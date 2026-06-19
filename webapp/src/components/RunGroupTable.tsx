import { Fragment, useMemo } from "react";
import styles from "./RunTable.module.css";
import type { ArtifactGroup } from "../lib/pipeline";
import { RunRowItem } from "./RunRowItem";

interface Props {
  columns: string[];
  groups: ArtifactGroup[];
  expanded: Set<string>;
  onToggle: (artifact: string) => void;
}

export function RunGroupTable({ columns, groups, expanded, onToggle }: Props) {
  const totalConfigs = useMemo(
    () => groups.reduce((s, g) => s + g.rows.length, 0),
    [groups],
  );

  if (groups.length === 0) {
    return <div className={styles.resultEmpty}>No results — no benchmark data loaded.</div>;
  }

  return (
    <div className={styles.resultTable}>
      <div className={styles.resultControls}>
        <span className={styles.resultCount}>
          {groups.length} artifacts · {totalConfigs} configs
        </span>
      </div>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={styles.matrixIdentityHeader}>Config</th>
            {columns.map((col) => (
              <th key={col} className={styles.matrixChallengeHeader}>{col}</th>
            ))}
            <th className={styles.matrixScoreHeader}>Pass %</th>
            <th className={styles.matrixScoreHeader}>Efficiency</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = expanded.has(g.artifact);
            return (
              <Fragment key={g.artifact}>
                <tr
                  className={styles.matrixGroupRow}
                  onClick={() => onToggle(g.artifact)}
                >
                  <td
                    colSpan={columns.length + 3}
                    className={styles.matrixGroupCell}
                  >
                    <span className={styles.matrixGroupCaret}>{open ? "▾" : "▸"}</span>
                    {g.artifact}
                    <span className={styles.matrixGroupCount}> ({g.rows.length})</span>
                  </td>
                </tr>
                {open && g.rows.map((row) => (
                  <RunRowItem
                    key={row.config_hash}
                    row={row}
                    columns={columns}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
