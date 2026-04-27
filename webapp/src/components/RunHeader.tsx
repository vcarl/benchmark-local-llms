import { Link } from "@tanstack/react-router";
import styles from "./RunHeader.module.css";
import { scoreBand } from "../lib/constants";
import type { BenchmarkResult } from "../lib/data";

export function RunHeader({ rec }: { rec: BenchmarkResult }) {
  return (
    <header className={styles.runHeader}>
      <Link to="/" className={styles.runBack}>◂ Back</Link>
      <h1>{rec.model} · {rec.prompt_name}</h1>
      <div className={styles.runMeta}>
        tier {rec.tier} · tags [{rec.tags.join(", ") || "—"}]
        <span className={styles.runScore} data-band={scoreBand(rec.score)}>{rec.score.toFixed(2)}</span>
      </div>
      <div className={styles.runMetaSmall}>
        {rec.runtime} · {rec.quant} · temp {rec.temperature} · {rec.is_scenario ? "scenario" : "prompt"}
      </div>
    </header>
  );
}
