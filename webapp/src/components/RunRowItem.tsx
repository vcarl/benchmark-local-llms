import styles from "./RunTable.module.css";
import type { ConfigRow } from "../lib/pipeline";
import { scoreBand, formatEfficiency } from "../lib/constants";

interface Props {
  row: ConfigRow;
  columns: string[];
}

export function RunRowItem({ row, columns }: Props) {
  const identityLabel = `${row.quant ?? "—"} · t${row.temperature} · ${row.system_prompt}`;

  return (
    <tr className={styles.matrixConfigRow}>
      <td className={styles.matrixIdentityCell} title={identityLabel}>
        {identityLabel}
      </td>
      {columns.map((col) => {
        const cell = row.cells[col];
        if (cell === undefined) {
          return <td key={col} className={styles.matrixCell}>—</td>;
        }
        return (
          <td
            key={col}
            className={styles.matrixCell}
            data-band={scoreBand(cell.score)}
            title={`${cell.score.toFixed(2)} ${cell.passed ? "✓" : "✗"}`}
          >
            {cell.score.toFixed(2)}
            <span className={styles.matrixCellMark}>{cell.passed ? " ✓" : " ✗"}</span>
          </td>
        );
      })}
      <td
        className={styles.matrixCell}
        data-band={scoreBand(row.passRate)}
      >
        {(row.passRate * 100).toFixed(0)}%
      </td>
      <td className={styles.matrixCell}>
        {formatEfficiency(row.efficiency)}
      </td>
    </tr>
  );
}
