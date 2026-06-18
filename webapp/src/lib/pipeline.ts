import type { BenchmarkResult } from "./data";
import { isPass } from "./constants";
import { modelFamily, modelSizeB } from "./data";
import { maxPeakMemoryGb } from "./run-summary";

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

// Total challenges = distinct prompt_names attempted in a (run_id, temperature)
// slice across every variant. Anchors the pass-rate denominator: a flaky variant
// that only got through 30/50 prompts is divided by 50 (assuming any variant in
// the same run completed the corpus), not by 30. If no variant in the slice
// reached a given prompt, that prompt is invisible — at-least-one-variant-finished
// is the implicit precondition.
const buildChallengeIndex = (data: BenchmarkResult[]): Map<string, number> => {
  const sets = new Map<string, Set<string>>();
  for (const r of data) {
    // Pass-rate denominator counts prompt challenges only — scenarios have
    // their own `value`-based scoring axis and don't compete in the prompt
    // pass-rate denominator.
    if (r.kind !== "prompt") continue;
    const k = `${r.run_id}|${r.temperature}`;
    let s = sets.get(k);
    if (!s) {
      s = new Set<string>();
      sets.set(k, s);
    }
    s.add(r.prompt_name);
  }
  const counts = new Map<string, number>();
  for (const [k, s] of sets) counts.set(k, s.size);
  return counts;
};

const challengeKey = (run_id: string, temperature: number): string =>
  `${run_id}|${temperature}`;

// Distinct prompt_names this variant has at least one passing record for.
// Counts at the prompt level rather than the record level so duplicate records
// for the same prompt_name (which shouldn't exist in well-formed data) can't
// drive the numerator above the run's challenge count.
//
// Scenario records carry a raw `value` (not bound to [0,1]) so they're
// excluded from pass/fail accounting entirely — pass rate is a prompt-only
// concept after the prompt/scenario split.
const countPassingChallenges = (runs: BenchmarkResult[]): number => {
  const passed = new Set<string>();
  for (const r of runs) {
    if (r.kind === "prompt" && isPass(r.score)) passed.add(r.prompt_name);
  }
  return passed.size;
};

// Some filters apply to whole variants rather than individual records — e.g.
// the duration filter compares the variant's total benchmark wall_time
// (summed across prompts) against a range, because filtering wall_time
// per-record would change the variant's averaged score and tokens by
// silently dropping long-running prompts.
export const applyVariantFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] => {
  if (f.durationRange === undefined) return data;
  const key = (r: BenchmarkResult) =>
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

export const applyFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  data.filter((r) => {
    if (f.tags !== undefined && f.tags.length > 0 && !r.tags.some((t) => f.tags!.includes(t)))
      return false;
    if (!passesDim(f.category, r.category)) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (f.family !== undefined && f.family.length > 0 && !f.family.includes(modelFamily(r.model)))
      return false;
    if (f.paramRange !== undefined) {
      // Models with unparseable size (null) pass through unfiltered.
      const size = modelSizeB(r.model);
      if (size !== null && !inRange(f.paramRange, size)) return false;
    }
    if (!passesDim(f.quant, r.quant)) return false;
    if (!inRange(f.tempRange, r.temperature)) return false;
    return true;
  });

export interface ScatterDot {
  baseModel: string;
  family: string;
  runtime: string;
  quant: string;
  temperature: number;
  run_id: string;
  executedAt: string;
  // Pass rate against the run's total challenge count, not just records observed
  // for this variant. Numerator = distinct prompt_names this variant passed.
  // Denominator = distinct prompt_names attempted at this (run_id, temperature)
  // by any variant in the dataset.
  score: number;       // 0..100
  tokens: number;      // total generation_tokens across the variant
  gen_tps: number;     // mean generation_tps across the variant's runs
  wallTime: number;    // total wall_time_sec for the variant (sum across prompts)
  mem: number;         // max peak_memory_gb, with fallback to sibling variants
}

// Wall-time (seconds) → star-point count. Log-scaled across the typical
// per-variant total range (~30s to many hours); clamped to [4, 15] so the
// shape stays legible at both ends.
export const starPointsForWallTime = (seconds: number): number => {
  const s = Math.max(seconds, 1);
  const n = Math.floor(Math.log2(s) * 1.08) - 1;
  return Math.max(4, Math.min(15, n));
};

export interface TpsDomain {
  min: number;
  max: number;
}

// Compute the gen_tps domain across an array of dots. Filters out non-positive
// values so the domain is meaningful even when some variants have missing tps.
// Returns a degenerate-but-safe domain when there's no usable data.
export const computeTpsDomain = (dots: ScatterDot[]): TpsDomain => {
  const values = dots.map((d) => d.gen_tps).filter((t) => Number.isFinite(t) && t > 0);
  if (values.length === 0) return { min: 1, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min, max: min * 1.0001 };
  return { min, max };
};

const OPACITY_MIN = 0.35;
const OPACITY_MAX = 0.95;

// Map a generation-tps value to a fill-opacity in [OPACITY_MIN, OPACITY_MAX]
// using a log scale across the supplied domain. Faster generation → more
// opaque. Out-of-range / non-positive inputs clamp to OPACITY_MIN.
export const opacityForTps = (tps: number, domain: TpsDomain): number => {
  if (!Number.isFinite(tps) || tps <= 0) return OPACITY_MIN;
  const { min, max } = domain;
  if (!(max > min)) return (OPACITY_MIN + OPACITY_MAX) / 2;
  const lo = Math.log(min);
  const hi = Math.log(max);
  const t = (Math.log(Math.max(min, Math.min(max, tps))) - lo) / (hi - lo);
  return OPACITY_MIN + t * (OPACITY_MAX - OPACITY_MIN);
};

export const aggregateForScatter = (data: BenchmarkResult[]): ScatterDot[] => {
  const challengeIndex = buildChallengeIndex(data);
  const key = (r: BenchmarkResult) =>
    `${r.model}|${r.runtime}|${r.quant}|${r.temperature}|${r.run_id}`;
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of data) {
    const k = key(r);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }

  const memByBaseModel = new Map<string, number>();
  for (const r of data) {
    const existing = memByBaseModel.get(r.model) ?? 0;
    if (r.peak_memory_gb > existing) memByBaseModel.set(r.model, r.peak_memory_gb);
  }

  const dots: ScatterDot[] = [];
  for (const [, runs] of groups) {
    const first = runs[0];
    if (first === undefined) continue;
    // Token sum / TPS mean scope to prompt records only — scenarios carry
    // dramatically larger token counts (a single scenario can be ~500k tokens)
    // which would dominate the scatter chart's x-axis. Pass-rate already uses
    // the prompt-only challenge index. Wall time still sums all records since
    // it reflects real time consumed by the variant.
    const promptRuns = runs.filter((r) => r.kind === "prompt");
    const promptN = promptRuns.length;
    const denom = challengeIndex.get(challengeKey(first.run_id, first.temperature)) ?? promptN;
    const passRate = denom > 0 ? countPassingChallenges(runs) / denom : 0;
    const totalTokens = promptRuns.reduce((s, r) => s + r.generation_tokens, 0);
    const meanGenTps = promptN === 0
      ? 0
      : promptRuns.reduce((s, r) => s + r.generation_tps, 0) / promptN;
    const totalWallTime = runs.reduce((s, r) => s + r.wall_time_sec, 0);
    const variantMem = maxPeakMemoryGb(runs);
    const mem = variantMem > 0 ? variantMem : (memByBaseModel.get(first.model) ?? 0);
    if (mem <= 0) continue;
    const executedAt = runs.reduce(
      (min, r) => (r.executed_at !== "" && (min === "" || r.executed_at < min) ? r.executed_at : min),
      "",
    );
    dots.push({
      baseModel: first.model,
      family: modelFamily(first.model),
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      run_id: first.run_id,
      executedAt,
      score: passRate * 100,
      tokens: totalTokens,
      gen_tps: meanGenTps,
      wallTime: totalWallTime,
      mem,
    });
  }
  return dots;
};

const tokensOf = (r: BenchmarkResult) => r.generation_tokens;

export interface RunRow {
  baseModel: string;
  family: string;
  runtime: string;
  quant: string;
  temperature: number;
  run_id: string;
  // Pass rate against the run's total challenge count at this temperature.
  // See ScatterDot.score for the full definition.
  score: number;        // 0..100
  tokens: number;       // total generation_tokens across the variant
  efficiency: number;   // round(tokens / score), 0 when score is 0
  mem: number;          // max peak_memory_gb for this variant, falls back to model max
  genTps: number;       // mean generation_tps across the variant's prompt runs
  wallTime: number;     // total wall_time_sec for the variant (sum across all runs)
  runs: number;         // # of underlying BenchmarkResult records
}

export interface RunGroup {
  baseModel: string;
  family: string;
  rows: RunRow[];
  primaryValue: number;
}

export type RunSortKey = "score" | "efficiency" | "memory";

const sortValue = (r: RunRow, key: RunSortKey): number =>
  key === "score" ? r.score : key === "efficiency" ? r.efficiency : r.mem;

const compareRuns = (key: RunSortKey) => (a: RunRow, b: RunRow): number => {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  // score desc, others asc
  return key === "score" ? vb - va : va - vb;
};

export const aggregateForRunList = (data: BenchmarkResult[]): RunRow[] => {
  const challengeIndex = buildChallengeIndex(data);

  const memByBaseModel = new Map<string, number>();
  for (const r of data) {
    const existing = memByBaseModel.get(r.model) ?? 0;
    if (r.peak_memory_gb > existing) memByBaseModel.set(r.model, r.peak_memory_gb);
  }

  const key = (r: BenchmarkResult) =>
    `${r.model}|${r.runtime}|${r.quant}|${r.temperature}|${r.run_id}`;
  const buckets = new Map<string, BenchmarkResult[]>();
  for (const r of data) {
    const k = key(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }

  const rows: RunRow[] = [];
  for (const [, runs] of buckets) {
    const first = runs[0];
    if (first === undefined) continue;
    const n = runs.length;
    // Token sum scopes to prompt records only — scenario token counts are
    // an order of magnitude larger and would distort the efficiency metric
    // (tokens / passRate). Pass-rate already uses the prompt-only challenge
    // index.
    const promptRuns = runs.filter((r) => r.kind === "prompt");
    const promptN = promptRuns.length;
    const denom = challengeIndex.get(challengeKey(first.run_id, first.temperature)) ?? promptN;
    const passRate = denom > 0 ? (countPassingChallenges(runs) / denom) * 100 : 0;
    const totalTokens = promptRuns.reduce((s, r) => s + tokensOf(r), 0);
    const efficiency = passRate > 0 ? Math.round(totalTokens / passRate) : 0;
    // Generation throughput is prompt-only (matching the scatter dot) so the
    // huge scenario token streams don't skew the per-variant mean. Wall time
    // sums all records since it reflects real time the variant consumed.
    const genTps = promptN === 0
      ? 0
      : promptRuns.reduce((s, r) => s + r.generation_tps, 0) / promptN;
    const wallTime = runs.reduce((s, r) => s + r.wall_time_sec, 0);
    const variantMem = maxPeakMemoryGb(runs);
    const mem = variantMem > 0 ? variantMem : (memByBaseModel.get(first.model) ?? 0);
    rows.push({
      baseModel: first.model,
      family: modelFamily(first.model),
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      run_id: first.run_id,
      score: passRate,
      tokens: totalTokens,
      efficiency,
      mem,
      genTps,
      wallTime,
      runs: n,
    });
  }
  return rows;
};

export const groupRunsByModel = (
  rows: RunRow[],
  primary: RunSortKey,
  secondary: RunSortKey,
): RunGroup[] => {
  const groups = new Map<string, RunRow[]>();
  for (const r of rows) {
    const arr = groups.get(r.baseModel);
    if (arr) arr.push(r);
    else groups.set(r.baseModel, [r]);
  }

  const cmpSecondary = compareRuns(secondary);
  const cmpScore = compareRuns("score");
  const cmpRowTie = (a: RunRow, b: RunRow): number => {
    const s = cmpSecondary(a, b);
    if (s !== 0) return s;
    if (secondary !== "score") {
      const t = cmpScore(a, b);
      if (t !== 0) return t;
    }
    return a.runtime.localeCompare(b.runtime)
      || a.quant.localeCompare(b.quant)
      || a.temperature - b.temperature;
  };

  const cmpPrimary = compareRuns(primary);
  const result: RunGroup[] = [];
  for (const [baseModel, gRows] of groups) {
    const sorted = gRows.slice().sort(cmpRowTie);
    const lead = sorted[0];
    if (lead === undefined) continue;
    const primaryValue = sortValue(lead, primary);
    result.push({ baseModel, family: lead.family, rows: sorted, primaryValue });
  }

  result.sort((a, b) => {
    const lead = cmpPrimary(a.rows[0]!, b.rows[0]!);
    if (lead !== 0) return lead;
    if (primary !== "score") {
      const s = cmpScore(a.rows[0]!, b.rows[0]!);
      if (s !== 0) return s;
    }
    return a.baseModel.localeCompare(b.baseModel);
  });

  return result;
};

