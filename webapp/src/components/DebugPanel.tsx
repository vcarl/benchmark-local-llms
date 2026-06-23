import styles from "./DrilldownPanel.module.css";
import type { BenchmarkResult } from "../lib/data";
import type { AttemptDetailItem } from "../lib/use-attempt-detail";
import { formatFinishedAt, formatWallTime, tallyItems } from "../lib/debug-metrics";
import { scoreBand } from "../lib/constants";

interface Props {
  // The matched BenchmarkResult for the expanded attempt; null when no record
  // was found (renders a graceful "metrics unavailable" state).
  record: BenchmarkResult | null;
  items: readonly AttemptDetailItem[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.debugStat}>
      <span className={styles.debugStatLabel}>{label}</span>
      <span className={styles.debugStatValue}>{value}</span>
    </div>
  );
}

export function DebugPanel({ record, items }: Props) {
  const tally = tallyItems(items);

  return (
    <div className={styles.debugPanel}>
      <div className={styles.itemLabel}>Debug</div>

      {record === null ? (
        <div className={styles.debugUnavailable}>
          Runtime metrics unavailable for this attempt.
        </div>
      ) : (
        <>
          {/* Outcome */}
          <div className={styles.debugGroup}>
            <Stat
              label="Items passed"
              value={`${record.passed_items}/${record.item_count} (${
                record.item_count === 0
                  ? "0"
                  : ((record.passed_items / record.item_count) * 100).toFixed(0)
              }%)`}
            />
            <Stat label="Score" value={record.score.toFixed(3)} />
            <div className={styles.debugStat}>
              <span className={styles.debugStatLabel}>Result</span>
              <span
                className={styles.debugStatValue}
                style={{ color: `var(--band)` }}
                data-band={scoreBand(record.passed ? 1 : 0)}
              >
                {record.passed ? "PASS" : "FAIL"}
              </span>
            </div>
          </div>

          {/* Throughput / size */}
          <div className={styles.debugGroup}>
            <Stat label="Gen tokens" value={record.generation_tokens.toLocaleString()} />
            <Stat label="Gen tok/s" value={record.generation_tps.toFixed(1)} />
            {record.prompt_tps > 0 && (
              <Stat label="Prompt tok/s" value={record.prompt_tps.toFixed(1)} />
            )}
          </div>

          {/* Resources / time */}
          <div className={styles.debugGroup}>
            <Stat label="Wall time" value={formatWallTime(record.wall_time_sec)} />
            <Stat label="Peak memory" value={`${record.peak_memory_gb.toFixed(2)} GB`} />
          </div>

          {/* Config */}
          <div className={styles.debugGroup}>
            <Stat label="Temperature" value={String(record.temperature)} />
            <Stat label="Runtime" value={record.runtime || "—"} />
            <Stat label="Quant" value={record.quant ?? "—"} />
            <Stat label="Max tokens" value={record.max_tokens.toLocaleString()} />
          </div>

          {/* Provenance */}
          <div className={styles.debugGroup}>
            <Stat label="Finished" value={formatFinishedAt(record.finished_at)} />
            <Stat label="Artifact" value={record.artifact || "—"} />
            <Stat
              label="Challenge"
              value={`${record.challenge_id}@${record.challenge_version}`}
            />
          </div>
        </>
      )}

      {/* Errors summary (always available from loaded items) */}
      <div className={styles.debugTally}>
        <span className={styles.debugStatLabel}>Errors</span>
        <span className={styles.debugTallyNum}>{tally.total} items</span>
        <span>· {tally.passed} passed</span>
        <span>· {tally.wrong} wrong</span>
        <span>· {tally.errored} errored</span>
      </div>
      {tally.errorMessages.length > 0 && (
        <div className={styles.debugErrors}>
          <div className={styles.itemLabel}>Error messages</div>
          {tally.errorMessages.map((msg) => (
            <div key={msg} className={styles.itemText}>
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
