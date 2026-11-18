// Scope → per-row score, ranking and grouping. Every number is summed from the
// row's cells (src/report/rows.ts); the report already chose the evidence.
import type { CellCost, Row } from "./rows";
import { type Cluster, pairedDiff, passRateSE, type PairedDiff } from "./stats";

export type ItemScope = "all" | "core" | "stretch";
export type SortKey = "score" | "efficiency" | "speed" | "memory" | "recent";
export type GroupBy = "model" | "none";

/** What a score means: the set's challenges (empty = all) and which items count. */
export interface Scope {
  items: ItemScope;
  challenges: string[];
}

export interface ScopedRow {
  row: Row;
  passed: number;
  items: number;
  /** Ranking score: passed / items, a missing item counting as a fail. */
  score: number;
  /** passed / items of the scored cells; null when nothing in scope was scored. */
  running: number | null;
  /** [scored, total] challenges with items in scope. */
  challenges: [number, number];
  complete: boolean;
  se: number | null;
  clusters: Map<string, Cluster>;
  /** Cost of the scored cells in scope; null when none. */
  cost: CellCost | null;
  /** Generation tokens per item over the scored cells (all their items: cost is not split by scope). */
  tokensPerItem: number | null;
  /** Wall seconds per item over the scored cells (same items as tokensPerItem); null without cost. */
  wallPerItem: number | null;
  /** Null from scopeRow; withEfficiency fills it over the pool. */
  efficiency: number | null;
  executedTo: string | null;
}

// Efficiency (docs/SCORING.md § Efficiency): E = S^1.70 · g_wall^0.50 · g_tps^0.60 · g_tokens^0.70 · g_mem^0.10.
// Each g is ε + (1−ε)·u, u the log-min–max position of the input over the pool
// (flipped for wall, tokens and memory, where lower is better). The pool is the
// rows handed to withEfficiency: every in-scope row of the dataset, before the
// row filters, so filtering changes nobody's efficiency.
const EFF_FLOOR = 0.05;
const EFF_SCORE_EXPONENT = 1.7;
type EffInput = (r: ScopedRow) => number | null;
const EFF_INPUTS: { value: EffInput; exponent: number; higherIsBetter: boolean }[] = [
  { value: (r) => r.wallPerItem, exponent: 0.5, higherIsBetter: false },
  { value: (r) => r.cost?.genTps ?? null, exponent: 0.6, higherIsBetter: true },
  { value: (r) => r.tokensPerItem, exponent: 0.7, higherIsBetter: false },
  { value: (r) => r.cost?.peakMemoryGb ?? null, exponent: 0.1, higherIsBetter: false },
];

/** Fills `efficiency` over the pool; a row missing any cost input (or with a non-positive one) gets null and stays out of the pool. */
export const withEfficiency = (rows: ScopedRow[]): ScopedRow[] => {
  const usable = (r: ScopedRow) => EFF_INPUTS.every(({ value }) => (value(r) ?? 0) > 0);
  const pool = rows.filter(usable);
  const range = EFF_INPUTS.map(({ value }) => {
    const ln = pool.map((r) => Math.log(value(r) as number));
    return [Math.min(...ln), Math.max(...ln)] as const;
  });
  return rows.map((r) => {
    if (!usable(r)) return { ...r, efficiency: null };
    let e = r.score ** EFF_SCORE_EXPONENT;
    EFF_INPUTS.forEach(({ value, exponent, higherIsBetter }, i) => {
      const [lo, hi] = range[i] as readonly [number, number];
      // An input that doesn't vary across the pool can't discriminate: neutral (g = 1) either direction.
      if (hi === lo) return;
      const u = (Math.log(value(r) as number) - lo) / (hi - lo);
      e *= (EFF_FLOOR + (1 - EFF_FLOOR) * (higherIsBetter ? u : 1 - u)) ** exponent;
    });
    return { ...r, efficiency: e };
  });
};

export const scopeRow = (row: Row, scope: Scope): ScopedRow => {
  const ids = scope.challenges.length === 0 ? Object.keys(row.cells) : scope.challenges;
  let passed = 0;
  let items = 0;
  let scoredItems = 0;
  let scored = 0;
  let total = 0;
  const clusters = new Map<string, Cluster>();
  const costs: CellCost[] = [];
  let costItems = 0;
  let executedTo: string | null = null;
  for (const id of ids) {
    const c = row.cells[id];
    if (c === undefined) continue;
    const [n, y] = scope.items === "all" ? [c.items, c.passed] : (c.scopes[scope.items] ?? [0, 0]);
    if (n === 0) continue;
    total++;
    items += n;
    passed += y;
    const fams = scope.items === "all" ? c.families : (c.scopeFamilies[scope.items] ?? {});
    for (const [f, [fn, fy]] of Object.entries(fams)) {
      const k = clusters.get(f);
      clusters.set(f, { n: (k?.n ?? 0) + fn, y: (k?.y ?? 0) + fy });
    }
    if (c.status !== "scored") continue;
    scored++;
    scoredItems += n;
    if (c.cost !== null) {
      costs.push(c.cost);
      costItems += c.items;
    }
    if (c.executedTo !== null && (executedTo === null || c.executedTo > executedTo)) executedTo = c.executedTo;
  }
  const score = items === 0 ? 0 : passed / items;
  const tokens = costs.reduce((s, c) => s + c.tokens, 0);
  const tokensPerItem = costItems === 0 ? null : tokens / costItems;
  return {
    row,
    passed,
    items,
    score,
    running: scoredItems === 0 ? null : passed / scoredItems,
    challenges: [scored, total],
    complete: scored === total,
    se: passRateSE(clusters),
    clusters,
    cost:
      costs.length === 0
        ? null
        : {
            tokens,
            wallSec: costs.reduce((s, c) => s + c.wallSec, 0),
            peakMemoryGb: Math.max(...costs.map((c) => c.peakMemoryGb)),
            genTps: costs.reduce((s, c) => s + c.genTps, 0) / costs.length,
          },
    tokensPerItem,
    wallPerItem: costItems === 0 ? null : costs.reduce((s, c) => s + c.wallSec, 0) / costItems,
    efficiency: null,
    executedTo,
  };
};

// Each key's natural direction; a row missing the value sorts last.
const sortValue = (r: ScopedRow, key: SortKey): number | null => {
  switch (key) {
    case "score":
      return -r.score;
    case "efficiency":
      return r.efficiency === null ? null : -r.efficiency;
    case "speed":
      return r.cost === null ? null : -r.cost.genTps;
    case "memory":
      return r.cost?.peakMemoryGb ?? null;
    case "recent":
      return r.executedTo === null ? null : -Date.parse(r.executedTo);
  }
};

export const sortRows = (rows: ScopedRow[], key: SortKey): ScopedRow[] =>
  [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      return va - vb;
    }
    return b.score - a.score || a.row.rowId.localeCompare(b.row.rowId);
  });

/**
 * Score-sort tiers. A tier runs from its first entry (the head) until an entry
 * is significantly below the head: the paired 95% CI on head − entry excludes
 * 0. That entry heads the next tier. Within a tier no entry is resolved from
 * its head; across a boundary the data says the head above is better.
 */
export interface Tier {
  /** 1-based tier number. */
  n: number;
  start: boolean;
  /** 1-based list position of the tier's head. */
  head: number;
  /** Paired difference (entry above − this entry); null for the first entry or below 5 shared families. */
  vsAbove: PairedDiff | null;
  /** Paired difference (entry at `ref` − this entry): the head this entry was tested against. */
  vsHead: PairedDiff | null;
  /** 1-based position of that head: this tier's, or the previous tier's when this entry starts a tier. */
  ref: number;
}

export interface Group {
  key: string;
  name: string;
  rows: ScopedRow[];
  /** Score sort only. */
  tier?: Tier;
}

/** Groups in the order of their first (best) row; a group is named by its shortest model name. */
export const groupRows = (sorted: ScopedRow[], by: GroupBy, sort: SortKey): Group[] => {
  const groups = new Map<string, Group>();
  for (const r of sorted) {
    const key = by === "model" ? r.row.modelKey : r.row.rowId;
    const g = groups.get(key);
    if (g === undefined) groups.set(key, { key, name: r.row.modelName, rows: [r] });
    else {
      g.rows.push(r);
      if (r.row.modelName.length < g.name.length) g.name = r.row.modelName;
    }
  }
  const out = [...groups.values()];
  if (sort !== "score") return out;
  const lead = (i: number) => (out[i] as Group).rows[0] as ScopedRow;
  let head = 0;
  let n = 1;
  out.forEach((g, i) => {
    const ref = head + 1;
    const vsHead = i === head ? null : pairedDiff(lead(head).clusters, lead(i).clusters);
    const start = i === 0 || (vsHead !== null && vsHead.lo > 0);
    if (start && i > 0) {
      n++;
      head = i;
    }
    g.tier = {
      n,
      start,
      head: head + 1,
      vsAbove: i === 0 ? null : pairedDiff(lead(i - 1).clusters, lead(i).clusters),
      vsHead,
      ref,
    };
  });
  return out;
};
