import { useEffect, useState } from "react";
import styles from "./ScenarioView.module.css";
import type { AgentEvent, ScenarioBenchmarkResult } from "../lib/data";
import { EventLog } from "./EventLog";

const terminationBand = (r: ScenarioBenchmarkResult["termination_reason"]): string => {
  if (r === "completed") return "green";
  if (r === "error") return "red";
  return "yellow";
};

type EventsState =
  | { kind: "idle" }                         // record has no events
  | { kind: "loading" }
  | { kind: "ready"; events: AgentEvent[] }
  | { kind: "error"; message: string };

const eventsUrl = (rec: ScenarioBenchmarkResult): string =>
  // base-relative so it works under /benchmark-local-llms/ and at the root
  `./events/${rec.archive_id}__${rec.prompt_name}.json`;

export function ScenarioView({ rec }: { rec: ScenarioBenchmarkResult }) {
  const [state, setState] = useState<EventsState>(() =>
    rec.has_events ? { kind: "loading" } : { kind: "idle" },
  );

  useEffect(() => {
    if (!rec.has_events) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(eventsUrl(rec))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AgentEvent[]>;
      })
      .then((events) => {
        if (!cancelled) setState({ kind: "ready", events });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rec.archive_id, rec.prompt_name, rec.has_events]);

  const events = state.kind === "ready" ? state.events : [];

  return (
    <div className={styles.scenarioView}>
      <section className={`${styles.section} ${styles.scenarioStats}`}>
        <Stat
          label={rec.score_field || "Score"}
          value={rec.value.toFixed(0)}
        />
        <Stat label="Termination" value={rec.termination_reason ?? "—"} bandColor={terminationBand(rec.termination_reason)} />
        <Stat label="Tool calls" value={rec.tool_call_count !== null ? String(rec.tool_call_count) : "—"} />
        <Stat label="Wall time" value={`${rec.wall_time_sec.toFixed(0)}s`} />
      </section>

      {state.kind === "loading" && (
        <section className={styles.section}>
          <h3>Timeline</h3>
          <div style={{ color: "var(--text-muted)" }}>Loading events…</div>
        </section>
      )}

      {state.kind === "error" && (
        <section className={styles.section}>
          <h3>Timeline</h3>
          <div style={{ color: "var(--text-muted)" }}>
            Could not load events: {state.message}
          </div>
        </section>
      )}

      {state.kind === "ready" && events.length > 0 && (
        <section className={styles.section}>
          <h3>Timeline ({events.length} events)</h3>
          <TimelineScrubber events={events} />
        </section>
      )}

      {state.kind === "ready" && events.length > 0 && (
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

function TimelineScrubber({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) return null;
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
