import { useMemo, useState, useRef, useEffect } from "react";
import styles from "./Scatter.module.css";
import type { ScatterPoint } from "../lib/pipeline";
import {
  computeTpsDomain,
  opacityForTps,
  starPointsForWallTime,
} from "../lib/pipeline";
import {
  setHoveredModel,
  clearHoveredModel,
  useHoveredModel,
} from "../lib/hover-store";
import { familyColor } from "../lib/colors";
import { formatWallTime } from "../lib/format";

interface Props {
  points: ScatterPoint[];
}

const M = { top: 20, right: 24, bottom: 50, left: 60 };

// Minimum inner plotting area so scales never collapse to zero / negative.
const MIN_W = M.left + M.right + 80;
const MIN_H = M.top + M.bottom + 80;

// Radius encodes peak memory (area ≈ footprint), matching the original 1bc370e formula.
const rScale = (mem: number): number => 6 + Math.sqrt(Math.max(mem, 0)) * 2.4;

interface XDomain { min: number; max: number; ticks: number[]; }

const FALLBACK_DOMAIN: XDomain = { min: 100, max: 100000, ticks: [100, 1000, 10000, 100000] };

const computeXDomain = (points: ScatterPoint[]): XDomain => {
  const values = points.map((d) => d.x).filter((t) => t > 0);
  if (values.length === 0) return FALLBACK_DOMAIN;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const minExp = Math.floor(Math.log10(rawMin));
  const maxExp = Math.ceil(Math.log10(rawMax));
  const effectiveMaxExp = maxExp === minExp ? minExp + 1 : maxExp;
  const min = 10 ** minExp;
  const max = 10 ** effectiveMaxExp;
  const ticks: number[] = [];
  for (let e = minExp; e <= effectiveMaxExp; e += 1) {
    const p = 10 ** e;
    ticks.push(p);
    if (e < effectiveMaxExp) ticks.push(3 * p);
  }
  return { min, max, ticks };
};

const xScaleFor = (domain: XDomain, iw: number) => (v: number): number => {
  const clamped = Math.max(Math.min(v, domain.max), domain.min);
  return M.left + ((Math.log10(clamped) - Math.log10(domain.min)) / (Math.log10(domain.max) - Math.log10(domain.min))) * iw;
};

const formatTick = (v: number): string => {
  if (v >= 1_000_000) return `${v / 1_000_000}M`;
  if (v >= 1_000) return `${v / 1_000}k`;
  return String(v);
};

// y-axis ticks in 0..1 space
const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];

const starPath = (cx: number, cy: number, n: number, outerR: number, innerR: number): string => {
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

export function Scatter({ points }: Props) {
  const xDomain = useMemo(() => computeXDomain(points), [points]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);
  const hovered = useHoveredModel();
  const [tip, setTip] = useState<{ dot: ScatterPoint; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Measure the wrapper's live pixel size and drive the viewBox from it so the
  // plot fills its container instead of letterboxing at a fixed aspect ratio.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(width, MIN_W), h: Math.max(height, MIN_H) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size?.w ?? 0;
  const H = size?.h ?? 0;
  const IW = W - M.left - M.right;
  const IH = H - M.top - M.bottom;

  const yScale = useMemo(() => (v: number): number => M.top + (1 - v) * IH, [IH]);
  const xScale = useMemo(() => xScaleFor(xDomain, IW), [xDomain, IW]);

  // Per-model trajectory polylines — connect dots of the same artifact (base model)
  // sorted by x (tokens) ascending. executedAt is not on ScatterPoint; use x as proxy.
  const trajectories = useMemo(() => {
    const byModel = new Map<string, ScatterPoint[]>();
    for (const d of points) {
      const arr = byModel.get(d.artifact);
      if (arr) arr.push(d);
      else byModel.set(d.artifact, [d]);
    }
    return Array.from(byModel.entries()).map(([model, list]) => ({
      model,
      family: list[0]!.family,
      pts: list.slice().sort((a, b) => a.x - b.x),
    }));
  }, [points]);

  if (points.length === 0) {
    return (
      <div className={styles.scatterWrap} ref={wrapRef}>
        <div className={styles.scatterEmpty}>No data matches the current filters.</div>
      </div>
    );
  }

  return (
    <div className={styles.scatterWrap} ref={wrapRef}>
      {size && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={styles.scatterSvg}>
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line className={styles.scatterGrid} x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
              <text className={styles.scatterTick} x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{(v * 100).toFixed(0)}%</text>
            </g>
          ))}
          {xDomain.ticks.map((v) => (
            <g key={`x${v}`}>
              <line className={styles.scatterGrid} x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + IH} />
              <text className={styles.scatterTick} x={xScale(v)} y={M.top + IH + 18} textAnchor="middle">{formatTick(v)}</text>
            </g>
          ))}
          <line className={styles.scatterAxis} x1={M.left} x2={M.left} y1={M.top} y2={M.top + IH} />
          <line className={styles.scatterAxis} x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} />
          <text className={styles.scatterAxisTitle} x={M.left + IW / 2} y={H - 10} textAnchor="middle">
            Total gen tokens (log)
          </text>
          <text
            className={styles.scatterAxisTitle}
            x={16}
            y={M.top + IH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${M.top + IH / 2})`}
          >
            Pass rate
          </text>

          {/* Trajectory polylines — faint colored lines connecting same-model dots */}
          {trajectories.map((t) => {
            if (t.pts.length < 2) return null;
            const ptStr = t.pts.map((d) => `${xScale(d.x)},${yScale(d.y)}`).join(" ");
            const dim = hovered !== null && hovered !== t.model;
            return (
              <polyline
                key={t.model}
                className={styles.scatterTrajectory}
                points={ptStr}
                stroke={familyColor(t.family)}
                style={{ opacity: dim ? 0.2 : 0.55 }}
              />
            );
          })}

          {/* Star-shaped dots, fill-opacity encodes generation tps */}
          {points.map((d) => {
            const outerR = rScale(d.peak_memory_gb);
            const innerR = outerR * 0.75;
            const n = starPointsForWallTime(d.wall_time_sec);
            const dim = hovered !== null && hovered !== d.artifact;
            const active = hovered === d.artifact;
            const baseOpacity = opacityForTps(d.generation_tps, tpsDomain);
            const hoverMultiplier = dim ? 0.4 : active ? 1.05 : 1;
            const fillOpacity = Math.max(0, Math.min(1, baseOpacity * hoverMultiplier));
            return (
              <path
                key={d.config_hash}
                className={styles.scatterDot}
                d={starPath(xScale(d.x), yScale(d.y), n, outerR, innerR)}
                fill={familyColor(d.family)}
                fillOpacity={fillOpacity}
                onMouseEnter={(ev) => {
                  setHoveredModel(d.artifact);
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip({ dot: d, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                }}
                onMouseMove={(ev) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip((prev) => prev ? { ...prev, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
                }}
                onMouseLeave={() => {
                  clearHoveredModel();
                  setTip(null);
                }}
              />
            );
          })}
        </svg>
      )}

      {tip && (
        <div className={styles.scatterTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className={styles.scatterTipTitle}>{tip.dot.artifact}</div>
          <div className={styles.scatterTipMeta}>
            {tip.dot.quant ?? "—"} · {tip.dot.runtime} · t{tip.dot.temperature} · {tip.dot.generation_tps.toFixed(0)} tok/s · {formatWallTime(tip.dot.wall_time_sec)}
          </div>
          <div>
            Pass: <strong>{(tip.dot.y * 100).toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.x).toLocaleString()}</strong> · Mem: <strong>{tip.dot.peak_memory_gb.toFixed(1)} GB</strong>
          </div>
        </div>
      )}
    </div>
  );
}
