/**
 * Webapp data contract serializer (requirements §10).
 *
 * The webapp (webapp/src/lib/data.ts) consumes a flat array of records with
 * **snake_case** field names — this file bridges the Effect-side camelCase
 * {@link ExecutionResult} + {@link ScoreResult} into that legacy shape without
 * touching the webapp.
 *
 * Rounding rules (§10.1 + Python `report.py::_serialize_results`):
 *   - `prompt_tps`, `generation_tps`, `wall_time_sec`, `peak_memory_gb` → 2 dp
 *   - `prompt_tokens`, `generation_tokens` → raw integer
 *   - `score` → raw (webapp rounds for display; we keep full precision)
 *
 * The `style` field from the Python prototype is deliberately omitted — the
 * requirements note (§2.1 / §10.1) explicitly removes it. The webapp still
 * references `style` in its TypeScript interface and will warn, but that's
 * out-of-scope for this phase (webapp revision is deferred).
 *
 * Tags and scenario fields (new in Task 1) surface capability clusters and
 * game state data that was previously discarded at the contract boundary.
 */
import type {
  AgentEvent,
  ExecutionResult,
  PromptCorpusEntry,
  ScenarioCorpusEntry,
} from "../schema/index.js";
import type { PromptScore, ScenarioScore, ScoreResult } from "../scoring/score-result.js";

/**
 * Shape of one record in `globalThis.__BENCHMARK_DATA`. Field names are
 * snake_case to match the Python prototype's JSON serialization exactly,
 * which is what the webapp's `BenchmarkResult` interface expects.
 *
 * Kept as a plain interface (not a Schema) because this is a one-way
 * terminal shape: we serialize to it and write to disk as JSON. No decode
 * path — the webapp decodes client-side.
 */
/**
 * Per-rubric pass/fail/error breakdown carried alongside `score_details`.
 * Only constraint scorers populate this — exact_match, code_exec, and game
 * scorers leave it `null`. Keeps the names of every rubric in each bucket so
 * the webapp can render the full rubric without re-parsing the formatted
 * `score_details` string.
 */
export interface WebappScoreBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}

interface CommonWebappFields {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly prompt_name: string;
  readonly category: string;
  readonly tier: number;
  readonly temperature: number;
  readonly tags: ReadonlyArray<string>;
  readonly score_details: string;
  readonly prompt_tokens: number;
  readonly generation_tokens: number;
  readonly prompt_tps: number;
  readonly generation_tps: number;
  readonly wall_time_sec: number;
  readonly peak_memory_gb: number;
  readonly output: string;
  readonly run_id: string;
  readonly archive_id: string;
  readonly executed_at: string;
}

export interface PromptWebappRecord extends CommonWebappFields {
  readonly kind: "prompt";
  readonly is_scenario: false;
  readonly score: number; // [0, 1]
  readonly score_breakdown: WebappScoreBreakdown | null;
  readonly prompt_text: string;
  readonly scenario_name: null;
  readonly termination_reason: null;
  readonly tool_call_count: null;
  readonly final_player_stats: null;
  readonly events: null;
  readonly has_events: false;
}

export interface ScenarioWebappRecord extends CommonWebappFields {
  readonly kind: "scenario";
  readonly is_scenario: true;
  readonly value: number;
  readonly score_field: string;
  readonly prompt_text: "";
  readonly scenario_name: string;
  readonly termination_reason: NonNullable<ExecutionResult["terminationReason"]> | null;
  readonly tool_call_count: number | null;
  readonly final_player_stats: Record<string, unknown> | null;
  readonly events: ReadonlyArray<AgentEvent> | null;
  readonly has_events: boolean;
  /**
   * Per-row blob pool (hash → message body) used to dedup the chat-message
   * history inside `turn_end.data.context.messages`. Travels with the events
   * to the sidecar file so the webapp can resolve `data.context.messagesRef`.
   * May be `null` (archives migrated before the field existed) or `{}` (no
   * interning happened for this scenario).
   */
  readonly blob_pool: Record<string, unknown> | null;
}

export type WebappRecord = PromptWebappRecord | ScenarioWebappRecord;

/**
 * Round to 2 decimal places. Mirrors Python's `round(x, 2)` semantics for
 * the positive finite numbers we're serializing.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Build the per-record fields shared by prompt and scenario records.
 * Internal helper for the two arm-specific factories below.
 */
const commonFields = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
  score: ScoreResult,
): CommonWebappFields => ({
  model: result.model,
  runtime: result.runtime,
  quant: result.quant,
  prompt_name: result.promptName,
  category: "promptText" in entry ? entry.category : "game",
  tier: entry.tier,
  temperature: result.temperature,
  tags: entry.tags ?? [],
  score_details: score.details,
  prompt_tokens: result.promptTokens,
  generation_tokens: result.generationTokens,
  prompt_tps: round2(result.promptTps),
  generation_tps: round2(result.generationTps),
  wall_time_sec: round2(result.wallTimeSec),
  peak_memory_gb: round2(result.peakMemoryGb),
  output: result.output,
  run_id: result.runId,
  archive_id: result.archiveId,
  executed_at: result.executedAt,
});

/**
 * Convert a prompt {@link ExecutionResult} + {@link PromptCorpusEntry} +
 * {@link PromptScore} into a {@link PromptWebappRecord}.
 *
 * Statically typed so the type system rules out cross-kind misuse — there is
 * no runtime check needed because {@link toScenarioWebappRecord} handles the
 * scenario arm.
 */
export const toPromptWebappRecord = (
  result: ExecutionResult,
  entry: PromptCorpusEntry,
  score: PromptScore,
): PromptWebappRecord => ({
  ...commonFields(result, entry, score),
  kind: "prompt",
  is_scenario: false,
  score: score.score,
  score_breakdown: score.breakdown
    ? {
        passed: score.breakdown.passed,
        failed: score.breakdown.failed,
        errored: score.breakdown.errored,
      }
    : null,
  prompt_text: entry.promptText,
  scenario_name: null,
  termination_reason: null,
  tool_call_count: null,
  final_player_stats: null,
  events: null,
  has_events: false,
});

/**
 * Convert a scenario {@link ExecutionResult} + {@link ScenarioCorpusEntry} +
 * {@link ScenarioScore} into a {@link ScenarioWebappRecord}.
 *
 * Statically typed so the type system rules out cross-kind misuse — there is
 * no runtime check needed because {@link toPromptWebappRecord} handles the
 * prompt arm.
 */
export const toScenarioWebappRecord = (
  result: ExecutionResult,
  entry: ScenarioCorpusEntry,
  score: ScenarioScore,
): ScenarioWebappRecord => ({
  ...commonFields(result, entry, score),
  kind: "scenario",
  is_scenario: true,
  value: score.value,
  score_field: score.scoreField,
  prompt_text: "",
  scenario_name: entry.name,
  termination_reason: result.terminationReason,
  tool_call_count: result.toolCallCount,
  final_player_stats: result.finalPlayerStats as Record<string, unknown> | null,
  events: result.events,
  has_events: result.events !== null && result.events.length > 0,
  blob_pool: result.blobPool as Record<string, unknown> | null,
});

/**
 * Type-overloaded façade that routes to the correct arm-specific factory.
 *
 * The overload signatures keep cross-kind misuse out of the type system: the
 * compiler accepts only `(prompt entry, prompt score)` or `(scenario entry,
 * scenario score)`, never a mix. The implementation discriminates on
 * `score.kind`, which is the runtime carrier of the same invariant.
 */
export function toWebappRecord(
  result: ExecutionResult,
  entry: PromptCorpusEntry,
  score: PromptScore,
): PromptWebappRecord;
export function toWebappRecord(
  result: ExecutionResult,
  entry: ScenarioCorpusEntry,
  score: ScenarioScore,
): ScenarioWebappRecord;
export function toWebappRecord(
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
  score: ScoreResult,
): WebappRecord {
  return score.kind === "prompt"
    ? toPromptWebappRecord(result, entry as PromptCorpusEntry, score)
    : toScenarioWebappRecord(result, entry as ScenarioCorpusEntry, score);
}

/**
 * Wire-format step: zero out scenario `events` arrays and the `blob_pool`
 * before serializing to `data.js`. Both live in side files written by
 * `writeEventFiles`; the `has_events` flag stays intact so the webapp knows
 * to fetch.
 *
 * Prompt records pass through unchanged — they never carry events.
 */
export const stripEventsForWire = (
  records: ReadonlyArray<WebappRecord>,
): ReadonlyArray<WebappRecord> =>
  records.map((rec) => (rec.kind === "scenario" ? { ...rec, events: null, blob_pool: null } : rec));
