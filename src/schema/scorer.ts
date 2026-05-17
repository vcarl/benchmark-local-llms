import { Schema } from "effect";
import { ConstraintDef } from "./constraints.js";

/**
 * Scorer configurations from requirements §2.2. The union is discriminated
 * by `type` — same literal set as {@link ScorerType} in `./enums.ts`.
 *
 * Scorer config is **pure data** (not closures as in the Python prototype);
 * evaluation lives in a separate scoring module (phase B3).
 */

/** Regex-extraction + string-equality scorer (§4.2). */
export const ExactMatchConfig = Schema.Struct({
  type: Schema.Literal("exact_match"),
  /** Target string (case-sensitive). */
  expected: Schema.String,
  /** Regex with a capture group; last match's first group is compared. */
  extract: Schema.String,
});
export type ExactMatchConfig = typeof ExactMatchConfig.Type;

/** Constraint-DSL scorer (§4.3). Score = passedCount / totalCount. */
export const ConstraintConfig = Schema.Struct({
  type: Schema.Literal("constraint"),
  constraints: Schema.Array(ConstraintDef),
});
export type ConstraintConfig = typeof ConstraintConfig.Type;

/**
 * Python-subprocess scorer (§4.4). `testCode` is resolved at YAML load
 * time from the companion `testFile` reference (§2.2) and embedded here
 * directly so the RunManifest is self-contained.
 */
export const CodeExecConfig = Schema.Struct({
  type: Schema.Literal("code_exec"),
  testCode: Schema.String,
});
export type CodeExecConfig = typeof CodeExecConfig.Type;

/**
 * Game scenario scorer (§4.5). `gameScorer` is a registry key into the 14
 * scorers listed in requirements §4.5; `scorerParams` are opaque per-scorer
 * parameters carried as a plain record.
 */
export const GameScorerConfig = Schema.Struct({
  type: Schema.Literal("game"),
  gameScorer: Schema.String,
  scorerParams: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
export type GameScorerConfig = typeof GameScorerConfig.Type;

export const ScorerConfig = Schema.Union(
  ExactMatchConfig,
  ConstraintConfig,
  CodeExecConfig,
  GameScorerConfig,
);
export type ScorerConfig = typeof ScorerConfig.Type;
