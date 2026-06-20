import { useMemo, useState, useRef } from "react";
import styles from "./Scatter.module.css";
import type { ScatterPoint } from "../lib/pipeline";
import {
  setHoveredModel,
  clearHoveredModel,
  useHoveredModel,
} from "../lib/hover-store";
import { familyColor } from "../lib/colors";
import { formatEfficiency } from "../lib/constants";
import { ScatterLegend } from "./ScatterLegend";

interface Props {
  points: ScatterPoint[];
}

const W = 860;
const H = 460;
const M = { top: 20, right: 24, bottom: 50, left: 60 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

// y is a passRate in 0..1; render as 0..100%.
const yScale = (v: number): number => M.top + (1 - v) * IH;
const SIZE_FALLBACK_B = 3;
const rScale = (sizeB: number | null): number => 6 + Math.sqrt(Math.max(sizeB ?? SIZE_FALLBACK_B, 0)) * 2.4;

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

const xScaleFor = (domain: XDomain) => (v: number): number => {
  const clamped = Math.max(Math.min(v, domain.max), domain.min);
  return M.left + ((Math.log10(clamped) - Math.log10(domain.min)) / (Math.log10(domain.max) - Math.log10(domain.min))) * IW;
};

const formatTick = (v: number): string => {
  if (v >= 1_000_000) return `${v / 1_000_000}M`;
  if (v >= 1_000) return `${v / 1_000}k`;
  return String(v);
};

const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];

export function Scatter({ points }: Props) {
  const xDomain = useMemo(() => computeXDomain(points), [points]);
  const xScale = useMemo(() => xScaleFor(xDomain), [xDomain]);
  const hovered = useHoveredModel();
  const [tip, setTip] = useState<{ dot: ScatterPoint; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; color: string }> = [];
    for (const d of points) {
      if (!seen.has(d.family)) {
        seen.add(d.family);
        out.push({ name: d.family, color: familyColor(d.family) });
      }
    }
    return out;
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

        {points.map((d) => {
          const dim = hovered !== null && hovered !== d.artifact;
          return (
            <circle
              key={d.config_hash}
              className={styles.scatterDot}
              cx={xScale(d.x)}
              cy={yScale(d.y)}
              r={rScale(d.sizeB)}
              fill={familyColor(d.family)}
              fillOpacity={dim ? 0.3 : 0.85}
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

      {tip && (
        <div className={styles.scatterTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className={styles.scatterTipTitle}>{tip.dot.artifact}</div>
          <div className={styles.scatterTipMeta}>
            {tip.dot.quant ?? "—"} · {tip.dot.runtime} · t{tip.dot.temperature} · {tip.dot.generation_tps.toFixed(0)} tok/s
          </div>
          <div>
            Pass: <strong>{(tip.dot.y * 100).toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.x).toLocaleString()}</strong> · Mem: <strong>{tip.dot.peak_memory_gb.toFixed(1)} GB</strong> · Eff: <strong>{formatEfficiency(tip.dot.efficiency)}</strong>
          </div>
        </div>
      )}

      <ScatterLegend families={families} />
    </div>
  );
}
