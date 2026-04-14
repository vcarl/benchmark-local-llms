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
 * Trailer behaviour on interrupt: we install a scoped finalizer that
 * rewrites the archive's line 1 with the finalized manifest (stats,
 * finishedAt, and `interrupted` flag). The finalizer reads the existing
 * file so the body (result lines) is preserved verbatim. It runs on
 * success, failure, and interruption — `Scope.addFinalizer` guarantees it.
 */
import { FileSystem, type HttpClient, type Path } from "@effect/platform";
import { Clock, Effect, Option, Ref, type Scope } from "effect";
import { appendResult, writeManifestHeader } from "../archive/writer.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { AdmiralClient } from "../game/admiral/client.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type { ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { RunManifest, RunStats } from "../schema/run-manifest.js";
import type { ScenarioCorpusEntry } from "../schema/scenario.js";
import { lookupCache } from "./cache.js";
import { runPrompt } from "./run-prompt.js";
import { type RunScenarioDeps, runScenario } from "./run-scenario.js";

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
) => Effect.Effect<ServerHandle, unknown, HttpClient.HttpClient | Scope.Scope>;

/** Admiral acquisition result — baseUrl plus a ready-to-use client. */
export interface AdmiralHandle {
  readonly baseUrl: string;
  readonly client: AdmiralClient;
}

export type AdmiralFactory = () => Effect.Effect<
  AdmiralHandle,
  unknown,
  HttpClient.HttpClient | Scope.Scope
>;

/** Per-scenario gameserver acquisition. */
export interface GameSessionDeps extends RunScenarioDeps {
  readonly gameServerBaseUrl: string;
}

export type GameSessionFactory = (
  scenario: ScenarioCorpusEntry,
  admiral: AdmiralHandle,
) => Effect.Effect<GameSessionDeps, unknown, HttpClient.HttpClient | Scope.Scope>;

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

// ── Helpers ────────────────────────────────────────────────────────────────

const zeroStats = (): RunStats => ({
  totalPrompts: 0,
  totalExecutions: 0,
  completed: 0,
  skippedCached: 0,
  errors: 0,
  totalWallTimeSec: 0,
});

const tallyResult = (stats: RunStats, result: ExecutionResult): RunStats => {
  const next: RunStats = {
    ...stats,
    totalExecutions: stats.totalExecutions + 1,
    totalWallTimeSec: stats.totalWallTimeSec + result.wallTimeSec,
  };
  if (result.error !== null) {
    return { ...next, errors: next.errors + 1 };
  }
  return { ...next, completed: next.completed + 1 };
};

const tallySkipped = (stats: RunStats, result: ExecutionResult): RunStats => ({
  ...stats,
  totalExecutions: stats.totalExecutions + 1,
  skippedCached: stats.skippedCached + 1,
  totalWallTimeSec: stats.totalWallTimeSec + result.wallTimeSec,
});

const llmBaseUrlFor = (handle: ServerHandle): string => `http://127.0.0.1:${handle.port}/v1`;

const appendIfSaving = (
  result: ExecutionResult,
  archivePath: string,
  noSave: boolean,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> => {
  if (noSave) return Effect.void;
  return appendResult(archivePath, result);
};

const modelFromManifest = (manifest: RunManifest): ModelConfig => ({
  artifact: manifest.artifact,
  runtime: manifest.runtime,
  name: manifest.model,
  quant: manifest.quant,
});

// ── Finalizing the archive ────────────────────────────────────────────────

/**
 * Read the archive file, replace the header line with a finalized manifest
 * (stats + finishedAt + interrupted), and preserve all result lines verbatim.
 *
 * We don't reuse {@link writeManifestTrailer} because that helper hard-codes
 * `{ ...existing, finishedAt, stats }` and so can't toggle `interrupted`.
 * Rather than expand the B2 API from C4 (fence), we do the small rewrite
 * inline. This is a minimally-invasive alternative; a follow-up patch on B2
 * can generalize the writer.
 */
const finalizeArchive = (
  archivePath: string,
  finalized: RunManifest,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs.readFileString(archivePath).pipe(
      Effect.mapError(
        (cause) =>
          ({
            _tag: "FileIOError",
            path: archivePath,
            operation: "finalize-read",
            cause: String(cause),
          }) as FileIOError,
      ),
    );
    const firstNewline = contents.indexOf("\n");
    const body = firstNewline < 0 ? "" : contents.slice(firstNewline + 1);
    // Re-encode via writeManifestHeader semantics: we need schema encode, but
    // writeManifestHeader is the only module with the encoder. Easiest: write
    // the header with the finalized manifest, then append the preserved body.
    yield* writeManifestHeader(archivePath, finalized);
    if (body.length > 0) {
      yield* fs.writeFileString(archivePath, body, { flag: "a" }).pipe(
        Effect.mapError(
          (cause) =>
            ({
              _tag: "FileIOError",
              path: archivePath,
              operation: "finalize-append-body",
              cause: String(cause),
            }) as FileIOError,
        ),
      );
    }
  });

// ── Prompt phase ───────────────────────────────────────────────────────────

const runPromptPhase = (
  input: RunModelInput,
  statsRef: Ref.Ref<RunStats>,
): Effect.Effect<
  void,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | import("../llm/chat-completion.js").ChatCompletion
> =>
  Effect.gen(function* () {
    if (input.scenariosOnly === true) return;

    const model = modelFromManifest(input.manifest);

    for (const prompt of input.prompts) {
      for (const temperature of input.temperatures) {
        const cached = yield* lookupCache({
          archiveDir: input.archiveDir,
          artifact: input.manifest.artifact,
          promptName: prompt.name,
          promptHash: prompt.promptHash,
          temperature,
          fresh: input.fresh,
        });

        if (Option.isSome(cached)) {
          // Carry over into the new archive (choice (a) — self-contained).
          const carried: ExecutionResult = {
            ...cached.value,
            runId: input.manifest.runId,
          };
          yield* appendIfSaving(carried, input.archivePath, input.noSave);
          yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
          continue;
        }

        const result = yield* runPrompt({
          runId: input.manifest.runId,
          model,
          prompt,
          temperature,
          maxTokens: input.maxTokens,
          ...(input.requestTimeoutSec !== undefined ? { timeoutSec: input.requestTimeoutSec } : {}),
        });
        yield* appendIfSaving(result, input.archivePath, input.noSave);
        yield* Ref.update(statsRef, (s) => tallyResult(s, result));
      }
    }
  });

// ── Scenario phase ─────────────────────────────────────────────────────────

const toFileIO =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    ({
      _tag: "FileIOError",
      path,
      operation,
      cause: String(cause),
    }) as FileIOError;

const runScenarioPhase = (
  input: RunModelInput,
  deps: RunModelDeps,
  llmHandle: ServerHandle,
  statsRef: Ref.Ref<RunStats>,
): Effect.Effect<
  void,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | Scope.Scope
> =>
  Effect.gen(function* () {
    if (input.scenarios.length === 0) return;
    if (input.temperatures.length === 0) return;
    const temperature = input.temperatures[0];
    if (temperature === undefined) return;

    const admiral = yield* Effect.mapError(
      deps.admiral(),
      toFileIO("<admiral>", "acquire-admiral"),
    );
    const llmBaseUrl = llmBaseUrlFor(llmHandle);
    const model = modelFromManifest(input.manifest);

    for (const scenario of input.scenarios) {
      const cached = yield* lookupCache({
        archiveDir: input.archiveDir,
        artifact: input.manifest.artifact,
        promptName: scenario.name,
        promptHash: scenario.scenarioHash,
        temperature,
        fresh: input.fresh,
      });

      if (Option.isSome(cached)) {
        const carried: ExecutionResult = {
          ...cached.value,
          runId: input.manifest.runId,
        };
        yield* appendIfSaving(carried, input.archivePath, input.noSave);
        yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
        continue;
      }

      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const game = yield* Effect.mapError(
            deps.gameSession(scenario, admiral),
            toFileIO(`<gameserver:${scenario.name}>`, "acquire-gameserver"),
          );
          return yield* runScenario(
            {
              runId: input.manifest.runId,
              model,
              scenario,
              temperature,
              admiralBaseUrl: admiral.baseUrl,
              gameServerBaseUrl: game.gameServerBaseUrl,
              llmBaseUrl,
              ...(input.idleTimeoutSec !== undefined ? { sseIdleSec: input.idleTimeoutSec } : {}),
            },
            { admiral: admiral.client, admin: game.admin },
          );
        }),
      );

      yield* appendIfSaving(result, input.archivePath, input.noSave);
      yield* Ref.update(statsRef, (s) => tallyResult(s, result));
    }
  });

// ── Top-level ──────────────────────────────────────────────────────────────

export interface RunModelOutcome {
  readonly manifest: RunManifest;
  readonly stats: RunStats;
  readonly interrupted: boolean;
}

/**
 * Run one model end-to-end. The caller supplies an "open" manifest (header
 * state) and the archive path; we write the header, do work, write the
 * trailer. The trailer write is a scoped finalizer so interrupts still
 * close the envelope.
 *
 * Interrupt detection: we set `interruptedRef = true` before starting work
 * and clear it at natural end. The finalizer observes the ref — if it's
 * still true, the run left via interruption or failure and we record that
 * in the manifest. This is simpler than introspecting the Fiber's Exit.
 */
export const runModel = (
  input: RunModelInput,
  deps: RunModelDeps,
): Effect.Effect<
  RunModelOutcome,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | import("../llm/chat-completion.js").ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const statsRef = yield* Ref.make<RunStats>({
        ...zeroStats(),
        totalPrompts: input.prompts.length,
      });
      // Starts "true"; flipped to false at natural completion.
      const interruptedRef = yield* Ref.make(true);

      if (!input.noSave) {
        yield* writeManifestHeader(input.archivePath, input.manifest);
      }

      // Finalizer: rewrite manifest with final stats + interrupted flag.
      // Installed before any work so it always runs.
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

      yield* runPromptPhase(input, statsRef);
      yield* runScenarioPhase(input, deps, llmHandle, statsRef);

      // Natural end — clear interrupted so the finalizer records success.
      yield* Ref.set(interruptedRef, false);

      const finalStats = yield* Ref.get(statsRef);
      const endedMs = yield* Clock.currentTimeMillis;
      const finalizedManifest: RunManifest = {
        ...input.manifest,
        interrupted: false,
        stats: finalStats,
        finishedAt: new Date(endedMs).toISOString(),
      };
      return {
        manifest: finalizedManifest,
        stats: finalStats,
        interrupted: false,
      } satisfies RunModelOutcome;
    }),
  );
