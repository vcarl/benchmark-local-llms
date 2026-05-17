import styles from "./ResultTable.module.css";
import type { ListRow } from "../lib/pipeline";
import { ResultRow } from "./ResultRow";

export type ListSortKey = "best" | "efficiency" | "memory";

interface Props {
  rows: ListRow[];
  sortKey: ListSortKey;
  onSortChange: (key: ListSortKey) => void;
  onRowClick: (row: ListRow) => void;
}

const sortRows = (rows: ListRow[], key: ListSortKey): ListRow[] => {
  const copy = rows.slice();
  if (key === "best") copy.sort((a, b) => b.bestScore - a.bestScore);
  else if (key === "efficiency") copy.sort((a, b) => a.efficiency - b.efficiency);
  else copy.sort((a, b) => a.mem - b.mem);
  return copy;
};

export function ResultTable({ rows, sortKey, onSortChange, onRowClick }: Props) {
  if (rows.length === 0) {
    return <div className={styles.resultEmpty}>No results match the current filters.</div>;
  }
  const sorted = sortRows(rows, sortKey);
  return (
    <div className={styles.resultTable}>
      <div className={styles.resultControls}>
        <span className={styles.resultCount}>{rows.length} rows</span>
        <div className={styles.resultSort}>
          <span className={styles.resultSortLabel}>sort by:</span>
          <button
            className={`${styles.resultSortBtn}${sortKey === "best" ? ` ${styles.resultSortBtnActive}` : ""}`}
            onClick={() => onSortChange("best")}
            type="button"
          >
            best
          </button>
          <button
            className={`${styles.resultSortBtn}${sortKey === "efficiency" ? ` ${styles.resultSortBtnActive}` : ""}`}
            onClick={() => onSortChange("efficiency")}
            type="button"
          >
            efficiency
          </button>
          <button
            className={`${styles.resultSortBtn}${sortKey === "memory" ? ` ${styles.resultSortBtnActive}` : ""}`}
            onClick={() => onSortChange("memory")}
            type="button"
          >
            memory
          </button>
        </div>
      </div>
      <div className={styles.resultHeader}>
        <div className={styles.resultRowBreakdown}>
          <div>Pass rate by variant</div>
          <div>Capabilities</div>
        </div>
        <div className={styles.resultRowAlways}>
          <div className={styles.resultRank}>#</div>
          <div>Model</div>
          <div className={styles.resultScoreHeader}>Score / efficiency</div>
          <div className={styles.resultNumericHeader}>Memory</div>
          <div className={styles.resultNumericHeader}>Tokens</div>
        </div>
      </div>
      {sorted.map((r, i) => (
        <ResultRow
          key={r.key}
          row={r}
          rank={i + 1}
          onClick={() => onRowClick(r)}
        />
      ))}
    </div>
  );
}
