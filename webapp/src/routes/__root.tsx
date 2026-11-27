import { createRootRoute, Link, Outlet, useMatchRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ControlColumn, DatasetColumn, PresetChips } from "../components/ControlColumn";
import { DrilldownPanel } from "../components/DrilldownPanel";
import { ModelList } from "../components/ModelList";
import { Scatter } from "../components/Scatter";
import { ScatterLegend } from "../components/ScatterLegend";
import { Pane, Sashay, type SashayHandle } from "@vcarl/sashay/react";
import "@vcarl/sashay/style.css";
import { modelFamily } from "../lib/artifact";
import { familyColor } from "../lib/colors";
import { issueTemplateUrl } from "../lib/constants";
import { computeTpsDomain, type ScatterPoint } from "../lib/encoding";
import { changedCells, errataOnRelease } from "../lib/errata";
import { groupRows, scopeRow, sortRows, withEfficiency } from "../lib/model";
import { defaultEntry, entryFor, type IndexEntry, useIndex, useSnapshot } from "../lib/snapshots";
import { applyFilters, applyView, funnel, inScope, parseView, toSearch, type ViewState } from "../lib/view-state";
import { fitXDomain, fitYDomain } from "../lib/scatter-layout";
import { clampViewport, toUnit, type Viewport } from "../lib/viewport";
import styles from "./index.module.css";

export const Route = createRootRoute({
  component: RootComponent,
  validateSearch: (s: Record<string, unknown>) => s,
});

function RootComponent() {
  const index = useIndex();
  if (index.status === "loaded") return <Shell index={index.value} />;
  return (
    <div className={styles.app}>
      {index.status === "loading" ? "Loading…" : `Could not load the dataset index: ${index.message}`}
    </div>
  );
}

function Shell({ index }: { index: IndexEntry[] }) {
  const DEFAULT_SET = defaultEntry(index)?.dataset ?? "alpha";
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
  // Layout writes read the latest URL: they can follow a selection change in the same event.
  const setLayout = useCallback(
    (layout: string) =>
      navigate({
        search: ((prev: Record<string, unknown>) => toSearch({ ...parseView(prev, DEFAULT_SET), layout }, DEFAULT_SET)) as never,
        replace: true,
      }),
    [navigate],
  );
  const panes = useRef<SashayHandle>(null);
  // Closing the drilldown keeps the selection highlighted.
  const closeDetails = useCallback(() => {
    setView({ ...view, row: undefined, attempt: undefined });
    panes.current?.close("details");
  }, [setView, view]);
  // The details pane exists only while a row is drilled into, so closing another pane
  // can't open it empty. A selection asks for it to be revealed once it has mounted.
  const drilled = view.row !== undefined;
  const revealDetails = useRef(false);
  useLayoutEffect(() => {
    if (!revealDetails.current || !drilled) return;
    revealDetails.current = false;
    panes.current?.reveal("details");
  });
  useEffect(() => {
    if (!drilled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetails();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drilled, closeDetails]);

  const matchRoute = useMatchRoute();
  const onPage = matchRoute({ to: "/errata" }) !== false || matchRoute({ to: "/release/$release" }) !== false;

  // Ephemeral cross-component hover keyed on rowId: one scatter point ⇄ one list row.
  const [hovered, setHovered] = useState<string | null>(null);

  const entry = entryFor(index, view.set);
  const snapshot = useSnapshot(entry);
  const dataset = snapshot.status === "loaded" ? snapshot.value : undefined;
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
                yCI: r.ci,
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
  const full = useMemo<Viewport>(() => {
    const x = fitXDomain(points.map((p) => p.x));
    const y = fitYDomain(points.map((p) => p.y));
    return { x0: x.min, x1: x.max, y0: y.min, y1: y.max };
  }, [points]);
  const vp = useMemo(() => (view.vp === undefined ? undefined : clampViewport(view.vp, full)), [view.vp, full]);
  // The hovered (else highlighted) point's place across the plot, kept in view while the chart pane is squeezed.
  const selPoint = points.find((p) => p.id === (hovered ?? view.sel));
  const focusX = selPoint === undefined ? null : Math.min(1, Math.max(0, toUnit(vp ?? full, selPoint.x, selPoint.y).u));
  const listed = useMemo(() => applyView(visible, vp), [visible, vp]);
  const counts = useMemo(
    () => funnel(dataset?.rows.length ?? 0, scoped, visible, vp === undefined ? undefined : listed),
    [dataset, scoped, visible, vp, listed],
  );
  const ranked = dataset?.dataset.ranked ?? true;
  const groups = useMemo(() => groupRows(listed, view.group, view.sort, ranked), [listed, view.group, view.sort, ranked]);
  const tpsDomain = useMemo(() => computeTpsDomain(points), [points]);
  const legendFamilies = useMemo(
    () => [...new Set(points.map((p) => p.family))].map((name) => ({ name, color: familyColor(name) })),
    [points],
  );

  if (dataset === undefined || entry === undefined) {
    return (
      <div className={styles.app}>
        {snapshot.status === "error" ? `Could not load the ${view.set} snapshot: ${snapshot.message}` : "Loading…"}
      </div>
    );
  }

  const selected = view.row === undefined ? undefined : scoped.find((r) => r.row.rowId === view.row);
  const select = (rowId: string) => {
    setView({ ...view, row: rowId, sel: rowId, attempt: undefined });
    revealDetails.current = true;
  };
  const tap = (rowId: string | undefined) => (rowId === undefined ? setView({ ...view, sel: undefined }) : select(rowId));
  const selectedIndex =
    selected === undefined || !ranked
      ? -1
      : groups.findIndex((g) => g.rows[0]?.row.rowId === selected.row.rowId);
  const ds = dataset.dataset;
  const items = dataset.challengeSet.reduce((s, c) => s + c.items, 0);

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.appHeaderTitle}>
          <h1>Benchmark Analysis</h1>
          <div className={styles.appSubtitle}>
            {ds.release === null ? (
              ds.title
            ) : (
              <Link to="/release/$release" params={{ release: ds.release }} className={styles.subtitleLink}>
                {ds.title}
              </Link>
            )}
            {ds.legacy && ` · ${ds.release === "0" ? "alpha · " : ""}legacy archive`}
            {!ds.ranked && " · unranked"}
            {ds.release !== null && ds.version !== null && (
              <>
                {` · eval ${ds.version}`}
                {" · "}
                <Link to="/errata" search={{ release: ds.release }} className={styles.subtitleLink}>
                  {errataOnRelease(ds.errata, ds.release).length} errata
                </Link>
              </>
            )}{" "}
            · {dataset.challengeSet.length} challenges · {items} items
          </div>
        </div>
        <div className={styles.appHeaderActions}>
          <a className={styles.requestLink} href={issueTemplateUrl("request-model.yml")} target="_blank" rel="noreferrer">
            Request a model
          </a>
          <a className={styles.requestLink} href={issueTemplateUrl("request-challenge-set.yml")} target="_blank" rel="noreferrer">
            Request a challenge
          </a>
          <Link to="/errata" search={{ release: ds.release ?? undefined }} className={styles.requestLink}>
            Errata
          </Link>
          {selected !== undefined && (
            <button type="button" className={styles.overviewButton} onClick={closeDetails} aria-label="Back to overview">
              ← Overview
            </button>
          )}
        </div>
      </header>
      {onPage ? (
        <Outlet />
      ) : (
        <Sashay
          ref={panes}
          layout={view.layout}
          defaultLayout={[1 / 2, 1]} // chart 1:1 list, details closed
          onLayoutChange={setLayout}
        >
          <Pane
            id="chart"
            title="Scatter"
            focus={2 / 5}
            minWidth={180}
            keepInView={focusX === null ? null : `${focusX * 100}%`}
            bar={{
              title: "Datasets",
              height: 360,
              content: <DatasetColumn view={view} datasets={index} dataset={entry} onChange={setView} />,
            }}
          >
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
          </Pane>
          <Pane
            id="list"
            title="Results"
            focus={2 / 5}
            minWidth={150}
            bar={{
              title: "Filters",
              height: 360,
              content: (
                <ControlColumn
                  view={view}
                  defaultSet={DEFAULT_SET}
                  dataset={dataset}
                  scoped={scopedIn}
                  funnel={counts}
                  onChange={setView}
                />
              ),
            }}
          >
            <div className={styles.listLane}>
              <PresetChips view={view} defaultSet={DEFAULT_SET} datasets={index} onChange={setView} />
              <div className={styles.listScroll}>
                <ModelList
                  groups={groups}
                  dataset={dataset}
                  ranked={ranked}
                  tpsDomain={tpsDomain}
                  hovered={hovered}
                  selected={view.sel}
                  onHover={setHovered}
                  onSelect={select}
                />
              </div>
            </div>
          </Pane>
          {drilled && (
            <Pane
              id="details"
              title="Details"
              focus={1 / 5}
              minWidth={180}
              maxWidth={560}
              opensTo={[2 / 5, 4 / 5]} // 2:2:1
              onClose={closeDetails}
            >
              <div className={styles.detailsLane}>
                {selected !== undefined ? (
                  <DrilldownPanel
                    r={selected}
                    runs={visible.filter((v) => v.row.modelKey === selected.row.modelKey)}
                    dataset={dataset}
                    scope={view.scope}
                    rank={selectedIndex < 0 ? undefined : { position: selectedIndex + 1, tier: groups[selectedIndex]?.tier }}
                    changed={changedCells(selected.row, dataset)}
                    attemptId={view.attempt}
                    onSelectAttempt={(a) => setView({ ...view, attempt: a })}
                  />
                ) : (
                  <Outlet />
              )}
            </div>
          </Pane>
          )}
        </Sashay>
      )}
    </div>
  );
}
