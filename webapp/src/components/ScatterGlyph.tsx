import { familyColor } from "../lib/colors";
import { opacityForTps, starPointsForWallTime, type TpsDomain } from "../lib/pipeline";

// ─── The descriptor glyph — single source of truth ───────────────────────────
//
// Every model/config is drawn as a star whose FOUR channels encode:
//   • shape   — star with N points; N derived from wall time (~4–15 points)
//   • size    — outer radius from peak memory (GB) via `radiusForMemory`
//   • color   — model family via `familyColor`
//   • opacity — generation tokens/sec (TPS) via `opacityForTps` over a domain
//
// The scatterplot, its legend, and the ranking-table rows all render the
// identical glyph by going through this module, so a model's descriptor looks
// the same everywhere.

// Radius (px) encodes peak memory (area ≈ footprint). Matches the original
// 1bc370e formula; do not invent a second size scale.
export const radiusForMemory = (mem: number): number => 6 + Math.sqrt(Math.max(mem, 0)) * 2.4;

// Inner-radius ratio for the star's concave vertices.
export const STAR_INNER_RATIO = 0.75;

// Pure SVG path string for an n-point star centered at (cx, cy).
export const starPath = (
  cx: number,
  cy: number,
  n: number,
  outerR: number,
  innerR: number,
): string => {
  let d = "";
  for (let i = 0; i < 2 * n; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / n) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  return `${d}Z`;
};

export interface GlyphEncoding {
  family: string | null;
  peak_memory_gb: number;
  wall_time_sec: number;
  generation_tps: number;
}

// Resolve the four encoding channels of a descriptor into concrete draw params
// (outer/inner radius, point count, fill color, fill opacity). Shared so the
// scatter `<path>` and the standalone `<ScatterGlyph>` can't drift.
export const glyphDrawParams = (enc: GlyphEncoding, tpsDomain: TpsDomain) => {
  const outerR = radiusForMemory(enc.peak_memory_gb);
  return {
    outerR,
    innerR: outerR * STAR_INNER_RATIO,
    points: starPointsForWallTime(enc.wall_time_sec),
    fill: familyColor(enc.family),
    fillOpacity: opacityForTps(enc.generation_tps, tpsDomain),
  };
};

interface Props {
  enc: GlyphEncoding;
  tpsDomain: TpsDomain;
  /** Multiplies the resolved fill-opacity (e.g. hover dim/boost). Default 1. */
  opacityMultiplier?: number;
  /**
   * Optional cap on the rendered glyph's outer box (px). When the natural box
   * (true scatter size) exceeds this, the SVG is rendered at `maxPx` while the
   * viewBox stays at the natural size, so the WHOLE glyph scales down uniformly
   * — same star, point count, color, and opacity, just smaller. Glyphs whose
   * natural box already fits keep their true size. Absent → no cap (default,
   * identical to the scatterplot).
   */
  maxPx?: number;
  className?: string;
  title?: string;
}

// Self-contained SVG that draws a single descriptor glyph at its TRUE scatter
// size (the SVG box is sized to the memory-derived radius, so the glyph varies
// per model exactly like the scatterplot). Decorative — kept aria-hidden.
export function ScatterGlyph({ enc, tpsDomain, opacityMultiplier = 1, maxPx, className, title }: Props) {
  const { outerR, innerR, points, fill, fillOpacity } = glyphDrawParams(enc, tpsDomain);
  // Pad by the stroke width so the 1.2px outline isn't clipped at the edges.
  const pad = 1.5;
  const box = outerR * 2 + pad * 2;
  const c = box / 2;
  const opacity = Math.max(0, Math.min(1, fillOpacity * opacityMultiplier));
  // Render size: cap to `maxPx` only when the natural box is bigger. The viewBox
  // remains the natural `box`, so a smaller width/height scales the entire glyph
  // uniformly (no distortion, no change to what's drawn). Smaller glyphs are
  // untouched. Absent maxPx ⇒ render at natural size (scatterplot-identical).
  const renderSize = maxPx !== undefined ? Math.min(box, maxPx) : box;
  return (
    <svg
      width={renderSize}
      height={renderSize}
      viewBox={`0 0 ${box} ${box}`}
      className={className}
      aria-hidden="true"
    >
      {title !== undefined && <title>{title}</title>}
      <path d={starPath(c, c, points, outerR, innerR)} fill={fill} fillOpacity={opacity} />
    </svg>
  );
}
