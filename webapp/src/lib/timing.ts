// Evaluation timing disclosure (server shape: src/report/timing.ts). Display
// only: a label never changes a score or rank.

export const TIMING_LABELS = ["predates", "exposable", "unknown"] as const;
export type TimingLabel = (typeof TIMING_LABELS)[number];
export type TimingCounts = Record<TimingLabel, number>;

/** The hub revision a bundle's weights were loaded from; `publishedAt` null when the run could not look it up. */
export interface WeightsSource {
  repo: string;
  revision: string;
  publishedAt: string | null;
}

export interface Timing {
  /** `<challenge>/<item>` → `committedAt` of the earliest frozen release holding its prompt. */
  items: Record<string, string>;
  rows: Record<string, Record<string, { weights: WeightsSource | null; labels: TimingCounts }>>;
}

export const LABEL_HELP: Record<TimingLabel, string> = {
  predates: "The weights were published on an earlier day than the item's release was frozen.",
  exposable: "The weights were published on a later day than the item's release was frozen.",
  unknown: "Same day, or the run recorded no weights publication date.",
};

export const TIMING_NOTE =
  "Disclosure only; it never affects score or rank. Weights publication is when the Hugging Face revision was committed, not when the model was trained; a requant uploaded after its base model gets the later date. `predates` does not mean uncontaminated: upstream sources and classic puzzles may be in training data elsewhere.";

const zero = (): TimingCounts => ({ predates: 0, exposable: 0, unknown: 0 });

/** The row's scored challenges, restricted to `challenges` (empty: all). */
const cellsOf = (timing: Timing, rowId: string, challenges: readonly string[]) =>
  Object.entries(timing.rows[rowId] ?? {}).filter(([id]) => challenges.length === 0 || challenges.includes(id));

/** Sum a row's per-challenge counts; null when the snapshot has no timing for the row. */
export const timingTotals = (timing: Timing, rowId: string, challenges: readonly string[] = []) => {
  if (timing.rows[rowId] === undefined) return null;
  const counts = zero();
  for (const [, c] of cellsOf(timing, rowId, challenges)) for (const l of TIMING_LABELS) counts[l] += c.labels[l];
  const total = TIMING_LABELS.reduce((s, l) => s + counts[l], 0);
  const shares = zero();
  if (total > 0) for (const l of TIMING_LABELS) shares[l] = counts[l] / total;
  return { total, counts, shares };
};

/** The distinct weights behind a row's cells (null: a bundle that recorded none). */
export const rowWeights = (timing: Timing, rowId: string, challenges: readonly string[] = []) => {
  const seen = new Map<string, WeightsSource | null>();
  for (const [, c] of cellsOf(timing, rowId, challenges))
    seen.set(c.weights === null ? "" : `${c.weights.repo}@${c.weights.revision}`, c.weights);
  return [...seen.values()];
};

/** The earliest and latest freeze day of a challenge's items; null when none is in a frozen release. */
export const frozenSpan = (timing: Timing, challenge: string): [string, string] | null => {
  const days = Object.entries(timing.items)
    .filter(([k]) => k.startsWith(`${challenge}/`))
    .map(([, at]) => at.slice(0, 10))
    .sort();
  return days.length === 0 ? null : [days[0]!, days[days.length - 1]!];
};
