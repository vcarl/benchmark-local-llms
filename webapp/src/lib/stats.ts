// ─── Uncertainty on the headline pass rate ───────────────────────────────────
//
// Items that share a scenario (one story, one set of numbers, one game) have
// correlated outcomes, so the sampling unit is the item *family*, not the item
// or the challenge (Miller 2024, "Adding Error Bars to Evals": cluster only on a
// shared context). Families come from the challenge YAML; an item with none is
// its own family, and a family may span challenges (a chain and the battery it
// decomposes); the report carries them per cell (src/report/rows.ts). Both
// estimators below are the cluster-robust (CR1) sandwich variance of a ratio
// estimator Σy / Σn with one cluster per family. Too few
// clusters makes that variance unreliable, so the functions return null.
// Intervals use the Student-t critical value with C − 1 degrees of freedom
// (C = cluster count): with few clusters z = 1.96 is far too narrow.

/** One family's contribution: `n` scored items, `y` passed (or a paired difference). */
export interface Cluster {
  readonly n: number;
  readonly y: number;
}

export const MIN_CLUSTERS = 5;

// t_{0.975, df} for df 1–30.
const T975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/** Two-sided 95% Student-t critical value; beyond df 30 the first-order expansion z + (z³ + z)/(4·df). */
export const tCrit = (df: number): number => T975[df - 1] ?? 1.96 + (1.96 ** 3 + 1.96) / (4 * df);

/** 95% CI half-width of an estimate with standard error `se` over `clusters` clusters. */
export const ci95 = (se: number, clusters: number): number => tCrit(clusters - 1) * se;

// CR1 standard error of Σy/Σn: sqrt(C/(C-1) · Σ (y_c − r·n_c)²) / Σn.
const ratioSE = (clusters: readonly Cluster[]): number | null => {
  const c = clusters.length;
  const n = clusters.reduce((s, k) => s + k.n, 0);
  if (c < MIN_CLUSTERS || n === 0) return null;
  const r = clusters.reduce((s, k) => s + k.y, 0) / n;
  const ss = clusters.reduce((s, k) => s + (k.y - r * k.n) ** 2, 0);
  return Math.sqrt((c / (c - 1)) * ss) / n;
};

/** Clustered standard error of a config's pass rate; null below MIN_CLUSTERS. */
export const passRateSE = (clusters: Map<string, Cluster>): number | null =>
  ratioSE([...clusters.values()]);

export interface PairedDiff {
  readonly diff: number; // a − b, as a pass-rate fraction
  readonly se: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * Paired difference a − b over the keys both cluster maps share with the same
 * item count. Keys must name identical item sets on both sides (model.ts keys
 * paired clusters by family and the scored challenges in it). Pairing cancels
 * the per-family difficulty both configs face, so the SE is far tighter than
 * combining two independent SEs. Null below MIN_CLUSTERS shared families.
 */
export const pairedDiff = (
  a: Map<string, Cluster>,
  b: Map<string, Cluster>,
): PairedDiff | null => {
  const d: Cluster[] = [];
  for (const [id, ca] of a) {
    const cb = b.get(id);
    if (cb !== undefined && cb.n === ca.n) d.push({ n: ca.n, y: ca.y - cb.y });
  }
  const se = ratioSE(d);
  if (se === null) return null;
  const diff = d.reduce((s, k) => s + k.y, 0) / d.reduce((s, k) => s + k.n, 0);
  const h = ci95(se, d.length);
  return { diff, se, lo: diff - h, hi: diff + h };
};

