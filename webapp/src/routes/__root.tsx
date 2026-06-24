import { createRootRoute, Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA, uniqueSorted, modelFamily } from "../lib/data";
import { RunGroupTable } from "../components/RunGroupTable";
import { ShiftFrame } from "../components/ShiftFrame";
import { aggregateRuns, applyFilters, baseChallengeId, computeScatterPoints, computeTpsDomain, defaultSortDir, type RunRow, type RunSortKey, type SortDir } from "../lib/pipeline";
import { Scatter } from "../components/Scatter";
import { ScatterLegend } from "../components/ScatterLegend";
import { FilterPanel } from "../components/FilterPanel";
import { familyColor } from "../lib/colors";
import { parseFilters, type SearchState } from "../lib/filter-state";
import { DrilldownPanel } from "../components/DrilldownPanel";
import { issueTemplateUrl } from "../lib/constants";
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
    sortPrimaryDir: typeof s.sortPrimaryDir === "string" ? s.sortPrimaryDir : undefined,
    sortSecondaryDir: typeof s.sortSecondaryDir === "string" ? s.sortSecondaryDir : undefined,
  }),
});

function RootComponent() {
  const navigate = useNavigate();

  const [primary, setPrimary] = useState<RunSortKey>("score");
  const [secondary, setSecondary] = useState<RunSortKey>("score");
  const [primaryDir, setPrimaryDir] = useState<SortDir>(defaultSortDir("score"));
  const [secondaryDir, setSecondaryDir] = useState<SortDir>(defaultSortDir("score"));

  // Picking a new metric resets that side to the metric's natural direction;
  // the toggle button flips only the current direction (metric unchanged).
  const onPrimaryChange = (k: RunSortKey) => {
    setPrimary(k);
    setPrimaryDir(defaultSortDir(k));
  };
  const onSecondaryChange = (k: RunSortKey) => {
    setSecondary(k);
    setSecondaryDir(defaultSortDir(k));
  };
  const onPrimaryDirToggle = () =>
    setPrimaryDir((d) => (d === "desc" ? "asc" : "desc"));
  const onSecondaryDirToggle = () =>
    setSecondaryDir((d) => (d === "desc" ? "asc" : "desc"));

  // Ephemeral cross-component hover, keyed on config_hash — the identity that maps
  // exactly one scatter point (computeScatterPoints groups by config_hash) to one
  // ranking row (aggregateRuns groups by config_hash). Lifted here so the scatter
  // and the ranking table can highlight each other symmetrically. Kept as React
  // state (not URL state): hover is transient and shouldn't pollute history.
  const [hoveredConfig, setHoveredConfig] = useState<string | null>(null);

  const search = useSearch({ strict: false }) as SearchState;
  const filters = useMemo(() => parseFilters(search), [search]);
  const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

  const groups = useMemo(
    () => aggregateRuns(filtered, primary, secondary, primaryDir, secondaryDir),
    [filtered, primary, secondary, primaryDir, secondaryDir],
  );
  const points = useMemo(() => computeScatterPoints(filtered), [filtered]);

  const legendFamilies = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; color: string }> = [];
    for (const d of points) {
      if (!seen.has(d.family)) {
        seen.add(d.family);
        out.push({ name: d.family, color: familyColor(d.family) });
      }
    }
    return out;
  }, [points]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);

  const allValues = useMemo(() => ({
    families: [...new Set(DATA.map((r) => modelFamily(r.artifact)))].sort(),
    runtimes: uniqueSorted(DATA, "runtime").map(String),
    quants: [...new Set(DATA.map((r) => r.quant ?? "—"))].sort(),
    temperatures: [...new Set(DATA.map((r) => String(r.temperature)))].sort(),
    challenges: [...new Set(DATA.map((r) => baseChallengeId(`${r.challenge_id}@${r.challenge_version}`)))].sort(),
  }), []);

  const shifted = search.config !== undefined;

  const closeDetails = () =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), config: undefined, attempt: undefined }) as never });

  // Select a config (open/drive the details drilldown) by writing the `config`
  // search param. Shared by a ranking-row click and a scatter-icon click so both
  // open the same drilldown.
  const selectConfig = (configHash: string) =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), config: configHash, attempt: undefined }) as never });

  const onRowClick = (row: RunRow) => selectConfig(row.config_hash);

  const onSelectAttempt = (id: string | undefined) =>
    navigate({ search: (prev) => ({ ...(prev as SearchState), attempt: id }) as never });

  const ranking = (
    <RunGroupTable
      groups={groups}
      primary={primary}
      secondary={secondary}
      primaryDir={primaryDir}
      secondaryDir={secondaryDir}
      tpsDomain={tpsDomain}
      onPrimaryChange={onPrimaryChange}
      onSecondaryChange={onSecondaryChange}
      onPrimaryDirToggle={onPrimaryDirToggle}
      onSecondaryDirToggle={onSecondaryDirToggle}
      onRowClick={onRowClick}
      hoveredConfig={hoveredConfig}
      onHoverConfig={setHoveredConfig}
    />
  );

  const leftLane = (
    <div className={styles.scatterLane}>
      <div className={styles.scatterPlotRegion}>
        <Scatter
          points={points}
          hoveredConfig={hoveredConfig}
          onHoverConfig={setHoveredConfig}
          onSelectConfig={selectConfig}
        />
      </div>
      <div className={styles.scatterBottomPane}>
        <ScatterLegend families={legendFamilies} tpsDomain={tpsDomain} />
        <FilterPanel allValues={allValues} />
      </div>
    </div>
  );

  // The per-config aggregate (RunRow) for the open drilldown, pulled from the
  // SAME aggregateRuns output that feeds the ranking table so the config summary
  // panel's headline numbers can't diverge from the ranking row.
  const selectedRow = useMemo<RunRow | null>(() => {
    if (search.config === undefined) return null;
    for (const g of groups) {
      for (const r of g.rows) {
        if (r.config_hash === search.config) return r;
      }
    }
    return null;
  }, [groups, search.config]);

  const details =
    search.config !== undefined ? (
      <DrilldownPanel
        records={filtered}
        configHash={search.config}
        runRow={selectedRow}
        attemptId={search.attempt}
        onSelectAttempt={onSelectAttempt}
      />
    ) : (
      <Outlet />
    );

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.appHeaderTitle}>
          <h1>Benchmark Analysis</h1>
          <div className={styles.appSubtitle}>
            {filtered.length} attempts · {groups.length} models
          </div>
        </div>
        <div className={styles.appHeaderActions}>
          <a
            className={styles.requestLink}
            href={issueTemplateUrl("request-model.yml")}
            target="_blank"
            rel="noreferrer"
          >
            Request a model
          </a>
          <a
            className={styles.requestLink}
            href={issueTemplateUrl("request-challenge-set.yml")}
            target="_blank"
            rel="noreferrer"
          >
            Request a challenge
          </a>
          {shifted && (
            <button
              type="button"
              className={styles.overviewButton}
              onClick={closeDetails}
              aria-label="Back to overview"
            >
              ← Overview
            </button>
          )}
        </div>
      </header>
      <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={leftLane} ranking={ranking} details={details} />
    </div>
  );
}
