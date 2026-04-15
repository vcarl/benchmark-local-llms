/**
 * `migrate` subcommand — ports prototype `benchmark-execution/*.jsonl` files
 * into new-format RunManifest archives. Delegates to `runMigrate` (D3) in
 * `src/migrate/`. Destructive-safe: source files are never modified.
 */
import { Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { runMigrate } from "../../migrate/index.js";
import { scenariosSubdir, systemPromptsPath } from "../paths.js";

const inputDir = Options.directory("input").pipe(
  Options.withDescription("Directory of prototype .jsonl files to migrate"),
  Options.withDefault("./benchmark-execution"),
);

const outputDir = Options.directory("output").pipe(
  Options.withDescription("Output directory for RunManifest archives"),
  Options.withDefault("./benchmark-archive"),
);

const promptsDir = Options.directory("prompts-dir").pipe(
  Options.withDescription("Prompts directory (used to reconstruct corpus metadata)"),
  Options.withDefault("prompts"),
);

const dryRun = Options.boolean("dry-run").pipe(
  Options.withDescription("Plan only; don't write migrated archives"),
  Options.withDefault(false),
);

export const migrateCommand = Command.make(
  "migrate",
  { inputDir, outputDir, promptsDir, dryRun },
  (args) =>
    Effect.gen(function* () {
      const registry = Layer.effect(
        SystemPromptRegistry,
        loadSystemPrompts(systemPromptsPath(args.promptsDir)),
      );
      const currentPromptCorpus = yield* loadPromptCorpus(args.promptsDir).pipe(
        Effect.provide(registry),
      );
      const currentScenarioCorpus = yield* loadScenarioCorpus(scenariosSubdir(args.promptsDir));

      const summary = yield* runMigrate({
        sourceDir: args.inputDir,
        outputDir: args.outputDir,
        currentPromptCorpus,
        currentScenarioCorpus,
        dryRun: args.dryRun,
      });

      yield* Effect.logInfo(
        `migrate: ${summary.filesRead} prototype file(s) → ${summary.archives.length} archive(s)${summary.dryRun ? " (dry-run)" : ""}`,
      );
      if (summary.readIssues.length > 0) {
        yield* Effect.logWarning(`migrate: ${summary.readIssues.length} read issue(s)`);
      }
      if (summary.invalidRecords.length > 0) {
        yield* Effect.logWarning(`migrate: ${summary.invalidRecords.length} invalid record(s)`);
      }
    }),
).pipe(
  Command.withDescription(
    "Migrate prototype benchmark-execution/*.jsonl files into RunManifest archives",
  ),
);
