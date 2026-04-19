/**
 * Top-level benchmark run loop (§5 / §5.3). Iterates over configured models,
 * builds a fresh {@link RunManifest} per model, and delegates per-model
 * orchestration to {@link runModel}.
 *
 * Each model produces one archive file: `{archiveDir}/{runId}.jsonl`. Models
 * that are inactive (`active: false`) or fail a name filter are skipped
 * before any server is spawned. A model whose per-model run fails with a
 * file/cache error is logged and the loop continues to the next model —
 * one bad archive doesn't sink the whole session.
 *
 * Environment fingerprint (`env` field on the manifest) is captured via a
 * small service so tests can pin it. Defaults to a light OS sniff.
 */
import { type FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { RunEnv, RunManifest } from "../schema/run-manifest.js";
import type { ScenarioCorpusEntry } from "../schema/scenario.js";
import { archiveFileName, makeRunId } from "./run-id.js";
import { type RunModelDeps, type RunModelOutcome, runModel } from "./run-model.js";
import { formatCrossModelRollup, toRollupInput } from "./summary.js";

// ── Public types ───────────────────────────────────────────────────────────

export interface RunLoopConfig {
  readonly models: ReadonlyArray<ModelConfig>;
  readonly promptCorpus: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
  readonly systemPrompts: Record<string, string>;
  readonly temperatures: ReadonlyArray<number>;
  readonly archiveDir: string;
  readonly fresh: boolean;
  readonly maxTokens: number;
  readonly idleTimeoutSec?: number;
  readonly modelNameFilter?: string;
  readonly scenariosOnly?: boolean;
  readonly noSave?: boolean;
  /** Per-LLM-request timeout in seconds. Default: 600. */
  readonly requestTimeoutSec?: number;
}

export interface RunLoopOutcome {
  readonly perModel: ReadonlyArray<RunModelOutcome>;
}

// ── Environment fingerprint ────────────────────────────────────────────────

/**
 * Build the `env` field for a manifest. Falls back to light defaults when
 * called outside of test control. A follow-up patch can replace this with a
 * proper service (hostname from `os.hostname`, git SHA from a subprocess).
 */
export const defaultRunEnv = (): RunEnv => ({
  hostname: process.env["HOSTNAME"] ?? "unknown",
  platform: `${process.platform}-${process.arch}`,
  runtimeVersion: "unknown",
  nodeVersion: process.version,
  benchmarkGitSha: "unknown",
});

// ── Filtering helpers ──────────────────────────────────────────────────────

const isActive = (m: ModelConfig): boolean => m.active !== false;

// ── Error description ─────────────────────────────────────────────────────
//
// Per-model failures are caught and rendered as a one-liner so the skip log
// shows the actionable reason (e.g. "No cached .gguf for ...") rather than
// the outer FileIOError wrapper. For ServerSpawnError-wrapped failures the
// `reason` field carries the human message; for cache-corruption we surface
// the file + line.

const describeModelFailure = (err: FileIOError | JsonlCorruptLine): string => {
  if (err._tag === "JsonlCorruptLine") {
    return `cache corrupt at ${err.filePath}:${err.lineNumber}`;
  }
  const cause = err.cause;
  if (cause !== null && typeof cause === "object" && "reason" in cause) {
    const reason = (cause as { reason: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return `${err.operation} failed (${err.path})`;
};

const matchesName = (m: ModelConfig, filter?: string): boolean => {
  if (filter === undefined || filter.length === 0) return true;
  const needle = filter.toLowerCase();
  const displayName = (m.name ?? m.artifact).toLowerCase();
  if (displayName.includes(needle)) return true;
  // Also match against the artifact string so callers can disambiguate
  // multi-runtime entries that share a display name (e.g. `unsloth/...`
  // selects only the llamacpp Qwen 3.5 9B; `mlx-community/...` selects only
  // the mlx variant).
  return m.artifact.toLowerCase().includes(needle);
};

// ── Manifest construction ──────────────────────────────────────────────────

const toCorpusRecord = <T extends { readonly name: string }>(
  entries: ReadonlyArray<T>,
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const e of entries) out[e.name] = e;
  return out;
};

/**
 * Construct an "open" manifest for one model — finishedAt null, stats zeroed,
 * interrupted false. The run loop's per-model call completes this envelope.
 */
export const makeOpenManifest = (params: {
  readonly runId: string;
  readonly startedAt: string;
  readonly model: ModelConfig;
  readonly env: RunEnv;
  readonly temperatures: ReadonlyArray<number>;
  readonly promptCorpus: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
}): RunManifest => ({
  schemaVersion: 1,
  runId: params.runId,
  startedAt: params.startedAt,
  finishedAt: null,
  interrupted: false,
  artifact: params.model.artifact,
  model: params.model.name ?? params.model.artifact,
  runtime: params.model.runtime,
  quant: params.model.quant ?? "",
  env: params.env,
  temperatures: params.temperatures,
  promptCorpus: toCorpusRecord(params.promptCorpus),
  scenarioCorpus: toCorpusRecord(params.scenarioCorpus),
  stats: {
    totalPrompts: params.promptCorpus.length,
    totalExecutions: 0,
    completed: 0,
    skippedCached: 0,
    errors: 0,
    totalWallTimeSec: 0,
  },
});

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Execute the full benchmark plan. One archive is produced per model; the
 * collected {@link RunModelOutcome}s are returned in model-order for the
 * caller (CLI, test) to format.
 *
 * Per-model typed failures (FileIOError, JsonlCorruptLine) are logged at
 * ERR and the loop moves on — one missing artifact or corrupt cache line
 * shouldn't sink a 56-model sweep. Defects and interrupts still propagate.
 */
export const runLoop = (
  config: RunLoopConfig,
  deps: RunModelDeps,
  env: RunEnv = defaultRunEnv(),
): Effect.Effect<
  RunLoopOutcome,
  FileIOError | JsonlCorruptLine,
  | import("@effect/platform").CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | import("@effect/platform").HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const pathMod = yield* Path.Path;
    const perModel: RunModelOutcome[] = [];

    // Filter with logging.
    const eligible: ModelConfig[] = [];
    for (const m of config.models) {
      if (!isActive(m)) {
        yield* Effect.logInfo(`skipping inactive model: ${m.name ?? m.artifact}`).pipe(
          Effect.annotateLogs({
            scope: "run-loop",
            model: m.name ?? m.artifact,
            runtime: m.runtime,
            quant: m.quant ?? "",
          }),
        );
        continue;
      }
      if (!matchesName(m, config.modelNameFilter)) {
        yield* Effect.logInfo(`skipping (filter miss): ${m.name ?? m.artifact}`).pipe(
          Effect.annotateLogs({
            scope: "run-loop",
            model: m.name ?? m.artifact,
            runtime: m.runtime,
            quant: m.quant ?? "",
          }),
        );
        continue;
      }
      eligible.push(m);
    }

    let modelIndex = 0;
    for (const model of eligible) {
      modelIndex += 1;
      const { runId, startedAt } = yield* makeRunId(model);
      const manifest = makeOpenManifest({
        runId,
        startedAt,
        model,
        env,
        temperatures: config.temperatures,
        promptCorpus: config.promptCorpus,
        scenarioCorpus: config.scenarioCorpus,
      });
      const archivePath = pathMod.join(config.archiveDir, archiveFileName(runId));
      const displayName = model.name ?? model.artifact;
      const quant = model.quant ?? "";

      const outcome = yield* Effect.gen(function* () {
        yield* Effect.logInfo(
          `model ${modelIndex}/${eligible.length}: ${displayName} (${model.artifact}${quant ? `, ${quant}` : ""})`,
        ).pipe(Effect.annotateLogs("scope", "run-loop"));

        return yield* runModel(
          {
            manifest,
            archivePath,
            prompts: config.promptCorpus,
            scenarios: config.scenarioCorpus,
            temperatures: config.temperatures,
            archiveDir: config.archiveDir,
            fresh: config.fresh,
            maxTokens: config.maxTokens,
            noSave: config.noSave ?? false,
            ...(config.idleTimeoutSec !== undefined
              ? { idleTimeoutSec: config.idleTimeoutSec }
              : {}),
            ...(config.scenariosOnly !== undefined ? { scenariosOnly: config.scenariosOnly } : {}),
            ...(config.requestTimeoutSec !== undefined
              ? { requestTimeoutSec: config.requestTimeoutSec }
              : {}),
          },
          deps,
        );
      }).pipe(
        // tapError emits ERR inside the outer annotateLogs wrap so the
        // skip log carries model/runtime/quant/runId. catchAll then swaps
        // the failure for `null`, which the loop uses as a skip sentinel.
        Effect.tapError((err) =>
          Effect.logError(`skipping ${displayName}: ${describeModelFailure(err)}`).pipe(
            Effect.annotateLogs("scope", "run-loop"),
          ),
        ),
        Effect.annotateLogs({
          model: displayName,
          runtime: model.runtime,
          quant,
          runId,
        }),
        Effect.catchAll(() => Effect.succeed(null)),
      );
      if (outcome !== null) perModel.push(outcome);
    }

    if (perModel.length > 1) {
      yield* Effect.logInfo(
        `\n${formatCrossModelRollup(
          perModel.map((m) => toRollupInput(m.aggregate, m.stats.totalWallTimeSec)),
        )}`,
      ).pipe(Effect.annotateLogs("scope", "run-loop"));
    }

    return { perModel };
  });

// Re-exports used by callers / tests -----------------------------------------

export type { ExecutionResult };
