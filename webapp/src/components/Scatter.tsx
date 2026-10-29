import { useMemo, useState, useRef, useEffect } from "react";
import styles from "./Scatter.module.css";
import type { ScatterPoint } from "../lib/pipeline";
import { computeTpsDomain } from "../lib/pipeline";
import { familyColor } from "../lib/colors";
import { formatWallTime } from "../lib/format";
import { glyphDrawParams, starPath } from "./ScatterGlyph";
import { fitXDomain, fitYDomain, paretoFrontier, placeLabels, pointLabels, type AxisDomain } from "../lib/scatter-layout";

interface Props {
  points: ScatterPoint[];
  // Shared, ephemeral cross-component hover (config_hash). One point ⇄ one row.
  hoveredConfig: string | null;
  onHoverConfig: (configHash: string | null) => void;
  // Open the drilldown for a config — same handler a ranking-row click uses.
  onSelectConfig: (configHash: string) => void;
}

const M = { top: 20, right: 24, bottom: 50, left: 60 };

// Minimum inner plotting area so scales never collapse to zero / negative.
const MIN_W = M.left + M.right + 80;
const MIN_H = M.top + M.bottom + 80;

const xScaleFor = (domain: AxisDomain, iw: number) => (v: number): number => {
  const clamped = Math.max(Math.min(v, domain.max), domain.min);
  return M.left + ((Math.log10(clamped) - Math.log10(domain.min)) / (Math.log10(domain.max) - Math.log10(domain.min))) * iw;
};

const formatTick = (v: number): string => {
  if (v >= 1_000_000) return `${v / 1_000_000}M`;
  if (v >= 1_000) return `${v / 1_000}k`;
  return String(v);
};

export function Scatter({ points, hoveredConfig, onHoverConfig, onSelectConfig }: Props) {
  // Both axes fit the displayed points, so they re-fit whenever filters change.
  const xDomain = useMemo(() => fitXDomain(points.map((p) => p.x)), [points]);
  const yDomain = useMemo(() => fitYDomain(points.map((p) => p.y)), [points]);
  const frontier = useMemo(() => paretoFrontier(points), [points]);
  const onFrontier = useMemo(() => new Set(frontier.map((p) => p.config_hash)), [frontier]);
  const labelText = useMemo(() => pointLabels(points), [points]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);
  // The artifact (base model) of the currently-hovered config, if any — drives
  // the SECONDARY family-level dimming (keep the "dim the rest of the model"
  // effect) while the matching config is the PRIMARY emphasis.
  const hoveredArtifact = useMemo(
    () => points.find((p) => p.config_hash === hoveredConfig)?.artifact ?? null,
    [points, hoveredConfig],
  );
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

  const yScale = useMemo(
    () => (v: number): number => M.top + (1 - (v - yDomain.min) / (yDomain.max - yDomain.min)) * IH,
    [yDomain, IH],
  );
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

  const labels = useMemo(
    () =>
      placeLabels(
        points.map((d) => ({
          key: d.config_hash,
          text: labelText.get(d.config_hash) ?? d.artifact,
          cx: xScale(d.x),
          cy: yScale(d.y),
          r: glyphDrawParams(d, tpsDomain).outerR,
          required: onFrontier.has(d.config_hash),
        })),
        { x0: M.left, y0: M.top, x1: M.left + IW, y1: M.top + IH },
      ),
    [points, labelText, xScale, yScale, tpsDomain, onFrontier, IW, IH],
  );

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
          {yDomain.ticks.map((v) => (
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
            const dim = hoveredArtifact !== null && hoveredArtifact !== t.model;
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

          {/* Pareto frontier — configs no other config beats on both pass rate and tokens */}
          {frontier.length > 1 && (
            <polyline
              className={styles.scatterFrontier}
              points={frontier.map((d) => `${xScale(d.x)},${yScale(d.y)}`).join(" ")}
            />
          )}

          {/* Star-shaped dots, fill-opacity encodes generation tps. Frontier
              stars draw last (on top); off-frontier stars are desaturated
              rather than faded so the TPS→opacity channel stays intact. */}
          {[...points].sort((a, b) => Number(onFrontier.has(a.config_hash)) - Number(onFrontier.has(b.config_hash))).map((d) => {
            const { outerR, innerR, points: n, fill, fillOpacity: baseOpacity } =
              glyphDrawParams(d, tpsDomain);
            // PRIMARY: the single config that matches the hovered row/point.
            const active = hoveredConfig === d.config_hash;
            // SECONDARY: dim everything that isn't the hovered config's model
            // family — preserves the prior "dim the others" look around the
            // emphasized point.
            const dim = hoveredConfig !== null && !active && d.artifact !== hoveredArtifact;
            const hoverMultiplier = active ? 1.05 : dim ? 0.4 : 1;
            const fillOpacity = Math.max(0, Math.min(1, baseOpacity * hoverMultiplier));
            return (
              <path
                key={d.config_hash}
                className={`${styles.scatterDot}${active ? ` ${styles.scatterDotActive}` : ""}${onFrontier.has(d.config_hash) ? "" : ` ${styles.scatterDotOffFrontier}`}`}
                d={starPath(xScale(d.x), yScale(d.y), n, outerR, innerR)}
                fill={fill}
                fillOpacity={fillOpacity}
                onClick={() => onSelectConfig(d.config_hash)}
                onMouseEnter={(ev) => {
                  onHoverConfig(d.config_hash);
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip({ dot: d, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                }}
                onMouseMove={(ev) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip((prev) => prev ? { ...prev, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
                }}
                onMouseLeave={() => {
                  onHoverConfig(null);
                  setTip(null);
                }}
              />
            );
          })}

          {labels.map((l) => (
            <text
              key={`l${l.key}`}
              className={`${styles.scatterLabel}${onFrontier.has(l.key) ? ` ${styles.scatterLabelFrontier}` : ""}`}
              x={l.x}
              y={l.y + 4}
              textAnchor={l.anchor}
            >
              {l.text}
            </text>
          ))}
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
