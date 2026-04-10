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

export interface QuantInfo {
  quant: string;
  avgScore: number;
  count: number;
}

/**
 * For each (model, runtime) pair, find the quant with the highest average score.
 * Returns a Map keyed by "model|runtime" with the best quant name as value.
 */
export function bestQuantMap(
  data: BenchmarkResult[],
): Map<string, string> {
  const groups: Record<string, Record<string, number[]>> = {};
  for (const d of data) {
    const key = d.model + "|" + d.runtime;
    if (!groups[key]) groups[key] = {};
    const q = d.quant || "";
    if (!groups[key][q]) groups[key][q] = [];
    groups[key][q].push(d.score);
  }
  const result = new Map<string, string>();
  for (const [key, quants] of Object.entries(groups)) {
    let bestQuant = "";
    let bestAvg = -1;
    for (const [q, scores] of Object.entries(quants)) {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestQuant = q;
      }
    }
    result.set(key, bestQuant);
  }
  return result;
}

/**
 * Filter data to keep only records for the best quant per (model, runtime).
 */
export function bestQuantData(data: BenchmarkResult[]): BenchmarkResult[] {
  const best = bestQuantMap(data);
  return data.filter((d) => {
    const key = d.model + "|" + d.runtime;
    return (d.quant || "") === best.get(key);
  });
}

/**
 * Get quant summary for a given model across all runtimes.
 * Returns a map of runtime -> QuantInfo[] sorted by avgScore descending.
 */
export function quantSummary(
  data: BenchmarkResult[],
  model: string,
): Record<string, QuantInfo[]> {
  const groups: Record<string, Record<string, number[]>> = {};
  for (const d of data) {
    if (d.model !== model) continue;
    if (!groups[d.runtime]) groups[d.runtime] = {};
    const q = d.quant || "";
    if (!groups[d.runtime][q]) groups[d.runtime][q] = [];
    groups[d.runtime][q].push(d.score);
  }
  const result: Record<string, QuantInfo[]> = {};
  for (const [runtime, quants] of Object.entries(groups)) {
    result[runtime] = Object.entries(quants)
      .map(([q, scores]) => ({
        quant: q,
        avgScore: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }
  return result;
}
