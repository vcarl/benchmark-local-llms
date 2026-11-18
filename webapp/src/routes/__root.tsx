import { createRootRoute, Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ControlColumn, PresetChips } from "../components/ControlColumn";
import { DrilldownPanel } from "../components/DrilldownPanel";
import { ModelList } from "../components/ModelList";
import { Scatter } from "../components/Scatter";
import { ScatterLegend } from "../components/ScatterLegend";
import { ShiftFrame } from "../components/ShiftFrame";
import { modelFamily } from "../lib/artifact";
import { familyColor } from "../lib/colors";
import { issueTemplateUrl } from "../lib/constants";
import { computeTpsDomain, type ScatterPoint } from "../lib/encoding";
import { groupRows, scopeRow, sortRows, withEfficiency } from "../lib/model";
import { DATASETS } from "../lib/rows";
import { applyFilters, applyView, funnel, inScope, parseView, toSearch, type ViewState } from "../lib/view-state";
import { fitXDomain, fitYDomain } from "../lib/scatter-layout";
import { clampViewport, type Viewport } from "../lib/viewport";
import styles from "./index.module.css";

export const Route = createRootRoute({
  component: RootComponent,
  validateSearch: (s: Record<string, unknown>) => s,
});

const DEFAULT_SET = DATASETS[0]?.dataset.label ?? "main";

function RootComponent() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const view = useMemo(() => parseView(search, DEFAULT_SET), [search]);
  const setView = useCallback(
    (v: ViewState) => navigate({ search: toSearch(v, DEFAULT_SET) as never }),
    [navigate],
  );
  // Zoom writes replace the history entry and read the latest URL, since they land after a debounce.
  const setViewport = useCallback(
    (vp: Viewport | undefined) =>
      navigate({
        search: ((prev: Record<string, unknown>) => toSearch({ ...parseView(prev, DEFAULT_SET), vp }, DEFAULT_SET)) as never,
        replace: true,
      }),
    [navigate],
  );

  // Ephemeral cross-component hover keyed on rowId: one scatter point ⇄ one list row.
  const [hovered, setHovered] = useState<string | null>(null);

  const dataset = DATASETS.find((d) => d.dataset.label === view.set) ?? DATASETS[0];
  const scopeKey = JSON.stringify(view.scope);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scopeKey stands for view.scope
  const scoped = useMemo(() => (dataset?.rows ?? []).map((r) => scopeRow(r, view.scope)), [dataset, scopeKey]);
  const scopedIn = useMemo(() => withEfficiency(scoped.filter(inScope)), [scoped]);
  const visible = useMemo(() => sortRows(applyFilters(scopedIn, view.filters), view.sort), [scopedIn, view.filters, view.sort]);
  const points = useMemo<ScatterPoint[]>(
    () =>
      visible.flatMap((r) =>
        r.cost === null
          ? []
          : [
              {
                id: r.row.rowId,
                model: r.row.modelKey,
                artifact: r.row.artifact,
                family: modelFamily(r.row.artifact),
                runtime: r.row.runtime,
                quant: r.row.quant,
                temperature: r.row.temperature,
                x: r.cost.tokens,
                y: r.score,
                ySE: r.se,
                peak_memory_gb: r.cost.peakMemoryGb,
                generation_tps: r.cost.genTps,
                wall_time_sec: r.cost.wallSec,
              },
            ],
      ),
    [visible],
  );
  // The zoom filters the list: clamped into the extent the scatter fits to the
  // filtered points (as the scatter does), then one more row filter. The scatter
  // keeps every filtered point, so its extent never depends on the zoom.
  const vp = useMemo(() => {
    if (view.vp === undefined) return undefined;
    const x = fitXDomain(points.map((p) => p.x));
    const y = fitYDomain(points.map((p) => p.y));
    return clampViewport(view.vp, { x0: x.min, x1: x.max, y0: y.min, y1: y.max });
  }, [view.vp, points]);
  const listed = useMemo(() => applyView(visible, vp), [visible, vp]);
  const counts = useMemo(
    () => funnel(dataset?.rows.length ?? 0, scoped, visible, vp === undefined ? undefined : listed),
    [dataset, scoped, visible, vp, listed],
  );
  const groups = useMemo(() => groupRows(listed, view.group, view.sort), [listed, view.group, view.sort]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);
  const legendFamilies = useMemo(
    () => [...new Set(points.map((p) => p.family))].map((name) => ({ name, color: familyColor(name) })),
    [points],
  );

  if (dataset === undefined) {
    return <div className={styles.app}>No data. Run ./bench report --output webapp/src/data.</div>;
  }

  const selected = view.row === undefined ? undefined : scoped.find((r) => r.row.rowId === view.row);
  const select = (rowId: string) => setView({ ...view, row: rowId, sel: rowId, attempt: undefined });
  // Closing the drilldown keeps the selection highlighted.
  const closeDetails = () => setView({ ...view, row: undefined, attempt: undefined });
  const tap = (rowId: string | undefined) => (rowId === undefined ? setView({ ...view, sel: undefined }) : select(rowId));
  const selectedIndex = selected === undefined ? -1 : groups.findIndex((g) => g.rows[0]?.row.rowId === selected.row.rowId);
  const ds = dataset.dataset;
  const items = dataset.challengeSet.reduce((s, c) => s + c.items, 0);

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.appHeaderTitle}>
          <h1>Benchmark Analysis</h1>
          <div className={styles.appSubtitle}>
            {ds.label}
            {ds.release !== null && ` · release ${ds.release}`}
            {ds.errata.length > 0 && ` + ${ds.errata.length} errata`} · {dataset.challengeSet.length} challenges · {items} items
          </div>
        </div>
        <div className={styles.appHeaderActions}>
          <a className={styles.requestLink} href={issueTemplateUrl("request-model.yml")} target="_blank" rel="noreferrer">
            Request a model
          </a>
          <a className={styles.requestLink} href={issueTemplateUrl("request-challenge-set.yml")} target="_blank" rel="noreferrer">
            Request a challenge
          </a>
          {selected !== undefined && (
            <button type="button" className={styles.overviewButton} onClick={closeDetails} aria-label="Back to overview">
              ← Overview
            </button>
          )}
        </div>
      </header>
      <ShiftFrame
        shifted={selected !== undefined}
        railOpen={view.open}
        onClose={closeDetails}
        scatter={
          <div className={styles.scatterLane}>
            <div className={styles.scatterPlotRegion}>
              <Scatter
                points={points}
                hovered={hovered}
                onHover={setHovered}
                selected={view.sel}
                onTap={tap}
                viewport={view.vp}
                onViewport={setViewport}
              />
            </div>
            <div className={styles.scatterBottomPane}>
              <ScatterLegend families={legendFamilies} tpsDomain={tpsDomain} />
            </div>
          </div>
        }
        rail={
          <ControlColumn
            view={view}
            defaultSet={DEFAULT_SET}
            datasets={DATASETS}
            dataset={dataset}
            scoped={scopedIn}
            funnel={counts}
            onChange={setView}
          />
        }
        list={
          <div className={styles.listLane}>
            <PresetChips view={view} defaultSet={DEFAULT_SET} datasets={DATASETS} onChange={setView} />
            <div className={styles.listScroll}>
              <ModelList
                groups={groups}
                dataset={dataset}
                tpsDomain={tpsDomain}
                hovered={hovered}
                selected={view.sel}
                onHover={setHovered}
                onSelect={select}
              />
            </div>
          </div>
        }
        details={
          selected !== undefined ? (
            <DrilldownPanel
              r={selected}
              dataset={dataset}
              scope={view.scope}
              rank={selectedIndex < 0 ? undefined : { position: selectedIndex + 1, tier: groups[selectedIndex]?.tier }}
              attemptId={view.attempt}
              onSelectAttempt={(a) => setView({ ...view, attempt: a })}
            />
          ) : (
            <Outlet />
          )
        }
      />
    </div>
  );
}
