import { useRef, useState } from "react";
import styles from "./ResultTable.module.css";
import type { RunRow } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";
import { CapabilityHoverCard } from "./CapabilityHoverCard";
import { setHoveredModel, clearHoveredModel } from "../lib/hover-store";
import { familyColor } from "../lib/colors";

interface Props {
  row: RunRow;
  rank?: number;            // group rank (1..N) — only on lead row
  compact: boolean;
  groupSize: number;        // # runs in this group; show toggle when > 1 and lead
  expanded: boolean;
  onToggle?: () => void;    // present on lead row when groupSize > 1
  onClick: () => void;
  maxTokens: number;        // max tokens across all rendered rows, for token-bar scale
}

const abbrevRuntime = (runtime: string): string =>
  runtime === "llamacpp" ? "lcpp" : runtime;

const variantTag = (r: RunRow): string =>
  `${abbrevRuntime(r.runtime)} · ${r.quant} · t${r.temperature}`;

export function RunRowItem({ row, rank, compact, groupSize, expanded, onToggle, onClick, maxTokens }: Props) {
  const [capTip, setCapTip] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const rowColor = familyColor(row.family);
  const tokenPct = Math.max(0, Math.min(100, (row.tokens / Math.max(1, maxTokens)) * 100));
  const scoreClamped = Math.max(0, Math.min(100, row.score));
  const tokensTitle = `${Math.round(row.tokens).toLocaleString()} tokens/run`;

  const handleMouseEnter = () => setHoveredModel(row.baseModel);
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
      ref={rowRef}
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
              style={{ width: `${scoreClamped}%`, background: rowColor }}
            />
            <span
              className={styles.resultVariantTokens}
              style={{ width: `${tokenPct}%`, background: rowColor, boxShadow: `0 0 6px ${rowColor}` }}
            />
          </span>
        </div>

        <div
          className={styles.resultCapability}
          onMouseEnter={(ev) => {
            const rect = rowRef.current?.getBoundingClientRect();
            if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
          }}
          onMouseMove={(ev) => {
            const rect = rowRef.current?.getBoundingClientRect();
            if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
          }}
          onMouseLeave={() => setCapTip(null)}
        >
          {row.capability.map((c) => (
            <div
              key={c.tag}
              className={styles.resultCapCell}
              data-band={c.pass === null ? "absent" : scoreBand(c.pass)}
              title={c.pass === null ? `${c.tag}: no runs` : `${c.tag}: ${Math.round(c.pass * 100)}%`}
            />
          ))}
          {capTip !== null && (
            <div style={{ position: "absolute", left: capTip.x + 12, top: capTip.y + 12, pointerEvents: "none" }}>
              <CapabilityHoverCard title={`${row.baseModel} · ${variantTag(row)}`} capability={row.capability} />
            </div>
          )}
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
              <div className={styles.resultModelName}>{row.baseModel}</div>
              <div className={styles.resultModelFamily}>{variantTag(row)}</div>
            </>
          )}
        </div>
        <div className={styles.resultScoreCell}>
          <div className={styles.resultScore} data-band={scoreBand(row.score / 100)}>
            {row.score.toFixed(0)}%
          </div>
          {!compact && <div className={styles.resultEfficiency}>{row.efficiency} tok/pt</div>}
        </div>
        <div className={styles.resultNumeric}>
          <span>{row.mem.toFixed(1)} GB</span>
          {!compact && <span className={styles.resultNumericSub}>{row.quant}</span>}
        </div>
        <div className={styles.resultNumeric}>
          <span>{Math.round(row.tokens).toLocaleString()}</span>
          {!compact && <span className={styles.resultNumericSub}>/run</span>}
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
        <span className={styles.resultGroupToggleCount}>{groupSize - 1} more</span>
      </button>
    )}
    </div>
  );
}
