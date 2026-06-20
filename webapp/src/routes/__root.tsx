import { createRootRoute, Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA, uniqueSorted, modelFamily } from "../lib/data";
import { RunGroupTable } from "../components/RunGroupTable";
import { ShiftFrame } from "../components/ShiftFrame";
import { aggregateRuns, applyFilters, computeScatterPoints, type RunRow, type RunSortKey } from "../lib/pipeline";
import { Scatter } from "../components/Scatter";
import { FilterPanel } from "../components/FilterPanel";
import { parseFilters, type SearchState } from "../lib/filter-state";
import { DrilldownPanel } from "../components/DrilldownPanel";
import styles from "./index.module.css";

export const Route = createRootRoute({
  component: RootComponent,
  validateSearch: (s: Record<string, unknown>): SearchState => ({
    family: typeof s.family === "string" ? s.family : undefined,
    runtime: typeof s.runtime === "string" ? s.runtime : undefined,
    quant: typeof s.quant === "string" ? s.quant : undefined,
    temperature: typeof s.temperature === "string" ? s.temperature : undefined,
    challenge: typeof s.challenge === "string" ? s.challenge : undefined,
    config: typeof s.config === "string" ? s.config : undefined,
    attempt: typeof s.attempt === "string" ? s.attempt : undefined,
    sortPrimary: typeof s.sortPrimary === "string" ? s.sortPrimary : undefined,
    sortSecondary: typeof s.sortSecondary === "string" ? s.sortSecondary : undefined,
  }),
});

function RootComponent() {
  const navigate = useNavigate();

  const [primary, setPrimary] = useState<RunSortKey>("score");
  const [secondary, setSecondary] = useState<RunSortKey>("score");

  const search = useSearch({ strict: false }) as SearchState;
  const filters = useMemo(() => parseFilters(search), [search]);
  const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

  const groups = useMemo(() => aggregateRuns(filtered, primary, secondary), [filtered, primary, secondary]);
  const points = useMemo(() => computeScatterPoints(filtered), [filtered]);

  const allValues = useMemo(() => ({
    families: [...new Set(DATA.map((r) => modelFamily(r.artifact)))].sort(),
    runtimes: uniqueSorted(DATA, "runtime").map(String),
    quants: [...new Set(DATA.map((r) => r.quant ?? "—"))].sort(),
    temperatures: [...new Set(DATA.map((r) => String(r.temperature)))].sort(),
    challenges: [...new Set(DATA.map((r) => `${r.challenge_id}@${r.challenge_version}`))].sort(),
  }), []);

  const shifted = search.config !== undefined;

  const closeDetails = () =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), config: undefined, attempt: undefined }) as never });

  const onRowClick = (row: RunRow) =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), config: row.config_hash, attempt: undefined }) as never });

  const onSelectAttempt = (id: string | undefined) =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), attempt: id }) as never });

  const ranking = (
    <RunGroupTable
      groups={groups}
      primary={primary}
      secondary={secondary}
      onPrimaryChange={setPrimary}
      onSecondaryChange={setSecondary}
      onRowClick={onRowClick}
    />
  );

  const leftLane = (
    <>
      <Scatter points={points} />
      <FilterPanel allValues={allValues} />
    </>
  );

  const details =
    search.config !== undefined ? (
      <DrilldownPanel
        records={filtered}
        configHash={search.config}
        attemptId={search.attempt}
        onSelectAttempt={onSelectAttempt}
      />
    ) : (
      <Outlet />
    );

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <h1>Benchmark Analysis</h1>
        <div className={styles.appSubtitle}>
          {filtered.length} attempts · {groups.length} models
        </div>
      </header>
      <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={leftLane} ranking={ranking} details={details} />
    </div>
  );
}
