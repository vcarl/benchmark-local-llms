import { Schema } from "effect";
import { Runtime } from "./enums.js";
import { RunEnv } from "./run-manifest.js";

/**
 * Why an item did not score a full pass. `null` on a full pass (score 1).
 * Derived by `classifyFailure` (src/scoring/failure-kind.ts) from the stored
 * item fields plus the scorer's outcome, so `bench score` can recompute it.
 */
export const FailureKind = Schema.Literal(
  "wrong",
  "no_answer",
  "length_cutoff",
  "thinking_truncated",
  "loop",
  "scorer_error",
  "execution_error",
  "near_miss",
);
export type FailureKind = typeof FailureKind.Type;

/** One challenge item's execution + per-item score. Body line of the attempt archive. */
export const ItemResult = Schema.Struct({
  itemId: Schema.String,
  promptName: Schema.String,
  promptHash: Schema.String,
  itemHash: Schema.String,
  scorerHash: Schema.optional(Schema.String),
  /** Multi-turn item `name` this line is a turn of; absent on single-shot items. */
  parentItemId: Schema.optional(Schema.String),
  /** 1-based turn index within `parentItemId`; absent on single-shot items. */
  turn: Schema.optional(Schema.Number),
  /** 0-based sample index of a repeated generation of this item; absent = sample 0. */
  sample: Schema.optional(Schema.Number),
  /** Sampler seed sent with the request; absent when none was sent. */
  seed: Schema.optional(Schema.Number),
  executedAt: Schema.String,
  /**
   * Set on a line copied from the cross-attempt cache: the attempt that
   * executed it and its `executedAt`. Absent on a line this attempt generated,
   * and on every line written before schemaVersion 3.
   */
  cachedFrom: Schema.optional(
    Schema.Struct({ attemptId: Schema.String, executedAt: Schema.String }),
  ),
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
  /**
   * Why generation stopped ("stop" | "length"), straight from the server.
   * `"length"` with an empty `output` is the signature of a model that spent
   * its entire budget thinking and never answered — a real failure, but a
   * distinguishable one, and not the same thing as a transport error.
   * Optional: archives predating the field omit it.
   */
  stopReason: Schema.optional(Schema.NullOr(Schema.String)),
  score: Schema.Number,
  /**
   * Why the item fell short of a full pass; `null` when `score` is 1. Optional:
   * archives scored before the field existed omit it until `bench score`
   * re-scores them.
   */
  failureKind: Schema.optional(Schema.NullOr(FailureKind)),
  /** The scorer's human-readable verdict (e.g. `expected 42, got 41`). Absent when the item was not scored. */
  scoreDetails: Schema.optional(Schema.String),
  /** The `slip` of the declared near miss that earned this item partial credit; present iff `failureKind` is `near_miss`. */
  nearMiss: Schema.optional(Schema.String),
  /**
   * Per-check breakdown for the constraint scorer (passed/failed/errored
   * constraint `name`s). Optional and constraint-shaped: only the constraint
   * scorer populates it; archives written before this field existed omit it
   * entirely and degrade to "no breakdown".
   */
  breakdown: Schema.optional(
    Schema.Struct({
      passed: Schema.Array(Schema.String),
      failed: Schema.Array(Schema.String),
      errored: Schema.Array(Schema.String),
    }),
  ),
});
export type ItemResult = typeof ItemResult.Type;

/**
 * An attempt's lines grouped per item (by `itemId`), in first-seen order:
 * one group per item, one entry per sample. A single-sample item is a group of one.
 */
export const groupSamples = <T extends { readonly itemId: string }>(
  lines: ReadonlyArray<T>,
): T[][] => {
  const groups = new Map<string, T[]>();
  for (const l of lines) {
    const g = groups.get(l.itemId);
    if (g === undefined) groups.set(l.itemId, [l]);
    else g.push(l);
  }
  return [...groups.values()];
};

/** Fraction of an item's samples that scored exactly 1 (a pass). */
export const passFraction = (samples: ReadonlyArray<{ readonly score: number }>): number =>
  samples.filter((s) => s.score === 1).length / samples.length;

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
 * additions (denormalized content, not hash inputs); `schemaVersion: 3` adds run
 * provenance (`invocationId`, `submitter`, `lines`, `env.hardware`, `cachedFrom`).
 */
export const AttemptManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1, 2, 3),
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
  /*
   * Generation provenance: the configuration's sampler and server knobs as
   * run. Recorded only, never hashed — `configHash` stays the identity. Each
   * is present iff the configuration set it; archives predating the fields
   * omit them.
   */
  topP: Schema.optional(Schema.Number),
  topK: Schema.optional(Schema.Number),
  minP: Schema.optional(Schema.Number),
  presencePenalty: Schema.optional(Schema.Number),
  repetitionPenalty: Schema.optional(Schema.Number),
  repetitionContextSize: Schema.optional(Schema.Number),
  chatTemplateKwargs: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean),
    }),
  ),
  ctxSize: Schema.optional(Schema.Number),
  /** Extra server CLI args as passed (mlx/omlx; llamacpp does not consume them). */
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
  /** Vendored template name (`templates/<name>.jinja`) passed to llama-server. */
  chatTemplate: Schema.optional(Schema.String),
  /** shortSha256 of that template file's content at run time; also part of `configHash`. */
  chatTemplateSha: Schema.optional(Schema.String),
  /** The harness's fixed server flags (llamacpp only), e.g. KV-cache type and reasoning format. */
  serverFlags: Schema.optional(Schema.Array(Schema.String)),

  challengeId: Schema.String,
  challengeVersion: Schema.Number,
  challengeHash: Schema.String,
  /**
   * The original `attemptId` of an attempt that `score --corpus` re-stamped
   * onto the current challenge identity after a scorer-only edit. Its embedded
   * challengeHash is the identity the model actually ran against. Absent on
   * attempts whose identity is as-run.
   */
  restampedFrom: Schema.optional(Schema.String),
  passThreshold: Schema.optional(Schema.Number),
  /**
   * promptNames of items whose score `bench score` kept from an earlier scorer
   * because their prompt drifted from the current challenge — the attempt mixes
   * scorers. Absent when every item was scored by the scorer its line names.
   */
  staleScoreItems: Schema.optional(Schema.Array(Schema.String)),
  /**
   * promptNames of archived lines whose item has been removed from this
   * challenge version. Their lines stay in the file for audit; the aggregate,
   * report, and audit count only the remaining items. Absent when none.
   */
  retiredItems: Schema.optional(Schema.Array(Schema.String)),

  /** Shared by every attempt one `./bench run` invocation writes. */
  invocationId: Schema.optional(Schema.String),
  /** Who produced the attempt (`BENCH_SUBMITTER`, default `local`). */
  submitter: Schema.optional(Schema.String),
  /** Item lines this attempt executed vs copied from the cache; filled at finalize. */
  lines: Schema.optional(Schema.Struct({ generated: Schema.Number, replayed: Schema.Number })),

  env: RunEnv,
  aggregate: AttemptAggregate,
});
export type AttemptManifest = typeof AttemptManifest.Type;
