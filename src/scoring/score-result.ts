import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import {
  type CodeExecFailed,
  type CodeExecTimeout,
  ScorerNotFound,
  type ScorerSpawnFailed,
} from "../errors/index.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreByConfig } from "./dispatch.js";
import { GAME_SCORERS } from "./game.js";

export interface PromptScore {
  readonly kind: "prompt";
  readonly score: number; // [0, 1]
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
  /**
   * Structured reason a zero score is not an ordinary wrong answer:
   * `no_answer` when the scorer's extraction found nothing to grade,
   * `scorer_error` when the scorer itself failed. Absent otherwise.
   */
  readonly failure?: "no_answer" | "scorer_error";
  /** The `slip` of the declared near miss that set this score. */
  readonly nearMiss?: string;
}

/** Credit for a correct answer that ignored the requested answer format. */
export const FORMAT_FLAW_CREDIT = 0.75;
/** The near-miss slip a format flaw carries (`failureKind` `near_miss`). */
export const FORMAT_FLAW = "format-flaw";

/**
 * Downgrade a full-credit score that was reached only through a looser
 * fallback reading of the output (no answer marker, wrong fence) to
 * {@link FORMAT_FLAW_CREDIT}, tagged `nearMiss: format-flaw`. Any other score
 * passes through: a fallback never lifts a wrong answer.
 */
export const asFormatFlaw = (s: PromptScore, flaw: string): PromptScore =>
  s.score === 1
    ? {
        ...s,
        score: FORMAT_FLAW_CREDIT,
        details: `format flaw (${flaw}): ${s.details}`,
        nearMiss: FORMAT_FLAW,
      }
    : s;

export interface ScenarioScore {
  readonly kind: "scenario";
  readonly value: number; // raw, from finalPlayerStats[scoreField]; no coercion
  readonly scoreField: string;
  readonly details: string;
}

export type ScoreResult = PromptScore | ScenarioScore;

export interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}

export type CorpusEntry = PromptCorpusEntry | ScenarioCorpusEntry;

const isPromptEntry = (e: CorpusEntry): e is PromptCorpusEntry =>
  "scorer" in e && typeof (e as PromptCorpusEntry).scorer === "object";

export const scoreExecution = (
  result: ExecutionResult,
  entry: CorpusEntry,
): Effect.Effect<
  ScoreResult,
  ScorerNotFound | CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> => {
  if (isPromptEntry(entry)) {
    return scoreByConfig(result.output, entry.scorer);
  }
  const fn = GAME_SCORERS[entry.scorer];
  if (fn === undefined) {
    return Effect.fail(new ScorerNotFound({ scorerName: entry.scorer }));
  }
  return Effect.sync(() => fn(result, entry.scorerParams));
};
