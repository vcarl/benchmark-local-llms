import type { BenchmarkResult } from "./data";
import { PASS_THRESHOLD } from "./constants";
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

export interface Row {
  key: string;
  label: string;
  meanScore: number;
  passRate: number;
  capabilityProfile: Record<string, { mean: number; count: number }>;
  runs: BenchmarkResult[];
}

export interface Sort {
  field: "meanScore" | "passRate" | "generation_tps" | "peak_memory_gb" | "wall_time_sec" | "name" | "tier";
  dir: "asc" | "desc";
}

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

const labelFor = (by: GroupBy, key: string, runs: BenchmarkResult[]): string => {
  if (by === "model") {
    const r = runs[0];
    if (r === undefined) return key;
    return `${r.model} · ${r.runtime} · ${r.quant}`;
  }
  return key;
};

export const aggregate = (
  groups: Map<string, BenchmarkResult[]>,
  by: GroupBy,
): Row[] => {
  const rows: Row[] = [];
  for (const [key, runs] of groups) {
    const meanScore = runs.reduce((s, r) => s + r.score, 0) / runs.length;
    const passRate = runs.filter((r) => r.score >= PASS_THRESHOLD).length / runs.length;

    // capability profile: mean score per tag across THIS group's runs
    const byTag = new Map<string, number[]>();
    for (const r of runs) {
      for (const t of r.tags) {
        const arr = byTag.get(t);
        if (arr) arr.push(r.score);
        else byTag.set(t, [r.score]);
      }
    }
    const capabilityProfile: Record<string, { mean: number; count: number }> = {};
    for (const [tag, scores] of byTag) {
      capabilityProfile[tag] = {
        mean: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      };
    }
    rows.push({ key, label: labelFor(by, key, runs), meanScore, passRate, capabilityProfile, runs });
  }
  return rows;
};

export const sortRows = (rows: Row[], sort: Sort): Row[] => {
  const mult = sort.dir === "asc" ? 1 : -1;
  const copy = rows.slice();
  copy.sort((a, b) => {
    if (sort.field === "name") return mult * a.label.localeCompare(b.label);
    if (sort.field === "meanScore") return mult * (a.meanScore - b.meanScore);
    if (sort.field === "passRate") return mult * (a.passRate - b.passRate);
    const avg = (field: keyof BenchmarkResult) =>
      (rs: BenchmarkResult[]) =>
        rs.reduce((s, r) => s + (typeof r[field] === "number" ? (r[field] as number) : 0), 0) / rs.length;
    if (sort.field === "generation_tps") return mult * (avg("generation_tps")(a.runs) - avg("generation_tps")(b.runs));
    if (sort.field === "peak_memory_gb") return mult * (avg("peak_memory_gb")(a.runs) - avg("peak_memory_gb")(b.runs));
    if (sort.field === "wall_time_sec") return mult * (avg("wall_time_sec")(a.runs) - avg("wall_time_sec")(b.runs));
    if (sort.field === "tier") return mult * (avg("tier")(a.runs) - avg("tier")(b.runs));
    return 0;
  });
  return copy;
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
