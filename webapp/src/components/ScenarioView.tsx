import styles from "./ScenarioView.module.css";
import type { BenchmarkResult } from "../lib/data";
import { EventLog } from "./EventLog";

const terminationBand = (r: BenchmarkResult["termination_reason"]): string => {
  if (r === "completed") return "green";
  if (r === "error") return "red";
  return "yellow";
};

export function ScenarioView({ rec }: { rec: BenchmarkResult }) {
  const events = rec.events ?? [];
  return (
    <div className={styles.scenarioView}>
      <section className={`${styles.section} ${styles.scenarioStats}`}>
        <Stat label="Score" value={rec.score.toFixed(2)} />
        <Stat label="Termination" value={rec.termination_reason ?? "—"} bandColor={terminationBand(rec.termination_reason)} />
        <Stat label="Tool calls" value={rec.tool_call_count !== null ? String(rec.tool_call_count) : "—"} />
        <Stat label="Wall time" value={`${rec.wall_time_sec.toFixed(0)}s`} />
      </section>

      {events.length > 0 && (
        <section className={styles.section}>
          <h3>Timeline ({events.length} events)</h3>
          <TimelineScrubber events={events} />
        </section>
      )}

      {events.length > 0 && (
        <section className={styles.section}>
          <h3>Event log</h3>
          <EventLog events={events} />
        </section>
      )}

      {rec.final_player_stats !== null && (
        <section className={styles.section}>
          <h3>Final player stats</h3>
          <pre className={styles.runText}>{JSON.stringify(rec.final_player_stats, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, bandColor }: { label: string; value: string; bandColor?: string }) {
  return (
    <div className={styles.scenarioStat}>
      <div className={styles.scenarioStatLabel}>{label}</div>
      <div className={styles.scenarioStatValue} data-band={bandColor}>{value}</div>
    </div>
  );
}

function TimelineScrubber({ events }: { events: BenchmarkResult["events"] }) {
  if (events === null || events.length === 0) return null;
  const typeColor = (t: string) =>
    t === "tool_error" ? "#fb923c"
      : t === "error" ? "#ef4444"
      : t === "turn_end" ? "#666"
      : t === "connection" ? "#60a5fa"
      : "#4ade80";
  return (
    <div className={styles.timeline}>
      {events.map((e, i) => (
        <div
          key={i}
          className={styles.timelineTick}
          style={{
            left: `${(i / Math.max(events.length - 1, 1)) * 100}%`,
            background: typeColor(e.event),
          }}
          title={`t=${e.tick} ${e.event}`}
        />
      ))}
    </div>
  );
}
