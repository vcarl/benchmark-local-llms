import { Schema } from "effect";
import { ScorerConfig } from "./scorer.js";

export const ChallengeItem = Schema.Struct({
  prompt: Schema.String,
  scorer: Schema.optional(ScorerConfig),
});
export type ChallengeItem = typeof ChallengeItem.Type;

/**
 * A named, versioned suite — a quiz/exam/certification. Edited by bumping
 * `version`, never by mutating a published version in place. Passes when the
 * fraction of items scored perfect is >= `passThreshold`.
 */
export const Challenge = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  passThreshold: Schema.Number,
  items: Schema.Array(ChallengeItem),
});
export type Challenge = typeof Challenge.Type;
