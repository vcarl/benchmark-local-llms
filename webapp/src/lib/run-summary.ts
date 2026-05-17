// Per-variant aggregation: a "run" is a (model, runtime, quant, temperature)
// tuple. The webapp's URL identifies a run by encoding `runtime~quant~temp`
// into a single segment so it survives URL paths even when quants contain
// underscores or hyphens (e.g. "Q4_K_M", "q4-k-m").
import type { BenchmarkResult, ScenarioBenchmarkResult } from "./data";
import { isPass } from "./constants";

export interface VariantKey {
  runtime: string;
  quant: string;
  temperature: number;
}

const VARIANT_SEPARATOR = "~";

export const encodeVariant = (v: VariantKey): string =>
  [v.runtime, v.quant, String(v.temperature)].join(VARIANT_SEPARATOR);

// Parse a `runtime~quant~temperature` string. Returns null if any of the
// three parts is missing or the temperature isn't a finite number.
export const parseVariant = (s: string): VariantKey | null => {
  const parts = s.split(VARIANT_SEPARATOR);
  if (parts.length !== 3) return null;
  const [runtime, quant, tempStr] = parts as [string, string, string];
  const temperature = Number(tempStr);
  if (!Number.isFinite(temperature)) return null;
  return { runtime, quant, temperature };
};

export const variantOf = (rec: BenchmarkResult): VariantKey => ({
  runtime: rec.runtime,
  quant: rec.quant,
  temperature: rec.temperature,
});

export const variantsEqual = (a: VariantKey, b: VariantKey): boolean =>
  a.runtime === b.runtime &&
  a.quant === b.quant &&
  a.temperature === b.temperature;

// Per-variant rollup. Counts are at the prompt level (one per record);
// totals sum across all records in the variant.
export interface VariantSummary {
  key: VariantKey;
  recordCount: number;
  pass: number;
  fail: number;
  error: number;
  passRate: number; // 0..1, share of non-error records that passed
  meanScore: number; // 0..1, mean across all records (errors count as 0)
  totalWallSec: number;
  totalGenerationTokens: number;
  meanPromptTps: number;
  meanGenerationTps: number;
  peakMemoryGb: number;
}

const isExecutionError = (rec: BenchmarkResult): boolean => {
  const d = rec.score_details;
  if (typeof d !== "string") return false;
  return d.startsWith("execution error:") || d.startsWith("scorer error:");
};

const meanOrZero = (values: number[]): number => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
};

export const maxPeakMemoryGb = (recs: BenchmarkResult[]): number => {
  let m = 0;
  for (const r of recs) {
    if (r.peak_memory_gb > m) m = r.peak_memory_gb;
  }
  return m;
};

export const summarizeVariant = (
  recs: BenchmarkResult[],
  key: VariantKey,
): VariantSummary => {
  let pass = 0;
  let fail = 0;
  let error = 0;
  let totalWallSec = 0;
  let totalGenerationTokens = 0;
  let scoreSum = 0;
  const promptTpsValues: number[] = [];
  const generationTpsValues: number[] = [];

  // pass/fail/score accounting is prompt-only after the prompt/scenario split:
  // scenario records carry a raw `value` rather than a [0,1] score, so they
  // can't participate in pass-rate or mean-score math. They still count
  // toward wall_time and tps aggregates.
  let promptCount = 0;
  for (const r of recs) {
    totalWallSec += r.wall_time_sec;
    totalGenerationTokens += r.generation_tokens;
    if (Number.isFinite(r.prompt_tps) && r.prompt_tps > 0) promptTpsValues.push(r.prompt_tps);
    if (Number.isFinite(r.generation_tps) && r.generation_tps > 0) {
      generationTpsValues.push(r.generation_tps);
    }
    if (r.kind !== "prompt") continue;
    promptCount += 1;
    if (isExecutionError(r)) error += 1;
    else if (isPass(r.score)) pass += 1;
    else fail += 1;
    scoreSum += r.score;
  }

  const recordCount = recs.length;
  // passRate is over scored records only — execution errors don't count
  // as failures of the model, they're broken runs. Avoids penalizing a
  // variant whose archive is partial.
  const scoredCount = pass + fail;
  const passRate = scoredCount === 0 ? 0 : pass / scoredCount;
  const meanScore = promptCount === 0 ? 0 : scoreSum / promptCount;

  return {
    key,
    recordCount,
    pass,
    fail,
    error,
    passRate,
    meanScore,
    totalWallSec,
    totalGenerationTokens,
    meanPromptTps: meanOrZero(promptTpsValues),
    meanGenerationTps: meanOrZero(generationTpsValues),
    peakMemoryGb: maxPeakMemoryGb(recs),
  };
};

// Return the list of variants for a model, ordered by mean score descending
// (so the "best" variant surfaces first in the switcher), with deterministic
// tie-breaks on runtime/quant/temperature so the order is stable.
export const variantsForModel = (
  data: BenchmarkResult[],
  model: string,
): VariantSummary[] => {
  const buckets = new Map<string, { key: VariantKey; recs: BenchmarkResult[] }>();
  for (const r of data) {
    if (r.model !== model) continue;
    // Don't drop scenarios here: summarizeVariant handles mixed kinds
    // internally (pass/score math is prompt-only; wall-time and tokens
    // accumulate over all records, including scenarios). Filtering scenarios
    // out at this layer would silently strip their contribution to the
    // variant's totalWallSec and totalGenerationTokens — which the run header
    // displays.
    const key = variantOf(r);
    const id = encodeVariant(key);
    const slot = buckets.get(id);
    if (slot) slot.recs.push(r);
    else buckets.set(id, { key, recs: [r] });
  }
  const out: VariantSummary[] = [];
  for (const { key, recs } of buckets.values()) {
    out.push(summarizeVariant(recs, key));
  }
  out.sort((a, b) => {
    if (a.meanScore !== b.meanScore) return b.meanScore - a.meanScore;
    if (a.key.runtime !== b.key.runtime) return a.key.runtime.localeCompare(b.key.runtime);
    if (a.key.quant !== b.key.quant) return a.key.quant.localeCompare(b.key.quant);
    return a.key.temperature - b.key.temperature;
  });
  return out;
};

// Filter records for a specific variant of a model.
export const recordsForVariant = (
  data: BenchmarkResult[],
  model: string,
  key: VariantKey,
): BenchmarkResult[] =>
  data.filter(
    (r) =>
      r.model === model &&
      r.runtime === key.runtime &&
      r.quant === key.quant &&
      r.temperature === key.temperature,
  );

export const scenariosForVariant = (
  data: BenchmarkResult[],
  model: string,
  key: VariantKey,
): ScenarioBenchmarkResult[] =>
  recordsForVariant(data, model, key).filter(
    (r): r is ScenarioBenchmarkResult => r.kind === "scenario",
  );
