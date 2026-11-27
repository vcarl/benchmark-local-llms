// Scatter encoding: one cost/quality point per visible row, drawn as the
// descriptor glyph (ScatterGlyph).

export interface ScatterPoint {
  /** The row's `rowId`: one point ⇄ one list row. */
  id: string;
  /** Points of one model (`modelKey`) are joined by a trajectory line. */
  model: string;
  artifact: string;
  family: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  x: number;
  y: number;
  // 95% CI half-width of y from the family-clustered SE (null when too few families).
  yCI: number | null;
  peak_memory_gb: number;
  generation_tps: number;
  wall_time_sec: number;
}

// ─── Scatter visual-encoding helpers ─────────────────────────────────────────

// Wall-time (seconds) → star-point count. Power curve fit to 30s→2, 5m→4,
// 30m→6, 2h→10, 10h→16 bumps; clamped to [2, 24] so the shape stays legible
// at both ends.
export const starPointsForWallTime = (seconds: number): number => {
  const n = Math.round(0.4 + 0.55 * Math.max(seconds, 1) ** 0.32);
  return Math.max(2, Math.min(24, n));
};

export interface TpsDomain {
  min: number;
  max: number;
}

// Compute the generation_tps domain across an array of ScatterPoints. Filters
// out non-positive values so the domain is meaningful even when some configs
// have missing tps. Returns a degenerate-but-safe domain when there's no
// usable data.
export const computeTpsDomain = (points: ScatterPoint[]): TpsDomain => {
  const values = points.map((p) => p.generation_tps).filter((t) => Number.isFinite(t) && t > 0);
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

