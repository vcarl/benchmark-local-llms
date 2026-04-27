import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import styles from "./index.module.css";
import { DATA, uniqueSorted, modelFamily, modelSizeB } from "../lib/data";
import { FilterPanel } from "../components/FilterPanel";
import { parseFilters } from "../lib/filter-state";
import { ResultTable, type ListSortKey } from "../components/ResultTable";
import { RunGroupTable } from "../components/RunGroupTable";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import { Scatter } from "../components/Scatter";
import { ShiftFrame } from "../components/ShiftFrame";
import type { GroupBy, ListRow, RunRow, RunSortKey } from "../lib/pipeline";
import {
  applyFilters,
  aggregateForList,
  aggregateForRunList,
  groupRunsByModel,
} from "../lib/pipeline";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const isRunSortKey = (v: unknown): v is RunSortKey =>
  v === "score" || v === "efficiency" || v === "memory";

function HomePage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const [legacySortKey, setLegacySortKey] = useState<ListSortKey>("best");

  const allValues = useMemo(() => ({
    tags: Array.from(new Set(DATA.flatMap((d) => d.tags))).sort(),
    categories: uniqueSorted(DATA, "category") as string[],
    runtimes: uniqueSorted(DATA, "runtime") as string[],
    families: Array.from(new Set(DATA.map((d) => modelFamily(d.model)))).sort(),
    paramSizes: Array.from(new Set(
      DATA.map((d) => modelSizeB(d.model)).filter((n): n is number => n !== null),
    )).sort((a, b) => a - b),
    quants: uniqueSorted(DATA, "quant") as string[],
    temperatures: (uniqueSorted(DATA, "temperature") as number[]).sort((a, b) => a - b),
    durationDomain: (() => {
      const ws = DATA.map((d) => d.wall_time_sec).filter((s) => Number.isFinite(s) && s > 0);
      if (ws.length === 0) return { min: 0, max: 0 };
      return { min: Math.floor(Math.min(...ws)), max: Math.ceil(Math.max(...ws)) };
    })(),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const panelModel = search.model;
  const isGroupedRunView = groupBy === "model" || groupBy === "modelOnly";

  const sortPrimary: RunSortKey = isRunSortKey(search.sortPrimary) ? search.sortPrimary : "score";
  const sortSecondary: RunSortKey = isRunSortKey(search.sortSecondary) ? search.sortSecondary : "score";

  const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

  const runGroups = useMemo(
    () => isGroupedRunView
      ? groupRunsByModel(aggregateForRunList(filtered), sortPrimary, sortSecondary)
      : [],
    [filtered, isGroupedRunView, sortPrimary, sortSecondary],
  );

  const legacyRows: ListRow[] = useMemo(
    () => isGroupedRunView ? [] : aggregateForList(filtered, groupBy),
    [filtered, groupBy, isGroupedRunView],
  );

  const setSearchPatch = (patch: Record<string, string | undefined>) =>
    navigate({ to: "/", search: (s) => ({ ...s, ...patch }) as never });

  const handleRunClick = (row: RunRow) =>
    setSearchPatch({ model: row.baseModel });

  const handleLegacyRowClick = (row: ListRow) => {
    if (row.baseModel !== null) {
      setSearchPatch({ model: row.baseModel });
      return;
    }
    if (groupBy === "prompt") {
      const firstRun = filtered.find((r) => r.prompt_name === row.key);
      if (firstRun) {
        navigate({ to: "/run/$model/$name", params: { model: firstRun.model, name: firstRun.prompt_name } });
      }
      return;
    }
    const patch: Record<string, string> =
      groupBy === "tag" ? { tags: row.key } :
      groupBy === "category" ? { category: row.key } : {};
    setSearchPatch(patch);
  };

  const closePanel = () =>
    navigate({ to: "/", search: (s) => { const { model: _, ...rest } = s as Record<string, unknown>; return rest as never; } });

  const ranking = isGroupedRunView ? (
    <RunGroupTable
      groups={runGroups}
      primary={sortPrimary}
      secondary={sortSecondary}
      onPrimaryChange={(k) => setSearchPatch({ sortPrimary: k })}
      onSecondaryChange={(k) => setSearchPatch({ sortSecondary: k })}
      onRowClick={handleRunClick}
    />
  ) : (
    <ResultTable
      rows={legacyRows}
      sortKey={legacySortKey}
      onSortChange={setLegacySortKey}
      onRowClick={handleLegacyRowClick}
    />
  );

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <h1>Benchmark Analysis</h1>
        <div className={styles.appSubtitle}>{DATA.length} runs · {allValues.tags.length} tags · {allValues.runtimes.length} runtimes</div>
      </header>
      <ShiftFrame
        model={panelModel}
        onClose={closePanel}
        scatter={
          <>
            <Scatter data={filtered} />
            <FilterPanel allValues={allValues} />
          </>
        }
        ranking={ranking}
        details={panelModel !== undefined && panelModel !== "" ? <ModelDetailPanel model={panelModel} data={DATA} /> : null}
      />
    </div>
  );
}
