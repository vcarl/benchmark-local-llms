import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { DATA, uniqueSorted } from "../lib/data";
import type { CellSelection } from "../components/HeatmapTable";
import { ModelSelector } from "../components/ModelSelector";
import { ScatterPlot } from "../components/ScatterPlot";
import { Leaderboard } from "../components/Leaderboard";
import { HeatmapTable } from "../components/HeatmapTable";
import { DetailPanel } from "../components/DetailPanel";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const allModels = useMemo(() => uniqueSorted(DATA, "model") as string[], []);
  const allCategories = useMemo(
    () => uniqueSorted(DATA, "category") as string[],
    [],
  );
  const allTiers = useMemo(
    () => (uniqueSorted(DATA, "tier") as number[]).sort((a, b) => a - b),
    [],
  );
  const runtimes = useMemo(
    () => uniqueSorted(DATA, "runtime") as string[],
    [],
  );

  const [checkedModels, setCheckedModels] = useState(() => new Set(allModels));
  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);

  const handleModelChange = useCallback(
    (model: string, checked: boolean) => {
      setCheckedModels((prev) => {
        const next = new Set(prev);
        if (checked) next.add(model);
        else next.delete(model);
        return next;
      });
    },
    [],
  );

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      setCheckedModels(selected ? new Set(allModels) : new Set());
    },
    [allModels],
  );

  const filteredData = useMemo(
    () => DATA.filter((d) => checkedModels.has(d.model)),
    [checkedModels],
  );

  return (
    <>
      <div className="header">Benchmark Analysis</div>
      <ModelSelector
        allModels={allModels}
        checkedModels={checkedModels}
        onChange={handleModelChange}
        onSelectAll={handleSelectAll}
      />
      <div className="content">
        <div className="summary-charts">
          <ScatterPlot data={filteredData} />
          <Leaderboard data={filteredData} />
        </div>
        <div className="heatmaps-scroll">
          <div className="heatmaps-row">
            {runtimes.map((rt, idx) => (
              <HeatmapTable
                key={rt}
                data={DATA}
                runtime={rt}
                allModels={allModels}
                allCategories={allCategories}
                allTiers={allTiers}
                checkedModels={checkedModels}
                showModelNames={idx === 0}
                onCellClick={setSelectedCell}
              />
            ))}
          </div>
        </div>
        <DetailPanel selection={selectedCell} data={DATA} />
      </div>
    </>
  );
}
