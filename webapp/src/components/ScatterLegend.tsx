import styles from "./ScatterLegend.module.css";
import {
  opacityForTps,
  starPointsForWallTime,
  type TpsDomain,
} from "../lib/pipeline";

interface Props {
  families: Array<{ name: string; color: string }>;
  tpsDomain: TpsDomain;
}

const WALL_TIME_REFS: Array<{ seconds: number; label: string }> = [
  { seconds: 1, label: "1s" },
  { seconds: 10, label: "10s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 1800, label: "30m" },
];

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

const formatTps = (v: number): string => {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  return v.toFixed(1);
};

export function ScatterLegend({ families, tpsDomain }: Props) {
  const tpsSamples: Array<{ tps: number; label: string }> = (() => {
    const { min, max } = tpsDomain;
    if (!(max > min)) return [{ tps: min, label: formatTps(min) }];
    const mid = Math.exp((Math.log(min) + Math.log(max)) / 2);
    return [
      { tps: min, label: formatTps(min) },
      { tps: mid, label: formatTps(mid) },
      { tps: max, label: formatTps(max) },
    ];
  })();

  return (
    <div className={styles.scatterLegend}>
      <div className={styles.scatterLegendRow}>
        <span className={styles.scatterLegendGroup}>family:</span>
        {families.map((f) => (
          <span key={f.name} className={styles.scatterLegendFamily}>
            <span className={styles.scatterLegendSwatch} style={{ background: f.color }} />
            {f.name}
          </span>
        ))}
      </div>
      <div className={styles.scatterLegendRow}>
        <span className={styles.scatterLegendGroup}>memory (area):</span>
        <svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="currentColor" /></svg>
        <span>1 GB</span>
        <svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor" /></svg>
        <span>5 GB</span>
        <svg width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="currentColor" /></svg>
        <span>15 GB</span>
      </div>
      <div className={styles.scatterLegendRow}>
        <span className={styles.scatterLegendGroup}>wall time (bumps):</span>
        {WALL_TIME_REFS.map(({ seconds, label }) => {
          const n = starPointsForWallTime(seconds);
          return (
            <span key={label} className={styles.scatterLegendStar}>
              <svg width="22" height="22" aria-hidden="true">
                <path d={starPath(11, 11, n, 10, 10 * 0.75)} fill="currentColor" />
              </svg>
              <span>{label}</span>
            </span>
          );
        })}
      </div>
      <div className={styles.scatterLegendRow}>
        <span className={styles.scatterLegendGroup}>gen tokens/s:</span>
        {tpsSamples.map(({ tps, label }) => {
          const op = opacityForTps(tps, tpsDomain);
          return (
            <span key={label} className={styles.scatterLegendStar}>
              <svg width="22" height="22" aria-hidden="true">
                <circle cx="11" cy="11" r="9" fill="currentColor" fillOpacity={op} />
              </svg>
              <span>{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
