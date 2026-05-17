/**
 * `score` subcommand — re-score an existing archive without running.
 *
 * The prototype exposed this behaviour only via `--report-only` (benchmark.py
 * lines 91-94, 106-112) which regenerated the HTML report from cached data.
 * The new `report` subcommand carries that role (writes webapp data). This
 * `score` subcommand is the smaller, focused tool: read archive → score each
 * result against the embedded corpus → print a tabular summary to stdout.
 * Useful when iterating on scorers without re-running models.
 *
 * Writing a scored archive back to disk is intentionally NOT done here — the
 * archive format (§6.1) stores `ExecutionResult` which does not carry a score
 * field; scores are transient (§2.5). If the operator wants rescored output
 * persisted, that's the `report` subcommand's job.
 */
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { loadManifest } from "../../archive/loader.js";
import type { ExecutionResult } from "../../schema/execution.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";
import { scoreExecution } from "../../scoring/score-result.js";
import { makeLoggerLayer } from "../logger.js";

const archivePathOpt = Options.file("archive").pipe(
  Options.withDescription("Path to the archive JSONL file to re-score"),
);

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

/**
 * Look up the corpus entry that matches an `ExecutionResult`. Prompt results
 * key into `promptCorpus`; scenario results (those with `scenarioName` set)
 * key into `scenarioCorpus`. Returns `null` when no corpus entry matches —
 * the caller renders that as "no-corpus".
 */
export const resolveCorpusEntry = (
  result: ExecutionResult,
  promptCorpus: Record<string, PromptCorpusEntry>,
  scenarioCorpus: Record<string, ScenarioCorpusEntry>,
): PromptCorpusEntry | ScenarioCorpusEntry | null => {
  if (result.scenarioName !== null) {
    return scenarioCorpus[result.scenarioName] ?? null;
  }
  return promptCorpus[result.promptName] ?? null;
};

/**
 * Format one line of the score table. Kept as a pure string builder so the
 * handler can keep its shape and tests can exercise the formatting without
 * needing the archive loader.
 */
export const formatScoredLine = (
  result: ExecutionResult,
  score: { readonly score: number; readonly details?: string | undefined } | null,
): string => {
  const scoreCell = score === null ? "no-corpus" : String(score.score.toFixed(3));
  const details = score?.details ?? "";
  return `${result.model}\t${result.promptName}\ttemp=${result.temperature}\t${scoreCell}\t${details}`;
};

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

export const scoreCommand = Command.make(
  "score",
  { archive: archivePathOpt, verbose },
  ({ archive, verbose: isVerbose }) =>
    Effect.gen(function* () {
      const loaded = yield* loadManifest(archive);
      const prompts = loaded.manifest.promptCorpus;
      const scenarios = loaded.manifest.scenarioCorpus;

      for (const result of loaded.results) {
        const entry = resolveCorpusEntry(result, prompts, scenarios);
        if (entry === null) {
          yield* printLine(formatScoredLine(result, null));
          continue;
        }
        const scoreOutcome = yield* scoreExecution(result, entry).pipe(Effect.either);
        if (scoreOutcome._tag === "Left") {
          yield* printLine(
            formatScoredLine(result, { score: 0, details: `error: ${String(scoreOutcome.left)}` }),
          );
          continue;
        }
        const s = scoreOutcome.right;
        yield* printLine(formatScoredLine(result, { score: s.score, details: s.details }));
      }
    }).pipe(Effect.provide(makeLoggerLayer(isVerbose))),
).pipe(Command.withDescription("Re-score an existing archive in place (stdout only)"));
