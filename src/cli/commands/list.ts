/**
 * `list-models` and `list-prompts` subcommands.
 *
 * No network calls, no server spawns — these are pure data-read commands
 * useful for inspecting the current corpus + model config. They match the
 * sections of `benchmark.py`'s "no models matching" and "no prompts matching"
 * fallback printouts (lines 132-134, 158-161) that enumerate available
 * values, but exposed as first-class subcommands.
 */
import { Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { loadModels } from "../../config/models.js";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import type { ModelConfig } from "../../schema/model.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";

const modelsPathOpt = Options.file("models").pipe(
  Options.withDescription("Path to models.yaml"),
  Options.withDefault("models.yaml"),
);

const promptsDirOpt = Options.directory("prompts").pipe(
  Options.withDescription("Path to prompts directory"),
  Options.withDefault("prompts"),
);

// ── formatting (pure) ──────────────────────────────────────────────────────

/**
 * Render one model row: `artifact  runtime  quant`. Missing quant is
 * rendered as `"-"` so columns line up even when config omits it.
 */
export const formatModelLine = (m: ModelConfig): string => {
  const quant = m.quant ?? "-";
  return `${m.artifact}\t${m.runtime}\t${quant}`;
};

export const formatModelList = (models: ReadonlyArray<ModelConfig>): string =>
  models.map(formatModelLine).join("\n");

/** One prompt row: `name  category  tier  system-prompt-key`. */
export const formatPromptLine = (p: PromptCorpusEntry): string =>
  `${p.name}\t${p.category}\ttier${p.tier}\t${p.system.key}`;

export const formatScenarioLine = (s: ScenarioCorpusEntry): string =>
  `${s.name}\t<scenario>\ttier${s.tier}\t-`;

/**
 * Assemble the full `list-prompts` output: prompts first (by category, stable
 * within each category), then a "Scenarios" group at the end.
 */
export const formatPromptList = (
  prompts: ReadonlyArray<PromptCorpusEntry>,
  scenarios: ReadonlyArray<ScenarioCorpusEntry>,
): string => {
  const promptLines = [...prompts]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(formatPromptLine);
  const scenarioLines = [...scenarios]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(formatScenarioLine);

  const out: string[] = [];
  out.push(...promptLines);
  if (scenarioLines.length > 0) {
    if (promptLines.length > 0) out.push("");
    out.push("# Scenarios");
    out.push(...scenarioLines);
  }
  return out.join("\n");
};

// ── handlers ───────────────────────────────────────────────────────────────

/**
 * Build the system-prompts registry as a Layer that reads from the ambient
 * FileSystem. Needed by `loadPromptCorpus` to resolve `system:` keys.
 */
const registryLayer = (promptsDir: string) =>
  Layer.effect(SystemPromptRegistry, loadSystemPrompts(`${promptsDir}/system-prompts.yaml`));

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

export const listModelsCommand = Command.make(
  "list-models",
  { modelsPath: modelsPathOpt },
  ({ modelsPath }) =>
    Effect.gen(function* () {
      const models = yield* loadModels(modelsPath);
      yield* printLine(formatModelList(models));
    }),
).pipe(Command.withDescription("Print one line per configured model (artifact, runtime, quant)"));

export const listPromptsCommand = Command.make(
  "list-prompts",
  { promptsDir: promptsDirOpt },
  ({ promptsDir }) =>
    Effect.gen(function* () {
      const prompts = yield* loadPromptCorpus(promptsDir).pipe(
        Effect.provide(registryLayer(promptsDir)),
      );
      // Scenarios dir is optional — a repo may not have scenarios configured
      // yet. Missing dir → empty list, not an error.
      const scenarios = yield* loadScenarioCorpus(`${promptsDir}/scenarios`).pipe(
        Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<ScenarioCorpusEntry>)),
      );
      yield* printLine(formatPromptList(prompts, scenarios));
    }),
).pipe(Command.withDescription("Print loaded prompts and scenarios"));
