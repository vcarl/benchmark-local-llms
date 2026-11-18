import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import styles from "./Scatter.module.css";
import type { ScatterPoint } from "../lib/encoding";
import { computeTpsDomain } from "../lib/encoding";
import { familyColor } from "../lib/colors";
import { formatWallTime } from "../lib/format";
import { glyphDrawParams, starPath } from "./ScatterGlyph";
import { Z95 } from "../lib/stats";
import { fitXDomain, fitYDomain, paretoFrontier, placeLabels, pointLabels, type AxisDomain } from "../lib/scatter-layout";
import { type Action, type GestureEvent, type GestureState, IDLE, type Rect, step } from "../lib/gesture";
import { type Frame, useTweenedFrame } from "../lib/tween";
import { clampViewport, formatViewport, linTicks, logTicks, panViewport, subViewport, type Viewport, zoomViewport } from "../lib/viewport";

interface Props {
  points: ScatterPoint[];
  // Shared, ephemeral cross-component hover (rowId). One point ⇄ one list row.
  hovered: string | null;
  onHover: (rowId: string | null) => void;
  /** The highlighted row (URL `sel`): ringed and always labelled. */
  selected: string | undefined;
  /** A tap on a point (its rowId) or on the background (undefined). */
  onTap: (rowId: string | undefined) => void;
  /** Zoomed view from the URL; undefined = full extent. */
  viewport: Viewport | undefined;
  /** Debounced: called once the view settles, never per frame. */
  onViewport: (vp: Viewport | undefined) => void;
}

/** Quiet period after the last gesture step before the view goes to the URL. */
const COMMIT_MS = 250;

const HINT = "Pinch or ⌘/Ctrl-scroll to zoom · scroll or drag to pan · ⇧-drag to box-zoom · double-click to zoom in";

const M = { top: 20, right: 24, bottom: 50, left: 60 };

// Minimum inner plotting area so scales never collapse to zero / negative.
const MIN_W = M.left + M.right + 80;
const MIN_H = M.top + M.bottom + 80;

// Unclamped: a point outside a zoomed view lands outside the plot and is clipped.
const xScaleFor = (domain: AxisDomain, iw: number) => (v: number): number =>
  M.left + ((Math.log10(v > 0 ? v : domain.min) - Math.log10(domain.min)) / (Math.log10(domain.max) - Math.log10(domain.min))) * iw;

const formatTick = (v: number): string => {
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toPrecision(3))}M`;
  if (v >= 1_000) return `${Number((v / 1_000).toPrecision(3))}k`;
  return String(Number(v.toPrecision(3)));
};

const pctTick = (v: number, step: number) => `${(v * 100).toFixed(step < 0.01 ? 1 : 0)}%`;

export function Scatter({ points, hovered, onHover, selected, onTap, viewport, onViewport }: Props) {
  // The full extent fits the displayed points, so it re-fits whenever filters
  // change; a zoomed view is clamped into it.
  const fitX = useMemo(() => fitXDomain(points.map((p) => p.x)), [points]);
  const fitY = useMemo(() => fitYDomain(points.map((p) => p.y)), [points]);
  // A change of points slides the plot from what is on screen; everything below
  // positions from `shown`. Zoom, pan and hover don't touch `points`, so stay instant.
  const target = useMemo<Frame>(
    () => ({ points: points.map((p) => ({ ...p, alpha: 1 })), x: fitX, y: fitY }),
    [points, fitX, fitY],
  );
  const shown = useTweenedFrame(target);
  const shownX = useMemo<AxisDomain>(
    () => (shown === target ? fitX : { ...shown.x, ticks: logTicks(shown.x.min, shown.x.max) }),
    [shown, target, fitX],
  );
  const shownY = useMemo<AxisDomain>(
    () => (shown === target ? fitY : { ...shown.y, ticks: linTicks(shown.y.min, shown.y.max) }),
    [shown, target, fitY],
  );
  const full = useMemo<Viewport>(() => ({ x0: shownX.min, x1: shownX.max, y0: shownY.min, y1: shownY.max }), [shownX, shownY]);

  // The live view follows gestures frame by frame; the URL gets it debounced.
  const [live, setLive] = useState<Viewport | undefined>(viewport);
  const liveRef = useRef(live);
  // URL → live view, keyed on the URL form: a new object for the same view is no change.
  const vpKey = viewport === undefined ? "" : formatViewport(viewport);
  // biome-ignore lint/correctness/useExhaustiveDependencies: vpKey stands for viewport
  useEffect(() => {
    liveRef.current = viewport;
    setLive(viewport);
  }, [vpKey]);
  const vp = useMemo(() => (live === undefined ? undefined : clampViewport(live, full)), [live, full]);
  const xDomain = useMemo<AxisDomain>(
    () => (vp === undefined ? shownX : { min: vp.x0, max: vp.x1, ticks: logTicks(vp.x0, vp.x1) }),
    [vp, shownX],
  );
  const yDomain = useMemo<AxisDomain>(
    () => (vp === undefined ? shownY : { min: vp.y0, max: vp.y1, ticks: linTicks(vp.y0, vp.y1) }),
    [vp, shownY],
  );
  const yStep = (yDomain.ticks[1] ?? 1) - (yDomain.ticks[0] ?? 0);
  const onFrontier = useMemo(() => new Set(paretoFrontier(points).map((p) => p.id)), [points]);
  const frontier = useMemo(
    () => shown.points.filter((p) => onFrontier.has(p.id)).sort((a, b) => a.x - b.x),
    [shown, onFrontier],
  );
  const labelText = useMemo(() => pointLabels(points), [points]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);
  // The model of the hovered row, if any — drives the SECONDARY model-level
  // dimming while the matching row is the PRIMARY emphasis.
  const hoveredModel = useMemo(
    () => points.find((p) => p.id === hovered)?.model ?? null,
    [points, hovered],
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

  // ── Gestures: pointer events → pure recognizer → viewport ops ──
  const gesture = useRef<GestureState>(IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commit = useCallback(() => {
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onViewport(liveRef.current), COMMIT_MS);
  }, [onViewport]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(commitTimer.current);
  }, []);
  const geom = useRef({ IW, IH, full, empty: points.length === 0 });
  geom.current = { IW, IH, full, empty: points.length === 0 };
  const [box, setBox] = useState<Rect | null>(null);

  const resetZoom = useCallback(() => {
    liveRef.current = undefined;
    setLive(undefined);
    clearTimeout(commitTimer.current);
    onViewport(undefined);
  }, [onViewport]);

  const apply = useCallback(
    (actions: Action[]) => {
      const { IW: iw, IH: ih, full: f } = geom.current;
      for (const a of actions) {
        if (a.kind === "tap") {
          onTap(a.target);
          continue;
        }
        if (a.kind === "end") {
          commit();
          continue;
        }
        if (a.kind === "box") {
          setBox(a.rect);
          continue;
        }
        if (a.kind === "reset") {
          resetZoom();
          continue;
        }
        const cur = liveRef.current === undefined ? f : (clampViewport(liveRef.current, f) ?? f);
        const u = (x: number) => Math.min(1, Math.max(0, (x - M.left) / iw));
        const v = (y: number) => Math.min(1, Math.max(0, 1 - (y - M.top) / ih));
        const next =
          a.kind === "pan"
            ? panViewport(cur, -a.dx / iw, a.dy / ih)
            : a.kind === "zoomto"
              ? subViewport(cur, u(a.rect.x0), u(a.rect.x1), v(a.rect.y1), v(a.rect.y0))
              : zoomViewport(cur, a.factor, u(a.x), v(a.y));
        liveRef.current = clampViewport(next, f);
        commit();
      }
      setLive(liveRef.current);
    },
    [onTap, commit, resetZoom],
  );

  const feed = useCallback(
    (e: GestureEvent): Action[] => {
      const [next, actions] = step(gesture.current, e);
      gesture.current = next;
      clearTimeout(timer.current);
      if (next.deadline !== null) {
        const at = next.deadline;
        timer.current = setTimeout(() => feed({ type: "timeout", t: at }), Math.max(0, at - performance.now()));
      }
      if (actions.length > 0) apply(actions);
      return actions;
    },
    [apply],
  );

  const pointer = (type: "down" | "move" | "up" | "cancel") => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0 && type === "down") return;
    if ((e.target as Element).closest("button") !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (type === "down") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setTip(null);
    }
    const target = (e.target as Element).closest("[data-id]")?.getAttribute("data-id") ?? undefined;
    feed({
      type,
      id: e.pointerId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
      touch: e.pointerType !== "mouse",
      shift: e.shiftKey,
      ...(target === undefined ? {} : { target }),
    });
  };

  // Wheel over the plot: ctrl/meta (and trackpad pinch) zooms, plain scroll pans.
  // React's onWheel is passive, so it could not stop the page from scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (geom.current.empty) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      feed({
        type: "wheel",
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        dx: e.deltaX,
        dy: e.deltaY,
        mode: e.deltaMode,
        zoom: e.ctrlKey || e.metaKey,
        t: performance.now(),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [feed]);

  const key = (k: string) => feed({ type: "key", key: k, x: M.left + IW / 2, y: M.top + IH / 2, t: performance.now() });
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (key(e.key).length > 0) e.preventDefault();
  };

  const yScale = useMemo(
    () => (v: number): number => M.top + (1 - (v - yDomain.min) / (yDomain.max - yDomain.min)) * IH,
    [yDomain, IH],
  );
  const xScale = useMemo(() => xScaleFor(xDomain, IW), [xDomain, IW]);

  // Per-model trajectory polylines — connect dots of the same model (modelKey)
  // sorted by x (tokens) ascending.
  const trajectories = useMemo(() => {
    const byModel = new Map<string, ScatterPoint[]>();
    for (const d of shown.points) {
      const arr = byModel.get(d.model);
      if (arr) arr.push(d);
      else byModel.set(d.model, [d]);
    }
    return Array.from(byModel.entries()).map(([model, list]) => ({
      model,
      family: list[0]!.family,
      pts: list.slice().sort((a, b) => a.x - b.x),
    }));
  }, [shown]);

  const inView = useMemo(
    () =>
      shown.points.filter((d) => {
        const x = xScale(d.x);
        const y = yScale(d.y);
        return x >= M.left && x <= M.left + IW && y >= M.top && y <= M.top + IH;
      }),
    [shown, xScale, yScale, IW, IH],
  );

  const labels = useMemo(
    () =>
      placeLabels(
        inView.map((d) => ({
          key: d.id,
          text: labelText.get(d.id) ?? d.artifact,
          cx: xScale(d.x),
          cy: yScale(d.y),
          r: glyphDrawParams(d, tpsDomain).outerR,
          required: onFrontier.has(d.id) || d.id === selected,
        })),
        { x0: M.left, y0: M.top, x1: M.left + IW, y1: M.top + IH },
      ),
    [inView, labelText, xScale, yScale, tpsDomain, onFrontier, selected, IW, IH],
  );
  const alpha = useMemo(() => new Map(shown.points.map((p) => [p.id, p.alpha])), [shown]);

  if (points.length === 0) {
    return (
      <div className={styles.scatterWrap} ref={wrapRef}>
        <div className={styles.scatterEmpty}>No data matches the current filters.</div>
      </div>
    );
  }

  const sel = selected === undefined ? undefined : shown.points.find((p) => p.id === selected);

  return (
    <div
      className={styles.scatterWrap}
      ref={wrapRef}
      data-zoomed={vp !== undefined}
      tabIndex={0}
      role="application"
      aria-label={`Pass rate vs tokens scatter. ${HINT}. Keys: + and − zoom, 0 resets, arrows pan.`}
      onKeyDown={onKeyDown}
      onPointerDown={pointer("down")}
      onPointerMove={pointer("move")}
      onPointerUp={pointer("up")}
      onPointerCancel={pointer("cancel")}
    >
      {size && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={styles.scatterSvg}>
          <defs>
            <clipPath id="scatter-plot-clip">
              <rect x={M.left} y={M.top} width={IW} height={IH} />
            </clipPath>
          </defs>
          {yDomain.ticks.map((v) => (
            <g key={`y${v}`}>
              <line className={styles.scatterGrid} x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
              <text className={styles.scatterTick} x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{pctTick(v, yStep)}</text>
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

          <g clipPath="url(#scatter-plot-clip)">
          {/* Trajectory polylines — faint colored lines connecting same-model dots */}
          {trajectories.map((t) => {
            if (t.pts.length < 2) return null;
            const ptStr = t.pts.map((d) => `${xScale(d.x)},${yScale(d.y)}`).join(" ");
            const dim = hoveredModel !== null && hoveredModel !== t.model;
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

          {/* ±1.96·SE pass-rate whisker for the hovered config only (from the
              plot or a ranking row): always-on whiskers span most of a zoomed
              y-axis and bury the plot. Clamped to the plotted range. */}
          {(() => {
            const d = shown.points.find((p) => p.id === hovered);
            if (d === undefined || d.ySE === null || d.ySE === 0) return null;
            const clampY = (v: number) => Math.max(yDomain.min, Math.min(yDomain.max, v));
            const x = xScale(d.x);
            const y1 = yScale(clampY(d.y - Z95 * d.ySE));
            const y2 = yScale(clampY(d.y + Z95 * d.ySE));
            return (
              <path
                className={styles.scatterWhisker}
                d={`M${x},${y1}V${y2}M${x - 4},${y1}H${x + 4}M${x - 4},${y2}H${x + 4}`}
                stroke={familyColor(d.family)}
              />
            );
          })()}

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
          {[...shown.points]
            .sort((a, b) => Number(onFrontier.has(a.id)) - Number(onFrontier.has(b.id)) || Number(a.id === selected) - Number(b.id === selected))
            .map((d) => {
            const { outerR, innerR, points: n, fill, fillOpacity: baseOpacity } =
              glyphDrawParams(d, tpsDomain);
            // PRIMARY: the single config that matches the hovered row/point.
            const active = hovered === d.id;
            // SECONDARY: dim everything that isn't the hovered config's model
            // family — preserves the prior "dim the others" look around the
            // emphasized point.
            const dim = hovered !== null && !active && d.model !== hoveredModel;
            const hoverMultiplier = active ? 1.05 : dim ? 0.4 : 1;
            const fillOpacity = Math.max(0, Math.min(1, baseOpacity * hoverMultiplier));
            return (
              <path
                key={d.id}
                data-id={d.id}
                className={`${styles.scatterDot}${active ? ` ${styles.scatterDotActive}` : ""}${onFrontier.has(d.id) ? "" : ` ${styles.scatterDotOffFrontier}`}`}
                d={starPath(xScale(d.x), yScale(d.y), n, outerR, innerR)}
                fill={fill}
                fillOpacity={fillOpacity}
                opacity={d.alpha < 1 ? d.alpha : undefined}
                onMouseEnter={(ev) => {
                  onHover(d.id);
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip({ dot: d, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                }}
                onMouseMove={(ev) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip((prev) => prev ? { ...prev, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
                }}
                onMouseLeave={() => {
                  onHover(null);
                  setTip(null);
                }}
              />
            );
          })}

          {sel !== undefined && (
            <circle
              className={styles.scatterSelected}
              cx={xScale(sel.x)}
              cy={yScale(sel.y)}
              r={glyphDrawParams(sel, tpsDomain).outerR + 5}
            />
          )}
          </g>

          {labels.map((l) => (
            <text
              key={`l${l.key}`}
              className={`${styles.scatterLabel}${onFrontier.has(l.key) || l.key === selected ? ` ${styles.scatterLabelFrontier}` : ""}`}
              x={l.x}
              y={l.y + 4}
              textAnchor={l.anchor}
              opacity={(alpha.get(l.key) ?? 1) < 1 ? alpha.get(l.key) : undefined}
            >
              {l.text}
            </text>
          ))}
        </svg>
      )}

      {box && (
        <div
          className={styles.scatterBox}
          style={{ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }}
        />
      )}

      <div className={styles.scatterControls}>
        <button type="button" onClick={() => key("+")} title={`Zoom in (+) · ${HINT}`} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => key("-")} disabled={vp === undefined} title={`Zoom out (−) · ${HINT}`} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={resetZoom} disabled={vp === undefined} title={`Reset zoom (0) · ${HINT}`} aria-label="Reset zoom">
          ⟲
        </button>
      </div>

      {tip && (
        <div className={styles.scatterTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className={styles.scatterTipTitle}>{tip.dot.artifact}</div>
          <div className={styles.scatterTipMeta}>
            {tip.dot.quant ?? "—"} · {tip.dot.runtime} · t{tip.dot.temperature} · {tip.dot.generation_tps.toFixed(0)} tok/s · {formatWallTime(tip.dot.wall_time_sec)}
          </div>
          <div>
            Pass: <strong>{(tip.dot.y * 100).toFixed(0)}%</strong>
            {tip.dot.ySE !== null && <> ± {(Z95 * tip.dot.ySE * 100).toFixed(0)}</>} · Tokens: <strong>{Math.round(tip.dot.x).toLocaleString()}</strong> · Mem: <strong>{tip.dot.peak_memory_gb.toFixed(1)} GB</strong>
          </div>
        </div>
      )}
    </div>
  );
}
