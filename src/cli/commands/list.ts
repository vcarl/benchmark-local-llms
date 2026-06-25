/**
 * `list-models` and `list-prompts` subcommands.
 *
 * No network calls, no server spawns — these are pure data-read commands
 * useful for inspecting the current challenge items + model config. They match
 * the sections of `benchmark.py`'s "no models matching" and "no prompts
 * matching" fallback printouts (lines 132-134, 158-161) that enumerate
 * available values, but exposed as first-class subcommands.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { loadChallenge } from "../../config/challenges.js";
import { loadConfigurations, type ResolvedConfiguration } from "../../config/configurations.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";
import { makeLoggerLayer } from "../logger.js";
import { DEFAULT_SCENARIOS_DIR, DEFAULT_SYSTEM_PROMPTS_PATH } from "../paths.js";

const configsFileOpt = Options.file("configs-file").pipe(
  Options.withDescription("Path to configs.yaml"),
  Options.withDefault("configs.yaml"),
);

const systemPromptsFileOpt = Options.file("system-prompts-file").pipe(
  Options.withDescription("Path to system-prompts YAML"),
  Options.withDefault(DEFAULT_SYSTEM_PROMPTS_PATH),
);

const challengesDirOpt = Options.directory("challenges").pipe(
  Options.withDescription("Path to challenges directory"),
  Options.withDefault("challenges"),
);

const scenariosDirOpt = Options.directory("scenarios").pipe(
  Options.withDescription("Path to scenarios directory"),
  Options.withDefault(DEFAULT_SCENARIOS_DIR),
);

// ── formatting (pure) ──────────────────────────────────────────────────────

/**
 * Render one configuration row: `id  artifact  runtime  quant  active`.
 * Missing quant renders as `"-"`; `active` is the effective boolean
 * (`active !== false`), so a config that omits the flag shows `true`.
 */
export const formatModelLine = (c: ResolvedConfiguration): string => {
  const quant = c.quant ?? "-";
  return `${c.id}\t${c.artifact}\t${c.runtime}\t${quant}\t${c.active !== false}`;
};

export const formatModelList = (configs: ReadonlyArray<ResolvedConfiguration>): string =>
  configs.map(formatModelLine).join("\n");

/** One prompt row: `name  category  tier`. */
export const formatPromptLine = (p: PromptCorpusEntry): string =>
  `${p.name}\t${p.category}\ttier${p.tier}`;

export const formatScenarioLine = (s: ScenarioCorpusEntry): string =>
  `${s.name}\t<scenario>\ttier${s.tier}`;

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

/** Load every `challenges/*.yaml` and flatten their resolved prompt items. */
const loadAllChallengeItems = (
  challengesDir: string,
): Effect.Effect<ReadonlyArray<PromptCorpusEntry>, unknown, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(challengesDir);
    const yamlFiles = entries
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.join(challengesDir, f))
      .sort();
    const challenges = yield* Effect.forEach(yamlFiles, (file) => loadChallenge(file));
    return challenges.flatMap((c) => c.items.map((i) => i.prompt));
  });

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

export const listModelsCommand = Command.make(
  "list-models",
  { configsFile: configsFileOpt, systemPromptsFile: systemPromptsFileOpt, verbose },
  ({ configsFile, systemPromptsFile, verbose: isVerbose }) =>
    Effect.gen(function* () {
      const systemPrompts = yield* loadSystemPrompts(systemPromptsFile);
      const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
      const configs = yield* loadConfigurations(configsFile).pipe(Effect.provide(registryLayer));
      yield* printLine(formatModelList(configs));
    }).pipe(Effect.provide(makeLoggerLayer(isVerbose))),
).pipe(
  Command.withDescription(
    "Print one line per configuration (id, artifact, runtime, quant, active)",
  ),
);

export const listPromptsCommand = Command.make(
  "list-prompts",
  { challengesDir: challengesDirOpt, scenariosDir: scenariosDirOpt, verbose },
  ({ challengesDir, scenariosDir, verbose: isVerbose }) =>
    Effect.gen(function* () {
      const prompts = yield* loadAllChallengeItems(challengesDir);
      // Scenarios dir is optional — a repo may not have scenarios configured
      // yet. Missing dir → empty list, not an error.
      const scenarios = yield* loadScenarioCorpus(scenariosDir).pipe(
        Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<ScenarioCorpusEntry>)),
      );
      yield* printLine(formatPromptList(prompts, scenarios));
    }).pipe(Effect.provide(makeLoggerLayer(isVerbose))),
).pipe(Command.withDescription("Print loaded prompts and scenarios"));
