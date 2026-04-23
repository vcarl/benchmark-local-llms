import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data-dev";
import { FilterBar, parseFilters, parseSort } from "../components/FilterBar";
import { ResultTable } from "../components/ResultTable";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import type { GroupBy, Row } from "../lib/pipeline";
import { applyFilters, groupRows, aggregate, sortRows } from "../lib/pipeline";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();

  const allValues = useMemo(() => ({
    tags: Array.from(new Set(DATA.flatMap((d) => d.tags))).sort(),
    categories: uniqueSorted(DATA, "category") as string[],
    tiers: (uniqueSorted(DATA, "tier") as number[]).sort((a, b) => a - b),
    runtimes: uniqueSorted(DATA, "runtime") as string[],
    families: Array.from(new Set(DATA.map((d) => modelFamily(d.model)))).sort(),
    sizeRanges: SIZE_RANGES.map((r) => r.label).filter((label) =>
      DATA.some((d) => modelSizeRange(d.model)?.label === label)
    ),
    quants: uniqueSorted(DATA, "quant") as string[],
    temperatures: (uniqueSorted(DATA, "temperature") as number[]).sort((a, b) => a - b),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const sort = parseSort(search.sort);
  const panelModel = search.model;

  const rows: Row[] = useMemo(() => {
    const filtered = applyFilters(DATA, filters);
    const grouped = groupRows(filtered, groupBy);
    const aggregated = aggregate(grouped, groupBy);
    return sortRows(aggregated, sort);
  }, [filters, groupBy, sort]);

  const handleRowClick = (row: Row) => {
    if (groupBy === "model" || groupBy === "modelOnly" || groupBy === "family" || groupBy === "runtime") {
      const model = row.runs[0]?.model;
      if (model) navigate({ to: "/", search: (s) => ({ ...s, model }) as never });
    } else if (groupBy === "prompt") {
      const r = row.runs[0];
      if (r) navigate({ to: "/run/$model/$name", params: { model: r.model, name: r.prompt_name } });
    } else {
      const patch: Record<string, string> =
        groupBy === "tag" ? { tags: row.key } :
        groupBy === "category" ? { category: row.key } : {};
      navigate({ to: "/", search: (s) => ({ ...s, ...patch }) as never });
    }
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
      <ResultTable rows={rows} groupBy={groupBy} onRowClick={handleRowClick} />
      {panelModel !== undefined && panelModel !== "" && (
        <ModelDetailPanel model={panelModel} data={DATA} onClose={closePanel} />
      )}
    </div>
  );
}
