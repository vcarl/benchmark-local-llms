/**
 * Middle orchestration layer: one model × one runtime run. Opens a scope
 * over the LLM server, writes the manifest header, iterates prompts ×
 * temperatures, optionally starts Admiral + runs scenarios at the first
 * temperature, and writes the trailer on exit (including on interrupt).
 *
 * Scope nesting (§5.1):
 *
 *   ModelScope (this function, via `Effect.scoped`)
 *     ├── LlmServer (llamacpp or mlx, acquired up-front)
 *     ├── [prompt × temperature loop]
 *     │     — uses ChatCompletion over the LLM server
 *     └── [scenario loop, only if scenarios present]
 *           ├── AdmiralServer (acquired once, reused across scenarios)
 *           └── For each scenario:
 *                 ScenarioScope
 *                   ├── GameServer (ephemeral port)
 *                   └── runSession (profile + SSE + watchdog)
 *
 * Admiral scope: per model, gated by scenario list non-empty. Benchmark.py
 * (lines 383-393) starts Admiral inside the per-model loop right before the
 * scenario iteration and tears it down in a matching `finally`. We mirror
 * that — once per model, reused across all scenarios for that model,
 * skipped entirely when the scenario list is empty.
 *
 * Trailer behaviour on interrupt: a scoped finalizer rewrites the archive's
 * line 1 with the finalized manifest (stats, finishedAt, `interrupted`). The
 * finalizer preserves the body verbatim. Runs on success, failure, and
 * interruption — `Scope.addFinalizer` guarantees it. `interruptedRef` starts
 * `true`; natural end flips it to `false` so an interrupt leaves it as
 * `true`.
 *
 * The prompt/scenario loops themselves live in `phases.ts` to keep this
 * module focused on the scope plumbing.
 */
import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Clock, Effect, Ref, type Scope, type Stream } from "effect";
import { writeManifestHeader } from "../archive/writer.js";
import type {
  FileIOError,
  JsonlCorruptLine,
  SseConnectionError,
  SseIdleTimeout,
  SseParseError,
} from "../errors/index.js";
import type { AdmiralClient } from "../game/admiral/client.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type { AgentEvent } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { RunManifest, RunStats } from "../schema/run-manifest.js";
import type { ScenarioCorpusEntry } from "../schema/scenario.js";
import { finalizeArchive } from "./finalize-archive.js";
import { runPromptPhase, runScenarioPhase } from "./phases.js";
import type { RunScenarioDeps } from "./run-scenario.js";
import { emptyAggregate, formatModelBlock, type ModelAggregate } from "./summary.js";

// ── Dependency seams ───────────────────────────────────────────────────────

/**
 * Acquire an LLM server within the caller's scope. Production wires
 * `llamacppServer` / `mlxServer` here; tests replace with a no-op fake.
 *
 * The factory's error channel is left `unknown` so callers can wire any
 * supervisor type — `runModel` collapses spawn failures into `FileIOError`
 * at the boundary.
 */
export type LlmServerFactory = (
  model: ModelConfig,
) => Effect.Effect<
  ServerHandle,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

/** Admiral acquisition result — baseUrl plus a ready-to-use client. */
export interface AdmiralHandle {
  readonly baseUrl: string;
  readonly client: AdmiralClient;
}

export type AdmiralFactory = () => Effect.Effect<
  AdmiralHandle,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

/** Per-scenario gameserver acquisition. */
export interface GameSessionDeps extends RunScenarioDeps {
  readonly gameServerBaseUrl: string;
  /**
   * Test override — if set, the scenario's SSE stream is supplied directly
   * instead of opening a real connection. Production factories leave this
   * undefined; test factories fill it with canned events.
   */
  readonly sseOverride?: Stream.Stream<
    AgentEvent,
    SseConnectionError | SseParseError | SseIdleTimeout
  >;
}

export type GameSessionFactory = (
  scenario: ScenarioCorpusEntry,
  admiral: AdmiralHandle,
) => Effect.Effect<
  GameSessionDeps,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

// ── Public inputs ──────────────────────────────────────────────────────────

export interface RunModelInput {
  readonly manifest: RunManifest;
  readonly archivePath: string;
  readonly prompts: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarios: ReadonlyArray<ScenarioCorpusEntry>;
  readonly temperatures: ReadonlyArray<number>;
  readonly archiveDir: string;
  readonly fresh: boolean;
  readonly maxTokens: number;
  readonly noSave: boolean;
  readonly idleTimeoutSec?: number;
  readonly scenariosOnly?: boolean;
  readonly requestTimeoutSec?: number;
}

export interface RunModelDeps {
  readonly llmServer: LlmServerFactory;
  readonly admiral: AdmiralFactory;
  readonly gameSession: GameSessionFactory;
}

export interface RunModelOutcome {
  readonly manifest: RunManifest;
  readonly stats: RunStats;
  readonly interrupted: boolean;
  readonly aggregate: ModelAggregate;
  readonly archivePath: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const zeroStats = (): RunStats => ({
  totalPrompts: 0,
  totalExecutions: 0,
  completed: 0,
  skippedCached: 0,
  errors: 0,
  totalWallTimeSec: 0,
});

const modelFromManifest = (manifest: RunManifest): ModelConfig => ({
  artifact: manifest.artifact,
  runtime: manifest.runtime,
  name: manifest.model,
  quant: manifest.quant,
});

const toFileIO =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    ({
      _tag: "FileIOError",
      path,
      operation,
      cause,
    }) as FileIOError;

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Run one model end-to-end. Writes header, runs prompts, runs scenarios
 * (with Admiral scoped to the scenario phase), rewrites the trailer on
 * exit.
 *
 * Error channel: file I/O + cache decode errors escape typed; LLM /
 * Admiral / SSE errors are folded into result lines by the lower modules.
 * Server-spawn failures from factories are mapped to `FileIOError` at the
 * boundary — the caller logs and continues.
 */
export const runModel = (
  input: RunModelInput,
  deps: RunModelDeps,
): Effect.Effect<
  RunModelOutcome,
  FileIOError | JsonlCorruptLine,
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const statsRef = yield* Ref.make<RunStats>({
        ...zeroStats(),
        totalPrompts: input.prompts.length,
      });
      const aggRef = yield* Ref.make<ModelAggregate>(emptyAggregate());
      // Starts "true"; flipped to false at natural completion. Interrupt
      // leaves it true; the finalizer reads this to set the manifest flag.
      const interruptedRef = yield* Ref.make(true);

      if (!input.noSave) {
        yield* writeManifestHeader(input.archivePath, input.manifest);
      }

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          if (input.noSave) return;
          const stats = yield* Ref.get(statsRef);
          const interrupted = yield* Ref.get(interruptedRef);
          const endedMs = yield* Clock.currentTimeMillis;
          const finalized: RunManifest = {
            ...input.manifest,
            interrupted,
            stats,
            finishedAt: new Date(endedMs).toISOString(),
          };
          yield* finalizeArchive(input.archivePath, finalized).pipe(Effect.ignore);
        }).pipe(Effect.ignore),
      );

      const llmHandle = yield* Effect.mapError(
        deps.llmServer(modelFromManifest(input.manifest)),
        toFileIO(`<llm-server:${input.manifest.runtime}>`, "acquire-llm-server"),
      );

      yield* runPromptPhase(input, statsRef, aggRef);

      if (input.scenarios.length > 0) {
        const admiral = yield* Effect.mapError(
          deps.admiral(),
          toFileIO("<admiral>", "acquire-admiral"),
        );
        yield* runScenarioPhase(input, deps.gameSession, admiral, llmHandle, statsRef, aggRef);
      }

      yield* Ref.set(interruptedRef, false);

      const finalAggregate = yield* Ref.get(aggRef);
      const finalStats = yield* Ref.get(statsRef);
      const endedMs = yield* Clock.currentTimeMillis;
      const finalizedManifest: RunManifest = {
        ...input.manifest,
        interrupted: false,
        stats: finalStats,
        finishedAt: new Date(endedMs).toISOString(),
      };

      yield* Effect.logInfo(
        `\n${formatModelBlock({
          modelDisplayName: input.manifest.model,
          archiveId: input.manifest.archiveId,
          runId: input.manifest.runId,
          runtime: input.manifest.runtime,
          quant: input.manifest.quant,
          archivePath: input.archivePath,
          totalWallTimeSec: finalStats.totalWallTimeSec,
          interrupted: false,
          aggregate: finalAggregate,
        })}`,
      ).pipe(Effect.annotateLogs("scope", "run-model"));

      return {
        manifest: finalizedManifest,
        stats: finalStats,
        interrupted: false,
        aggregate: finalAggregate,
        archivePath: input.archivePath,
      } satisfies RunModelOutcome;
    }),
  );
