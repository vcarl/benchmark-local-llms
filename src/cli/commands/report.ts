/**
 * `report` subcommand — loads archives, scores results, emits the webapp's
 * `data.js` file. Delegates to `runReport` (D2) in `src/report/`.
 *
 * `--scoring=as-run` uses each archive's embedded corpus (self-contained
 * re-score). `--scoring=current` loads `prompts/` fresh via B1 and scores
 * against that — useful when the scoring logic or corpus has changed since
 * the archive was written.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { runReport } from "../../report/index.js";
import { makeLoggerLayer } from "../logger.js";
import { scenariosSubdir, systemPromptsPath } from "../paths.js";

const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Archive directory to scan"),
  Options.withDefault("./benchmark-archive"),
);

const scoring = Options.choice("scoring", ["as-run", "current"] as const).pipe(
  Options.withDescription("Which corpus to score against: as-run (embedded) or current (disk)"),
  Options.withDefault("as-run"),
);

const output = Options.directory("output").pipe(
  Options.withDescription("Output directory for data.js (e.g. webapp/src/data)"),
  Options.withDefault("./webapp/src/data"),
);

const promptsDir = Options.directory("prompts-dir").pipe(
  Options.withDescription("Prompts directory (only used when --scoring=current)"),
  Options.withDefault("prompts"),
);

const verbose = Options.boolean("verbose").pipe(Options.withAlias("v"), Options.withDefault(false));

export const reportCommand = Command.make(
  "report",
  { archiveDir, scoring, output, promptsDir, verbose },
  (args) =>
    Effect.gen(function* () {
      const outputPath = path.join(args.output, "data.js");
      const useCurrent = args.scoring === "current";
      const registry = Layer.effect(
        SystemPromptRegistry,
        loadSystemPrompts(systemPromptsPath(args.promptsDir)),
      );
      const currentPromptCorpus = useCurrent
        ? yield* loadPromptCorpus(args.promptsDir).pipe(Effect.provide(registry))
        : undefined;
      const currentScenarioCorpus = useCurrent
        ? yield* loadScenarioCorpus(scenariosSubdir(args.promptsDir))
        : undefined;

      const summary = yield* runReport({
        archiveDir: args.archiveDir,
        outputPath,
        scoringMode: args.scoring,
        ...(currentPromptCorpus !== undefined ? { currentPromptCorpus } : {}),
        ...(currentScenarioCorpus !== undefined ? { currentScenarioCorpus } : {}),
      });

      yield* Effect.logInfo(
        `report: wrote ${summary.recordCount} records from ${summary.archivesLoaded} archives → ${summary.outputPath}`,
      );
      if (summary.loadIssues.length > 0) {
        yield* Effect.logWarning(`report: ${summary.loadIssues.length} archive load issue(s)`);
      }
      if (summary.unmatched.length > 0) {
        yield* Effect.logWarning(`report: ${summary.unmatched.length} unmatched prompt(s)`);
      }
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(Command.withDescription("Generate webapp report data from archive files"));
