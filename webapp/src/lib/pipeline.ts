import type { BenchmarkResult } from "./data";
import { CAPABILITY_TAGS, PASS_THRESHOLD } from "./constants";
import { modelFamily, modelSizeB } from "./data";

export interface NumRange { min: number; max: number }

export interface Filters {
  tags?: string[];
  tagsExclude?: string[];
  category?: string[];
  runtime?: string[];
  family?: string[];
  paramRange?: NumRange;   // model parameter count in B; null sizes pass through
  quant?: string[];
  tempRange?: NumRange;
  durationRange?: NumRange; // wall_time_sec window
  isScenario?: boolean;
}

export type GroupBy =
  | "model"      // model + runtime + quant
  | "modelOnly"  // model aggregated across runtimes+quants
  | "tag"
  | "category"
  | "prompt"
  | "runtime"
  | "family";

const passesDim = <T>(selected: T[] | undefined, v: T): boolean =>
  selected === undefined || selected.length === 0 || selected.includes(v);

const inRange = (range: NumRange | undefined, v: number): boolean =>
  range === undefined || (v >= range.min && v <= range.max);

// Some filters apply to whole variants rather than individual records — e.g.
// the duration filter compares the variant's total benchmark wall_time
// (summed across prompts) against a range, because filtering wall_time
// per-record would change the variant's averaged score and tokens by
// silently dropping long-running prompts.
export const applyVariantFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] => {
  if (f.durationRange === undefined) return data;
  const key = (r: BenchmarkResult) => `${r.model}|${r.runtime}|${r.quant}|${r.temperature}`;
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
    if (f.tagsExclude !== undefined && r.tags.some((t) => f.tagsExclude!.includes(t)))
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
    if (f.isScenario !== undefined && r.is_scenario !== f.isScenario) return false;
    return true;
  });

export const groupRows = (
  data: BenchmarkResult[],
  by: GroupBy,
): Map<string, BenchmarkResult[]> => {
  const groups = new Map<string, BenchmarkResult[]>();
  const push = (key: string, r: BenchmarkResult) => {
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  };
  for (const r of data) {
    switch (by) {
      case "model":
        push(`${r.model}|${r.runtime}|${r.quant}`, r);
        break;
      case "modelOnly":
        push(r.model, r);
        break;
      case "tag":
        // A result with multiple tags appears in every group it has.
        for (const t of r.tags) push(t, r);
        break;
      case "category":
        push(r.category, r);
        break;
      case "prompt":
        push(r.prompt_name, r);
        break;
      case "runtime":
        push(r.runtime, r);
        break;
      case "family":
        push(modelFamily(r.model), r);
        break;
    }
  }
  return groups;
};

export interface ScatterDot {
  baseModel: string;
  family: string;
  runtime: string;
  quant: string;
  temperature: number;
  executedAt: string;
  score: number;       // 0..100 (mean * 100)
  tokens: number;      // mean (prompt_tokens + generation_tokens)
  gen_tps: number;     // mean generation_tps across the variant's runs
  wallTime: number;    // total wall_time_sec for the variant (sum across prompts)
  mem: number;         // max peak_memory_gb, with fallback to sibling variants
}

// Wall-time (seconds) → star-point count. Log-scaled across the typical
// per-variant total range (~30s to many hours); clamped to [5, 15] so the
// shape stays legible at both ends.
export const starPointsForWallTime = (seconds: number): number => {
  const s = Math.max(seconds, 1);
  const n = 5 + Math.floor(Math.log2(s) * 0.7);
  return Math.max(5, Math.min(15, n));
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
  const key = (r: BenchmarkResult) => `${r.model}|${r.runtime}|${r.quant}|${r.temperature}`;
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
    const n = runs.length;
    const meanScore = runs.reduce((s, r) => s + r.score, 0) / n;
    const meanTokens = runs.reduce((s, r) => s + (r.prompt_tokens + r.generation_tokens), 0) / n;
    const meanGenTps = runs.reduce((s, r) => s + r.generation_tps, 0) / n;
    const totalWallTime = runs.reduce((s, r) => s + r.wall_time_sec, 0);
    const variantMem = runs.reduce((m, r) => Math.max(m, r.peak_memory_gb), 0);
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
      executedAt,
      score: meanScore * 100,
      tokens: meanTokens,
      gen_tps: meanGenTps,
      wallTime: totalWallTime,
      mem,
    });
  }
  return dots;
};

export interface ListVariant {
  runtime: string;
  quant: string;
  temperature: number;
  score: number;   // 0..100 percentage
  tokens: number;  // mean total tokens per run in this variant
}

export interface ListCapability {
  tag: string;
  pass: number | null; // 0..1, null when no runs
  runs: number;
}

export interface ListRow {
  key: string;               // the group key (model name, prompt name, tag, etc.)
  baseModel: string | null;  // record.model when groupBy=model/modelOnly, else null
  family: string | null;     // set for model-ish groupings
  bestScore: number;         // 0..100
  bestVariant: { runtime: string; quant: string; temperature: number; tokens: number };
  efficiency: number;        // round(best.tokens / bestScore), lower = better; 0 when bestScore is 0
  variants: ListVariant[];
  capability: ListCapability[];
  mem: number;               // max peak_memory_gb across runs
  avgTokens: number;         // mean (prompt+generation) across runs
}

const tokensOf = (r: BenchmarkResult) => r.prompt_tokens + r.generation_tokens;

const computeCapability = (runs: BenchmarkResult[]): ListCapability[] =>
  CAPABILITY_TAGS.map((tag) => {
    const tagRuns = runs.filter((r) => r.tags.includes(tag));
    if (tagRuns.length === 0) return { tag, pass: null, runs: 0 };
    const pass = tagRuns.filter((r) => r.score >= PASS_THRESHOLD).length / tagRuns.length;
    return { tag, pass, runs: tagRuns.length };
  });

const computeVariants = (runs: BenchmarkResult[]): ListVariant[] => {
  const key = (r: BenchmarkResult) => `${r.runtime}|${r.quant}|${r.temperature}`;
  const buckets = new Map<string, BenchmarkResult[]>();
  for (const r of runs) {
    const k = key(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const variants: ListVariant[] = [];
  for (const [, vRuns] of buckets) {
    const first = vRuns[0];
    if (first === undefined) continue;
    const n = vRuns.length;
    const mean = vRuns.reduce((s, r) => s + r.score, 0) / n;
    const tokens = vRuns.reduce((s, r) => s + tokensOf(r), 0) / n;
    variants.push({
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      score: mean * 100,
      tokens,
    });
  }
  variants.sort((a, b) => b.score - a.score);
  return variants;
};

export interface RunRow {
  baseModel: string;
  family: string;
  runtime: string;
  quant: string;
  temperature: number;
  score: number;        // 0..100
  tokens: number;       // mean prompt+generation per record
  efficiency: number;   // round(tokens / score), 0 when score is 0
  mem: number;          // max peak_memory_gb for this variant, falls back to model max
  capability: ListCapability[];
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
  const memByBaseModel = new Map<string, number>();
  for (const r of data) {
    const existing = memByBaseModel.get(r.model) ?? 0;
    if (r.peak_memory_gb > existing) memByBaseModel.set(r.model, r.peak_memory_gb);
  }

  const key = (r: BenchmarkResult) => `${r.model}|${r.runtime}|${r.quant}|${r.temperature}`;
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
    const meanScore = (runs.reduce((s, r) => s + r.score, 0) / n) * 100;
    const meanTokens = runs.reduce((s, r) => s + tokensOf(r), 0) / n;
    const efficiency = meanScore > 0 ? Math.round(meanTokens / meanScore) : 0;
    const variantMem = runs.reduce((m, r) => Math.max(m, r.peak_memory_gb), 0);
    const mem = variantMem > 0 ? variantMem : (memByBaseModel.get(first.model) ?? 0);
    rows.push({
      baseModel: first.model,
      family: modelFamily(first.model),
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      score: meanScore,
      tokens: meanTokens,
      efficiency,
      mem,
      capability: computeCapability(runs),
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

export const aggregateForList = (data: BenchmarkResult[], groupBy: GroupBy): ListRow[] => {
  // For list view, "model" groups by model name only (variants handle runtime/quant breakdown).
  // "modelOnly" also maps to model-level grouping.
  const effectiveGroupBy: GroupBy = groupBy === "model" ? "modelOnly" : groupBy;
  const groups = groupRows(data, effectiveGroupBy);
  const rows: ListRow[] = [];
  for (const [key, runs] of groups) {
    if (runs.length === 0) continue;
    const variants = computeVariants(runs);
    const best = variants[0];
    if (best === undefined) continue;
    const bestScore = best.score;
    const efficiency = bestScore > 0 ? Math.round(best.tokens / bestScore) : 0;
    const capability = computeCapability(runs);
    const mem = runs.reduce((m, r) => Math.max(m, r.peak_memory_gb), 0);
    const avgTokens = runs.reduce((s, r) => s + tokensOf(r), 0) / runs.length;
    const isModelGroup = groupBy === "model" || groupBy === "modelOnly";
    const firstRun = runs[0];
    const family = firstRun && (isModelGroup || groupBy === "family" || groupBy === "runtime")
      ? modelFamily(firstRun.model)
      : null;
    rows.push({
      key,
      baseModel: isModelGroup && firstRun ? firstRun.model : null,
      family,
      bestScore,
      bestVariant: { runtime: best.runtime, quant: best.quant, temperature: best.temperature, tokens: best.tokens },
      efficiency,
      variants,
      capability,
      mem,
      avgTokens,
    });
  }
  return rows;
};
