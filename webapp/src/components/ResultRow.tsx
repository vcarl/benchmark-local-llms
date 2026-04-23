import { CapabilityBar } from "./CapabilityBar";
import type { Row } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";
import type { GroupBy } from "../lib/pipeline";

interface Props {
  row: Row;
  groupBy: GroupBy;
  onClick: () => void;
}

const showProfile = (by: GroupBy): boolean =>
  by === "model" || by === "modelOnly" || by === "family" || by === "runtime";

export function ResultRow({ row, groupBy, onClick }: Props) {
  return (
    <div className="result-row" onClick={onClick} role="button">
      <div className="result-label">{row.label}</div>
      <div className="result-profile">
        {showProfile(groupBy) ? (
          <CapabilityBar profile={row.capabilityProfile} />
        ) : (
          <TopModels runs={row.runs} />
        )}
      </div>
      <div className={`result-score cap-${scoreBand(row.meanScore)}`}>
        {row.meanScore.toFixed(2)}
      </div>
      <div className="result-pass">{Math.round(row.passRate * 100)}%</div>
      <div className="result-arrow">▸</div>
    </div>
  );
}

// When grouping by tag/category/prompt, the profile bar is replaced by
// a mini-list of the top 3 models inside this group.
function TopModels({ runs }: { runs: Row["runs"] }) {
  const byModel = new Map<string, { sum: number; count: number }>();
  for (const r of runs) {
    const prev = byModel.get(r.model);
    if (prev) { prev.sum += r.score; prev.count += 1; }
    else byModel.set(r.model, { sum: r.score, count: 1 });
  }
  const top = Array.from(byModel.entries())
    .map(([m, v]) => ({ model: m, mean: v.sum / v.count }))
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 3);
  return (
    <div className="top-models">
      {top.map((t) => (
        <span key={t.model} className={`top-model cap-${scoreBand(t.mean)}`}>
          {t.model} · {t.mean.toFixed(2)}
        </span>
      ))}
    </div>
  );
}
