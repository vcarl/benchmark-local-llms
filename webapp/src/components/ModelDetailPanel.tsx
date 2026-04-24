import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { BenchmarkResult } from "../lib/data";
import { PASS_THRESHOLD, CAPABILITY_TAGS, scoreBand } from "../lib/constants";

interface Props {
  model: string;
  data: BenchmarkResult[];
  onClose: () => void;
}

export function ModelDetailPanel({ model, data, onClose }: Props) {
  const [tab, setTab] = useState<"all" | "prompts" | "scenarios">("all");
  const navigate = useNavigate();

  const runs = useMemo(() => data.filter((d) => d.model === model), [data, model]);
  const filtered = useMemo(() => {
    if (tab === "prompts") return runs.filter((r) => !r.is_scenario);
    if (tab === "scenarios") return runs.filter((r) => r.is_scenario);
    return runs;
  }, [runs, tab]);

  const mean = runs.length === 0 ? 0 : runs.reduce((s, r) => s + r.score, 0) / runs.length;
  const pass = runs.length === 0 ? 0 : runs.filter((r) => r.score >= PASS_THRESHOLD).length / runs.length;

  // Mean per capability tag across this model's runs.
  const profile = useMemo(() => {
    const byTag = new Map<string, number[]>();
    for (const r of runs) for (const t of r.tags) {
      const a = byTag.get(t); if (a) a.push(r.score); else byTag.set(t, [r.score]);
    }
    const out: Record<string, { mean: number; count: number }> = {};
    for (const [t, ss] of byTag) out[t] = { mean: ss.reduce((s, v) => s + v, 0) / ss.length, count: ss.length };
    return out;
  }, [runs]);

  const first = runs[0];

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside className="model-panel">
        <header className="model-panel-header">
          <button className="panel-close" onClick={onClose} aria-label="close">×</button>
          <h2>{model}</h2>
          {first && <div className="panel-subtitle">{first.runtime} · {first.quant} · temp {first.temperature}</div>}
          <div className="panel-metrics">
            <span className={`cap-${scoreBand(mean)}`}>score {mean.toFixed(2)}</span>
            <span>pass {Math.round(pass * 100)}%</span>
          </div>
        </header>

        <section className="panel-section">
          <h3>Capability profile</h3>
          <div className="panel-profile">
            {CAPABILITY_TAGS.map((tag) => {
              const cell = profile[tag];
              return (
                <div key={tag} className="panel-profile-row">
                  <span className="panel-profile-name">{tag}</span>
                  <div className="panel-profile-bar">
                    {cell !== undefined && (
                      <div
                        className={`cap-${scoreBand(cell.mean)}`}
                        style={{ width: `${Math.round(cell.mean * 100)}%`, height: "100%" }}
                      />
                    )}
                  </div>
                  <span className="panel-profile-value">
                    {cell !== undefined ? cell.mean.toFixed(2) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-tabs">
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All ({runs.length})</button>
            <button className={tab === "prompts" ? "active" : ""} onClick={() => setTab("prompts")}>Prompts</button>
            <button className={tab === "scenarios" ? "active" : ""} onClick={() => setTab("scenarios")}>Scenarios</button>
          </div>
          <div className="panel-runs" key={tab}>
            {filtered.map((r) => (
              <button
                key={`${r.prompt_name}·${r.temperature}·${r.quant}·${r.runtime}`}
                className="panel-run"
                onClick={() => navigate({ to: "/run/$model/$name", params: { model, name: r.prompt_name } })}
              >
                <span>{r.prompt_name}</span>
                <span className="panel-run-tier">t{r.tier}</span>
                <span className={`cap-${scoreBand(r.score)} panel-run-score`}>{r.score.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
