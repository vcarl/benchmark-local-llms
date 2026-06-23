import styles from "./RunTable.module.css";
import type { RunRow, TpsDomain } from "../lib/pipeline";
import { scoreBand, formatEfficiency } from "../lib/constants";
import { formatWallTime } from "../lib/format";
import { ScatterGlyph } from "./ScatterGlyph";

interface Props {
  row: RunRow;
  rank?: number; // group rank (1..N) — only on lead row
  compact: boolean;
  groupSize: number; // # configs in this group; show toggle when > 1 and lead
  expanded: boolean;
  onToggle?: () => void; // present on lead row when groupSize > 1
  onClick: () => void;
  tpsDomain: TpsDomain; // shared TPS domain (same one the scatter uses) for glyph opacity
  highlighted: boolean; // this row's config === the shared hoveredConfig
  onHoverConfig: (configHash: string | null) => void; // report row hover up (config_hash)
}

// Max rendered diameter (px) for the descriptor glyph on COMPACT rows. Compact
// rows are ~24px tall; this caps oversized markers to the row's content height
// (with a couple px of inset) so they don't bleed into adjacent rows. Markers
// already smaller than this keep their true scatter size.
const COMPACT_GLYPH_MAX_PX = 20;

const abbrevRuntime = (runtime: string): string =>
  runtime === "llamacpp" ? "lcpp" : runtime;

const variantTag = (r: RunRow): string =>
  `${abbrevRuntime(r.runtime)} · ${r.quant ?? "—"} · t${r.temperature}`;

export function RunRowItem({ row, rank, compact, groupSize, expanded, onToggle, onClick, tpsDomain, highlighted, onHoverConfig }: Props) {
  const scorePct = Math.max(0, Math.min(100, row.passRate * 100));
  // The descriptor glyph encodes the SAME four channels as this model's scatter
  // marker (family→color, peak memory→size, wall time→points, TPS→opacity),
  // drawn at true scatter size via the shared ScatterGlyph.
  const glyphTitle = `${row.mem.toFixed(1)} GB · ${formatWallTime(row.wallTime)} · ${row.genTps > 0 ? row.genTps.toFixed(0) : "—"} tok/s`;

  const handleMouseEnter = () => onHoverConfig(row.config_hash);
  const handleMouseLeave = () => onHoverConfig(null);

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  const showToggle = !compact && groupSize > 1 && onToggle !== undefined;

  return (
    <div className={styles.runRowWrap}>
    <button
      type="button"
      className={`${styles.resultRow} ${styles.runRow}${compact ? ` ${styles.resultRowCompact}` : ""}${highlighted ? ` ${styles.resultRowHighlighted}` : ""}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={styles.resultGlyph} title={glyphTitle} aria-hidden="true">
        <ScatterGlyph
          enc={{
            family: row.family,
            peak_memory_gb: row.mem,
            wall_time_sec: row.wallTime,
            generation_tps: row.genTps,
          }}
          tpsDomain={tpsDomain}
          // Compact rows are ~24px tall; cap oversized markers so they fit the
          // row instead of bleeding into neighbours. Expanded/lead rows render
          // at true scatter size (no cap), matching the scatterplot exactly.
          maxPx={compact ? COMPACT_GLYPH_MAX_PX : undefined}
        />
      </span>

      <div className={styles.resultRowAlways}>
        <div className={styles.resultRank}>
          {compact ? "" : (rank ?? "")}
        </div>
        <div className={styles.resultModel}>
          {compact ? (
            <div className={`${styles.resultModelName} ${styles.runRowVariant}`}>{variantTag(row)}</div>
          ) : (
            <>
              <div className={styles.resultModelName}>{row.artifact}</div>
              <div className={styles.resultModelFamily}>{variantTag(row)}</div>
            </>
          )}
          <div className={styles.resultCoverage}>
            {row.uniqueChallenges} challenges · {row.itemCount} items
          </div>
        </div>
        <div className={styles.resultScoreCell}>
          <div className={styles.resultScore} data-band={scoreBand(row.passRate)}>
            {scorePct.toFixed(0)}%
          </div>
          {!compact && <div className={styles.resultEfficiency}>{formatEfficiency(row.efficiency)}</div>}
        </div>
        <div className={styles.resultStats}>
          <div className={styles.resultStatCol}>
            <span className={styles.resultStatVal} title={`${Math.round(row.tokens).toLocaleString()} generation tokens (total)`}>
              {Math.round(row.tokens).toLocaleString()}
            </span>
            <span className={styles.resultStatUnit}>tok</span>
            <span className={styles.resultStatVal} title={`${row.genTps.toFixed(1)} generation tokens/sec (mean)`}>
              {row.genTps > 0 ? row.genTps.toFixed(0) : "—"}
            </span>
            <span className={styles.resultStatUnit}>tok/s</span>
          </div>
          <div className={styles.resultStatCol}>
            <span className={styles.resultStatVal} title={`${row.mem.toFixed(2)} GB peak memory`}>
              {row.mem.toFixed(1)}
            </span>
            <span className={styles.resultStatUnit}>GB</span>
            <span className={styles.resultStatVal} title={`${Math.round(row.wallTime).toLocaleString()}s total wall time`}>
              {row.wallTime > 0 ? formatWallTime(row.wallTime) : "—"}
            </span>
            <span className={styles.resultStatUnit}>wall</span>
          </div>
        </div>
      </div>

    </button>
    {showToggle && (
      <button
        type="button"
        className={styles.resultGroupToggle}
        aria-label={expanded ? "Collapse runs" : "Expand runs"}
        onClick={handleToggleClick}
      >
        <span className={styles.resultGroupToggleCaret}>{expanded ? "▾" : "▸"}</span>
        {groupSize - 1} more
      </button>
    )}
    </div>
  );
}
