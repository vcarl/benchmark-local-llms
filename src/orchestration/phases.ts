/**
 * Prompt and scenario phase loops extracted from {@link runModel}. Keeping
 * them as free functions lets `run-model.ts` stay under the 250-line budget
 * and makes the two phases unit-testable in isolation if we ever want that.
 *
 * These functions take a `RunModelInput` / `RunModelDeps` shape (public from
 * `run-model.ts`) and a `statsRef` + `archivePath` for append-side-effects.
 * They assume the archive's header has already been written by the caller.
 */
import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Effect, Option, Ref, type Scope } from "effect";
import { appendResult } from "../archive/writer.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type { ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { RunManifest, RunStats } from "../schema/run-manifest.js";
import { lookupCache } from "./cache.js";
import type { AdmiralHandle, GameSessionFactory, RunModelInput } from "./run-model.js";
import { runPrompt } from "./run-prompt.js";
import { runScenario } from "./run-scenario.js";
import { type ModelAggregate, recordPrompt, recordScenario } from "./summary.js";

// ── Shared helpers ─────────────────────────────────────────────────────────

const tallyResult = (stats: RunStats, result: ExecutionResult): RunStats => {
  const next: RunStats = {
    ...stats,
    totalExecutions: stats.totalExecutions + 1,
    totalWallTimeSec: stats.totalWallTimeSec + result.wallTimeSec,
  };
  if (result.error !== null) return { ...next, errors: next.errors + 1 };
  return { ...next, completed: next.completed + 1 };
};

const tallySkipped = (stats: RunStats, result: ExecutionResult): RunStats => ({
  ...stats,
  totalExecutions: stats.totalExecutions + 1,
  skippedCached: stats.skippedCached + 1,
  totalWallTimeSec: stats.totalWallTimeSec + result.wallTimeSec,
});

const modelFromManifest = (manifest: RunManifest): ModelConfig => ({
  artifact: manifest.artifact,
  runtime: manifest.runtime,
  name: manifest.model,
  quant: manifest.quant,
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

const toFileIO =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    ({
      _tag: "FileIOError",
      path,
      operation,
      cause: String(cause),
    }) as FileIOError;

// ── Prompt phase ───────────────────────────────────────────────────────────

/**
 * Iterate `prompts × temperatures`, honour the cross-run cache, and append
 * results to the archive. Updates `statsRef` with completed / errored /
 * skipped counts. No-op when `scenariosOnly` is set.
 */
export const runPromptPhase = (
  input: RunModelInput,
  statsRef: Ref.Ref<RunStats>,
  aggRef: Ref.Ref<ModelAggregate>,
): Effect.Effect<
  void,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | ChatCompletion
> =>
  Effect.gen(function* () {
    if (input.scenariosOnly === true) return;

    const model = modelFromManifest(input.manifest);
    const total = input.prompts.length * input.temperatures.length;
    let promptIndex = 0;

    for (const prompt of input.prompts) {
      for (const temperature of input.temperatures) {
        promptIndex += 1;
        const cached = yield* lookupCache({
          archiveDir: input.archiveDir,
          artifact: input.manifest.artifact,
          runId: input.manifest.runId,
          promptName: prompt.name,
          promptHash: prompt.promptHash,
          temperature,
          fresh: input.fresh,
        });

        if (Option.isSome(cached)) {
          const carried: ExecutionResult = {
            ...cached.value,
            archiveId: input.manifest.archiveId,
            runId: input.manifest.runId,
          };
          yield* appendIfSaving(carried, input.archivePath, input.noSave);
          yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
          yield* Ref.update(aggRef, (a) => recordPrompt(a, carried, true));
          yield* Effect.logInfo(
            `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — cache hit (archiveId=${carried.archiveId}, executedAt=${carried.executedAt})`,
          ).pipe(Effect.annotateLogs("scope", "prompt"));
          continue;
        }

        const result = yield* runPrompt({
          archiveId: input.manifest.archiveId,
          runId: input.manifest.runId,
          model,
          prompt,
          temperature,
          maxTokens: input.maxTokens,
          ...(input.requestTimeoutSec !== undefined ? { timeoutSec: input.requestTimeoutSec } : {}),
        });
        yield* appendIfSaving(result, input.archivePath, input.noSave);
        yield* Ref.update(statsRef, (s) => tallyResult(s, result));
        yield* Ref.update(aggRef, (a) => recordPrompt(a, result, false));
        if (result.error !== null) {
          yield* Effect.logInfo(
            `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — ERROR: ${result.error}`,
          ).pipe(Effect.annotateLogs("scope", "prompt"));
        } else {
          yield* Effect.logInfo(
            `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} → ${result.generationTokens} gen tok, ${result.generationTps.toFixed(1)} tps gen, ${result.promptTps.toFixed(1)} tps prompt, ${result.wallTimeSec.toFixed(1)}s`,
          ).pipe(Effect.annotateLogs("scope", "prompt"));
        }
      }
    }
  }).pipe(Effect.annotateLogs("phase", "prompt"));

// ── Scenario phase ─────────────────────────────────────────────────────────

/**
 * Scenarios execute only at the first configured temperature. Each scenario
 * opens its own scope for the gameserver + runSession; Admiral is already
 * held by the caller (shared across all scenarios for this model).
 */
export const runScenarioPhase = (
  input: RunModelInput,
  gameSession: GameSessionFactory,
  admiral: AdmiralHandle,
  llmHandle: ServerHandle,
  statsRef: Ref.Ref<RunStats>,
  aggRef: Ref.Ref<ModelAggregate>,
): Effect.Effect<
  void,
  FileIOError | JsonlCorruptLine,
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | Scope.Scope
> =>
  Effect.gen(function* () {
    if (input.scenarios.length === 0) return;
    if (input.temperatures.length === 0) return;
    const temperature = input.temperatures[0];
    if (temperature === undefined) return;

    const llmBaseUrl = llmBaseUrlFor(llmHandle);
    const model = modelFromManifest(input.manifest);
    const total = input.scenarios.length;
    let scenarioIndex = 0;

    for (const scenario of input.scenarios) {
      scenarioIndex += 1;
      const cached = yield* lookupCache({
        archiveDir: input.archiveDir,
        artifact: input.manifest.artifact,
        runId: input.manifest.runId,
        promptName: scenario.name,
        promptHash: scenario.scenarioHash,
        temperature,
        fresh: input.fresh,
      });

      if (Option.isSome(cached)) {
        const carried: ExecutionResult = {
          ...cached.value,
          archiveId: input.manifest.archiveId,
          runId: input.manifest.runId,
        };
        yield* appendIfSaving(carried, input.archivePath, input.noSave);
        yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
        yield* Ref.update(aggRef, (a) => recordScenario(a, carried, true));
        yield* Effect.logInfo(
          `scenario ${scenarioIndex}/${total} ${scenario.name} — cache hit (archiveId=${carried.archiveId}, executedAt=${carried.executedAt})`,
        ).pipe(Effect.annotateLogs("scope", "scenario"));
        continue;
      }

      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const game = yield* Effect.mapError(
            gameSession(scenario, admiral),
            toFileIO(`<gameserver:${scenario.name}>`, "acquire-gameserver"),
          );
          return yield* runScenario(
            {
              archiveId: input.manifest.archiveId,
              runId: input.manifest.runId,
              model,
              scenario,
              temperature,
              admiralBaseUrl: admiral.baseUrl,
              gameServerBaseUrl: game.gameServerBaseUrl,
              llmBaseUrl,
              ...(input.idleTimeoutSec !== undefined ? { sseIdleSec: input.idleTimeoutSec } : {}),
              ...(game.sseOverride !== undefined ? { sseOverride: game.sseOverride } : {}),
            },
            { admiral: admiral.client, admin: game.admin },
          );
        }),
      ).pipe(Effect.annotateLogs({ scenario: scenario.name }));

      yield* appendIfSaving(result, input.archivePath, input.noSave);
      yield* Ref.update(statsRef, (s) => tallyResult(s, result));
      yield* Ref.update(aggRef, (a) => recordScenario(a, result, false));
      if (result.error !== null) {
        yield* Effect.logInfo(
          `scenario ${scenarioIndex}/${total} ${scenario.name} — ${result.terminationReason ?? "error"}: ${result.error}, ticks=${result.events?.length ?? 0}, toolCalls=${result.toolCallCount ?? 0}, ${result.wallTimeSec.toFixed(1)}s`,
        ).pipe(Effect.annotateLogs("scope", "scenario"));
      } else {
        yield* Effect.logInfo(
          `scenario ${scenarioIndex}/${total} ${scenario.name} — ${result.terminationReason ?? "completed"}, ticks=${result.events?.length ?? 0}, toolCalls=${result.toolCallCount ?? 0}, ${result.wallTimeSec.toFixed(1)}s`,
        ).pipe(Effect.annotateLogs("scope", "scenario"));
      }
    }
  }).pipe(Effect.annotateLogs("phase", "scenario"));
