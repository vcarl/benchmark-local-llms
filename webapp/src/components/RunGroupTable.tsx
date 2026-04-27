import { useMemo, useState } from "react";
import styles from "./ResultTable.module.css";
import type { RunGroup, RunRow, RunSortKey } from "../lib/pipeline";
import { RunRowItem } from "./RunRowItem";

interface Props {
  groups: RunGroup[];
  primary: RunSortKey;
  secondary: RunSortKey;
  onPrimaryChange: (k: RunSortKey) => void;
  onSecondaryChange: (k: RunSortKey) => void;
  onRowClick: (row: RunRow) => void;
}

const SORT_OPTIONS: { value: RunSortKey; label: string }[] = [
  { value: "score", label: "score" },
  { value: "efficiency", label: "efficiency" },
  { value: "memory", label: "memory" },
];

export function RunGroupTable({
  groups, primary, secondary, onPrimaryChange, onSecondaryChange, onRowClick,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const isExpanded = (baseModel: string): boolean =>
    allExpanded ? true : expanded.has(baseModel);

  const toggleGroup = (baseModel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(baseModel)) next.delete(baseModel);
      else next.add(baseModel);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setAllExpanded(false);
      setExpanded(new Set());
    } else {
      setAllExpanded(true);
    }
  };

  const totalRuns = useMemo(
    () => groups.reduce((s, g) => s + g.rows.length, 0),
    [groups],
  );

  const maxTokens = useMemo(() => {
    let m = 0;
    for (const g of groups) for (const r of g.rows) if (r.tokens > m) m = r.tokens;
    return m;
  }, [groups]);

  if (groups.length === 0) {
    return <div className={styles.resultEmpty}>No results match the current filters.</div>;
  }

  return (
    <div className={styles.resultTable}>
      <div className={styles.resultControls}>
        <span className={styles.resultCount}>
          {groups.length} models · {totalRuns} runs
        </span>
        <div className={styles.resultSort}>
          <label className={styles.resultSortGroup}>
            <span className={styles.resultSortLabel}>models by:</span>
            <select
              value={primary}
              onChange={(e) => onPrimaryChange(e.target.value as RunSortKey)}
              className={styles.resultSortSelect}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.resultSortGroup}>
            <span className={styles.resultSortLabel}>runs by:</span>
            <select
              value={secondary}
              onChange={(e) => onSecondaryChange(e.target.value as RunSortKey)}
              className={styles.resultSortSelect}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.resultSortBtn}
            onClick={toggleAll}
          >
            {allExpanded ? "collapse all" : "expand all"}
          </button>
        </div>
      </div>
      <div className={styles.resultHeader}>
        <div className={styles.resultRowBreakdown}>
          <div>Score / tokens</div>
          <div>Capabilities</div>
        </div>
        <div className={styles.resultRowAlways}>
          <div className={styles.resultRank}>#</div>
          <div>Model / variant</div>
          <div className={styles.resultScoreHeader}>Score</div>
          <div className={styles.resultNumericHeader}>Memory</div>
          <div className={styles.resultNumericHeader}>Tokens</div>
        </div>
      </div>
      {groups.map((g, gi) => {
        const open = isExpanded(g.baseModel);
        const [lead, ...rest] = g.rows;
        if (lead === undefined) return null;
        return (
          <div key={g.baseModel} className={styles.resultGroup}>
            <RunRowItem
              row={lead}
              rank={gi + 1}
              compact={false}
              groupSize={g.rows.length}
              expanded={open}
              onToggle={g.rows.length > 1 ? () => toggleGroup(g.baseModel) : undefined}
              onClick={() => onRowClick(lead)}
              maxTokens={maxTokens}
            />
            {open && rest.map((r) => (
              <RunRowItem
                key={`${r.runtime}|${r.quant}|${r.temperature}`}
                row={r}
                compact
                groupSize={g.rows.length}
                expanded={open}
                onClick={() => onRowClick(r)}
                maxTokens={maxTokens}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
