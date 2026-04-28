/**
 * `report` subcommand — loads archives, scores results against the current
 * on-disk corpus, and emits the webapp's `data.js` file. Delegates to
 * `runReport` (D2) in `src/report/`.
 *
 * Results whose prompt or scenario content has changed since the run
 * (hash drift) or has been removed from the corpus are dropped and reported
 * in the summary.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { FileIOError } from "../../errors/index.js";
import { type ReportSummary, runReport } from "../../report/index.js";
import { makeLoggerLayer } from "../logger.js";
import { scenariosSubdir, systemPromptsPath } from "../paths.js";

/**
 * Emit the three-line audit block for a completed report run.
 *
 * Always prints — even when all counters are zero — so operators have a clear
 * read on what was loaded, what was dropped and why, and what was written.
 *
 * Line 1: how many archives were loaded
 * Line 2: how many results were dropped (and why)
 * Line 3: how many cells were written and where
 */
export const logAuditBlock = (summary: ReportSummary): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`report: loaded ${summary.archivesLoaded} archives`);
    yield* Effect.logInfo(
      `report: dropped ${summary.dropped.promptAbsent} (prompt absent), ${summary.dropped.promptDrifted} (prompt drifted)`,
    );
    yield* Effect.logInfo(`report: wrote ${summary.recordCount} cells → ${summary.outputPath}`);
  });

/**
 * True when a {@link FileIOError} indicates the archive directory itself is
 * missing (rather than a per-file load failure). The archive-dir read is the
 * first filesystem op `runReport` performs; ENOENT / NotFound here usually
 * means the operator hasn't run `./bench migrate` yet.
 */
export const isMissingArchiveDirError = (err: FileIOError): boolean =>
  err.operation === "read-archive-dir" && /ENOENT|NotFound/i.test(String(err.cause));

export const missingArchiveDirHint = (archiveDir: string): string =>
  `No archive directory at '${archiveDir}'. Run './bench migrate' to create ` +
  "archives from benchmark-execution/, or pass --archive-dir to point at an existing directory.";

const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Archive directory to scan"),
  Options.withDefault("./benchmark-archive"),
);

const output = Options.directory("output").pipe(
  Options.withDescription("Output directory for data.js (e.g. webapp/src/data)"),
  Options.withDefault("./webapp/src/data"),
);

const promptsDir = Options.directory("prompts-dir").pipe(
  Options.withDescription("Prompts directory containing the current corpus"),
  Options.withDefault("prompts"),
);

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

export const reportCommand = Command.make(
  "report",
  { archiveDir, output, promptsDir, verbose },
  (args) =>
    Effect.gen(function* () {
      const outputPath = path.join(args.output, "data.js");
      const registry = Layer.effect(
        SystemPromptRegistry,
        loadSystemPrompts(systemPromptsPath(args.promptsDir)),
      );
      const loadPrompts = loadPromptCorpus(args.promptsDir).pipe(Effect.provide(registry));
      const loadScenarios = loadScenarioCorpus(scenariosSubdir(args.promptsDir));

      const currentPromptCorpus = yield* loadPrompts;
      const currentScenarioCorpus = yield* loadScenarios;

      const summary = yield* runReport({
        archiveDir: args.archiveDir,
        outputPath,
        currentPromptCorpus,
        currentScenarioCorpus,
      }).pipe(
        Effect.tapError((err) =>
          err instanceof FileIOError && isMissingArchiveDirError(err)
            ? Effect.logError(missingArchiveDirHint(args.archiveDir))
            : Effect.void,
        ),
      );

      if (summary.loadIssues.length > 0) {
        yield* Effect.logWarning(`report: ${summary.loadIssues.length} archive load issue(s)`);
      }
      yield* logAuditBlock(summary);
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(Command.withDescription("Generate webapp report data from archive files"));
