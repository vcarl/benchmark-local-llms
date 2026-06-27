import { Schema } from "effect";
import { ConstraintDef } from "./constraints.js";

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
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const ConstraintItem = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  prompt: Schema.String,
  scorer: Schema.Literal("constraint"),
  constraints: Schema.Array(ConstraintDef),
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

export const ChallengeItem = Schema.Union(
  ExactMatchItem,
  ConstraintItem,
  CodeExecItem,
  GameItem,
  SetMatchItem,
  OrderedMatchItem,
);
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
