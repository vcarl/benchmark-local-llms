/**
 * Flag definitions for the `run` subcommand. Split out of `run.ts` to keep
 * both files focused and under the ~200-line budget.
 *
 * Python prototype cross-refs for each flag are in the block comment of
 * `./run.ts`.
 */
import { Options } from "@effect/cli";

export const modelName = Options.text("model-name").pipe(
  Options.withDescription("Substring filter on model display name (case-insensitive)"),
  Options.optional,
);

export const maxTokens = Options.integer("max-tokens").pipe(
  Options.withDescription("Max generation tokens per prompt (default 8096)"),
  Options.withDefault(8096),
);

export const scenarios = Options.text("scenarios").pipe(
  Options.withDescription("'all' | 'none' | substring filter on scenario names (default 'all')"),
  Options.withDefault("all"),
);

export const noSave = Options.boolean("no-save").pipe(
  Options.withDescription("Don't write archive files"),
  Options.withDefault(false),
);

export const fresh = Options.boolean("fresh").pipe(
  Options.withDescription("Ignore cross-run cache; every prompt re-runs"),
  Options.withDefault(false),
);

export const temperatures = Options.text("temperatures").pipe(
  Options.withDescription("Comma-separated list of temperatures, e.g. '0.7,1.0' (default '0.7')"),
  Options.optional,
);

export const idleTimeout = Options.integer("idle-timeout").pipe(
  Options.withDescription("SSE idle timeout in seconds for scenarios (default 120)"),
  Options.optional,
);

export const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Output directory for archive JSONL files"),
  Options.withDefault("./benchmark-archive"),
);

export const scenariosOnly = Options.boolean("scenarios-only").pipe(
  Options.withDescription("Skip the prompt corpus; run only scenarios"),
  Options.withDefault(false),
);

export const modelsFile = Options.file("models-file").pipe(
  Options.withDescription("Path to models.yaml"),
  Options.withDefault("models.yaml"),
);

export const promptsDir = Options.directory("prompts-dir").pipe(
  Options.withDescription("Path to prompts directory"),
  Options.withDefault("prompts"),
);

export const admiralDir = Options.directory("admiral-dir").pipe(
  Options.withDescription("Directory containing Admiral checkout (required for scenarios)"),
  Options.optional,
);

export const gameServerBinary = Options.file("game-server-binary").pipe(
  Options.withDescription("Path to gameserver binary (required for scenarios)"),
  Options.optional,
);

export const runOptions = {
  modelName,
  maxTokens,
  scenarios,
  noSave,
  fresh,
  temperatures,
  idleTimeout,
  archiveDir,
  scenariosOnly,
  modelsFile,
  promptsDir,
  admiralDir,
  gameServerBinary,
};
