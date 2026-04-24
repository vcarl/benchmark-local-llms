import type { BenchmarkResult } from "./data";
import { CAPABILITY_TAGS, PASS_THRESHOLD } from "./constants";
import { modelFamily, modelSizeRange } from "./data";

export interface Filters {
  tags?: string[];
  tagsExclude?: string[];
  category?: string[];
  tier?: number[];
  runtime?: string[];
  family?: string[];
  sizeRange?: string[];
  quant?: string[];
  temperature?: number[];
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

export const applyFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  data.filter((r) => {
    if (f.tags !== undefined && f.tags.length > 0 && !r.tags.some((t) => f.tags!.includes(t)))
      return false;
    if (f.tagsExclude !== undefined && r.tags.some((t) => f.tagsExclude!.includes(t)))
      return false;
    if (!passesDim(f.category, r.category)) return false;
    if (!passesDim(f.tier, r.tier)) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (f.family !== undefined && f.family.length > 0 && !f.family.includes(modelFamily(r.model)))
      return false;
    if (f.sizeRange !== undefined && f.sizeRange.length > 0) {
      const sr = modelSizeRange(r.model)?.label;
      if (sr === undefined || !f.sizeRange.includes(sr)) return false;
    }
    if (!passesDim(f.quant, r.quant)) return false;
    if (!passesDim(f.temperature, r.temperature)) return false;
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
  mem: number;         // max peak_memory_gb, with fallback to sibling variants
}

export const starPointsForTokens = (tokens: number): number => {
  const t = Math.max(tokens, 500);
  const n = 6 + Math.floor(Math.log2(t / 500) * 2.4);
  return Math.max(6, Math.min(18, n));
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
