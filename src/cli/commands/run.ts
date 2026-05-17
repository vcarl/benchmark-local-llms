/**
 * `run` subcommand — the main benchmark entry point.
 *
 * Flag surface (requirements §8.2 + benchmark.py audit):
 *   --model-name          benchmark.py:67-70
 *   --max-tokens          benchmark.py:71-74
 *   --scenarios           benchmark.py:95-98
 *   --no-save             benchmark.py:83-86
 *   --fresh               new in rewrite (§8.2 + §5.3.2)
 *   --idle-timeout        new in rewrite (§5.4)
 *   --archive-dir         new — configurable output location (default ./benchmark-archive)
 *   --scenarios-only      new — run only scenarios, skip prompt corpus
 *   --models-file         configurable models.yaml path (default models.yaml)
 *   --prompts-dir         configurable prompts dir (default prompts)
 *   --admiral-dir         path to Admiral checkout (for --scenarios != none)
 *   --game-server-binary  path to gameserver binary (for --scenarios != none)
 *
 * Intentionally NOT ported (per §8.2 "removed" note):
 *   --runtime    (runtime is now per-model-config)
 *   --models     (size filtering gone — configure what you want to run)
 *   --quick      (always full suite)
 *   --prompt     (no per-prompt filter; run the full corpus)
 *   --download   (out of scope — handled outside the benchmark tool)
 *   --report-only (now a distinct `report` subcommand)
 *   --scenario-md-dir (scenarios' .md files now live beside their YAML)
 */
import { Command } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Clock, Effect, Layer, Option } from "effect";
import { loadModels } from "../../config/models.js";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { ChatCompletionLive } from "../../llm/chat-completion.js";
import { checkCompletion, type PlannedCell } from "../../orchestration/completion.js";
import { runLoop } from "../../orchestration/run-loop.js";
import { averageGenTps } from "../../orchestration/summary.js";
import { clearRunState, generateRunId, loadRunState, saveRunState } from "../../state/run-state.js";
import { buildRunLoopConfig, type RunFlags } from "../config/build.js";
import { makeRunDeps } from "../deps.js";
import { makeLoggerLayer } from "../logger.js";
import { scenariosSubdir, systemPromptsPath } from "../paths.js";
import { runOptions } from "./run-options.js";

/**
 * Extended per-model stdout record (one per model) — see stdout-observability
 * spec. Stdout is machine-readable; human-readable logs go to stderr via the
 * logger. Downstream shell glue parses by splitting on `\t` and reading
 * `key=value` pairs after the fixed-order `<model>\t<runtime>\t<quant>`
 * header columns.
 */
export interface RunRecordInput {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly completed: number;
  readonly cached: number;
  readonly errors: number;
  readonly totalWallTimeSec: number;
  readonly genTps: number;
  readonly interrupted: boolean;
  readonly archivePath: string;
}

export const formatRunRecord = (r: RunRecordInput): string =>
  [
    r.model,
    r.runtime,
    r.quant,
    `completed=${r.completed}`,
    `cached=${r.cached}`,
    `errors=${r.errors}`,
    `wall=${r.totalWallTimeSec.toFixed(1)}`,
    `genTps=${r.genTps.toFixed(1)}`,
    `interrupted=${r.interrupted}`,
    `archive=${r.archivePath}`,
  ].join("\t");

type RunOptionsParsed = {
  readonly modelName: Option.Option<string>;
  readonly quant: Option.Option<string>;
  readonly params: Option.Option<string>;
  readonly maxTokens: number;
  readonly scenarios: string;
  readonly noSave: boolean;
  readonly fresh: boolean;
  readonly idleTimeout: Option.Option<number>;
  readonly archiveDir: string;
  readonly scenariosOnly: boolean;
  readonly modelsFile: string;
  readonly promptsDir: string;
  readonly admiralDir: Option.Option<string>;
  readonly gameServerBinary: Option.Option<string>;
  readonly verbose: boolean;
};

/**
 * Fold the parsed options into the typed {@link RunFlags} we pass to
 * {@link buildRunLoopConfig}. Returns either the flags or a user-facing
 * validation message — the caller turns the latter into a typed failure.
 */
export const normalizeRunOptions = (
  parsed: RunOptionsParsed,
):
  | { readonly ok: true; readonly flags: RunFlags }
  | { readonly ok: false; readonly error: string } => {
  const flags: RunFlags = {
    ...(Option.isSome(parsed.modelName) ? { modelName: parsed.modelName.value } : {}),
    ...(Option.isSome(parsed.quant) ? { quant: parsed.quant.value } : {}),
    ...(Option.isSome(parsed.params) ? { params: parsed.params.value } : {}),
    maxTokens: parsed.maxTokens,
    scenarios: parsed.scenarios,
    noSave: parsed.noSave,
    fresh: parsed.fresh,
    ...(Option.isSome(parsed.idleTimeout) ? { idleTimeoutSec: parsed.idleTimeout.value } : {}),
    archiveDir: parsed.archiveDir,
    scenariosOnly: parsed.scenariosOnly,
    // Sentinel — proper run-id plumbing (state file, resume) lands in a
    // later task. Every archive produced by this invocation gets this
    // value stamped on it.
    runId: "UNSET-PENDING-TASK-6",
  };
  return { ok: true, flags };
};

// ── Run-id lifecycle helpers ───────────────────────────────────────────────

/**
 * Resolve the active runId for this invocation:
 *   --fresh        → delete state, generate new id, write state
 *   --no-save      → ephemeral id; skip state I/O
 *   state present  → reuse cached id (resume)
 *   state absent   → generate new id, write state
 *
 * Returns the id and a flag indicating whether this is a resume.
 */
const resolveRunId = (archiveDir: string, fresh: boolean, noSave: boolean) =>
  Effect.gen(function* () {
    if (noSave) {
      const id = yield* generateRunId();
      return { runId: id, resumed: false, ephemeral: true };
    }
    if (fresh) {
      yield* clearRunState(archiveDir);
      const id = yield* generateRunId();
      const millis = yield* Clock.currentTimeMillis;
      const createdAt = new Date(millis).toISOString();
      yield* saveRunState(archiveDir, { runId: id, createdAt });
      return { runId: id, resumed: false, ephemeral: false };
    }
    const existing = yield* loadRunState(archiveDir);
    if (Option.isSome(existing)) {
      return { runId: existing.value.runId, resumed: true, ephemeral: false };
    }
    const id = yield* generateRunId();
    const millis = yield* Clock.currentTimeMillis;
    const createdAt = new Date(millis).toISOString();
    yield* saveRunState(archiveDir, { runId: id, createdAt });
    return { runId: id, resumed: false, ephemeral: false };
  });

/**
 * Enumerate the (artifact, promptName, promptHash, temperature) cells
 * implied by the live config. Filters mirror the run-loop's per-model
 * matching: name (against m.name OR m.artifact), quant, params. Each
 * cell is tagged kind="prompt" or kind="scenario" for callers that care.
 */
const enumeratePlannedCells = (
  config: import("../../orchestration/run-loop.js").RunLoopConfig,
): Effect.Effect<ReadonlyArray<PlannedCell>> =>
  Effect.gen(function* () {
    const out: PlannedCell[] = [];
    for (const m of config.models) {
      if (config.modelNameFilter !== undefined) {
        const needle = config.modelNameFilter.toLowerCase();
        const haystackName = (m.name ?? "").toLowerCase();
        const haystackArtifact = m.artifact.toLowerCase();
        if (!haystackName.includes(needle) && !haystackArtifact.includes(needle)) continue;
      }
      if (config.quantFilter !== undefined) {
        const needle = config.quantFilter.toLowerCase();
        if (m.quant === undefined || !m.quant.toLowerCase().includes(needle)) continue;
      }
      if (config.paramsFilter !== undefined) {
        const needle = config.paramsFilter.toLowerCase();
        if (m.params === undefined || !m.params.toLowerCase().includes(needle)) continue;
      }
      // Loader rejects active models missing temperature, so this is a programmer
      // error if it fires (e.g., enumerating cells for an unvalidated config).
      if (m.temperature === undefined) {
        return yield* Effect.die(
          new Error(
            `enumeratePlannedCells: model '${m.artifact}' has no temperature; this should have been caught by the models.yaml loader.`,
          ),
        );
      }
      const modelTemp = m.temperature;
      if (config.scenariosOnly !== true) {
        for (const p of config.promptCorpus) {
          out.push({
            artifact: m.artifact,
            promptName: p.name,
            promptHash: p.promptHash,
            temperature: modelTemp,
            kind: "prompt",
          });
        }
      }
      for (const s of config.scenarioCorpus) {
        out.push({
          artifact: m.artifact,
          promptName: s.name,
          promptHash: s.scenarioHash,
          temperature: modelTemp,
          kind: "scenario",
        });
      }
    }
    return out;
  });

// ── Handler ────────────────────────────────────────────────────────────────

const registryLayer = (promptsDir: string) =>
  Layer.effect(SystemPromptRegistry, loadSystemPrompts(systemPromptsPath(promptsDir)));

export const runCommand = Command.make("run", runOptions, (raw) => {
  const parsed = raw as unknown as RunOptionsParsed;
  return Effect.gen(function* () {
    const normalized = normalizeRunOptions(parsed);
    if (!normalized.ok) {
      yield* Effect.logError(normalized.error);
      return yield* Effect.fail(new Error(normalized.error));
    }
    const flags = normalized.flags;

    const archiveDir = flags.archiveDir;
    const { runId, resumed, ephemeral } = yield* resolveRunId(
      archiveDir,
      flags.fresh,
      flags.noSave,
    );

    yield* Effect.logInfo(
      resumed
        ? `run ${runId}: resuming`
        : ephemeral
          ? `run ${runId}: ephemeral (--no-save)`
          : `run ${runId}: starting fresh`,
    ).pipe(Effect.annotateLogs("scope", "run"));

    // Load corpora -------------------------------------------------------
    const systemPrompts = yield* loadSystemPrompts(systemPromptsPath(parsed.promptsDir));
    const models = yield* loadModels(parsed.modelsFile);
    const promptCorpus = flags.scenariosOnly
      ? []
      : yield* loadPromptCorpus(parsed.promptsDir).pipe(
          Effect.provide(registryLayer(parsed.promptsDir)),
        );
    const scenarioCorpus = yield* loadScenarioCorpus(scenariosSubdir(parsed.promptsDir)).pipe(
      Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<never>)),
    );

    const config = buildRunLoopConfig({
      flags: { ...flags, runId },
      models,
      promptCorpus,
      scenarioCorpus,
      systemPrompts,
    });

    // Build factories (HTTP + subprocess deps stitched together) ---------
    const deps = makeRunDeps({
      admiralDir: Option.getOrUndefined(parsed.admiralDir),
      gameServerBinary: Option.getOrUndefined(parsed.gameServerBinary),
    });

    // Run --------------------------------------------------------------
    const outcome = yield* runLoop(config, deps);

    // Print a per-model summary line --------------------------------------
    for (const m of outcome.perModel) {
      console.log(
        formatRunRecord({
          model: m.manifest.model,
          runtime: m.manifest.runtime,
          quant: m.manifest.quant,
          completed: m.stats.completed,
          cached: m.stats.skippedCached,
          errors: m.stats.errors,
          totalWallTimeSec: m.stats.totalWallTimeSec,
          genTps: averageGenTps(m.aggregate),
          interrupted: m.interrupted,
          archivePath: m.archivePath,
        }),
      );
    }

    if (!ephemeral) {
      const planned = yield* enumeratePlannedCells(config);
      const verdict = yield* checkCompletion({
        archiveDir,
        runId,
        plannedCells: planned,
      });
      if (verdict.complete) {
        yield* clearRunState(archiveDir);
        yield* Effect.logInfo(
          `run ${runId} complete: ${verdict.validCells}/${verdict.totalCells} cells`,
        ).pipe(Effect.annotateLogs("scope", "run"));
      } else {
        yield* Effect.logInfo(
          `run ${runId} partial: ${verdict.validCells}/${verdict.totalCells} cells; rerun ./bench run to continue`,
        ).pipe(Effect.annotateLogs("scope", "run"));
      }
    }
  }).pipe(
    Effect.provide(ChatCompletionLive),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(makeLoggerLayer(parsed.verbose)),
  );
}).pipe(Command.withDescription("Run the benchmark suite against configured models"));
