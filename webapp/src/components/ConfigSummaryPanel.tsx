import styles from "./DrilldownPanel.module.css";
import type { BenchmarkResult } from "../lib/data";
import type { ChallengeBreakdownRow, RunRow } from "../lib/pipeline";
import {
  challengeDistribution,
  finishedSpan,
  formatFinishedAt,
  formatWallTime,
} from "../lib/debug-metrics";
import { formatEfficiency, scoreBand } from "../lib/constants";

interface Props {
  // The per-config aggregate threaded from the ranking table's aggregateRuns
  // output — guarantees the headline numbers match the ranking row exactly.
  row: RunRow;
  // The config's BenchmarkResult records (already filtered to this config_hash).
  records: BenchmarkResult[];
  // The per-challenge breakdown rows the drilldown already computed.
  breakdown: ChallengeBreakdownRow[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.debugStat}>
      <span className={styles.debugStatLabel}>{label}</span>
      <span className={styles.debugStatValue}>{value}</span>
    </div>
  );
}

function BandStat({ label, value, rate }: { label: string; value: string; rate: number }) {
  return (
    <div className={styles.debugStat}>
      <span className={styles.debugStatLabel}>{label}</span>
      <span className={styles.debugStatValue} style={{ color: "var(--band)" }} data-band={scoreBand(rate)}>
        {value}
      </span>
    </div>
  );
}

const SYSTEM_PROMPT_INLINE_MAX = 160;

export function ConfigSummaryPanel({ row, records, breakdown }: Props) {
  // passed_items summed straight from records so the headline matches the same
  // source the ranking row aggregated from (RunRow exposes only passRate +
  // itemCount, not passedItems).
  const passedItems = records.reduce((s, r) => s + r.passed_items, 0);
  const passPct = row.itemCount === 0 ? 0 : (passedItems / row.itemCount) * 100;

  const span = finishedSpan(records.map((r) => r.finished_at));
  const dist = challengeDistribution(breakdown);

  const head = records[0];
  const systemPrompt = head?.system_prompt ?? "";
  const maxTokens = head?.max_tokens ?? 0;
  const longPrompt = systemPrompt.length > SYSTEM_PROMPT_INLINE_MAX;

  return (
    <div className={styles.summaryPanel}>
      <div className={styles.itemLabel}>Config summary</div>

      {/* Identity */}
      <div className={styles.debugGroup}>
        <Stat label="Artifact" value={row.artifact || "—"} />
        <Stat label="Family" value={row.family || "—"} />
        <Stat label="Runtime" value={row.runtime || "—"} />
        <Stat label="Quant" value={row.quant ?? "—"} />
        <Stat label="Temperature" value={String(row.temperature)} />
        <Stat label="Max tokens" value={maxTokens.toLocaleString()} />
        <Stat label="Config hash" value={row.config_hash || "—"} />
      </div>

      {/* Overall outcome */}
      <div className={styles.debugGroup}>
        <BandStat
          label="Pass rate"
          rate={row.passRate}
          value={`${(row.passRate * 100).toFixed(1)}% (${passedItems}/${row.itemCount} items)`}
        />
        <Stat
          label="Challenges fully passed"
          value={`${dist.fullyPassed}/${dist.total}`}
        />
        <Stat label="Partial" value={String(dist.partial)} />
        <Stat label="Zero" value={String(dist.zero)} />
        <Stat label="Efficiency" value={formatEfficiency(row.efficiency)} />
      </div>

      {/* Coverage */}
      <div className={styles.debugGroup}>
        <Stat label="Distinct challenges" value={String(row.uniqueChallenges)} />
        <Stat label="Attempts completed" value={String(row.attemptsCompleted)} />
        <Stat
          label="First finished"
          value={span.earliest === null ? "—" : formatFinishedAt(span.earliest)}
        />
        <Stat
          label="Last finished"
          value={span.latest === null ? "—" : formatFinishedAt(span.latest)}
        />
      </div>

      {/* Throughput / size */}
      <div className={styles.debugGroup}>
        <Stat label="Gen tokens" value={row.tokens.toLocaleString()} />
        <Stat label="Mean gen tok/s" value={row.genTps.toFixed(1)} />
      </div>

      {/* Resources / time */}
      <div className={styles.debugGroup}>
        <Stat label="Peak memory" value={`${row.mem.toFixed(2)} GB`} />
        <Stat label="Total wall time" value={formatWallTime(row.wallTime)} />
      </div>

      {/* Challenge distribution: strong / weak signal */}
      <div className={styles.debugGroup}>
        {dist.best !== null && (
          <BandStat
            label="Best challenge"
            rate={dist.best.passRate}
            value={`${dist.best.challengeKey} (${(dist.best.passRate * 100).toFixed(0)}%)`}
          />
        )}
        {dist.worst !== null && (
          <BandStat
            label="Worst challenge"
            rate={dist.worst.passRate}
            value={`${dist.worst.challengeKey} (${(dist.worst.passRate * 100).toFixed(0)}%)`}
          />
        )}
      </div>

      <div className={styles.debugTally}>
        <span className={styles.debugStatLabel}>Distribution</span>
        <span className={styles.debugTallyNum}>{dist.total} challenges</span>
        <span>· {dist.fullyPassed} fully passed</span>
        <span>· {dist.partial} partial</span>
        <span>· {dist.zero} at 0%</span>
      </div>

      {/* System prompt (config-level context) */}
      {systemPrompt === "" ? null : longPrompt ? (
        <details className={styles.thinking}>
          <summary className={styles.thinkingSummary}>System prompt</summary>
          <div className={styles.itemText}>{systemPrompt}</div>
        </details>
      ) : (
        <>
          <div className={styles.itemLabel}>System prompt</div>
          <div className={styles.itemText}>{systemPrompt}</div>
        </>
      )}
    </div>
  );
}
