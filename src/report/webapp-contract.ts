/**
 * Webapp data contract serializer (requirements §10).
 *
 * The webapp (webapp/src/lib/data.ts) consumes a flat array of records with
 * **snake_case** field names — this file bridges the Effect-side camelCase
 * {@link ExecutionResult} + {@link Score} into that legacy shape without
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
import type { Score } from "../scoring/score-result.js";

/**
 * Shape of one record in `globalThis.__BENCHMARK_DATA`. Field names are
 * snake_case to match the Python prototype's JSON serialization exactly,
 * which is what the webapp's `BenchmarkResult` interface expects.
 *
 * Kept as a plain interface (not a Schema) because this is a one-way
 * terminal shape: we serialize to it and write to disk as JSON. No decode
 * path — the webapp decodes client-side.
 */
export interface WebappRecord {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly prompt_name: string;
  readonly category: string;
  readonly tier: number;
  readonly temperature: number;
  readonly tags: ReadonlyArray<string>;
  readonly is_scenario: boolean;
  readonly score: number;
  readonly score_details: string;
  readonly prompt_tokens: number;
  readonly generation_tokens: number;
  readonly prompt_tps: number;
  readonly generation_tps: number;
  readonly wall_time_sec: number;
  readonly peak_memory_gb: number;
  readonly output: string;
  readonly prompt_text: string;
  readonly scenario_name: string | null;
  readonly termination_reason:
    | "completed"
    | "wall_clock"
    | "tokens"
    | "tool_calls"
    | "error"
    | null;
  readonly tool_call_count: number | null;
  readonly final_player_stats: Record<string, unknown> | null;
  readonly events: ReadonlyArray<AgentEvent> | null;
}

/**
 * Round to 2 decimal places. Mirrors Python's `round(x, 2)` semantics for
 * the positive finite numbers we're serializing.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Convert an {@link ExecutionResult} + its corpus entry + a computed
 * {@link Score} into a webapp-ready record.
 *
 * `entry` may be a PromptCorpusEntry (has `category`, `tier`, `promptText`)
 * or a ScenarioCorpusEntry (has `tier` only — category synthesized as "game",
 * promptText left empty since scenarios have `scenarioMd` instead).
 */
export const toWebappRecord = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
  score: Score,
): WebappRecord => {
  const isPrompt = "promptText" in entry;
  return {
    model: result.model,
    runtime: result.runtime,
    quant: result.quant,
    prompt_name: result.promptName,
    category: isPrompt ? entry.category : "game",
    tier: entry.tier,
    temperature: result.temperature,
    tags: entry.tags ?? [],
    is_scenario: !isPrompt,
    score: score.score,
    score_details: score.details,
    prompt_tokens: result.promptTokens,
    generation_tokens: result.generationTokens,
    prompt_tps: round2(result.promptTps),
    generation_tps: round2(result.generationTps),
    wall_time_sec: round2(result.wallTimeSec),
    peak_memory_gb: round2(result.peakMemoryGb),
    output: result.output,
    prompt_text: isPrompt ? entry.promptText : "",
    scenario_name: isPrompt ? null : entry.name,
    termination_reason: result.terminationReason,
    tool_call_count: result.toolCallCount,
    final_player_stats: result.finalPlayerStats as Record<string, unknown> | null,
    events: result.events,
  };
};
