import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { type CodeExecFailed, type CodeExecTimeout, ScorerNotFound } from "../errors/index.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreByConfig } from "./dispatch.js";
import { GAME_SCORERS } from "./game.js";

export interface PromptScore {
  readonly kind: "prompt";
  readonly score: number; // [0, 1]
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
}

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
  ScorerNotFound | CodeExecTimeout | CodeExecFailed,
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
