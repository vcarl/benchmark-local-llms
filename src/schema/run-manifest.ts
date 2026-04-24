import { Schema } from "effect";
import { Runtime } from "./enums.js";
import { PromptCorpusEntry } from "./prompt.js";
import { ScenarioCorpusEntry } from "./scenario.js";

/** Environment fingerprint captured at run start (§2.4). */
export const RunEnv = Schema.Struct({
  hostname: Schema.String,
  platform: Schema.String,
  runtimeVersion: Schema.String,
  nodeVersion: Schema.String,
  benchmarkGitSha: Schema.String,
});
export type RunEnv = typeof RunEnv.Type;

/** Populated at run end by the trailer writer (§6.1). */
export const RunStats = Schema.Struct({
  totalPrompts: Schema.Number,
  totalExecutions: Schema.Number,
  completed: Schema.Number,
  skippedCached: Schema.Number,
  errors: Schema.Number,
  totalWallTimeSec: Schema.Number,
});
export type RunStats = typeof RunStats.Type;

/**
 * Top-level archival envelope (§2.4). One manifest per benchmark execution
 * session. Serialized as a single JSON line (the header) at the top of the
 * `{runId}.jsonl` archive file, with ExecutionResults on subsequent lines
 * and a trailer rewriting `stats`/`finishedAt` at the end (§6.1).
 *
 * `schemaVersion` is a hard literal `1` — bump requires a migration.
 *
 * `promptCorpus` and `scenarioCorpus` are keyed by the entry's `name`, giving
 * O(1) lookup when scoring results. Embedding the full corpus makes the
 * archive self-contained: re-scoring "as run" doesn't depend on current YAML.
 */
export const RunManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  interrupted: Schema.Boolean,

  artifact: Schema.String,
  model: Schema.String,
  runtime: Runtime,
  quant: Schema.String,

  env: RunEnv,

  temperatures: Schema.Array(Schema.Number),

  promptCorpus: Schema.Record({ key: Schema.String, value: PromptCorpusEntry }),
  scenarioCorpus: Schema.Record({ key: Schema.String, value: ScenarioCorpusEntry }),

  stats: RunStats,
});
export type RunManifest = typeof RunManifest.Type;
