import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data-dev";
import { FilterBar, parseFilters } from "../components/FilterBar";
import { ResultTable, type ListSortKey } from "../components/ResultTable";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import { Scatter } from "../components/Scatter";
import type { GroupBy, ListRow } from "../lib/pipeline";
import { applyFilters, aggregateForList } from "../lib/pipeline";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<ListSortKey>("best");

  const allValues = useMemo(() => ({
    tags: Array.from(new Set(DATA.flatMap((d) => d.tags))).sort(),
    categories: uniqueSorted(DATA, "category") as string[],
    tiers: (uniqueSorted(DATA, "tier") as number[]).sort((a, b) => a - b),
    runtimes: uniqueSorted(DATA, "runtime") as string[],
    families: Array.from(new Set(DATA.map((d) => modelFamily(d.model)))).sort(),
    sizeRanges: SIZE_RANGES.map((r) => r.label).filter((label) =>
      DATA.some((d) => modelSizeRange(d.model)?.label === label),
    ),
    quants: uniqueSorted(DATA, "quant") as string[],
    temperatures: (uniqueSorted(DATA, "temperature") as number[]).sort((a, b) => a - b),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const panelModel = search.model;

  const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

  const rows: ListRow[] = useMemo(
    () => aggregateForList(filtered, groupBy),
    [filtered, groupBy],
  );

  const handleRowClick = (row: ListRow) => {
    if (row.baseModel !== null) {
      navigate({ to: "/", search: (s) => ({ ...s, model: row.baseModel }) as never });
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
    navigate({ to: "/", search: (s) => ({ ...s, ...patch }) as never });
  };

  const closePanel = () =>
    navigate({ to: "/", search: (s) => { const { model: _, ...rest } = s as Record<string, unknown>; return rest as never; } });

  return (
    <div className="app">
      <header className="app-header">
        <h1>Benchmark Analysis</h1>
        <div className="app-subtitle">{DATA.length} runs · {allValues.tags.length} tags · {allValues.runtimes.length} runtimes</div>
      </header>
      <FilterBar allValues={allValues} />
      <Scatter data={filtered} />
      <ResultTable rows={rows} sortKey={sortKey} onSortChange={setSortKey} onRowClick={handleRowClick} />
      {panelModel !== undefined && panelModel !== "" && (
        <ModelDetailPanel model={panelModel} data={DATA} onClose={closePanel} />
      )}
    </div>
  );
}
