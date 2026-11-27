import { Schema } from "effect";
import { Runtime } from "./enums.js";
import { PromptCorpusEntry } from "./prompt.js";
import { ScenarioCorpusEntry } from "./scenario.js";

/**
 * Hardware the attempt ran on (see docs/ARCHIVE-FORMAT.md § Hardware profile).
 * Every field but `os` feeds `hardwareId`. Holds no hostname, serial, or user.
 */
export const HardwareProfile = Schema.Struct({
  cpu: Schema.String,
  cpuCores: Schema.Number,
  /** Physical cores per core type (macOS `hw.perflevelN.name`), e.g. `{ Performance: 12 }`. */
  coreTypes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Number })),
  gpu: Schema.optional(Schema.String),
  gpuCores: Schema.optional(Schema.Number),
  gpuMemoryGb: Schema.optional(Schema.Number),
  memoryGb: Schema.Number,
  os: Schema.String,
});
export type HardwareProfile = typeof HardwareProfile.Type;

/**
 * Environment fingerprint captured at run start (§2.4). `hostname` is only on
 * archives written before schemaVersion 3; newer ones carry `hardware` and
 * `hardwareId` instead.
 */
export const RunEnv = Schema.Struct({
  hostname: Schema.optional(Schema.String),
  platform: Schema.String,
  runtimeVersion: Schema.String,
  nodeVersion: Schema.String,
  benchmarkGitSha: Schema.String,
  hardware: Schema.optional(HardwareProfile),
  hardwareId: Schema.optional(Schema.String),
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
 * `archiveId` is the per-(model × run) identity that matches the filename
 * stem. `runId` is the run's id — same value across every archive produced
 * by one `./bench run`, and across resumes of the same run.
 *
 * `schemaVersion` stays at literal `1`.
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
