import styles from "./RunTable.module.css";
import type { RunRow } from "../lib/pipeline";
import { scoreBand, formatEfficiency } from "../lib/constants";
import { formatWallTime } from "../lib/format";
import { setHoveredModel, clearHoveredModel } from "../lib/hover-store";
import { familyColor } from "../lib/colors";

interface Props {
  row: RunRow;
  rank?: number; // group rank (1..N) — only on lead row
  compact: boolean;
  groupSize: number; // # configs in this group; show toggle when > 1 and lead
  expanded: boolean;
  onToggle?: () => void; // present on lead row when groupSize > 1
  onClick: () => void;
  maxTokens: number; // max tokens across all rendered rows, for token-bar scale
}

const abbrevRuntime = (runtime: string): string =>
  runtime === "llamacpp" ? "lcpp" : runtime;

const variantTag = (r: RunRow): string =>
  `${abbrevRuntime(r.runtime)} · ${r.quant ?? "—"} · t${r.temperature}`;

export function RunRowItem({ row, rank, compact, groupSize, expanded, onToggle, onClick, maxTokens }: Props) {
  const rowColor = familyColor(row.family);
  const scorePct = Math.max(0, Math.min(100, row.passRate * 100));
  const tokenPct = Math.max(0, Math.min(100, (row.tokens / Math.max(1, maxTokens)) * 100));
  const tokensTitle = `${Math.round(row.tokens).toLocaleString()} gen tokens (total)`;

  const handleMouseEnter = () => setHoveredModel(row.artifact);
  const handleMouseLeave = () => clearHoveredModel();

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  const showToggle = !compact && groupSize > 1 && onToggle !== undefined;

  return (
    <div className={styles.runRowWrap}>
    <button
      type="button"
      className={`${styles.resultRow} ${styles.runRow}${compact ? ` ${styles.resultRowCompact}` : ""}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.resultRowBreakdown}>
        <div className={styles.runBar}>
          <span className={styles.resultVariantTrack} title={tokensTitle}>
            <span
              className={styles.resultVariantFill}
              style={{ width: `${scorePct}%`, background: rowColor }}
            />
            <span
              className={styles.resultVariantTokens}
              style={{ width: `${tokenPct}%`, background: rowColor, boxShadow: `0 0 6px ${rowColor}` }}
            />
          </span>
        </div>
      </div>

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
