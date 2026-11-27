import { Schema } from "effect";
import { ConstraintDef } from "./constraints.js";

/**
 * Scorer configurations from requirements §2.2. The union is discriminated
 * by `type` — same literal set as {@link ScorerType} in `./enums.ts`.
 *
 * Scorer config is **pure data** (not closures as in the Python prototype);
 * evaluation lives in a separate scoring module (phase B3).
 */

/** Partial credit for a near miss: strictly between 0 and 1. */
const NearMissCredit = Schema.Number.pipe(Schema.greaterThan(0), Schema.lessThan(1));

/**
 * A named near miss on an `exact_match` item: an extracted answer equal to
 * `expected` scores `credit` instead of 0. `slip` names the mistake (e.g.
 * `round-at-end`, `percent-for-decimal`).
 */
export const ExactNearMiss = Schema.Struct({
  slip: Schema.String,
  credit: NearMissCredit,
  expected: Schema.String,
});
export type ExactNearMiss = typeof ExactNearMiss.Type;

/** A named near miss on a `constraint` item: output matching `pattern` scores `credit`. */
export const PatternNearMiss = Schema.Struct({
  slip: Schema.String,
  credit: NearMissCredit,
  pattern: Schema.String,
});
export type PatternNearMiss = typeof PatternNearMiss.Type;

/** Regex-extraction + string-equality scorer (§4.2). */
export const ExactMatchConfig = Schema.Struct({
  type: Schema.Literal("exact_match"),
  /** Target string (case-sensitive). */
  expected: Schema.String,
  /** Regex with a capture group; last match's first group is compared. */
  extract: Schema.String,
  /**
   * Looser regex tried only when `extract` finds nothing (e.g. the answer
   * without its `ANSWER:` marker); a correct answer it recovers is a format
   * flaw (`FORMAT_FLAW_CREDIT`).
   */
  fallbackExtract: Schema.optional(Schema.String),
  /** Wrong answers that earn partial credit, checked in order when the answer is not `expected`. */
  nearMisses: Schema.optional(Schema.Array(ExactNearMiss)),
});
export type ExactMatchConfig = typeof ExactMatchConfig.Type;

/** Constraint-DSL scorer (§4.3). Score = passedCount / totalCount. */
export const ConstraintConfig = Schema.Struct({
  type: Schema.Literal("constraint"),
  constraints: Schema.Array(ConstraintDef),
  /** Patterns that earn partial credit, checked in order when the constraints score below 1. */
  nearMisses: Schema.optional(Schema.Array(PatternNearMiss)),
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
  /**
   * Submission mode (`sql`, `regex`, ...): the output's first fenced `<lang>`
   * block is bound to the Python string `SUBMISSION` for `testCode` to judge,
   * instead of being executed. Absent: the output is Python and runs.
   */
  submission: Schema.optional(Schema.String),
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

/**
 * Set-membership scorer. Grades an answer that is an unordered SET of known
 * entities (e.g. which actors are colluding, a currency-arbitrage cycle).
 *
 * `vocabulary` is the closed set of candidate entity names; extraction only
 * ever recognises tokens from this list, which makes parsing the model's prose
 * robust. `expected` is the gold set (order ignored); every element must appear
 * in `vocabulary` (enforced at load time). Partial credit is the F1 score of
 * the predicted set against `expected`; full credit on "all and only".
 */
export const SetMatchConfig = Schema.Struct({
  type: Schema.Literal("set_match"),
  vocabulary: Schema.Array(Schema.String),
  expected: Schema.Array(Schema.String),
  /** Case-sensitive entity matching. Defaults to false (case-insensitive). */
  caseSensitive: Schema.optional(Schema.Boolean),
});
export type SetMatchConfig = typeof SetMatchConfig.Type;

/**
 * Ordered-sequence scorer. Grades an answer that is an ORDERED sequence of
 * known entities (e.g. the order firms default in a contagion cascade, the
 * strongest trust path through a graph).
 *
 * Same `vocabulary` / `expected` / `caseSensitive` contract as
 * {@link SetMatchConfig}, except `expected` is an ordered sequence. Partial
 * credit is the longest-common-subsequence ratio
 * `|LCS(predicted, expected)| / max(|predicted|, |expected|)`; full credit on
 * "all and only, in order".
 */
export const OrderedMatchConfig = Schema.Struct({
  type: Schema.Literal("ordered_match"),
  vocabulary: Schema.Array(Schema.String),
  expected: Schema.Array(Schema.String),
  /** Case-sensitive entity matching. Defaults to false (case-insensitive). */
  caseSensitive: Schema.optional(Schema.Boolean),
});
export type OrderedMatchConfig = typeof OrderedMatchConfig.Type;

/** Challenge-supplied Python scorer with its script source inline, run in the sandbox (`scoring/custom.ts`). */
export const CustomConfig = Schema.Struct({
  type: Schema.Literal("custom"),
  source: Schema.String,
});
export type CustomConfig = typeof CustomConfig.Type;

export const ScorerConfig = Schema.Union(
  ExactMatchConfig,
  ConstraintConfig,
  CodeExecConfig,
  GameScorerConfig,
  SetMatchConfig,
  OrderedMatchConfig,
  CustomConfig,
);
export type ScorerConfig = typeof ScorerConfig.Type;
