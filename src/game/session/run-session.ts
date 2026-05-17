/**
 * Per-scenario top-level orchestration (requirements §5.3 / §5.4 / §5.5).
 *
 * Composes:
 *   - {@link gameServer}        — per-scenario subprocess on an ephemeral port
 *   - {@link makeGameAdminClient} — fixture reset + credential resolution + final stats
 *   - {@link acquireProfile}    — Admiral profile lifecycle (configure → create → connect)
 *   - {@link consumeAdmiralSse} — SSE stream of agent events
 *   - {@link makeWatchdog}      — cutoff state machine + wall-clock fiber
 *
 * Returns a fully-populated {@link ExecutionResult} ready for the C4
 * archive writer to append to JSONL.
 *
 * What this module does NOT do:
 *   - drive the LLM directly (Admiral does that internally via the profile)
 *   - score the result (deferred to report time, §4.6)
 *   - write to any archive (C4)
 *
 * The race semantics (§3.3): SSE consumption is forked on its own fiber; we
 * race that fiber against the watchdog's `wallClockTimer` fiber. Whichever
 * finishes first wins; the loser is interrupted automatically by `Effect.race`.
 */
import type { HttpClient } from "@effect/platform";
import { Effect, Stream } from "effect";
import {
  type AdmiralApiError,
  GameCredentialMismatch,
  type GameFixtureResetError,
  type SseConnectionError,
  type SseIdleTimeout,
  type SseParseError,
} from "../../errors/index.js";
import type { TerminationReason } from "../../schema/enums.js";
import type { AgentEvent, ExecutionResult } from "../../schema/execution.js";
import type { ModelConfig } from "../../schema/model.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";
import type { AdmiralClient } from "../admiral/client.js";
import { acquireProfile } from "../admiral/profile.js";
import { consumeAdmiralSse } from "../admiral/sse.js";
import type { GameAdminClient, PlayerCredential } from "../server/admin-client.js";
import { makeWatchdog } from "./watchdog.js";

export interface RunSessionInput {
  /** Frozen scenario from the prompt corpus. */
  readonly scenario: ScenarioCorpusEntry;
  /** Model under test (carries runtime + artifact identity). */
  readonly model: ModelConfig;
  /** Per-archive identity (filename stem) stamped on the result. */
  readonly archiveId: string;
  /** Logical-run group identity stamped on the result. */
  readonly runId: string;
  /** Temperature this scenario runs at (per §5.3.1, scenarios run at one). */
  readonly temperature: number;
  /** Base URL for the Admiral server already supervised by the caller. */
  readonly admiralBaseUrl: string;
  /** Base URL the gameserver listens on (passed to Admiral as `server_url`). */
  readonly gameServerBaseUrl: string;
  /** Base URL of the LLM server Admiral relays to (e.g. `http://127.0.0.1:18080/v1`). */
  readonly llmBaseUrl: string;
  /** Idle timeout for the SSE stream. Default 120s (§5.4). */
  readonly sseIdleSec?: number;
  /**
   * Optional override for the SSE stream — for tests that want to inject
   * canned events instead of round-tripping through Admiral. When set,
   * `admiralBaseUrl` is unused for log streaming.
   */
  readonly sseOverride?: Stream.Stream<
    AgentEvent,
    SseConnectionError | SseParseError | SseIdleTimeout
  >;
}

export interface RunSessionDeps {
  readonly admiral: AdmiralClient;
  readonly admin: GameAdminClient;
}

const utcNow = (): string => new Date().toISOString();

const isoStartedAt = utcNow;

const provider = "custom" as const;

/** Pick the LLM player's id from a scenario's player list. */
const llmPlayerId = (scenario: ScenarioCorpusEntry): string | null => {
  for (const p of scenario.players) {
    if (p.controlledBy === "llm") return p.id;
  }
  return null;
};

const credString = (c: PlayerCredential | undefined, key: "username" | "password"): string => {
  if (!c) return "";
  return c[key] ?? "";
};

/**
 * Drain the SSE stream into the watchdog. Returns when:
 *   - the stream completes naturally (Admiral closed the connection) — `"completed"`
 *   - the watchdog trips on tokens / tool_calls — that reason
 *
 * Stream-level failures (`SseConnectionError`, `SseParseError`, `SseIdleTimeout`)
 * propagate up so the outer race / catch maps them to `"error"` with the
 * cause attached.
 */
const consumeIntoWatchdog = <R>(
  events: Stream.Stream<AgentEvent, SseConnectionError | SseParseError | SseIdleTimeout, R>,
  watchdog: Awaited<ReturnType<typeof makeWatchdog>> extends Effect.Effect<infer A> ? A : never,
  collected: Array<AgentEvent>,
): Effect.Effect<TerminationReason, SseConnectionError | SseParseError | SseIdleTimeout, R> =>
  Effect.gen(function* () {
    // We need to peek the watchdog after each event to bail out as soon as
    // a count-based cutoff trips. `Stream.runForEach` works because we exit
    // by failing-with-success-payload — actually cleaner: use Stream.foldEffect.
    const trippedRef = { value: null as TerminationReason | null };

    yield* Stream.runForEachWhile(events, (event) =>
      Effect.gen(function* () {
        collected.push(event);
        yield* watchdog.observe(event);
        const t = yield* watchdog.tripped;
        if (t !== null) {
          trippedRef.value = t;
          return false;
        }
        return true;
      }),
    );
    return trippedRef.value ?? "completed";
  });

/**
 * Run one scenario end-to-end and produce an {@link ExecutionResult}.
 * Errors that the user might care about (Admiral API failures, fixture
 * reset failures, credential mismatches, SSE failures) are caught at the
 * boundary and folded into a result with `terminationReason: "error"` and
 * `error: <stringified cause>`. The function itself fails only if a
 * truly unrecoverable Effect-level fault bubbles up (e.g. defect).
 */
export const runSession = (
  input: RunSessionInput,
  deps: RunSessionDeps,
): Effect.Effect<ExecutionResult, never, HttpClient.HttpClient | import("effect/Scope").Scope> => {
  const startedAt = isoStartedAt();
  const startedMs = Date.now();
  const sseIdleSec = input.sseIdleSec ?? 120;

  const playerId = llmPlayerId(input.scenario);

  const collected: Array<AgentEvent> = [];

  // The error-channel effect that drives the session. We catch into a
  // result at the boundary so the caller never needs to.
  const work = Effect.gen(function* () {
    if (playerId === null) {
      // Schema requires at least one llm player for the scenario to be
      // actionable. Surface as a credential mismatch so it shows up the
      // same way operator-facing as a Real™ mismatch.
      return yield* Effect.fail(
        new GameCredentialMismatch({
          expectedId: "<no-llm-player>",
          availableIds: input.scenario.players.map((p) => p.id),
        }),
      );
    }

    yield* Effect.logDebug(`reset fixture ${input.scenario.fixture}`).pipe(
      Effect.annotateLogs("scope", "session"),
    );
    const creds = yield* deps.admin.reset(input.scenario.fixture);
    yield* Effect.logDebug(`resolve credential for player=${playerId ?? "<auto>"}`).pipe(
      Effect.annotateLogs("scope", "session"),
    );
    const player = yield* deps.admin.resolveCredential(creds, playerId);

    yield* Effect.logDebug(`configure + create profile for scenario ${input.scenario.name}`).pipe(
      Effect.annotateLogs("scope", "session"),
    );
    const profile = yield* acquireProfile(deps.admiral, {
      provider: {
        id: provider,
        baseUrl: input.llmBaseUrl,
        apiKey: "local",
      },
      profile: {
        provider,
        name: `bench-${input.archiveId}-${input.scenario.name}`,
        username: credString(player, "username"),
        password: credString(player, "password"),
        model: input.model.artifact,
        serverUrl: input.gameServerBaseUrl,
        directive: input.scenario.scenarioMd,
        connectionMode: "http_v2",
      },
    });
    yield* Effect.logDebug(`profile ${profile.profileId} ready`).pipe(
      Effect.annotateLogs("scope", "session"),
    );

    const watchdog = yield* makeWatchdog(input.scenario.cutoffs);

    const sseStream =
      input.sseOverride ??
      consumeAdmiralSse({
        profileId: profile.profileId,
        admiralBaseUrl: input.admiralBaseUrl,
        idleSec: sseIdleSec,
      });

    // Race the SSE consumer against the wall-clock timer. Whichever
    // completes first wins; `Effect.race` interrupts the loser.
    const reason: TerminationReason = yield* Effect.race(
      consumeIntoWatchdog(sseStream, watchdog, collected),
      watchdog.wallClockTimer,
    );

    return { reason, profile };
  });

  // Intentionally simple: if `work` produces a typed error, fold to the
  // error result. If the SSE stream fails, the inner Effect catches and
  // turns it into a value (we never let it propagate past `runSession`).
  return Effect.scoped(work).pipe(
    Effect.matchEffect({
      onFailure: (cause) =>
        Effect.succeed(buildErrorResult(input, startedAt, startedMs, collected, cause)),
      onSuccess: ({ reason }) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`fetching final player stats`).pipe(
            Effect.annotateLogs("scope", "session"),
          );
          const finalStats = yield* deps.admin
            .getPlayerStats(playerId ?? "")
            .pipe(Effect.orElseSucceed(() => ({}) as Record<string, unknown>));
          return buildResult(input, startedAt, startedMs, collected, reason, finalStats, null);
        }),
    }),
  );
};

const stringifyCause = (
  cause:
    | AdmiralApiError
    | GameFixtureResetError
    | GameCredentialMismatch
    | SseConnectionError
    | SseParseError
    | SseIdleTimeout,
): string => {
  // Tagged errors stringify cleanly with JSON; truncate to the same 200-char
  // budget the Python prototype uses (line 247).
  return JSON.stringify(cause).slice(0, 200);
};

const buildErrorResult = (
  input: RunSessionInput,
  startedAt: string,
  startedMs: number,
  collected: ReadonlyArray<AgentEvent>,
  cause: unknown,
): ExecutionResult =>
  buildResult(
    input,
    startedAt,
    startedMs,
    collected,
    "error",
    null,
    typeof cause === "object" && cause !== null && "_tag" in cause
      ? stringifyCause(cause as Parameters<typeof stringifyCause>[0])
      : String(cause),
  );

const buildResult = (
  input: RunSessionInput,
  startedAt: string,
  startedMs: number,
  collected: ReadonlyArray<AgentEvent>,
  termination: TerminationReason,
  finalStats: Record<string, unknown> | null,
  error: string | null,
): ExecutionResult => {
  const elapsed = (Date.now() - startedMs) / 1000;
  const toolCallCount = collected.reduce((acc, e) => (e.event === "tool_call" ? acc + 1 : acc), 0);
  // Sum the LATEST turn_end's tokens — events are cumulative per the
  // mapping table; we want the high-water value for the result.
  let totalTokens = 0;
  for (const e of collected) {
    if (e.event === "turn_end") {
      const inN = e.data["totalTokensIn"];
      const outN = e.data["totalTokensOut"];
      const sum = (typeof inN === "number" ? inN : 0) + (typeof outN === "number" ? outN : 0);
      if (sum > totalTokens) totalTokens = sum;
    }
  }

  const result: ExecutionResult = {
    archiveId: input.archiveId,
    runId: input.runId,
    executedAt: startedAt,
    promptName: input.scenario.name,
    temperature: input.temperature,
    model: input.model.name ?? input.model.artifact,
    runtime: input.model.runtime,
    quant: input.model.quant ?? "",
    promptTokens: 0,
    generationTokens: totalTokens,
    promptTps: 0,
    generationTps: 0,
    peakMemoryGb: 0,
    wallTimeSec: elapsed,
    output: "",
    error,
    promptHash: input.scenario.scenarioHash,
    scenarioHash: input.scenario.scenarioHash,
    scenarioName: input.scenario.name,
    terminationReason: termination,
    toolCallCount,
    finalPlayerStats: finalStats,
    events: collected,
  };
  return result;
};
