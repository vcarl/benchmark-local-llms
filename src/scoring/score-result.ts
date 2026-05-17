import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { type CodeExecFailed, type CodeExecTimeout, ScorerNotFound } from "../errors/index.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreCodeExec } from "./code-exec.js";
import { scoreConstraints } from "./constraint.js";
import { scoreExactMatch } from "./exact-match.js";
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
    const cfg = entry.scorer;
    switch (cfg.type) {
      case "exact_match":
        return scoreExactMatch(result.output, cfg);
      case "constraint":
        return scoreConstraints(result.output, cfg);
      case "code_exec":
        return scoreCodeExec(result.output, cfg.testCode);
      case "game":
        return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
    }
  }
  const fn = GAME_SCORERS[entry.scorer];
  if (fn === undefined) {
    return Effect.fail(new ScorerNotFound({ scorerName: entry.scorer }));
  }
  return Effect.sync(() => fn(result, entry.scorerParams));
};
