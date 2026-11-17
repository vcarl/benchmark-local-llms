import { useLayoutEffect, useRef, useState } from "react";
import type { ScatterPoint } from "./encoding";

// ─── Scatter transitions: interpolate one displayed frame toward the next ────

/** A displayed point; `alpha` < 1 while it fades in. */
export type TweenPoint = ScatterPoint & { alpha: number };

export interface Span { min: number; max: number; }

/** Everything the scatter positions from: points plus the fitted axis extents. */
export interface Frame { points: TweenPoint[]; x: Span; y: Span; }

// A point's identity across datasets (rowIds differ per dataset). A key repeated
// within one set is numbered in rowId order.
export const identityKeys = (points: ScatterPoint[]): Map<string, string> => {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const p of [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const base = `${p.model}|${p.runtime}|${p.quant ?? ""}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(p.id, `${base}|${n}`);
  }
  return out;
};

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Tokens sit on a log axis; a non-positive value has no log, so it just snaps.
const lerpLog = (a: number, b: number, t: number) => (a > 0 && b > 0 ? 10 ** lerp(Math.log10(a), Math.log10(b), t) : b);

// The frame `t` (0..1, already eased) of the way from `from` to `to`. Matched
// points move (x in log space, y and memory linearly); the rest of each point
// comes from `to`. Unmatched points fade in at their final position; points
// gone from `to` are dropped.
export const lerpFrame = (from: Frame, to: Frame, t: number): Frame => {
  if (t >= 1) return to;
  const fromKeys = identityKeys(from.points);
  const byKey = new Map(from.points.map((p) => [fromKeys.get(p.id), p]));
  const toKeys = identityKeys(to.points);
  return {
    points: to.points.map((p) => {
      const a = byKey.get(toKeys.get(p.id));
      if (a === undefined) return { ...p, alpha: t };
      return {
        ...p,
        x: lerpLog(a.x, p.x, t),
        y: lerp(a.y, p.y, t),
        peak_memory_gb: lerp(a.peak_memory_gb, p.peak_memory_gb, t),
        alpha: lerp(a.alpha, 1, t),
      };
    }),
    x: { min: lerpLog(from.x.min, to.x.min, t), max: lerpLog(from.x.max, to.x.max, t) },
    y: { min: lerp(from.y.min, to.y.min, t), max: lerp(from.y.max, to.y.max, t) },
  };
};

const DURATION_MS = 400;

// Shows `target` (memoize it: a new object starts a tween). Each new target
// tweens over DURATION_MS from whatever is on screen, so an interruption picks
// up mid-flight. Reduced motion snaps.
export function useTweenedFrame(target: Frame): Frame {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useLayoutEffect(() => {
    const show = (f: Frame) => {
      shownRef.current = f;
      setShown(f);
    };
    const from = shownRef.current;
    if (from === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      show(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      show(lerpFrame(from, target, easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}
