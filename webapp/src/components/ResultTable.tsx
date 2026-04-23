import type { Row, GroupBy } from "../lib/pipeline";
import { ResultRow } from "./ResultRow";

interface Props {
  rows: Row[];
  groupBy: GroupBy;
  onRowClick: (row: Row) => void;
}

export function ResultTable({ rows, groupBy, onRowClick }: Props) {
  if (rows.length === 0) {
    return <div className="result-empty">No results match the current filters.</div>;
  }
  return (
    <div className="result-table">
      <div className="result-header">
        <div>NAME</div>
        <div>{(groupBy === "model" || groupBy === "modelOnly" || groupBy === "family" || groupBy === "runtime")
          ? "CAPABILITY PROFILE" : "TOP MODELS"}</div>
        <div>SCORE</div>
        <div>PASS</div>
        <div />
      </div>
      {rows.map((r) => (
        <ResultRow key={r.key} row={r} groupBy={groupBy} onClick={() => onRowClick(r)} />
      ))}
    </div>
  );
}
