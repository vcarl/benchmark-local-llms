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

/** One family's contribution: `n` scored items, `y` passed (or a paired difference). */
export interface Cluster {
  readonly n: number;
  readonly y: number;
}

export const MIN_CLUSTERS = 5;
export const Z95 = 1.96;

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
 * Paired difference a − b over the families both cluster maps share with the
 * same item count (the same canonical items). Pairing cancels the per-family
 * difficulty both configs face, so the SE is far tighter than combining two
 * independent SEs. Null below MIN_CLUSTERS shared families.
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
  return { diff, se, lo: diff - Z95 * se, hi: diff + Z95 * se };
};

