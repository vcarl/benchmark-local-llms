/**
 * `run` subcommand — the main benchmark entry point.
 *
 * Flag surface (requirements §8.2 + benchmark.py audit):
 *   --model-name          benchmark.py:67-70
 *   --max-tokens          benchmark.py:71-74
 *   --scenarios           benchmark.py:95-98
 *   --no-save             benchmark.py:83-86
 *   --fresh               new in rewrite (§8.2 + §5.3.2)
 *   --temperatures        new in rewrite (§8.2 + §5.3.1)
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
import { Effect, Layer, Option } from "effect";
import { loadModels } from "../../config/models.js";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { ChatCompletionLive } from "../../llm/chat-completion.js";
import { runLoop } from "../../orchestration/run-loop.js";
import { buildRunLoopConfig, parseTemperatures, type RunFlags } from "../config/build.js";
import { makeRunDeps } from "../deps.js";
import { runOptions } from "./run-options.js";

type RunOptionsParsed = {
  readonly modelName: Option.Option<string>;
  readonly maxTokens: number;
  readonly scenarios: string;
  readonly noSave: boolean;
  readonly fresh: boolean;
  readonly temperatures: Option.Option<string>;
  readonly idleTimeout: Option.Option<number>;
  readonly archiveDir: string;
  readonly scenariosOnly: boolean;
  readonly modelsFile: string;
  readonly promptsDir: string;
  readonly admiralDir: Option.Option<string>;
  readonly gameServerBinary: Option.Option<string>;
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
  const temps = parseTemperatures(Option.getOrUndefined(parsed.temperatures));
  if (temps === null) {
    return {
      ok: false,
      error: `invalid --temperatures value: expected comma-separated floats, e.g. '0.7,1.0'`,
    };
  }
  const flags: RunFlags = {
    ...(Option.isSome(parsed.modelName) ? { modelName: parsed.modelName.value } : {}),
    maxTokens: parsed.maxTokens,
    scenarios: parsed.scenarios,
    noSave: parsed.noSave,
    fresh: parsed.fresh,
    temperatures: temps,
    ...(Option.isSome(parsed.idleTimeout) ? { idleTimeoutSec: parsed.idleTimeout.value } : {}),
    archiveDir: parsed.archiveDir,
    scenariosOnly: parsed.scenariosOnly,
  };
  return { ok: true, flags };
};

// ── Handler ────────────────────────────────────────────────────────────────

const systemPromptsPath = (promptsDir: string) => `${promptsDir}/system-prompts.yaml`;
const scenariosSubdir = (promptsDir: string) => `${promptsDir}/scenarios`;

const registryLayer = (promptsDir: string) =>
  Layer.effect(SystemPromptRegistry, loadSystemPrompts(systemPromptsPath(promptsDir)));

export const runCommand = Command.make("run", runOptions, (raw) =>
  Effect.gen(function* () {
    const parsed = raw as unknown as RunOptionsParsed;
    const normalized = normalizeRunOptions(parsed);
    if (!normalized.ok) {
      yield* Effect.logError(normalized.error);
      return yield* Effect.fail(new Error(normalized.error));
    }
    const flags = normalized.flags;

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
      flags,
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
      const label = m.manifest.model;
      const stats = m.stats;
      console.log(
        `${label}\tcompleted=${stats.completed}\tskippedCached=${stats.skippedCached}\terrors=${stats.errors}\tinterrupted=${m.interrupted}`,
      );
    }
  }).pipe(Effect.provide(ChatCompletionLive), Effect.provide(FetchHttpClient.layer)),
).pipe(Command.withDescription("Run the benchmark suite against configured models"));
