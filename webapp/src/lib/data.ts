export interface AgentEvent {
  event: "tool_call" | "tool_result" | "tool_error" | "turn_end" | "error" | "connection";
  tick: number;
  ts: number;
  data: unknown;
}

export interface BenchmarkResult {
  model: string;
  runtime: string;
  quant: string;
  prompt_name: string;
  category: string;
  tier: number;
  temperature: number;
  tags: string[];
  is_scenario: boolean;
  score: number;
  score_details: string;
  prompt_tokens: number;
  generation_tokens: number;
  prompt_tps: number;
  generation_tps: number;
  wall_time_sec: number;
  peak_memory_gb: number;
  output: string;
  prompt_text: string;
  scenario_name: string | null;
  termination_reason:
    | "completed" | "wall_clock" | "tokens" | "tool_calls" | "error" | null;
  tool_call_count: number | null;
  final_player_stats: Record<string, unknown> | null;
  events: AgentEvent[] | null;
}

declare global {
  interface Window {
    __BENCHMARK_DATA?: unknown[];
  }
}

// Defensive normalization: old data.js files produced before the scenario-first
// rewrite are missing new fields; fill sensible defaults so the app loads them
// without runtime errors.
export const normalizeRecord = (raw: Partial<BenchmarkResult>): BenchmarkResult => ({
  model: raw.model ?? "",
  runtime: raw.runtime ?? "",
  quant: raw.quant ?? "",
  prompt_name: raw.prompt_name ?? "",
  category: raw.category ?? "",
  tier: raw.tier ?? 0,
  temperature: raw.temperature ?? 0,
  tags: raw.tags ?? [],
  is_scenario: raw.is_scenario ?? (raw.scenario_name != null),
  score: raw.score ?? 0,
  score_details: raw.score_details ?? "",
  prompt_tokens: raw.prompt_tokens ?? 0,
  generation_tokens: raw.generation_tokens ?? 0,
  prompt_tps: raw.prompt_tps ?? 0,
  generation_tps: raw.generation_tps ?? 0,
  wall_time_sec: raw.wall_time_sec ?? 0,
  peak_memory_gb: raw.peak_memory_gb ?? 0,
  output: raw.output ?? "",
  prompt_text: raw.prompt_text ?? "",
  scenario_name: raw.scenario_name ?? null,
  termination_reason: raw.termination_reason ?? null,
  tool_call_count: raw.tool_call_count ?? null,
  final_player_stats: raw.final_player_stats ?? null,
  events: raw.events ?? null,
});

export let DATA: BenchmarkResult[] =
  typeof window !== "undefined" && window.__BENCHMARK_DATA
    ? (window.__BENCHMARK_DATA as Partial<BenchmarkResult>[]).map(normalizeRecord)
    : [];

export function setData(data: BenchmarkResult[]) {
  DATA = data;
}

export function uniqueSorted<K extends keyof BenchmarkResult>(
  data: BenchmarkResult[],
  field: K,
): BenchmarkResult[K][] {
  const values = [...new Set(data.map((d) => d[field]))];
  return values.sort() as BenchmarkResult[K][];
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

export interface SizeRange { label: string; min: number; max: number }
export const SIZE_RANGES: SizeRange[] = [
  { label: "Under 10B", min: 0, max: 10 },
  { label: "10-25B", min: 10, max: 25 },
  { label: "25-40B", min: 25, max: 40 },
  { label: "40-80B", min: 40, max: 80 },
  { label: "80B+", min: 80, max: Infinity },
];

export function modelSizeRange(name: string): SizeRange | null {
  const size = modelSizeB(name);
  if (size === null) return null;
  return SIZE_RANGES.find((r) => size >= r.min && size < r.max) ?? null;
}
