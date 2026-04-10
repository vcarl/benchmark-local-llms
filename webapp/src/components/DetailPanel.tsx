import type { BenchmarkResult } from "../lib/data";
import { avgScore, groupBy } from "../lib/data";
import { scoreColor, textColor } from "../lib/colors";
import type { CellSelection } from "./HeatmapTable";

interface DetailPanelProps {
  selection: CellSelection | null;
  data: BenchmarkResult[];
}

export function DetailPanel({ selection, data }: DetailPanelProps) {
  if (!selection) {
    return (
      <div className="detail-panel">
        <div className="detail-placeholder">Click a cell to see details</div>
      </div>
    );
  }

  const matches = data.filter(
    (d) =>
      d.model === selection.model &&
      d.runtime === selection.runtime &&
      d.tier === selection.tier &&
      d.category === selection.category,
  );

  if (matches.length === 0) {
    return (
      <div className="detail-panel">
        <div className="detail-placeholder">
          No data for this combination
        </div>
      </div>
    );
  }

  const byStyle = groupBy(matches, (d) => d.style);
  const styles = Object.keys(byStyle).sort();

  return (
    <div className="detail-panel">
      <div className="detail-title">
        {selection.model} &mdash; {selection.category} &mdash; Tier{" "}
        {selection.tier} &mdash; {selection.runtime}
      </div>

      {/* Bar chart by style */}
      <div className="bar-chart">
        {styles.map((style) => {
          const items = byStyle[style];
          const avg = avgScore(items);
          const pct = Math.round(avg * 100);
          return (
            <div key={style} className="bar-row">
              <div className="bar-label">{style || "default"}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: Math.max(pct, 2) + "%",
                    background: scoreColor(pct),
                    color: textColor(pct),
                  }}
                >
                  {pct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual prompt results */}
      <div className="prompt-results">
        <h4>Individual Results</h4>
        {matches.map((d) => {
          const pct = Math.round(d.score * 100);
          return (
            <div key={d.prompt_name}>
              <div className="prompt-result-row">
                <div className="prompt-result-name">{d.prompt_name}</div>
                <div
                  className="prompt-result-score"
                  style={{ color: scoreColor(pct) }}
                >
                  {pct}%
                </div>
                <div className="prompt-result-details">
                  {d.score_details}
                </div>
              </div>
              {d.prompt_text && (
                <div className="prompt-result-prompt">{d.prompt_text}</div>
              )}
              {d.output && (
                <div className="prompt-result-output">{d.output}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
