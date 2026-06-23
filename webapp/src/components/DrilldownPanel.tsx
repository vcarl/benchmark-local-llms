import styles from "./DrilldownPanel.module.css";
import type { BenchmarkResult } from "../lib/data";
import { challengeBreakdown, type RunRow } from "../lib/pipeline";
import { useAttemptDetail } from "../lib/use-attempt-detail";
import { scoreBand } from "../lib/constants";
import { DebugPanel } from "./DebugPanel";
import { ConfigSummaryPanel } from "./ConfigSummaryPanel";

interface Props {
  records: BenchmarkResult[];
  configHash: string;
  // The per-config aggregate for this config, threaded from the same
  // aggregateRuns output that feeds the ranking table (null if not found).
  runRow: RunRow | null;
  attemptId: string | undefined;
  onSelectAttempt: (id: string | undefined) => void;
}

export function DrilldownPanel({ records, configHash, runRow, attemptId, onSelectAttempt }: Props) {
  const rows = challengeBreakdown(records, configHash);
  const detail = useAttemptDetail(attemptId);

  if (rows.length === 0) {
    return <div className={styles.empty}>No challenges for this config.</div>;
  }

  const configRecords = records.filter((r) => r.config_hash === configHash);

  return (
    <div className={styles.panel}>
      {runRow !== null && (
        <ConfigSummaryPanel row={runRow} records={configRecords} breakdown={rows} />
      )}
      {rows.map((row) => {
        const open = row.attemptId === attemptId;
        return (
          <div key={row.challengeKey}>
            <button
              type="button"
              className={styles.challengeRow}
              onClick={() => onSelectAttempt(open ? undefined : row.attemptId)}
            >
              <span className={styles.challengeKey}>{row.challengeKey}</span>
              <span className={styles.challengeCoverage}>{row.passedItems}/{row.itemCount} items</span>
              <span className={styles.challengeScore} style={{ ["--band" as string]: undefined }} data-band={scoreBand(row.passRate)}>
                {(row.passRate * 100).toFixed(0)}%
              </span>
            </button>
            {open && (
              <div className={styles.item}>
                {detail.status === "loading" && <div className={styles.loading}>Loading…</div>}
                {detail.status === "not-found" && (
                  <div className={styles.loading}>No detail available (v1 attempt — re-run as v2 to enable drilldown).</div>
                )}
                {detail.status === "error" && <div className={styles.error}>Failed to load: {detail.message}</div>}
                {detail.status === "loaded" && (
                  <>
                    <DebugPanel record={row.record} items={detail.detail.items} />
                    <div className={styles.itemLabel}>System prompt</div>
                    <div className={styles.itemText}>{detail.detail.system_prompt_text}</div>
                    {detail.detail.items.map((it) => (
                      <div key={it.item_id} className={styles.item}>
                        <div className={styles.itemLabel}>
                          {it.prompt_name} · <span className={styles.itemScore} data-band={scoreBand(it.score)}>score {it.score}</span>
                        </div>
                        <div className={styles.itemLabel}>Prompt</div>
                        <div className={styles.itemText}>{it.prompt_text}</div>
                        <div className={styles.itemLabel}>Output</div>
                        <div className={styles.itemText}>{it.output}</div>
                        <details className={styles.thinking}>
                          <summary className={styles.thinkingSummary}>Thinking</summary>
                          {it.reasoning !== null && it.reasoning !== "" ? (
                            <div className={styles.itemText}>{it.reasoning}</div>
                          ) : (
                            <div className={styles.thinkingEmpty}>No thinking captured</div>
                          )}
                        </details>
                        {it.error !== null && (
                          <>
                            <div className={styles.itemLabel}>Error</div>
                            <div className={styles.itemText}>{it.error}</div>
                          </>
                        )}
                        <div className={styles.itemLabel}>Scorer</div>
                        <div className={styles.itemText}>{JSON.stringify(it.scorer, null, 2)}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
