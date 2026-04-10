export interface BenchmarkResult {
  model: string;
  runtime: string;
  quant: string;
  prompt_name: string;
  category: string;
  tier: number;
  style: string;
  score: number;
  score_details: string;
  prompt_tps: number;
  generation_tps: number;
  prompt_tokens: number;
  generation_tokens: number;
  wall_time_sec: number;
  peak_memory_gb: number;
  output: string;
  prompt_text: string;
}

declare global {
  interface Window {
    __BENCHMARK_DATA?: BenchmarkResult[];
  }
}

// In report builds, data comes from window.__BENCHMARK_DATA (set by data.js).
// In dev builds, it comes from the JSON import in data-dev.ts.
// This module is imported by report-entry.tsx; data-dev.ts re-exports with the JSON fallback.
export let DATA: BenchmarkResult[] =
  (typeof window !== "undefined" && window.__BENCHMARK_DATA) || [];

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

export function avgScore(records: BenchmarkResult[]): number {
  if (records.length === 0) return 0;
  return records.reduce((sum, d) => sum + d.score, 0) / records.length;
}

export function modelsForRuntime(
  data: BenchmarkResult[],
  runtime: string,
): Set<string> {
  return new Set(data.filter((d) => d.runtime === runtime).map((d) => d.model));
}

export function modelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("mistral") || lower.includes("devstral")) return "Mistral";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("phi")) return "Phi";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("gpt")) return "GPT";
  if (lower.includes("glm")) return "GLM";
  return name.split(" ")[0] || "Other";
}

export function groupBy(
  data: BenchmarkResult[],
  keyFn: (d: BenchmarkResult) => string,
): Record<string, BenchmarkResult[]> {
  const groups: Record<string, BenchmarkResult[]> = {};
  for (const d of data) {
    const key = keyFn(d);
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }
  return groups;
}
