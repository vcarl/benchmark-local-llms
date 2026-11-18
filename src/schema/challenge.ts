import { Schema } from "effect";
import { ConstraintDef } from "./constraints.js";
import { ExactNearMiss, PatternNearMiss } from "./scorer.js";

/**
 * Raw on-disk shape of a single challenge item. The representation is
 * deliberately *flat* (scorer config interleaved with prompt metadata via a
 * `scorer:` discriminator), whereas the resolved `ResolvedItem` carries a
 * *nested* {@link import("./scorer.js").ScorerConfig} struct. The challenge
 * loader bridges the two.
 *
 * Split into four `scorer:`-discriminated structs (rather than one wide struct)
 * so a missing-required-field error (e.g. `scorer: exact_match` without
 * `extract`) surfaces with a pointer to the exact field instead of a generic
 * accept-anything decode.
 *
 * `system` is intentionally absent: the system prompt is an LLM-config concern
 * owned by `configs.yaml` (`systemPrompt:` → `system-prompts.yaml`), not a
 * property of a challenge item.
 */
const ExactMatchItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("exact_match"),
  expected: Schema.String,
  extract: Schema.String,
  nearMisses: Schema.optional(Schema.Array(ExactNearMiss)),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const ConstraintItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("constraint"),
  constraints: Schema.Array(ConstraintDef),
  nearMisses: Schema.optional(Schema.Array(PatternNearMiss)),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const CodeExecItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("code_exec"),
  /** Path to companion test file, resolved relative to the challenge file's dir. */
  testFile: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const GameItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("game"),
  gameScorer: Schema.String,
  scorerParams: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const SetMatchItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("set_match"),
  vocabulary: Schema.Array(Schema.String),
  expected: Schema.Array(Schema.String),
  caseSensitive: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const OrderedMatchItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("ordered_match"),
  vocabulary: Schema.Array(Schema.String),
  expected: Schema.Array(Schema.String),
  caseSensitive: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * One turn of a multi-turn item: a prompt, its scorer (exact_match or
 * constraint, same fields as the single-shot items), and `answer` — the gold
 * assistant message injected as history before every later turn.
 */
const turnFields = { prompt: Schema.String, answer: Schema.String };
export const Turn = Schema.Union(
  Schema.Struct({
    ...turnFields,
    scorer: Schema.Literal("exact_match"),
    expected: Schema.String,
    extract: Schema.String,
    nearMisses: Schema.optional(Schema.Array(ExactNearMiss)),
  }),
  Schema.Struct({
    ...turnFields,
    scorer: Schema.Literal("constraint"),
    constraints: Schema.Array(ConstraintDef),
    nearMisses: Schema.optional(Schema.Array(PatternNearMiss)),
  }),
);
export type Turn = typeof Turn.Type;

/**
 * A conversational item: an ordered list of turns, each scored independently.
 * The loader expands it into one scored unit per turn (see
 * docs/superpowers/specs/2026-11-16-multiturn-challenges-design.md).
 */
const MultiTurnItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  turns: Schema.Array(Turn).pipe(Schema.minItems(2)),
  tags: Schema.optional(Schema.Array(Schema.String)),
});
export type MultiTurnItem = typeof MultiTurnItem.Type;

export const SingleItem = Schema.Union(
  ExactMatchItem,
  ConstraintItem,
  CodeExecItem,
  GameItem,
  SetMatchItem,
  OrderedMatchItem,
);
export type SingleItem = typeof SingleItem.Type;

export const ChallengeItem = Schema.Union(SingleItem, MultiTurnItem);
export type ChallengeItem = typeof ChallengeItem.Type;

/**
 * A named, versioned suite — a quiz/exam/certification. Edited by bumping
 * `version`, never by mutating a published version in place. Passes when the
 * fraction of items scored perfect is >= `passThreshold`.
 *
 * Items are fully inline: each carries its prompt text, tier, tags, and scorer
 * configuration. There is no global prompt corpus and no ID dereferencing.
 */
export const Challenge = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  passThreshold: Schema.Number,
  items: Schema.Array(ChallengeItem),
});
export type Challenge = typeof Challenge.Type;
