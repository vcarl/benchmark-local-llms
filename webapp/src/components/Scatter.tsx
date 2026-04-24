import { useMemo, useState, useRef } from "react";
import type { BenchmarkResult } from "../lib/data";
import {
  aggregateForScatter,
  starPointsForTokens,
  type ScatterDot,
} from "../lib/pipeline";
import { ScatterLegend } from "./ScatterLegend";
import {
  setHoveredModel,
  clearHoveredModel,
  useHoveredModel,
} from "../lib/hover-store";

interface Props {
  data: BenchmarkResult[];
}

const FAMILY_COLORS: Record<string, string> = {
  Llama: "#e06666",
  Qwen: "#6fa8dc",
  Mistral: "#93c47d",
  Gemma: "#b996de",
  DeepSeek: "#f6b26b",
  Phi: "#76d7c4",
  GPT: "#ffd966",
  GLM: "#c27ba0",
  Other: "#9aa0a6",
};

const colorFor = (family: string): string => FAMILY_COLORS[family] ?? FAMILY_COLORS.Other;

const W = 860;
const H = 460;
const M = { top: 20, right: 24, bottom: 50, left: 60 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

const X_MIN = 500;
const X_MAX = 32000;

const xScale = (v: number): number => {
  const clamped = Math.max(v, X_MIN);
  return M.left + ((Math.log10(clamped) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN))) * IW;
};
const yScale = (v: number): number => M.top + (1 - v / 100) * IH;
const rScale = (mem: number): number => 6 + Math.sqrt(Math.max(mem, 0)) * 2.4;

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

const xTicks = [500, 1000, 2000, 5000, 10000, 20000];
const yTicks = [0, 20, 40, 60, 80, 100];

export function Scatter({ data }: Props) {
  const dots = useMemo(() => aggregateForScatter(data), [data]);
  const hovered = useHoveredModel();
  const [tip, setTip] = useState<{ dot: ScatterDot; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; color: string }> = [];
    for (const d of dots) {
      if (!seen.has(d.family)) {
        seen.add(d.family);
        out.push({ name: d.family, color: colorFor(d.family) });
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
      <div className="scatter-wrap" ref={wrapRef}>
        <div className="scatter-empty">No data matches the current filters.</div>
      </div>
    );
  }

  return (
    <div className="scatter-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="scatter-svg"
      >
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="scatter-grid" x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
            <text className="scatter-tick" x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line className="scatter-grid" x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + IH} />
            <text className="scatter-tick" x={xScale(v)} y={M.top + IH + 18} textAnchor="middle">
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          </g>
        ))}
        <line className="scatter-axis" x1={M.left} x2={M.left} y1={M.top} y2={M.top + IH} />
        <line className="scatter-axis" x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} />
        <text className="scatter-axis-title" x={M.left + IW / 2} y={H - 10} textAnchor="middle">
          Avg tokens per run (log)
        </text>
        <text
          className="scatter-axis-title"
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
              className="scatter-trajectory"
              points={points}
              stroke={colorFor(t.family)}
              style={{ opacity: dim ? 0.2 : 0.55 }}
            />
          );
        })}

        {dots.map((d) => {
          const outerR = rScale(d.mem);
          const innerR = outerR * 0.75;
          const n = starPointsForTokens(d.tokens);
          const dim = hovered !== null && hovered !== d.baseModel;
          const active = hovered === d.baseModel;
          return (
            <path
              key={`${d.baseModel}|${d.runtime}|${d.quant}|${d.temperature}`}
              className="scatter-dot"
              d={starPath(xScale(d.tokens), yScale(d.score), n, outerR, innerR)}
              fill={colorFor(d.family)}
              fillOpacity={dim ? 0.35 : active ? 0.95 : 0.85}
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
        <div className="scatter-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className="scatter-tip-title">{tip.dot.baseModel}</div>
          <div className="scatter-tip-meta">
            {tip.dot.quant} · {tip.dot.runtime} · t{tip.dot.temperature}
            {tip.dot.executedAt ? ` · ${tip.dot.executedAt.slice(0, 10)}` : ""}
          </div>
          <div>
            Pass: <strong>{tip.dot.score.toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.tokens)}</strong> · Mem: <strong>{tip.dot.mem.toFixed(1)} GB</strong>
          </div>
        </div>
      )}

      <ScatterLegend families={families} />
    </div>
  );
}
