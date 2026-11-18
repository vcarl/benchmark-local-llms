// The scatter's zoomed view, in data coordinates (x tokens on a log axis,
// y pass rate), and its URL form `vp=x0,x1,y0,y1`. Zoom and pan act in the
// plot's unit square — log10 on x, linear on y — so a pointer's position is a
// fraction of the view on both axes. No viewport means the full extent.

export interface Viewport {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const MIN_LOG_X = Math.log10(1.02);
const MIN_Y = 0.01;

/** 4 significant figures on x, 4 decimals on y: stable under round-trip, finer than a pixel. */
export const formatViewport = (v: Viewport): string =>
  [Number(v.x0.toPrecision(4)), Number(v.x1.toPrecision(4)), Number(v.y0.toFixed(4)), Number(v.y1.toFixed(4))].join(",");

export const parseViewport = (s: unknown): Viewport | undefined => {
  if (s === undefined || s === null) return undefined;
  const n = String(s).split(",").map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) return undefined;
  const [x0, x1, y0, y1] = n as [number, number, number, number];
  return x0 > 0 && x0 < x1 && y0 < y1 ? { x0, x1, y0, y1 } : undefined;
};

// One axis as [lo, hi] in its unit space (log10 for x).
const zoomAxis = (lo: number, hi: number, f: number, at: number): [number, number] => {
  const c = lo + at * (hi - lo);
  return [c - (c - lo) / f, c + (hi - c) / f];
};

/** Zoom by `f` (> 1 in) about the view fraction (u, v), u from the left, v from the bottom. */
export const zoomViewport = (vp: Viewport, f: number, u: number, v: number): Viewport => {
  const [lx0, lx1] = zoomAxis(Math.log10(vp.x0), Math.log10(vp.x1), f, u);
  const [y0, y1] = zoomAxis(vp.y0, vp.y1, f, v);
  return { x0: 10 ** lx0, x1: 10 ** lx1, y0, y1 };
};

/** The part of the view between fractions u0..u1 (from the left) and v0..v1 (from the bottom). */
export const subViewport = (vp: Viewport, u0: number, u1: number, v0: number, v1: number): Viewport => {
  const lx0 = Math.log10(vp.x0);
  const lw = Math.log10(vp.x1) - lx0;
  const h = vp.y1 - vp.y0;
  return { x0: 10 ** (lx0 + u0 * lw), x1: 10 ** (lx0 + u1 * lw), y0: vp.y0 + v0 * h, y1: vp.y0 + v1 * h };
};

/** Move the view by (du, dv) view widths/heights: positive du shows larger x, positive dv higher y. */
export const panViewport = (vp: Viewport, du: number, dv: number): Viewport => {
  const lx = Math.log10(vp.x1 / vp.x0) * du;
  const dy = (vp.y1 - vp.y0) * dv;
  return { x0: vp.x0 * 10 ** lx, x1: vp.x1 * 10 ** lx, y0: vp.y0 + dy, y1: vp.y1 + dy };
};

const clampAxis = (lo: number, hi: number, flo: number, fhi: number, min: number): [number, number, boolean] => {
  const full = fhi - flo;
  const span = Math.min(Math.max(hi - lo, Math.min(min, full)), full);
  let a = (lo + hi) / 2 - span / 2;
  a = Math.min(Math.max(a, flo), fhi - span);
  return [a, a + span, span >= full * (1 - 1e-9)];
};

/** Keep the view inside `full` and above the minimum span; undefined when it shows all of `full`. */
export const clampViewport = (vp: Viewport, full: Viewport): Viewport | undefined => {
  const [lx0, lx1, fx] = clampAxis(Math.log10(vp.x0), Math.log10(vp.x1), Math.log10(full.x0), Math.log10(full.x1), MIN_LOG_X);
  const [y0, y1, fy] = clampAxis(vp.y0, vp.y1, full.y0, full.y1, MIN_Y);
  return fx && fy ? undefined : { x0: 10 ** lx0, x1: 10 ** lx1, y0, y1 };
};

/** (x, y) as a fraction of `full`: u from the left in log space, v from the bottom. */
export const toUnit = (full: Viewport, x: number, y: number): { u: number; v: number } => ({
  u: Math.log10(x / full.x0) / Math.log10(full.x1 / full.x0),
  v: (y - full.y0) / (full.y1 - full.y0),
});

/** Zoom past which the minimap shows: the view spans under 1/MINIMAP_ZOOM of the extent on an axis. */
export const MINIMAP_ZOOM = 1.2;

export const minimapShown = (vp: Viewport | undefined, full: Viewport): boolean => {
  if (vp === undefined) return false;
  const a = toUnit(full, vp.x0, vp.y0);
  const b = toUnit(full, vp.x1, vp.y1);
  return Math.min(b.u - a.u, b.v - a.v) < 1 / MINIMAP_ZOOM;
};

/** The view moved, spans kept, so its center sits at the fraction (u, v) of `full`. */
export const centerViewport = (vp: Viewport, full: Viewport, u: number, v: number): Viewport => {
  const half = Math.sqrt(vp.x1 / vp.x0);
  const cx = full.x0 * (full.x1 / full.x0) ** u;
  const cy = full.y0 + v * (full.y1 - full.y0);
  const hy = (vp.y1 - vp.y0) / 2;
  return { x0: cx / half, x1: cx * half, y0: cy - hy, y1: cy + hy };
};

/** A point at (x, y) is inside the view, edges included. Comparing raw x is the log-axis test: log10 is monotone. */
export const inView = (vp: Viewport, x: number, y: number): boolean => x >= vp.x0 && x <= vp.x1 && y >= vp.y0 && y <= vp.y1;

const niceStep = (raw: number): number => {
  const p = 10 ** Math.floor(Math.log10(raw));
  return p * ([1, 2, 5, 10].find((m) => m * p >= raw * (1 - 1e-9)) ?? 10);
};

/** Ticks at a 1/2/5 step, about `target` of them, inside [min, max]. */
export const linTicks = (min: number, max: number, target = 5): number[] => {
  const step = niceStep((max - min) / target);
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) out.push(Number((k * step).toPrecision(6)));
  return out;
};

/** Log-axis ticks: 1·3 per decade past two decades, 1·2·3·5 past one, every digit below; linear when that leaves too few. */
export const logTicks = (min: number, max: number): number[] => {
  const d = Math.log10(max / min);
  const stops = d > 2 ? [1, 3] : d > 0.9 ? [1, 2, 3, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); 10 ** e <= max; e++)
    for (const s of stops) {
      const t = Number((s * 10 ** e).toPrecision(6));
      if (t >= min * (1 - 1e-9) && t <= max * (1 + 1e-9)) out.push(t);
    }
  return out.length >= 3 ? out : linTicks(min, max);
};
