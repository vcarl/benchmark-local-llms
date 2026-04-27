import { useMemo, useState, useRef } from "react";
import styles from "./Scatter.module.css";
import type { BenchmarkResult } from "../lib/data";
import {
  aggregateForScatter,
  computeTpsDomain,
  opacityForTps,
  starPointsForWallTime,
  type ScatterDot,
} from "../lib/pipeline";
import { ScatterLegend } from "./ScatterLegend";
import {
  setHoveredModel,
  clearHoveredModel,
  useHoveredModel,
} from "../lib/hover-store";
import { familyColor } from "../lib/colors";

interface Props {
  data: BenchmarkResult[];
}

const W = 860;
const H = 460;
const M = { top: 20, right: 24, bottom: 50, left: 60 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

const yScale = (v: number): number => M.top + (1 - v / 100) * IH;
const rScale = (mem: number): number => 6 + Math.sqrt(Math.max(mem, 0)) * 2.4;

interface XDomain {
  min: number;
  max: number;
  ticks: number[];
}

const FALLBACK_DOMAIN: XDomain = { min: 100, max: 100000, ticks: [100, 1000, 10000, 100000] };

const computeXDomain = (dots: ScatterDot[]): XDomain => {
  const values = dots.map((d) => d.tokens).filter((t) => t > 0);
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

const yTicks = [0, 20, 40, 60, 80, 100];

const formatWallTime = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s - m * 60);
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export function Scatter({ data }: Props) {
  const dots = useMemo(() => aggregateForScatter(data), [data]);
  const xDomain = useMemo(() => computeXDomain(dots), [dots]);
  const xScale = useMemo(() => xScaleFor(xDomain), [xDomain]);
  const tpsDomain = useMemo(() => computeTpsDomain(dots), [dots]);
  const hovered = useHoveredModel();
  const [tip, setTip] = useState<{ dot: ScatterDot; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; color: string }> = [];
    for (const d of dots) {
      if (!seen.has(d.family)) {
        seen.add(d.family);
        out.push({ name: d.family, color: familyColor(d.family) });
      }
    }
    return out;
  }, [dots]);

  const trajectories = useMemo(() => {
    const byModel = new Map<string, ScatterDot[]>();
    for (const d of dots) {
      const arr = byModel.get(d.baseModel);
      if (arr) arr.push(d);
      else byModel.set(d.baseModel, [d]);
    }
    return Array.from(byModel.entries()).map(([model, list]) => ({
      model,
      family: list[0].family,
      dots: list.slice().sort((a, b) => {
        if (a.executedAt && b.executedAt) return a.executedAt.localeCompare(b.executedAt);
        return 0;
      }),
    }));
  }, [dots]);

  if (dots.length === 0) {
    return (
      <div className={styles.scatterWrap} ref={wrapRef}>
        <div className={styles.scatterEmpty}>No data matches the current filters.</div>
      </div>
    );
  }

  return (
    <div className={styles.scatterWrap} ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className={styles.scatterSvg}
      >
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className={styles.scatterGrid} x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
            <text className={styles.scatterTick} x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}
        {xDomain.ticks.map((v) => (
          <g key={`x${v}`}>
            <line className={styles.scatterGrid} x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + IH} />
            <text className={styles.scatterTick} x={xScale(v)} y={M.top + IH + 18} textAnchor="middle">
              {formatTick(v)}
            </text>
          </g>
        ))}
        <line className={styles.scatterAxis} x1={M.left} x2={M.left} y1={M.top} y2={M.top + IH} />
        <line className={styles.scatterAxis} x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} />
        <text className={styles.scatterAxisTitle} x={M.left + IW / 2} y={H - 10} textAnchor="middle">
          Avg tokens per run (log)
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

        {trajectories.map((t) => {
          if (t.dots.length < 2) return null;
          const points = t.dots.map((d) => `${xScale(d.tokens)},${yScale(d.score)}`).join(" ");
          const dim = hovered !== null && hovered !== t.model;
          return (
            <polyline
              key={t.model}
              className={styles.scatterTrajectory}
              points={points}
              stroke={familyColor(t.family)}
              style={{ opacity: dim ? 0.2 : 0.55 }}
            />
          );
        })}

        {dots.map((d) => {
          const outerR = rScale(d.mem);
          const innerR = outerR * 0.75;
          const n = starPointsForWallTime(d.wallTime);
          const dim = hovered !== null && hovered !== d.baseModel;
          const active = hovered === d.baseModel;
          const baseOpacity = opacityForTps(d.gen_tps, tpsDomain);
          const hoverMultiplier = dim ? 0.4 : active ? 1.05 : 1;
          const fillOpacity = Math.max(0, Math.min(1, baseOpacity * hoverMultiplier));
          return (
            <path
              key={`${d.baseModel}|${d.runtime}|${d.quant}|${d.temperature}`}
              className={styles.scatterDot}
              d={starPath(xScale(d.tokens), yScale(d.score), n, outerR, innerR)}
              fill={familyColor(d.family)}
              fillOpacity={fillOpacity}
              onMouseEnter={(ev) => {
                setHoveredModel(d.baseModel);
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
          <div className={styles.scatterTipTitle}>{tip.dot.baseModel}</div>
          <div className={styles.scatterTipMeta}>
            {tip.dot.quant} · {tip.dot.runtime} · t{tip.dot.temperature} · {tip.dot.gen_tps.toFixed(0)} tok/s · {formatWallTime(tip.dot.wallTime)}
            {tip.dot.executedAt ? ` · ${tip.dot.executedAt.slice(0, 10)}` : ""}
          </div>
          <div>
            Pass: <strong>{tip.dot.score.toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.tokens)}</strong> · Mem: <strong>{tip.dot.mem.toFixed(1)} GB</strong>
          </div>
        </div>
      )}

      <ScatterLegend families={families} tpsDomain={tpsDomain} />
    </div>
  );
}
