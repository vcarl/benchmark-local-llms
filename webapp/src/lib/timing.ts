// Evaluation timing disclosure (server shape: src/report/timing.ts). Display
// only: a label never changes a score or rank.

export const TIMING_LABELS = ["unpublished", "predates", "cutoff-claimed", "exposable", "unknown"] as const;
export type TimingLabel = (typeof TIMING_LABELS)[number];
export type TimingCounts = Record<TimingLabel, number>;

export interface ModelDates {
  model?: string;
  note?: string;
  released?: string;
  releasedSource?: string;
  releasedNote?: string;
  cutoff?: string;
  cutoffSource?: string;
  cutoffNote?: string;
}

export interface Timing {
  itemDates: { asOf: string; source: string } | null;
  items: Record<string, { publishedAt: string; evidence: string } | null>;
  models: Record<string, ModelDates>;
  rows: Record<string, Record<string, TimingCounts>>;
}

export const LABEL_HELP: Record<TimingLabel, string> = {
  unpublished: "Item not public as of the item-dates snapshot, so it cannot have been trained on.",
  predates: "The weights were published before the item became public.",
  "cutoff-claimed": "Weights published after the item, but the vendor's stated training cutoff is before it (a vendor claim).",
  exposable: "Weights published after the item; the cutoff is missing or not before it.",
  unknown: "A date is missing, or the dates fall in the same day or period.",
};

export const TIMING_NOTE =
  "Disclosure only; it never affects score or rank. `predates` does not mean uncontaminated: upstream sources and classic puzzles may be in training data elsewhere. Training cutoffs are vendor claims.";

export interface TimingTotals {
  total: number;
  counts: TimingCounts;
  /** Share per label, in TIMING_LABELS order; all 0 when total is 0. */
  shares: TimingCounts;
}

const zero = (): TimingCounts => ({ unpublished: 0, predates: 0, "cutoff-claimed": 0, exposable: 0, unknown: 0 });

/** Sum a row's per-challenge counts; `challenges` (empty/undefined: all) restricts them. */
export const timingTotals = (
  timing: Timing,
  rowId: string,
  challenges: readonly string[] = [],
): TimingTotals | null => {
  const per = timing.rows[rowId];
  if (per === undefined) return null;
  const counts = zero();
  for (const [id, c] of Object.entries(per)) {
    if (challenges.length > 0 && !challenges.includes(id)) continue;
    for (const l of TIMING_LABELS) counts[l] += c[l];
  }
  const total = TIMING_LABELS.reduce((s, l) => s + counts[l], 0);
  const shares = zero();
  if (total > 0) for (const l of TIMING_LABELS) shares[l] = counts[l] / total;
  return { total, counts, shares };
};

/** Min and max `publishedAt` among a challenge's public items, plus how many are not public. */
export const challengeItemDates = (timing: Timing, challenge: string) => {
  const entries = Object.entries(timing.items).filter(([k]) => k.startsWith(`${challenge}/`));
  const dates = entries.flatMap(([, v]) => (v === null ? [] : [v.publishedAt.slice(0, 10)])).sort();
  return {
    items: entries.map(([k, v]) => ({ item: k.slice(challenge.length + 1), date: v })),
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    notPublic: entries.filter(([, v]) => v === null).length,
  };
};
