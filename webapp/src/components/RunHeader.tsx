import { Link } from "@tanstack/react-router";
import { scoreBand } from "../lib/constants";
import type { BenchmarkResult } from "../lib/data";

export function RunHeader({ rec }: { rec: BenchmarkResult }) {
  return (
    <header className="run-header">
      <Link to="/" className="run-back">◂ Back</Link>
      <h1>{rec.model} · {rec.prompt_name}</h1>
      <div className="run-meta">
        tier {rec.tier} · tags [{rec.tags.join(", ") || "—"}]
        <span className={`run-score cap-${scoreBand(rec.score)}`}>{rec.score.toFixed(2)}</span>
      </div>
      <div className="run-meta-small">
        {rec.runtime} · {rec.quant} · temp {rec.temperature} · {rec.is_scenario ? "scenario" : "prompt"}
      </div>
    </header>
  );
}
