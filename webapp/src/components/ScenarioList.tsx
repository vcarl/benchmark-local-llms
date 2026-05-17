import { Link } from "@tanstack/react-router";
import styles from "./ScenarioList.module.css";
import type { ScenarioBenchmarkResult } from "../lib/data";

interface Props {
  model: string;
  variantKey: string;
  scenarios: ScenarioBenchmarkResult[];
}

const terminationBand = (
  r: ScenarioBenchmarkResult["termination_reason"],
): "green" | "red" | "yellow" | undefined => {
  if (r === "completed") return "green";
  if (r === "error") return "red";
  if (r === null) return undefined;
  return "yellow";
};

export function ScenarioList({ model, variantKey, scenarios }: Props) {
  if (scenarios.length === 0) {
    return <div className={styles.empty}>No scenarios for this variant</div>;
  }
  return (
    <div className={styles.scenarioList}>
      {scenarios.map((rec) => {
        const name = rec.scenario_name ?? rec.prompt_name;
        return (
          <Link
            key={`${rec.run_id}:${name}`}
            to="/run/$model/$variant/scenarios/$name"
            params={{
              model,
              variant: variantKey,
              name,
            }}
            className={styles.row}
          >
            <span className={styles.scorePill}>
              {rec.value.toFixed(0)}
            </span>
            <span className={styles.name}>{name}</span>
            <span
              className={styles.badge}
              data-band={terminationBand(rec.termination_reason)}
            >
              {rec.termination_reason ?? "—"}
            </span>
            <span className={styles.metric}>
              {rec.tool_call_count !== null ? `${rec.tool_call_count} tools` : "—"}
            </span>
            <span className={styles.metric}>
              {`${Math.round(rec.wall_time_sec)}s`}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
