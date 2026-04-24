import { Schema } from "effect";
import { AgentEventType, Runtime, TerminationReason } from "./enums.js";

/**
 * Normalized game event from the Admiral SSE stream (§2.3). Admiral log
 * entries are filtered and mapped to this smaller surface — see §5.4 for the
 * mapping table. `tick` is a monotonic counter within the session; `data` is
 * the raw Admiral-side detail payload kept as an opaque record.
 */
export const AgentEvent = Schema.Struct({
  event: AgentEventType,
  tick: Schema.Number,
  ts: Schema.String,
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
export type AgentEvent = typeof AgentEvent.Type;

/**
 * Per-execution archive record (§2.3). Written to the RunManifest's JSONL
 * body, one line per `(prompt, temperature)` pair and one line per scenario.
 *
 * Scenario-specific fields (`scenarioName`, `terminationReason`,
 * `toolCallCount`, `finalPlayerStats`, `events`) are `null` for prompt runs.
 * Model identity is denormalized from the manifest header for direct
 * query convenience against the flat result stream.
 *
 * Cache key for cross-run dedup: `(artifact, promptName, promptHash, temperature)`.
 * `scenarioHash` is non-null for scenario runs; `promptHash` carries the same
 * value when the execution is a scenario (there is no distinct prompt hash).
 */
export const ExecutionResult = Schema.Struct({
  runId: Schema.String,
  executedAt: Schema.String,
  promptName: Schema.String,
  temperature: Schema.Number,

  model: Schema.String,
  runtime: Runtime,
  quant: Schema.String,

  promptTokens: Schema.Number,
  generationTokens: Schema.Number,
  promptTps: Schema.Number,
  generationTps: Schema.Number,
  peakMemoryGb: Schema.Number,
  wallTimeSec: Schema.Number,

  output: Schema.String,
  error: Schema.NullOr(Schema.String),

  promptHash: Schema.String,
  scenarioHash: Schema.NullOr(Schema.String),

  scenarioName: Schema.NullOr(Schema.String),
  terminationReason: Schema.NullOr(TerminationReason),
  toolCallCount: Schema.NullOr(Schema.Number),
  finalPlayerStats: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  events: Schema.NullOr(Schema.Array(AgentEvent)),
});
export type ExecutionResult = typeof ExecutionResult.Type;
