import {
  createRootRoute,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA, uniqueSorted, modelFamily, modelSizeB } from "../lib/data";
import { FilterPanel } from "../components/FilterPanel";
import { parseFilters } from "../lib/filter-state";
import { ResultTable, type ListSortKey } from "../components/ResultTable";
import { RunGroupTable } from "../components/RunGroupTable";
import { Scatter } from "../components/Scatter";
import { ShiftFrame } from "../components/ShiftFrame";
import { encodeVariant, variantsForModel } from "../lib/run-summary";
import type { GroupBy, ListRow, RunRow, RunSortKey } from "../lib/pipeline";
import {
  applyFilters,
  applyVariantFilters,
  aggregateForList,
  aggregateForRunList,
  groupRunsByModel,
} from "../lib/pipeline";
import styles from "./index.module.css";

export const Route = createRootRoute({
  component: RootComponent,
});

const isRunSortKey = (v: unknown): v is RunSortKey =>
  v === "score" || v === "efficiency" || v === "memory";

function RootComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const [legacySortKey, setLegacySortKey] = useState<ListSortKey>("best");

  // Drill-down ↔ overview is route-driven now: /run/... is the shifted state.
  const shifted = location.pathname.startsWith("/run/");

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
      const totals = new Map<string, number>();
      for (const d of DATA) {
        if (!Number.isFinite(d.wall_time_sec) || d.wall_time_sec <= 0) continue;
        const k = `${d.model}|${d.runtime}|${d.quant}|${d.temperature}`;
        totals.set(k, (totals.get(k) ?? 0) + d.wall_time_sec);
      }
      const vals = Array.from(totals.values());
      if (vals.length === 0) return { min: 0, max: 0 };
      return { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) };
    })(),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const isGroupedRunView = groupBy === "model" || groupBy === "modelOnly";

  const sortPrimary: RunSortKey = isRunSortKey(search.sortPrimary) ? search.sortPrimary : "score";
  const sortSecondary: RunSortKey = isRunSortKey(search.sortSecondary) ? search.sortSecondary : "score";

  const filtered = useMemo(
    () => applyVariantFilters(applyFilters(DATA, filters), filters),
    [filters],
  );

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

  // navigate without `to` keeps the user on the current route — important so
  // changing a filter while on /run/... doesn't kick them back to /.
  const setSearchPatch = (patch: Record<string, string | undefined>) =>
    navigate({ search: (s) => ({ ...(s as object), ...patch }) as never });

  const goToBestVariant = (model: string) => {
    const variants = variantsForModel(DATA, model);
    if (variants.length === 0) return;
    navigate({
      to: "/run/$model/$variant",
      params: { model, variant: encodeVariant(variants[0].key) },
    });
  };

  const handleRunClick = (row: RunRow) =>
    navigate({
      to: "/run/$model/$variant",
      params: {
        model: row.baseModel,
        variant: encodeVariant({
          runtime: row.runtime,
          quant: row.quant,
          temperature: row.temperature,
        }),
      },
    });

  const handleLegacyRowClick = (row: ListRow) => {
    if (row.baseModel !== null) { goToBestVariant(row.baseModel); return; }
    if (groupBy === "prompt") {
      // A prompt-name group click: navigate to the variant containing the
      // first record for that prompt and expand the row by name.
      const firstRun = filtered.find((r) => r.prompt_name === row.key);
      if (firstRun) {
        navigate({
          to: "/run/$model/$variant",
          params: {
            model: firstRun.model,
            variant: encodeVariant({
              runtime: firstRun.runtime,
              quant: firstRun.quant,
              temperature: firstRun.temperature,
            }),
          },
          search: { expanded: firstRun.prompt_name } as never,
        });
      }
      return;
    }
    const patch: Record<string, string> =
      groupBy === "tag" ? { tags: row.key } :
      groupBy === "category" ? { category: row.key } : {};
    setSearchPatch(patch);
  };

  const closeDetails = () => navigate({ to: "/", search: (s) => s as never });

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
        <div className={styles.appSubtitle}>
          {DATA.length} runs · {allValues.tags.length} tags · {allValues.runtimes.length} runtimes
        </div>
      </header>
      <ShiftFrame
        shifted={shifted}
        onClose={closeDetails}
        scatter={
          <>
            <Scatter data={filtered} />
            <FilterPanel allValues={allValues} />
          </>
        }
        ranking={ranking}
        details={<Outlet />}
      />
    </div>
  );
}
