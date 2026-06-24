import { useMemo, useState } from "react";
import styles from "./RunTable.module.css";
import type { RunGroup, RunRow, RunSortKey, TpsDomain } from "../lib/pipeline";
import { RunRowItem } from "./RunRowItem";

interface Props {
  groups: RunGroup[];
  primary: RunSortKey;
  secondary: RunSortKey;
  tpsDomain: TpsDomain; // shared with the scatter so row glyphs match markers
  onPrimaryChange: (k: RunSortKey) => void;
  onSecondaryChange: (k: RunSortKey) => void;
  onRowClick: (row: RunRow) => void;
  // Shared, ephemeral cross-component hover (config_hash). Highlights the row
  // whose config matches, and reports row hover up so the scatter can mirror it.
  hoveredConfig: string | null;
  onHoverConfig: (configHash: string | null) => void;
}

const SORT_OPTIONS: { value: RunSortKey; label: string }[] = [
  { value: "score", label: "score" },
  { value: "efficiency", label: "efficiency" },
  { value: "memory", label: "memory" },
];

export function RunGroupTable({
  groups, primary, secondary, tpsDomain, onPrimaryChange, onSecondaryChange, onRowClick,
  hoveredConfig, onHoverConfig,
}: Props) {
  // Artifact-group expand (reveals a model's sibling configs).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Invocation expand, keyed by config_hash (reveals a config's older runs).
  const [expandedInvocations, setExpandedInvocations] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const isExpanded = (artifact: string): boolean =>
    allExpanded ? true : expanded.has(artifact);

  const isInvocationsExpanded = (configHash: string): boolean =>
    allExpanded ? true : expandedInvocations.has(configHash);

  const toggleGroup = (artifact: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(artifact)) next.delete(artifact);
      else next.add(artifact);
      return next;
    });
  };

  const toggleInvocations = (configHash: string) => {
    setExpandedInvocations((prev) => {
      const next = new Set(prev);
      if (next.has(configHash)) next.delete(configHash);
      else next.add(configHash);
      return next;
    });
  };

  // "expand all" / "collapse all" drives BOTH axes: artifact groups and
  // per-config invocations.
  const toggleAll = () => {
    if (allExpanded) {
      setAllExpanded(false);
      setExpanded(new Set());
      setExpandedInvocations(new Set());
    } else {
      setAllExpanded(true);
    }
  };

  const totalRuns = useMemo(
    () => groups.reduce((s, g) => s + g.rows.length, 0),
    [groups],
  );

  if (groups.length === 0) {
    return <div className={styles.resultEmpty}>No results match the current filters.</div>;
  }

  return (
    <div className={styles.resultTable}>
      <div className={styles.resultControls}>
        <span className={styles.resultCount}>
          {groups.length} models · {totalRuns} configs
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
          <button type="button" className={styles.resultSortBtn} onClick={toggleAll}>
            {allExpanded ? "collapse all" : "expand all"}
          </button>
        </div>
      </div>
      <div className={styles.resultHeader}>
        <div className={styles.resultRowAlways}>
          <div className={styles.resultRank}>#</div>
          <div>Model / variant</div>
          <div className={styles.resultScoreHeader}>Score</div>
          <div className={styles.resultStatsHeader}>tok · t/s · mem · wall</div>
        </div>
      </div>
      {groups.map((g, gi) => {
        const open = isExpanded(g.artifact);
        const [lead, ...rest] = g.rows;
        if (lead === undefined) return null;
        return (
          <div key={g.artifact} className={styles.resultGroup}>
            <RunRowItem
              row={lead}
              rank={gi + 1}
              compact={false}
              groupSize={g.rows.length}
              expanded={open}
              onToggle={g.rows.length > 1 ? () => toggleGroup(g.artifact) : undefined}
              onClick={() => onRowClick(lead)}
              tpsDomain={tpsDomain}
              highlighted={lead.config_hash === hoveredConfig}
              onHoverConfig={onHoverConfig}
              invocationsExpanded={isInvocationsExpanded(lead.config_hash)}
              onToggleInvocations={lead.invocations.length > 1 ? () => toggleInvocations(lead.config_hash) : undefined}
            />
            {open && rest.map((r) => (
              <RunRowItem
                key={r.config_hash}
                row={r}
                compact
                groupSize={g.rows.length}
                expanded={open}
                onClick={() => onRowClick(r)}
                tpsDomain={tpsDomain}
                highlighted={r.config_hash === hoveredConfig}
                onHoverConfig={onHoverConfig}
                invocationsExpanded={isInvocationsExpanded(r.config_hash)}
                onToggleInvocations={r.invocations.length > 1 ? () => toggleInvocations(r.config_hash) : undefined}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
