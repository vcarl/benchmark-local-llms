/**
 * `report` subcommand — shell that calls the top-level report generator
 * (task D2) once it lands on the shared branch.
 *
 * As of this commit `src/report/` is being built in a sibling worktree; the
 * import is stubbed via an indirection so this file compiles against the
 * current base branch. At merge time the stub entry point is replaced by
 * whatever D2 exports (e.g. `generateReport(args) => Effect<void, …>`).
 * Flag surface mirrors requirements §8.3 plus a default archive-dir.
 */
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { generateReport } from "../stubs/report-stub.js";

const archiveGlob = Options.text("archive").pipe(
  Options.withDescription(
    "Path or glob of archive JSONL files to include (default all in archive-dir)",
  ),
  Options.optional,
);

const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Archive directory to scan when --archive is not set"),
  Options.withDefault("./benchmark-archive"),
);

const scoring = Options.choice("scoring", ["as-run", "current"] as const).pipe(
  Options.withDescription("Which corpus to score against: as-run (embedded) or current (disk)"),
  Options.withDefault("as-run"),
);

const output = Options.directory("output").pipe(
  Options.withDescription("Output directory for report (e.g. webapp/src/data)"),
  Options.withDefault("./webapp/src/data"),
);

const promptsDir = Options.directory("prompts-dir").pipe(
  Options.withDescription("Prompts directory (only used when --scoring=current)"),
  Options.withDefault("prompts"),
);

export const reportCommand = Command.make(
  "report",
  { archiveGlob, archiveDir, scoring, output, promptsDir },
  (args) =>
    Effect.gen(function* () {
      yield* generateReport({
        archiveGlob: args.archiveGlob._tag === "Some" ? args.archiveGlob.value : undefined,
        archiveDir: args.archiveDir,
        scoring: args.scoring,
        output: args.output,
        promptsDir: args.promptsDir,
      });
    }),
).pipe(Command.withDescription("Generate webapp report data from archive files"));
