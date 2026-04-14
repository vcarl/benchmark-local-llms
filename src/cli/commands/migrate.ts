/**
 * `migrate` subcommand — shell for the migration tool (task D3). Like
 * `report`, this is a thin wrapper that delegates to `src/migrate/`; that
 * module is being built in a sibling worktree and is not yet on this branch.
 * The stub import in `src/cli/stubs/` satisfies the compiler — the merge
 * step will swap it for the real entry point.
 *
 * Flag surface: minimal. The Python prototype had no migrate command — this
 * is a new CLI exposing the D3 tool. We keep the options flat (input dir,
 * output dir, prompts dir for corpus reconstruction).
 */
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { runMigration } from "../stubs/migrate-stub.js";

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
  Options.withDescription("Don't write anything; just print what would happen"),
  Options.withDefault(false),
);

export const migrateCommand = Command.make(
  "migrate",
  { inputDir, outputDir, promptsDir, dryRun },
  (args) =>
    Effect.gen(function* () {
      yield* runMigration({
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        promptsDir: args.promptsDir,
        dryRun: args.dryRun,
      });
    }),
).pipe(
  Command.withDescription(
    "Migrate prototype benchmark-execution/*.jsonl files into RunManifest archives",
  ),
);
