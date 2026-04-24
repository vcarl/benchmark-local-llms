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
    return <div className="result-empty">No results match the current filters.</div>;
  }
  const sorted = sortRows(rows, sortKey);
  return (
    <div className="result-table">
      <div className="result-controls">
        <span className="result-count">{rows.length} rows</span>
        <div className="result-sort">
          <span className="result-sort-label">sort by:</span>
          <button
            className={`result-sort-btn${sortKey === "best" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("best")}
            type="button"
          >
            best
          </button>
          <button
            className={`result-sort-btn${sortKey === "efficiency" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("efficiency")}
            type="button"
          >
            efficiency
          </button>
          <button
            className={`result-sort-btn${sortKey === "memory" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("memory")}
            type="button"
          >
            memory
          </button>
        </div>
      </div>
      <div className="result-header">
        <div className="result-rank">#</div>
        <div>Model</div>
        <div className="result-score-header">Score / efficiency</div>
        <div>Pass rate by variant</div>
        <div>Capabilities</div>
        <div className="result-numeric-header">Memory</div>
        <div className="result-numeric-header">Tokens</div>
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
