import type { BenchmarkResult } from "./data";
import { EFFICIENCY_SCALE } from "./constants";

interface NumRange { min: number; max: number }

export interface Filters {
  tags?: string[];
  category?: string[];
  runtime?: string[];
  family?: string[];
  paramRange?: NumRange;   // model parameter count in B; null sizes pass through
  quant?: string[];
  tempRange?: NumRange;
  durationRange?: NumRange; // wall_time_sec window
}

const passesDim = <T>(selected: T[] | undefined, v: T): boolean =>
  selected === undefined || selected.length === 0 || selected.includes(v);

const inRange = (range: NumRange | undefined, v: number): boolean =>
  range === undefined || (v >= range.min && v <= range.max);

// Some filters apply to whole variants rather than individual records — e.g.
// the duration filter compares the variant's total benchmark wall_time
// (summed across prompts) against a range, because filtering wall_time
// per-record would change the variant's averaged score and tokens by
// silently dropping long-running prompts.
// TODO(Task 8): update key() and applyFilters once the new filter UI is designed.
export const applyVariantFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] => {
  if (f.durationRange === undefined) return data;
  // biome-ignore lint/suspicious/noExplicitAny: filter fields pending Task 8 redesign
  const key = (r: any) =>
    `${r.model}|${r.runtime}|${r.quant}|${r.temperature}|${r.run_id}`;
  const buckets = new Map<string, BenchmarkResult[]>();
  for (const r of data) {
    const k = key(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const keep = new Set<string>();
  for (const [k, runs] of buckets) {
    const total = runs.reduce((s, r) => s + r.wall_time_sec, 0);
    if (inRange(f.durationRange, total)) keep.add(k);
  }
  return data.filter((r) => keep.has(key(r)));
};

// TODO(Task 8): update field references (model, category, tags, etc.) once
// the new filter UI is designed for the config×challenge axis.
// biome-ignore lint/suspicious/noExplicitAny: filter fields pending Task 8 redesign
export const applyFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  // biome-ignore lint/suspicious/noExplicitAny: filter fields pending Task 8 redesign
  data.filter((r: any) => {
    if (f.tags !== undefined && f.tags.length > 0 && !r.tags?.some((t: string) => f.tags!.includes(t)))
      return false;
    if (!passesDim(f.category, r.category)) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (f.family !== undefined && f.family.length > 0) return false;
    if (f.paramRange !== undefined) {
      const size = r.modelSizeB ?? null;
      if (size !== null && !inRange(f.paramRange, size)) return false;
    }
    if (!passesDim(f.quant, r.quant)) return false;
    if (!inRange(f.tempRange, r.temperature)) return false;
    return true;
  });

// ─── Config×Challenge matrix ─────────────────────────────────────────────────

export interface Cell { score: number; passed: boolean; }

export interface ConfigRow {
  config_hash: string;
  artifact: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  system_prompt: string;
  cells: Record<string, Cell>;
  passRate: number;
  efficiency: number | null;
  attemptsCompleted: number;
}

export interface ArtifactGroup { artifact: string; rows: ConfigRow[]; }

export const computeConfigScores = (
  attempts: BenchmarkResult[],
): { passRate: number; efficiency: number | null } => {
  const completed = attempts.length;
  if (completed === 0) return { passRate: 0, efficiency: null };
  const passed = attempts.filter((a) => a.passed).length;
  const passRate = passed / completed;
  const uniqueChallenges = new Set(
    attempts.map((a) => `${a.challenge_id}@${a.challenge_version}`),
  ).size;
  const overallTokens = attempts.reduce((s, a) => s + a.generation_tokens, 0);
  const timeSpent = attempts.reduce((s, a) => s + a.wall_time_sec, 0);
  const denom = overallTokens * timeSpent;
  if (denom === 0) return { passRate, efficiency: null };
  const efficiency = ((passRate * uniqueChallenges * completed) / denom) * EFFICIENCY_SCALE;
  return { passRate, efficiency };
};

export const bestAttempt = (records: BenchmarkResult[]): BenchmarkResult | null =>
  records.reduce<BenchmarkResult | null>(
    (best, r) => (best === null || r.score > best.score ? r : best),
    null,
  );

export const aggregateMatrix = (
  records: BenchmarkResult[],
): { columns: string[]; groups: ArtifactGroup[] } => {
  const columns = [...new Set(records.map((r) => r.challenge_id))].sort();

  const byConfig = new Map<string, BenchmarkResult[]>();
  for (const r of records) {
    const list = byConfig.get(r.config_hash) ?? [];
    list.push(r);
    byConfig.set(r.config_hash, list);
  }

  const rows: ConfigRow[] = [];
  for (const [config_hash, attempts] of byConfig) {
    const head = attempts[0];
    if (head === undefined) continue;
    const cells: Record<string, Cell> = {};
    for (const col of columns) {
      const best = bestAttempt(attempts.filter((a) => a.challenge_id === col));
      if (best !== null) cells[col] = { score: best.score, passed: best.passed };
    }
    const scores = computeConfigScores(attempts);
    rows.push({
      config_hash,
      artifact: head.artifact,
      runtime: head.runtime,
      quant: head.quant,
      temperature: head.temperature,
      system_prompt: head.system_prompt,
      cells,
      passRate: scores.passRate,
      efficiency: scores.efficiency,
      attemptsCompleted: attempts.length,
    });
  }

  const byArtifact = new Map<string, ConfigRow[]>();
  for (const row of rows) {
    const list = byArtifact.get(row.artifact) ?? [];
    list.push(row);
    byArtifact.set(row.artifact, list);
  }
  const groups = [...byArtifact.entries()]
    .map(([artifact, gRows]) => ({ artifact, rows: gRows }))
    .sort((a, b) => a.artifact.localeCompare(b.artifact));

  return { columns, groups };
};
