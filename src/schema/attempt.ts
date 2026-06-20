import { Schema } from "effect";
import { Runtime } from "./enums.js";
import { RunEnv } from "./run-manifest.js";

/** One challenge item's execution + per-item score. Body line of the attempt archive. */
export const ItemResult = Schema.Struct({
  itemId: Schema.String,
  promptName: Schema.String,
  promptHash: Schema.String,
  itemHash: Schema.String,
  scorerHash: Schema.optional(Schema.String),
  executedAt: Schema.String,
  promptTokens: Schema.Number,
  generationTokens: Schema.Number,
  promptTps: Schema.Number,
  generationTps: Schema.Number,
  peakMemoryGb: Schema.Number,
  wallTimeSec: Schema.Number,
  output: Schema.String,
  reasoning: Schema.NullOr(Schema.String),
  rawOutput: Schema.String,
  error: Schema.NullOr(Schema.String),
  score: Schema.Number,
});
export type ItemResult = typeof ItemResult.Type;

export const AttemptAggregate = Schema.Struct({
  score: Schema.Number,
  passed: Schema.Boolean,
});
export type AttemptAggregate = typeof AttemptAggregate.Type;

/**
 * Header of one `(config × challenge)` attempt archive. Config and challenge
 * identity are denormalized; `env` is provenance (incl. harness git sha) and
 * is NOT part of `configHash`. `aggregate` is zeroed at header-write and
 * filled at finalize. `passThreshold` and `schemaVersion: 2` are v2 reconstruction
 * additions (denormalized content, not hash inputs).
 */
export const AttemptManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1, 2),
  attemptId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  interrupted: Schema.Boolean,

  configId: Schema.String,
  configHash: Schema.String,
  artifact: Schema.String,
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  systemPrompt: Schema.String,
  maxTokens: Schema.Number,

  challengeId: Schema.String,
  challengeVersion: Schema.Number,
  challengeHash: Schema.String,
  passThreshold: Schema.optional(Schema.Number),

  env: RunEnv,
  aggregate: AttemptAggregate,
});
export type AttemptManifest = typeof AttemptManifest.Type;
