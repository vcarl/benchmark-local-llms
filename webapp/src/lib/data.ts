export interface BenchmarkResult {
  readonly config_id: string;
  readonly config_hash: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  readonly system_prompt: string;
  readonly max_tokens: number;
  readonly challenge_id: string;
  readonly challenge_version: number;
  readonly attempt_id: string;
  readonly finished_at: string;
  readonly score: number;
  readonly passed: boolean;
  readonly generation_tokens: number;
  readonly wall_time_sec: number;
  readonly item_count: number;
  readonly passed_items: number;
  readonly peak_memory_gb: number;
  readonly generation_tps: number;
  readonly prompt_tps: number;
}

declare global {
  // biome-ignore lint/style/noVar: augmenting globalThis requires `var`
  var __BENCHMARK_DATA: unknown[] | undefined;
}

export const normalizeRecord = (raw: unknown): BenchmarkResult => {
  const r = raw as Record<string, unknown>;
  return {
    config_id: String(r.config_id ?? ""),
    config_hash: String(r.config_hash ?? ""),
    artifact: String(r.artifact ?? ""),
    runtime: String(r.runtime ?? ""),
    quant: r.quant == null ? null : String(r.quant),
    temperature: Number(r.temperature ?? 0),
    system_prompt: String(r.system_prompt ?? ""),
    max_tokens: Number(r.max_tokens ?? 0),
    challenge_id: String(r.challenge_id ?? ""),
    challenge_version: Number(r.challenge_version ?? 0),
    attempt_id: String(r.attempt_id ?? ""),
    finished_at: String(r.finished_at ?? ""),
    score: Number(r.score ?? 0),
    passed: Boolean(r.passed),
    generation_tokens: Number(r.generation_tokens ?? 0),
    wall_time_sec: Number(r.wall_time_sec ?? 0),
    item_count: Number(r.item_count ?? 0),
    passed_items: Number(r.passed_items ?? 0),
    peak_memory_gb: Number(r.peak_memory_gb ?? 0),
    generation_tps: Number(r.generation_tps ?? 0),
    prompt_tps: Number(r.prompt_tps ?? 0),
  };
};

export let DATA: BenchmarkResult[] = globalThis.__BENCHMARK_DATA
  ? (globalThis.__BENCHMARK_DATA as unknown[]).map(normalizeRecord)
  : [];

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

/**
 * Split a model artifact (e.g. `mlx-community/Qwen3.6-35B-A3B-4bit`) on its
 * FIRST `/`: everything before becomes `prefix` (the org, e.g. `mlx-community`)
 * and everything after becomes `name` (the useful model part). When there is no
 * `/`, `prefix` is null and `name` is the whole string. Only the first `/` is a
 * boundary — any later slashes stay in `name`.
 */
export function splitArtifact(artifact: string): { prefix: string | null; name: string } {
  const idx = artifact.indexOf("/");
  if (idx === -1) return { prefix: null, name: artifact };
  return { prefix: artifact.slice(0, idx), name: artifact.slice(idx + 1) };
}
