// A model's spread across its runs (rows sharing a modelKey): per-challenge
// score distributions and failure-kind profiles. Complete rows only — a partial
// run's missing challenges would read as failures.

import type { Scope, ScopedRow } from "./model";
import type { Cell } from "./rows";

export interface Box {
  id: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** One per run, in `runs` order. */
  values: number[];
}

/** Every failure kind the report emits (src/report), plus the failed items no kind covers. */
export const FAILURE_AXES = [
  "thinking_truncated",
  "wrong",
  "loop",
  "untagged",
  "no_answer",
  "length_cutoff",
  "execution_error",
  "context_exceeded",
  "scorer_error",
  "near_miss",
] as const;

export interface FailureProfile {
  runtime: string;
  runs: number;
  /** Mean failed samples per run, per FAILURE_AXES entry. */
  mean: number[];
}

const quantile = (sorted: number[], p: number): number => {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const a = sorted[lo] as number;
  return a + ((sorted[Math.ceil(i)] as number) - a) * (i - lo);
};

const scopedCounts = (c: Cell, scope: Scope): [number, number] =>
  scope.items === "all" ? [c.items, c.passed] : (c.scopes[scope.items] ?? [0, 0]);

export const completeRuns = (rows: ScopedRow[]): ScopedRow[] => rows.filter((r) => r.complete);

/** Pass rate per challenge across runs; challenges with no items in scope are dropped. */
export const challengeBoxes = (runs: ScopedRow[], scope: Scope): Box[] => {
  const ids = scope.challenges.length > 0 ? scope.challenges : [...new Set(runs.flatMap((r) => Object.keys(r.row.cells)))].sort();
  return ids.flatMap((id) => {
    const values = runs.flatMap((r) => {
      const c = r.row.cells[id];
      if (c === undefined) return [];
      const [n, y] = scopedCounts(c, scope);
      return n === 0 ? [] : [y / n];
    });
    if (values.length === 0) return [];
    const s = [...values].sort((a, b) => a - b);
    return [{ id, min: s[0] as number, q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1] as number, values }];
  });
};

/** Failure kinds per run, averaged per runtime. Kinds are tallied per cell, so this ignores the item scope. */
export const failureProfiles = (runs: ScopedRow[]): FailureProfile[] => {
  const by = new Map<string, number[][]>();
  for (const r of runs) {
    // Kinds are tallied per sample; results archived before failure kinds existed carry none.
    const kinds: Record<string, number> = { untagged: 0 };
    for (const c of Object.values(r.row.cells)) {
      let tagged = 0;
      for (const [k, n] of Object.entries(c.failureKinds)) {
        kinds[k] = (kinds[k] ?? 0) + n;
        tagged += n;
      }
      kinds.untagged = (kinds.untagged ?? 0) + Math.max(0, Math.round((c.items - c.passed) * (c.samples?.[1] ?? 1) - tagged));
    }
    const v = FAILURE_AXES.map((k) => kinds[k] ?? 0);
    by.set(r.row.runtime, [...(by.get(r.row.runtime) ?? []), v]);
  }
  return [...by.entries()]
    .map(([runtime, vs]) => ({
      runtime,
      runs: vs.length,
      mean: FAILURE_AXES.map((_, i) => vs.reduce((s, v) => s + (v[i] as number), 0) / vs.length),
    }))
    .sort((a, b) => a.runtime.localeCompare(b.runtime));
};
