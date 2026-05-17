import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import styles from "./ModelDetailPanel.module.css";
import type { BenchmarkResult } from "../lib/data";
import { PASS_THRESHOLD, CAPABILITY_TAGS, scoreBand } from "../lib/constants";

interface Props {
  model: string;
  data: BenchmarkResult[];
}

export function ModelDetailPanel({ model, data }: Props) {
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
    <aside className={styles.modelPanel}>
      <header className={styles.modelPanelHeader}>
        <h2>{model}</h2>
        {first && <div className={styles.panelSubtitle}>{first.runtime} · {first.quant} · temp {first.temperature}</div>}
        <div className={styles.panelMetrics}>
          <span data-band={scoreBand(mean)}>score {mean.toFixed(2)}</span>
          <span>pass {Math.round(pass * 100)}%</span>
        </div>
      </header>

      <section className={styles.panelSection}>
        <h3>Capability profile</h3>
        <div className={styles.panelProfile}>
          {CAPABILITY_TAGS.map((tag) => {
            const cell = profile[tag];
            return (
              <div key={tag} className={styles.panelProfileRow}>
                <span className={styles.panelProfileName}>{tag}</span>
                <div className={styles.panelProfileBar}>
                  {cell !== undefined && (
                    <div
                      className={styles.panelProfileBarFill}
                      data-band={scoreBand(cell.mean)}
                      style={{ width: `${Math.round(cell.mean * 100)}%`, height: "100%" }}
                    />
                  )}
                </div>
                <span className={styles.panelProfileValue}>
                  {cell !== undefined ? cell.mean.toFixed(2) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.panelSection}>
        <div className={styles.panelTabs}>
          <button className={tab === "all" ? styles.tabActive : ""} onClick={() => setTab("all")}>All ({runs.length})</button>
          <button className={tab === "prompts" ? styles.tabActive : ""} onClick={() => setTab("prompts")}>Prompts</button>
          <button className={tab === "scenarios" ? styles.tabActive : ""} onClick={() => setTab("scenarios")}>Scenarios</button>
        </div>
        <div className={styles.panelRuns} key={tab}>
          {filtered.map((r) => (
            <button
              key={`${r.prompt_name}·${r.temperature}·${r.quant}·${r.runtime}`}
              className={styles.panelRun}
              onClick={() => navigate({ to: "/run/$model/$name", params: { model, name: r.prompt_name } })}
            >
              <span>{r.prompt_name}</span>
              <span className={styles.panelRunTier}>t{r.tier}</span>
              <span className={styles.panelRunScore} data-band={scoreBand(r.score)}>{r.score.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
