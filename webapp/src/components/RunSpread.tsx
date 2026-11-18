import styles from "./RunSpread.module.css";
import { scoreBand } from "../lib/constants";
import type { Scope, ScopedRow } from "../lib/model";
import { challengeBoxes, FAILURE_AXES, failureProfiles } from "../lib/run-spread";

const RUNTIME_COLORS: Record<string, string> = { omlx: "#66bbff", mlx: "#e8a33d", llamacpp: "#b48cff" };
const runtimeColor = (rt: string) => RUNTIME_COLORS[rt] ?? "#9aa0a6";

function Legend({ runtimes, swatch }: { runtimes: string[]; swatch: "dot" | "line" }) {
  return (
    <div className={styles.legend}>
      {runtimes.map((rt) => (
        <span key={rt} className={styles.legendItem}>
          <span className={swatch === "dot" ? styles.dot : styles.line} style={{ background: runtimeColor(rt) }} />
          {rt}
        </span>
      ))}
    </div>
  );
}

const BW = 480;
const BH = 300;
const PAD = { l: 28, r: 4, t: 8, b: 64 };

function ChallengeBoxes({ runs, scope }: { runs: ScopedRow[]; scope: Scope }) {
  const boxes = challengeBoxes(runs, scope);
  const plotH = BH - PAD.t - PAD.b;
  const colW = (BW - PAD.l - PAD.r) / Math.max(1, boxes.length);
  const y = (v: number) => PAD.t + (1 - v) * plotH;
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} className={styles.chart} role="img" aria-label="Pass rate per challenge across runs">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={BW - PAD.r} y1={y(t)} y2={y(t)} className={styles.grid} />
          <text x={PAD.l - 4} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
            {t * 100}
          </text>
        </g>
      ))}
      {boxes.map((b, i) => {
        const cx = PAD.l + colW * (i + 0.5);
        const half = Math.min(14, colW * 0.32);
        const seen = new Map<number, number>();
        return (
          <g key={b.id} data-band={scoreBand(b.median)}>
            <title>{`${b.id}: median ${(b.median * 100).toFixed(0)} · IQR ${(b.q1 * 100).toFixed(0)}–${(b.q3 * 100).toFixed(0)} · range ${(b.min * 100).toFixed(0)}–${(b.max * 100).toFixed(0)}`}</title>
            <line x1={cx} x2={cx} y1={y(b.max)} y2={y(b.min)} className={styles.whisker} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(b.max)} y2={y(b.max)} className={styles.whisker} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(b.min)} y2={y(b.min)} className={styles.whisker} />
            <rect x={cx - half} width={half * 2} y={y(b.q3)} height={Math.max(2, y(b.q1) - y(b.q3))} className={styles.box} />
            <line x1={cx - half} x2={cx + half} y1={y(b.median)} y2={y(b.median)} className={styles.median} />
            {b.values.map((v, j) => {
              // Ties fan out sideways so every run stays visible.
              const n = seen.get(v) ?? 0;
              seen.set(v, n + 1);
              const dx = (n % 2 === 1 ? 1 : -1) * Math.ceil(n / 2) * 4;
              const rt = runs[j]?.row.runtime ?? "";
              return <circle key={j} cx={cx + dx} cy={y(v)} r={2.5} fill={runtimeColor(rt)} opacity={0.85} />;
            })}
            <text x={cx} y={BH - PAD.b + 8} className={styles.label} transform={`rotate(-45 ${cx} ${BH - PAD.b + 8})`} textAnchor="end">
              {b.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const RW = 480;
const RH = 340;
const CX = RW / 2;
const CY = RH / 2;
const R = 115;

function FailureRadar({ runs }: { runs: ScopedRow[] }) {
  const profiles = failureProfiles(runs);
  const peak = Math.max(1, ...profiles.flatMap((p) => p.mean));
  const max = Math.ceil(peak / 4) * 4;
  const pt = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / FAILURE_AXES.length;
    const r = (v / max) * R;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const ring = (v: number) => FAILURE_AXES.map((_, i) => pt(i, v).join(",")).join(" ");
  const zero = FAILURE_AXES.map((_, i) => profiles.every((p) => p.mean[i] === 0));
  return (
    <>
      <svg viewBox={`0 0 ${RW} ${RH}`} className={styles.chart} role="img" aria-label="Mean failures per run by failure kind, per runtime">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <polygon points={ring(max * f)} className={styles.grid} fill="none" />
            <text x={CX + 3} y={CY - R * f - 2} className={styles.tick}>
              {max * f}
            </text>
          </g>
        ))}
        {FAILURE_AXES.map((k, i) => {
          const [x, y] = pt(i, max);
          const [lx, ly] = pt(i, max * 1.12);
          return (
            <g key={k}>
              <line x1={CX} y1={CY} x2={x} y2={y} className={styles.grid} />
              <text
                x={lx}
                y={ly}
                className={zero[i] ? styles.axisZero : styles.label}
                textAnchor={Math.abs(lx - CX) < 4 ? "middle" : lx < CX ? "end" : "start"}
                dominantBaseline="middle"
              >
                {k.replace(/_/g, " ")}
              </text>
            </g>
          );
        })}
        {profiles.map((p) => (
          <polygon
            key={p.runtime}
            points={p.mean.map((v, i) => pt(i, v).join(",")).join(" ")}
            fill={runtimeColor(p.runtime)}
            fillOpacity={0.15}
            stroke={runtimeColor(p.runtime)}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Mean per run</th>
            {profiles.map((p) => (
              <th key={p.runtime} style={{ color: runtimeColor(p.runtime) }}>
                {p.runtime} <span className={styles.runs}>×{p.runs}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FAILURE_AXES.map((k, i) =>
            zero[i] ? null : (
              <tr key={k}>
                <td>{k.replace(/_/g, " ")}</td>
                {profiles.map((p) => (
                  <td key={p.runtime}>{(p.mean[i] ?? 0).toFixed(1)}</td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  );
}

/** A model's spread across its complete runs: per-challenge box plots, then failure kinds by runtime. */
export function RunSpread({ rows, scope }: { rows: ScopedRow[]; scope: Scope }) {
  const runs = rows.filter((r) => r.complete);
  const partial = rows.length - runs.length;
  const runtimes = [...new Set(runs.map((r) => r.row.runtime))].sort();
  if (runs.length === 0) return <div className={styles.empty}>No complete runs to compare.</div>;
  return (
    <div className={styles.spread}>
      <div className={styles.caption}>
        {runs.length} complete run{runs.length === 1 ? "" : "s"}
        {partial > 0 && ` · ${partial} partial excluded`}
      </div>
      <section className={styles.section}>
        <h3 className={styles.heading}>Pass rate per challenge</h3>
        <Legend runtimes={runtimes} swatch="dot" />
        <ChallengeBoxes runs={runs} scope={scope} />
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>Failure reasons</h3>
        <Legend runtimes={runtimes} swatch="line" />
        <FailureRadar runs={runs} />
        <p className={styles.note}>Failed samples per run. “untagged” = failures archived before failure kinds were recorded.</p>
      </section>
    </div>
  );
}
