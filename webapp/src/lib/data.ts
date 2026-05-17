export interface AgentEvent {
  event: "tool_call" | "tool_result" | "tool_error" | "turn_end" | "error" | "connection";
  tick: number;
  ts: number;
  data: unknown;
}

export interface ScoreBreakdown {
  passed: string[];
  failed: string[];
  errored: string[];
}

// Fields shared by both prompt and scenario records. Every record on
// `globalThis.__BENCHMARK_DATA` has these regardless of `kind`.
interface CommonBenchmarkFields {
  model: string;
  runtime: string;
  quant: string;
  prompt_name: string;
  category: string;
  tier: number;
  temperature: number;
  tags: string[];
  score_details: string;
  prompt_tokens: number;
  generation_tokens: number;
  prompt_tps: number;
  generation_tps: number;
  wall_time_sec: number;
  peak_memory_gb: number;
  output: string;
  prompt_text: string;
  run_id: string;
  archive_id: string;
  executed_at: string;
}

// Prompt-judged record: `score` is in [0,1] and pass-rate logic operates
// on these. Scenario fields are explicitly null/falsy.
export interface PromptBenchmarkResult extends CommonBenchmarkFields {
  kind: "prompt";
  is_scenario: false;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  scenario_name: null;
  termination_reason: null;
  tool_call_count: null;
  final_player_stats: null;
  events: null;
  has_events: false;
}

// Scenario-judged record: carries a raw `value` (no [0,1] bound) plus the
// `score_field` it came from. Pass-rate logic skips these.
export interface ScenarioBenchmarkResult extends CommonBenchmarkFields {
  kind: "scenario";
  is_scenario: true;
  value: number;
  score_field: string;
  scenario_name: string | null;
  termination_reason:
    | "completed" | "wall_clock" | "tokens" | "tool_calls" | "error" | null;
  tool_call_count: number | null;
  final_player_stats: Record<string, unknown> | null;
  events: AgentEvent[] | null;
  has_events: boolean;
}

export type BenchmarkResult = PromptBenchmarkResult | ScenarioBenchmarkResult;

declare global {
  // biome-ignore lint/style/noVar: augmenting globalThis requires `var`
  var __BENCHMARK_DATA: unknown[] | undefined;
}

// Defensive normalization: old data.js files produced before the scenario-first
// rewrite are missing new fields; fill sensible defaults so the app loads them
// without runtime errors.
//
// The discriminator: `kind` is preferred when present; else fall back to the
// legacy `is_scenario` boolean (which older serializers always populated).
// Loose input shape for normalization. Both arms' fields are allowed at once
// because legacy data.js files predate the discriminated union — a record may
// arrive with `is_scenario` set but no `kind`, or with neither field set when
// it's an even older prompt-only record. Arm-specific fields are independently
// optional rather than intersected, since the prompt arm narrows them to
// `null` while the scenario arm allows real values; `Partial<P> & Partial<S>`
// would collapse those to `null | undefined`.
type RawBenchmarkRecord = Partial<CommonBenchmarkFields> & {
  kind?: "prompt" | "scenario";
  is_scenario?: boolean;
  // prompt-arm
  score?: number;
  score_breakdown?: ScoreBreakdown | null;
  // scenario-arm
  value?: number;
  score_field?: string;
  scenario_name?: string | null;
  termination_reason?:
    | "completed" | "wall_clock" | "tokens" | "tool_calls" | "error" | null;
  tool_call_count?: number | null;
  final_player_stats?: Record<string, unknown> | null;
  events?: AgentEvent[] | null;
  has_events?: boolean;
};

export const normalizeRecord = (raw: RawBenchmarkRecord): BenchmarkResult => {
  const common: CommonBenchmarkFields = {
    model: raw.model ?? "",
    runtime: raw.runtime ?? "",
    quant: raw.quant ?? "",
    prompt_name: raw.prompt_name ?? "",
    category: raw.category ?? "",
    tier: raw.tier ?? 0,
    temperature: raw.temperature ?? 0,
    tags: raw.tags ?? [],
    score_details: raw.score_details ?? "",
    prompt_tokens: raw.prompt_tokens ?? 0,
    generation_tokens: raw.generation_tokens ?? 0,
    prompt_tps: raw.prompt_tps ?? 0,
    generation_tps: raw.generation_tps ?? 0,
    wall_time_sec: raw.wall_time_sec ?? 0,
    peak_memory_gb: raw.peak_memory_gb ?? 0,
    output: raw.output ?? "",
    prompt_text: raw.prompt_text ?? "",
    run_id: raw.run_id ?? "",
    archive_id: raw.archive_id ?? "",
    executed_at: raw.executed_at ?? "",
  };

  const isScenario = raw.kind === "scenario" || raw.is_scenario === true ||
    (raw.kind === undefined && raw.is_scenario === undefined && raw.scenario_name != null);

  if (isScenario) {
    return {
      ...common,
      kind: "scenario",
      is_scenario: true,
      value: raw.value ?? 0,
      score_field: raw.score_field ?? "",
      scenario_name: raw.scenario_name ?? null,
      termination_reason: raw.termination_reason ?? null,
      tool_call_count: raw.tool_call_count ?? null,
      final_player_stats: raw.final_player_stats ?? null,
      events: raw.events ?? null,
      has_events: raw.has_events ?? false,
    };
  }

  return {
    ...common,
    kind: "prompt",
    is_scenario: false,
    score: raw.score ?? 0,
    score_breakdown: raw.score_breakdown ?? null,
    scenario_name: null,
    termination_reason: null,
    tool_call_count: null,
    final_player_stats: null,
    events: null,
    has_events: false,
  };
};

export let DATA: BenchmarkResult[] = globalThis.__BENCHMARK_DATA
  ? (globalThis.__BENCHMARK_DATA as Parameters<typeof normalizeRecord>[0][]).map(normalizeRecord)
  : [];

export function uniqueSorted<K extends keyof CommonBenchmarkFields>(
  data: BenchmarkResult[],
  field: K,
): CommonBenchmarkFields[K][] {
  const values = [...new Set(data.map((d) => d[field]))];
  return values.sort() as CommonBenchmarkFields[K][];
}

export function modelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("qwen") || lower.includes("qwq")) return "Qwen";
  if (lower.includes("mistral") || lower.includes("devstral") || lower.includes("magistral")) return "Mistral";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("phi")) return "Phi";
  if (lower.includes("gpt")) return "GPT";
  if (lower.includes("glm")) return "GLM";
  return name.split(" ")[0] || "Other";
}

export function modelSizeB(name: string): number | null {
  const match = name.match(/(\d+)B\b/i);
  return match ? parseInt(match[1], 10) : null;
}

