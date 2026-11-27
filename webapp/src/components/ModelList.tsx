import { useEffect, useRef, useState } from "react";
import styles from "./ModelList.module.css";
import { ScatterGlyph } from "./ScatterGlyph";
import { modelFamily } from "../lib/artifact";
import { scoreBand } from "../lib/constants";
import type { TpsDomain } from "../lib/encoding";
import { formatWallTime } from "../lib/format";
import type { Group, ScopedRow } from "../lib/model";
import type { Row, RowsDataset } from "../lib/rows";
import { variantLine, variantTitle } from "../lib/variant-line";
import type { PairedDiff } from "../lib/stats";

interface Props {
  groups: Group[];
  dataset: RowsDataset;
  /** False: no rank numbers. */
  ranked: boolean;
  tpsDomain: TpsDomain;
  hovered: string | null;
  /** The highlighted row (URL `sel`). */
  selected: string | undefined;
  onHover: (rowId: string | null) => void;
  onSelect: (rowId: string) => void;
}

const pct = (f: number, digits = 0) => `${(f * 100).toFixed(digits)}%`;

export { variantLine };

const scoreTitle = (r: ScopedRow): string => {
  if (r.complete)
    return r.ci === null ? pct(r.score, 1) : `${pct(r.score, 1)} ± ${(r.ci * 100).toFixed(1)} (95% CI)`;
  const [done, total] = r.challenges;
  return `Ranked at ${pct(r.score, 1)}. Partial pass rate ${r.running === null ? "—" : pct(r.running, 1)} over the ${done} of ${total} challenges run; missing challenges count as fails.`;
};

const effTitle = (r: ScopedRow): string =>
  r.efficiency === null || r.tokensPerItem === null
    ? "No cost data in scope"
    : `Efficiency ${(r.efficiency * 100).toFixed(0)}: pass rate ${pct(r.score, 1)}, ${r.tokensPerItem.toFixed(0)} tokens and ${(r.wallPerItem ?? 0).toFixed(1)} s per item, relative to the other rows in the set`;

const signedPts = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}`;

/**
 * A tier comparison (`other − this`, as `Tier` stores it) read from this
 * entry's side: `−6.4 pts [−11.6, −1.2]`, percentage points with the 95% CI.
 */
export const formatDiff = (p: PairedDiff): string =>
  `${signedPts(-p.diff)} pts [${signedPts(-p.hi)}, ${signedPts(-p.lo)}]`;

const mixedTitle = (row: Row): string => {
  const p = row.provenance;
  const span = `${row.freshness.executedFrom?.slice(0, 10) ?? "?"} – ${row.freshness.executedTo?.slice(0, 10) ?? "?"}`;
  return `Mixed evidence · runtime ${p.runtimeVersions.join(", ")} · sha ${p.gitShas.join(", ")} · executed ${span}`;
};

function ListRow({
  r,
  rank,
  title,
  sub,
  props,
  toggle,
}: {
  r: ScopedRow;
  rank: string;
  title: string;
  sub: boolean;
  props: Props;
  toggle?: React.ReactNode;
}) {
  const { row } = r;
  const c = r.cost;
  return (
    <div className={styles.rowWrap}>
      <button
        type="button"
        className={`${styles.row}${sub ? ` ${styles.sub}` : ""}${props.hovered === row.rowId ? ` ${styles.hot}` : ""}${props.selected === row.rowId ? ` ${styles.sel}` : ""}`}
        aria-current={props.selected === row.rowId ? "true" : undefined}
        onClick={() => props.onSelect(row.rowId)}
        onMouseEnter={() => props.onHover(row.rowId)}
        onMouseLeave={() => props.onHover(null)}
      >
        <span className={styles.glyph} aria-hidden="true">
          {c !== null && (
            <ScatterGlyph
              enc={{ family: modelFamily(row.artifact), peak_memory_gb: c.peakMemoryGb, wall_time_sec: c.wallSec, generation_tps: c.genTps }}
              tpsDomain={props.tpsDomain}
              maxPx={sub ? 18 : 30}
            />
          )}
        </span>
        <span className={styles.rank}>{rank}</span>
        <span className={styles.model}>
          <span className={styles.name} title={sub ? variantTitle(row, props.dataset) : undefined}>
            {title}
            {row.provenance.mixed && (
              <span className={styles.mixed} title={mixedTitle(row)} aria-label="mixed evidence">
                •
              </span>
            )}
          </span>
          {!sub && (
            <span className={styles.meta} title={variantTitle(row, props.dataset)}>
              {variantLine(row, props.dataset)}
            </span>
          )}
        </span>
        <span className={styles.score} title={scoreTitle(r)}>
          {r.complete ? (
            <span className={styles.pct} data-band={scoreBand(r.score)}>
              {pct(r.score)}
            </span>
          ) : (
            <>
              <span className={`${styles.pct} ${styles.partial}`}>{r.running === null ? "—" : pct(r.running)}</span>
              <span className={styles.done}>
                {r.challenges[0]}/{r.challenges[1]}
              </span>
            </>
          )}
        </span>
        <span className={styles.stat} title={effTitle(r)}>
          {r.efficiency === null ? "—" : (r.efficiency * 100).toFixed(0)}
        </span>
        <span className={styles.stat}>{c === null ? "—" : `${(c.tokens / 1000).toFixed(0)}k`}</span>
        <span className={styles.stat}>{c === null ? "—" : c.genTps.toFixed(0)}</span>
        <span className={styles.stat}>{c === null ? "—" : `${c.peakMemoryGb.toFixed(1)}`}</span>
        <span className={styles.stat}>{c === null ? "—" : formatWallTime(c.wallSec)}</span>
      </button>
      {toggle}
    </div>
  );
}

export function ModelList(props: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement | null>(null);
  // A selection made in the scatter scrolls its row into view, in the side-by-side layout only:
  // stacked, it would yank the page away from the plot.
  useEffect(() => {
    if (props.selected === undefined || !window.matchMedia("(min-width: 900px)").matches) return;
    ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [props.selected]);
  const flip = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className={styles.list} ref={ref}>
      <div className={styles.head}>
        <span />
        <span className={styles.rank}>#</span>
        <span>Model</span>
        <span className={styles.score}>Pass rate</span>
        <span className={styles.stat} title="Pass rate per token cost; see docs/SCORING.md">eff</span>
        <span className={styles.stat}>tok</span>
        <span className={styles.stat}>tok/s</span>
        <span className={styles.stat}>GB</span>
        <span className={styles.stat}>wall</span>
      </div>
      {props.groups.length === 0 && <div className={styles.empty}>No rows match the current filters.</div>}
      {props.groups.map((g, i) => {
        const [lead, ...rest] = g.rows;
        if (lead === undefined) return null;
        const expanded = open.has(g.key);
        const t = g.tier;
        return (
          <div key={g.key} className={styles.group}>
            {t !== undefined && t.start && i > 0 && (
              <div
                className={styles.tierRule}
                title={t.vsHead === null ? undefined : `#${i + 1} vs #${t.ref}: ${formatDiff(t.vsHead)}, paired 95% CI`}
              >
                Tier {t.n} · below #{t.ref} at 95%
              </div>
            )}
            <ListRow
              r={lead}
              rank={props.ranked ? String(i + 1) : ""}
              title={g.name}
              sub={false}
              props={props}
              toggle={
                rest.length > 0 && (
                  <button type="button" className={styles.more} onClick={() => flip(g.key)} aria-expanded={expanded}>
                    {expanded ? "−" : `+${rest.length}`}
                  </button>
                )
              }
            />
            {expanded &&
              rest.map((r) => (
                <ListRow key={r.row.rowId} r={r} rank="" title={variantLine(r.row, props.dataset)} sub props={props} />
              ))}
          </div>
        );
      })}
    </div>
  );
}
