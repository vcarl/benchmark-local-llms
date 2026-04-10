export interface BenchmarkResult {
  model: string;
  runtime: string;
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

import benchmarkData from "../data/benchmark.json";

export const DATA: BenchmarkResult[] = benchmarkData as BenchmarkResult[];

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
