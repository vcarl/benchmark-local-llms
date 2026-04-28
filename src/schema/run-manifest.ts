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
 * `{archiveId}.jsonl` archive file, with ExecutionResults on subsequent lines
 * and a trailer rewriting `stats`/`finishedAt` at the end (§6.1).
 *
 * `archiveId` is the per-(model × invocation) identity that matches the
 * filename stem. `runId` is the logical-run group id — same value across
 * every archive produced by one `./bench run` invocation, and across resume
 * invocations of the same logical run.
 *
 * `schemaVersion` stays at literal `1`; legacy archives (which carry only
 * the old `runId`) are translated by the loader rather than being version-
 * bumped on disk.
 */
export const RunManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  archiveId: Schema.String,
  runId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  interrupted: Schema.Boolean,

  artifact: Schema.String,
  model: Schema.String,
  runtime: Runtime,
  quant: Schema.String,

  env: RunEnv,

  temperature: Schema.Number,

  promptCorpus: Schema.Record({ key: Schema.String, value: PromptCorpusEntry }),
  scenarioCorpus: Schema.Record({ key: Schema.String, value: ScenarioCorpusEntry }),

  stats: RunStats,
});
export type RunManifest = typeof RunManifest.Type;
