import { shortModelName } from "./data";
import type { ScatterPoint } from "./pipeline";

// ─── Axis domains (fit to the displayed points) ──────────────────────────────

export interface AxisDomain { min: number; max: number; ticks: number[]; }

// y (pass rate, 0..1): pad the data range, snap outward to a round step, clamp
// to [0, 1]. Step scales with the span so a tight 78–99% cluster gets 5% ticks
// while a full 0–100% spread keeps 20% ticks.
export const fitYDomain = (ys: number[]): AxisDomain => {
  const vals = ys.filter(Number.isFinite);
  if (vals.length === 0) return { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(0.02, (hi - lo) * 0.05);
  const span = hi - lo + 2 * pad;
  const step = span <= 0.3 ? 0.05 : span <= 0.6 ? 0.1 : 0.2;
  // Round in integer step-units to dodge float noise (0.15000000000000002).
  const units = Math.round(1 / step);
  let minU = Math.max(0, Math.floor((lo - pad) * units));
  let maxU = Math.min(units, Math.ceil((hi + pad) * units));
  if (maxU <= minU) {
    // Degenerate (e.g. every point at 100%): open one step below/above.
    if (minU > 0) minU -= 1;
    else maxU += 1;
  }
  const ticks: number[] = [];
  for (let u = minU; u <= maxU; u += 1) ticks.push(u / units);
  return { min: minU / units, max: maxU / units, ticks };
};

// Nice log-scale stops within one decade; 1/2/3/5 keeps labels like 100k/300k/1M.
const LOG_STOPS = [1, 2, 3, 5];
const niceDown = (v: number): number => {
  const p = 10 ** Math.floor(Math.log10(v));
  return p * [...LOG_STOPS].reverse().find((s) => s * p <= v * (1 + 1e-9))!;
};
const niceUp = (v: number): number => {
  const p = 10 ** Math.floor(Math.log10(v));
  const s = LOG_STOPS.find((m) => m * p >= v * (1 - 1e-9));
  return s === undefined ? 10 * p : s * p;
};

// x (tokens, log): ignore non-positive values (unplottable on log; the scale
// clamps them to the left edge), pad ~5% each way, snap outward to nice stops.
// Ticks are every stop inside the domain, thinned to 1/3 per decade past two
// decades so labels never crowd.
export const fitXDomain = (xs: number[]): AxisDomain => {
  const vals = xs.filter((v) => v > 0 && Number.isFinite(v));
  if (vals.length === 0) return { min: 100, max: 100000, ticks: [100, 1000, 10000, 100000] };
  const min = niceDown(Math.min(...vals) / 1.05);
  const max = niceUp(Math.max(...vals) * 1.05);
  const stops = Math.log10(max / min) > 2 ? [1, 3] : LOG_STOPS;
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(min)); 10 ** e <= max; e += 1) {
    for (const s of stops) {
      // toPrecision collapses float drift (3 * 1e5 = 300000.00000000006).
      const t = Number((s * 10 ** e).toPrecision(6));
      if (t >= min * (1 - 1e-9) && t <= max * (1 + 1e-9)) ticks.push(t);
    }
  }
  return { min, max, ticks };
};

// ─── Pareto frontier ─────────────────────────────────────────────────────────

// A point is on the frontier when no other point has y ≥ AND x ≤ with at least
// one strict (higher pass rate for fewer-or-equal tokens). Exact duplicates
// don't dominate each other, so both stay. Returned sorted by x ascending.
// ponytail: O(n²) — fine for the ~30–100 displayed configs.
export const paretoFrontier = (points: ScatterPoint[]): ScatterPoint[] =>
  points
    .filter((p) => !points.some((q) => q !== p && q.y >= p.y && q.x <= p.x && (q.y > p.y || q.x < p.x)))
    .sort((a, b) => a.x - b.x);

// ─── Labels ──────────────────────────────────────────────────────────────────

// Short label per config. When displayed configs share a short name (same
// model at different quants/runtimes/temperatures), append quant, then
// runtime, then temperature — each only as far as needed to tell them apart.
export const pointLabels = (points: ScatterPoint[]): Map<string, string> => {
  const parts = (p: ScatterPoint) => [shortModelName(p.artifact), p.quant ?? "", p.runtime, `t${p.temperature}`];
  const at = (p: ScatterPoint, k: number) => parts(p).slice(0, k + 1).filter(Boolean).join(" ");
  // ponytail: O(n²) per level — fine for the displayed config count.
  return new Map(points.map((p) => {
    let k = 0;
    while (k < 3 && points.some((q) => q !== p && at(q, k) === at(p, k))) k += 1;
    return [p.config_hash, at(p, k)];
  }));
};

export interface LabelCandidate {
  key: string;
  text: string;
  cx: number; // marker center (px)
  cy: number;
  r: number; // marker outer radius (px)
  required: boolean; // frontier labels are always drawn
}

export interface PlacedLabel { key: string; text: string; x: number; y: number; anchor: "start" | "end"; }

interface Box { x0: number; y0: number; x1: number; y1: number; }
const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Greedy placement: required labels first, then the rest top-down. Each label
// tries right-of-marker, then left, then the same nudged a line up/down; it's kept at the first slot that stays in
// `bounds` and clears every placed label and every other marker. Required
// labels that find no clear slot are drawn anyway; optional
// ones are skipped (the forced fallback still prefers the side that fits
// horizontally). Text width is estimated (charW px per char), so no DOM
// measuring is needed.
export const placeLabels = (
  cands: LabelCandidate[],
  bounds: Box,
  charW = 6.2,
  lineH = 12,
): PlacedLabel[] => {
  const markers = cands.map((c) => ({ key: c.key, box: { x0: c.cx - c.r, y0: c.cy - c.r, x1: c.cx + c.r, y1: c.cy + c.r } }));
  const order = [...cands].sort((a, b) => Number(b.required) - Number(a.required) || a.cy - b.cy);
  const placed: { label: PlacedLabel; box: Box }[] = [];
  for (const c of order) {
    const w = c.text.length * charW;
    const gap = c.r + 3;
    const sides = [
      { anchor: "start" as const, x: c.cx + gap, x0: c.cx + gap, x1: c.cx + gap + w },
      { anchor: "end" as const, x: c.cx - gap, x0: c.cx - gap - w, x1: c.cx - gap },
    ];
    // Beside the marker first; then nudged up/down one line on each side.
    const slots = [0, -lineH, lineH].flatMap((dy) =>
      sides.map(({ anchor, x, x0, x1 }) => ({ anchor, x, y: c.cy + dy, box: { x0, x1, y0: c.cy + dy - lineH / 2, y1: c.cy + dy + lineH / 2 } })),
    );
    const inBounds = (b: Box) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1;
    const clear = (b: Box) =>
      !placed.some((p) => overlaps(p.box, b)) && !markers.some((m) => m.key !== c.key && overlaps(m.box, b));
    const slot =
      slots.find((s) => inBounds(s.box) && clear(s.box)) ??
      (c.required ? (slots.find((s) => s.box.x0 >= bounds.x0 && s.box.x1 <= bounds.x1) ?? slots[0]) : undefined);
    if (!slot) continue;
    placed.push({ label: { key: c.key, text: c.text, x: slot.x, y: slot.y, anchor: slot.anchor }, box: slot.box });
  }
  return placed.map((p) => p.label);
};
