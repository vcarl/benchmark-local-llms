import type { BenchmarkResult } from "../lib/data";
import { avgScore, modelsForRuntime } from "../lib/data";
import { scoreColor, textColor } from "../lib/colors";

interface CellSelection {
  model: string;
  category: string;
  tier: number;
  runtime: string;
  quant: string;
}

interface HeatmapTableProps {
  data: BenchmarkResult[];
  runtime: string;
  allModels: string[];
  allCategories: string[];
  allTiers: number[];
  checkedModels: Set<string>;
  showModelNames: boolean;
  onCellClick: (selection: CellSelection) => void;
  bestQuantMap?: Map<string, string>;
}

export type { CellSelection };

export function HeatmapTable({
  data,
  runtime,
  allModels,
  allCategories,
  allTiers,
  checkedModels,
  showModelNames,
  onCellClick,
  bestQuantMap: bestQMap,
}: HeatmapTableProps) {
  const rtModels = modelsForRuntime(data, runtime);

  return (
    <div className="heatmap-panel">
      <h3>{runtime}</h3>
      <table className="heatmap">
        <thead>
          <tr>
            {showModelNames && (
              <th style={{ textAlign: "left", width: "250px" }}>Model</th>
            )}
            <th style={{ width: "40px" }}>Tier</th>
            {allCategories.map((cat) => (
              <th key={cat}>{cat}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allModels
            .filter((model) => checkedModels.has(model))
            .map((model) => {
              const hasData = rtModels.has(model);
              return allTiers.map((tier, tierIdx) => (
                <ModelTierRow
                  key={`${model}-${tier}`}
                  data={data}
                  model={model}
                  runtime={runtime}
                  tier={tier}
                  tierIdx={tierIdx}
                  totalTiers={allTiers.length}
                  allCategories={allCategories}
                  hasData={hasData}
                  showModelNames={showModelNames}
                  onCellClick={onCellClick}
                  bestQuantMap={bestQMap}
                />
              ));
            })}
        </tbody>
      </table>
    </div>
  );
}

interface ModelTierRowProps {
  data: BenchmarkResult[];
  model: string;
  runtime: string;
  tier: number;
  tierIdx: number;
  totalTiers: number;
  allCategories: string[];
  hasData: boolean;
  showModelNames: boolean;
  onCellClick: (selection: CellSelection) => void;
  bestQuantMap?: Map<string, string>;
}

function ModelTierRow({
  data,
  model,
  runtime,
  tier,
  tierIdx,
  totalTiers,
  allCategories,
  hasData,
  showModelNames,
  onCellClick,
  bestQuantMap: bestQMap,
}: ModelTierRowProps) {
  return (
    <>
      <tr className={hasData ? undefined : "greyed-out"}>
        {showModelNames && tierIdx === 0 && (
          <td
            className="model-name"
            rowSpan={totalTiers}
            style={{ verticalAlign: "middle" }}
          >
            {model}
            {(() => {
              const q = bestQMap?.get(model + "|" + runtime);
              if (!q) return null;
              return (
                <span style={{ color: "#9ca3af", fontSize: "0.8em", marginLeft: "4px" }}>
                  {q}
                </span>
              );
            })()}
          </td>
        )}
        <td className="tier-label">{tier}</td>
        {allCategories.map((cat) => {
          const matches = data.filter(
            (d) =>
              d.model === model &&
              d.runtime === runtime &&
              d.tier === tier &&
              d.category === cat,
          );
          if (matches.length === 0) {
            return (
              <td key={cat} className="no-data">
                {"\u2014"}
              </td>
            );
          }
          const avg = avgScore(matches);
          const pct = Math.round(avg * 100);
          return (
            <td
              key={cat}
              style={{
                background: scoreColor(pct),
                color: textColor(pct),
              }}
              onClick={() => onCellClick({ model, category: cat, tier, runtime, quant: bestQMap?.get(model + "|" + runtime) || "" })}
            >
              {pct + "%"}
            </td>
          );
        })}
      </tr>
      {tierIdx === totalTiers - 1 && (
        <tr className="model-separator">
          <td colSpan={allCategories.length + 2} />
        </tr>
      )}
    </>
  );
}
