/**
 * Common types returned from every scorer. The requirements doc §4.x consistently
 * describes a score (number) plus a human-readable `details` string; we mirror
 * that here with a single shape rather than four slightly-different ones.
 *
 * Score is in [0, 1] in all cases. `breakdown` carries constraint-specific
 * pass/fail/errored lists when relevant, so the report layer can render the
 * detail without re-running the scorer.
 */
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { type CodeExecFailed, type CodeExecTimeout, ScorerNotFound } from "../errors/index.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreCodeExec } from "./code-exec.js";
import { scoreConstraints } from "./constraint.js";
import { scoreExactMatch } from "./exact-match.js";
import { GAME_SCORERS } from "./game.js";
import { stripThinkingTags } from "./strip-thinking.js";

export interface Score {
  readonly score: number;
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
}

export interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}

export type CorpusEntry = PromptCorpusEntry | ScenarioCorpusEntry;

const isPromptEntry = (e: CorpusEntry): e is PromptCorpusEntry =>
  "scorer" in e && typeof (e as PromptCorpusEntry).scorer === "object";

/**
 * Top-level scoring dispatch (§4). Given an execution result and its corpus
 * entry, strip thinking tags from the output and route to the appropriate
 * scorer.
 *
 * PromptCorpusEntry carries a ScorerConfig discriminated union; we switch on
 * the `type` tag. ScenarioCorpusEntry carries a bare `scorer` name string;
 * we look it up in the game scorer registry (or fail with ScorerNotFound).
 */
export const scoreExecution = (
  result: ExecutionResult,
  entry: CorpusEntry,
): Effect.Effect<
  Score,
  ScorerNotFound | CodeExecTimeout | CodeExecFailed,
  CommandExecutor.CommandExecutor
> => {
  if (isPromptEntry(entry)) {
    const stripped = stripThinkingTags(result.output);
    const cfg = entry.scorer;
    switch (cfg.type) {
      case "exact_match":
        return scoreExactMatch(stripped, cfg);
      case "constraint":
        return scoreConstraints(stripped, cfg);
      case "code_exec":
        return scoreCodeExec(stripped, cfg.testCode);
      case "game":
        // A `game` ScorerConfig on a *prompt* entry is degenerate per the
        // schema but the union allows it. Treat as ScorerNotFound — game
        // scorers should only appear on scenario entries.
        return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
    }
  }
  // Scenario entry: look up the game scorer by name.
  const fn = GAME_SCORERS[entry.scorer];
  if (fn === undefined) {
    return Effect.fail(new ScorerNotFound({ scorerName: entry.scorer }));
  }
  return Effect.sync(() => fn(result, entry.scorerParams));
};
