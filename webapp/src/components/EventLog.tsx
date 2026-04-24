import { useState } from "react";
import type { AgentEvent } from "../lib/data";

const TYPES: AgentEvent["event"][] = ["tool_call", "tool_result", "tool_error", "turn_end", "error", "connection"];

export function EventLog({ events }: { events: AgentEvent[] }) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(TYPES));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const visible = events.filter((e) => enabled.has(e.event));
  const toggleType = (t: string) => {
    const next = new Set(enabled);
    if (next.has(t)) next.delete(t); else next.add(t);
    setEnabled(next);
  };
  const toggleRow = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i); else next.add(i);
    setExpanded(next);
  };

  return (
    <div className="event-log">
      <div className="event-filters">
        {TYPES.map((t) => (
          <label key={t}>
            <input type="checkbox" checked={enabled.has(t)} onChange={() => toggleType(t)} />
            {t}
          </label>
        ))}
        <span className="event-count">{visible.length} / {events.length} events</span>
      </div>
      <div className="event-rows">
        {visible.map((e, i) => (
          <div key={i} className={`event-row event-${e.event}`} onClick={() => toggleRow(i)}>
            <span className="event-tick">t={e.tick}</span>
            <span className="event-type">{e.event}</span>
            <span className="event-summary">{summarize(e)}</span>
            {expanded.has(i) && (
              <pre className="event-data">{JSON.stringify(e.data, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const summarize = (e: AgentEvent): string => {
  if (e.data === null || typeof e.data !== "object") return "";
  const d = e.data as Record<string, unknown>;
  if ("tool" in d) return String(d.tool);
  if ("message" in d) return String(d.message).slice(0, 80);
  const keys = Object.keys(d);
  return keys.length === 0 ? "" : `{${keys.join(", ")}}`;
};
