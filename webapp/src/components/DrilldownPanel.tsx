import { useState } from "react";
import styles from "./DrilldownPanel.module.css";
import { formatDiff, variantLine } from "./ModelList";
import { changedCellTitle } from "../lib/errata";
import { RunSpread } from "./RunSpread";
import { scoreBand } from "../lib/constants";
import { describeScorer } from "../lib/describe-scorer";
import { formatCount, formatItemTiming, formatWallTime } from "../lib/format";
import type { Scope, ScopedRow, Tier } from "../lib/model";
import type { Cell, CellStatus, RowsDataset } from "../lib/rows";
import { useAttemptDetail } from "../lib/use-attempt-detail";

interface Props {
  r: ScopedRow;
  /** Every listed run of the same model, `r` included. */
  runs: ScopedRow[];
  dataset: RowsDataset;
  scope: Scope;
  /** The row's list position when it leads an entry; its tier under the score sort. */
  rank: { position: number; tier: Tier | undefined } | undefined;
  /** Cells an erratum changed since `<release>.0` (lib/errata changedCells). */
  changed: Map<string, string[]>;
  attemptId: string | undefined;
  onSelectAttempt: (id: string | undefined) => void;
}

const STATUS: Record<CellStatus, string> = {
  scored: "scored",
  stale_hash: "stale hash — counts as 0",
  interrupted: "interrupted — counts as 0",
  not_run: "not run — counts as 0",
};

const pct = (f: number, d = 1) => `${(f * 100).toFixed(d)}%`;
const day = (iso: string | null) => (iso === null ? "?" : iso.slice(0, 10));
const span = (from: string | null, to: string | null) =>
  from === null ? "—" : day(from) === day(to) ? day(from) : `${day(from)} – ${day(to)}`;
const list = (xs: string[]) => (xs.length === 0 ? "—" : xs.join(", "));

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.debugStat}>
      <span className={styles.debugStatLabel}>{label}</span>
      <span className={styles.debugStatValue}>{value}</span>
    </div>
  );
}

const counts = (c: Cell, scope: Scope): [number, number] =>
  scope.items === "all" ? [c.items, c.passed] : (c.scopes[scope.items] ?? [0, 0]);

export function DrilldownPanel({ r, runs, dataset, scope, rank, changed, attemptId, onSelectAttempt }: Props) {
  const t = rank?.tier;
  const { row } = r;
  // A shared URL with an attempt opens that attempt's challenge.
  const [openCell, setOpenCell] = useState<string | null>(
    () => Object.entries(row.cells).find(([, c]) => attemptId !== undefined && c.sourceAttempts.includes(attemptId))?.[0] ?? null,
  );
  const detail = useAttemptDetail(attemptId);
  const hw = dataset.hardware[row.hardwareId];
  const p = row.provenance;
  const ids = scope.challenges.length === 0 ? Object.keys(row.cells) : scope.challenges;
  const cells = ids.flatMap((id) => {
    const c = row.cells[id];
    return c === undefined || counts(c, scope)[0] === 0 ? [] : [[id, c] as const];
  });

  const scopeSplit = ["core", "stretch"].flatMap((s) => {
    const [n, y] = cells.reduce(([n, y], [, c]) => [n + (c.scopes[s]?.[0] ?? 0), y + (c.scopes[s]?.[1] ?? 0)], [0, 0]);
    return n === 0 ? [] : [`${s} ${pct(y / n, 0)}`];
  });
  const failures = Object.entries(
    cells.reduce<Record<string, number>>((acc, [, c]) => {
      for (const [k, n] of Object.entries(c.failureKinds)) acc[k] = (acc[k] ?? 0) + n;
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => b - a);
  const nearMiss = cells.reduce((s, [, c]) => s + c.nearMissCredit, 0);
  const spanDays =
    row.freshness.executedFrom === null || row.freshness.executedTo === null
      ? 0
      : (Date.parse(row.freshness.executedTo) - Date.parse(row.freshness.executedFrom)) / 86_400_000;
  const mixedWhy = [
    ...(p.runtimeVersions.length > 1 ? ["several runtime builds"] : []),
    ...(p.gitShas.length > 1 ? ["several git shas"] : []),
    ...(spanDays > 7 ? [`executed over ${Math.round(spanDays)} days`] : []),
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{row.modelName}</div>
      <RunSpread rows={runs} scope={scope} />
      <div className={styles.summaryPanel}>
        <div className={styles.subtitle}>Selected run · {variantLine(row, dataset)}</div>

        <div className={styles.debugGroup}>
          <Stat
            label="Pass rate"
            value={
              <span style={{ color: "var(--band)" }} data-band={scoreBand(r.score)}>
                {pct(r.score)}
                {r.ci !== null && ` ± ${(r.ci * 100).toFixed(1)}`}
              </span>
            }
          />
          {!r.complete && (
            <Stat
              label="Partial pass rate"
              value={`${r.running === null ? "—" : pct(r.running)} · ${r.challenges[0]}/${r.challenges[1]}`}
            />
          )}
          {rank !== undefined && (
            <Stat label="Rank" value={`#${rank.position}${t === undefined ? "" : ` · tier ${t.n}`}`} />
          )}
          {t?.vsAbove != null && rank !== undefined && (
            <Stat label={`vs #${rank.position - 1}`} value={`${formatDiff(t.vsAbove)} paired 95% CI`} />
          )}
          {t?.vsHead != null && rank !== undefined && t.ref !== rank.position - 1 && (
            <Stat label={`vs #${t.ref}`} value={`${formatDiff(t.vsHead)} paired 95% CI`} />
          )}
          {r.efficiency !== null && r.tokensPerItem !== null && (
            <Stat label="Efficiency" value={`${(r.efficiency * 100).toFixed(0)} · ${r.tokensPerItem.toFixed(0)} tokens/item`} />
          )}
          <Stat label="Items passed" value={`${formatCount(r.passed)}/${r.items}`} />
          {scopeSplit.length > 0 && <Stat label="Scope" value={scopeSplit.join(" · ")} />}
          {nearMiss > 0 && <Stat label="Near-miss credit" value={formatCount(nearMiss)} />}
        </div>
        {failures.length > 0 && (
          <div className={styles.debugTally}>
            <span className={styles.debugStatLabel}>Failures</span>
            {failures.map(([k, n]) => (
              <span key={k}>
                <span className={styles.debugTallyNum}>{n}</span> {k.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        <div className={styles.debugGroup}>
          <Stat label="Artifact" value={row.artifact} />
          <Stat label="Config" value={`${row.configId} · ${row.configHash}`} />
          {row.variantLabel !== "" && <Stat label="Differs from siblings" value={row.variantLabel} />}
          <Stat
            label="Hardware"
            value={
              hw === undefined
                ? row.hardwareId
                : `${hw.cpu} · ${hw.cpuCores} cores${hw.gpuCores === undefined ? "" : ` · ${hw.gpuCores} GPU cores`} · ${hw.memoryGb} GB · ${hw.os}`
            }
          />
          <Stat label="Contributor" value={list(p.submitters)} />
        </div>

        <div className={styles.debugGroup}>
          <Stat label="Executed" value={<span className={styles.nowrap}>{span(row.freshness.executedFrom, row.freshness.executedTo)}</span>} />
          <Stat label="Runtime" value={list(p.runtimeVersions)} />
          <Stat label="Git sha" value={list(p.gitShas)} />
          <Stat label="Samples / item" value={p.samples === null ? "—" : p.samples[0] === p.samples[1] ? String(p.samples[0]) : `${p.samples[0]}–${p.samples[1]}`} />
          {p.restamped > 0 && <Stat label="Re-stamped cells" value={String(p.restamped)} />}
          {mixedWhy.length > 0 && <Stat label="Mixed" value={mixedWhy.join(" · ")} />}
        </div>
      </div>

      {cells.map(([id, c]) => {
        const [n, y] = counts(c, scope);
        const scored = c.status === "scored";
        const open = openCell === id;
        const errata = changed.get(id);
        return (
          <div key={id}>
            <button
              type="button"
              className={`${styles.challengeRow}${scored ? "" : ` ${styles.challengeRowMissing}`}`}
              onClick={() => {
                if (!scored) return;
                setOpenCell(open ? null : id);
                // Opening a challenge loads its (first) attempt's items straight away.
                onSelectAttempt(open ? undefined : c.sourceAttempts[0]);
              }}
              aria-expanded={scored ? open : undefined}
            >
              <span className={styles.challengeKey}>
                {id}
                {errata !== undefined && (
                  <span className={styles.erratumMark} title={changedCellTitle(errata, dataset.dataset.release ?? "")}>
                    {" "}
                    ✱
                  </span>
                )}
              </span>
              <span className={styles.challengeCoverage}>
                {scored
                  ? [
                      `${formatCount(y)}/${n}`,
                      span(c.executedFrom, c.executedTo),
                      `${c.samples?.[1] ?? 1}×`,
                      list(c.runtimeVersions),
                      ...(c.cost === null ? [] : [formatWallTime(c.cost.wallSec)]),
                    ].map((part, i) => (
                      // Counts and dates stay whole; only the gaps between parts break.
                      <span key={i} className={i === 3 ? undefined : styles.nowrap}>
                        {i > 0 && " · "}
                        {part}
                      </span>
                    ))
                  : STATUS[c.status]}
              </span>
              <span className={styles.challengeScore} data-band={scoreBand(n === 0 ? 0 : y / n)}>
                {pct(n === 0 ? 0 : y / n, 0)}
              </span>
            </button>
            {open && (
              <div className={styles.attempts}>
                {/* Several attempts behind one cell: a switcher; otherwise just the items. */}
                {c.sourceAttempts.length > 1 &&
                  c.sourceAttempts.map((a) => (
                    <button
                      type="button"
                      key={a}
                      className={styles.attempt}
                      aria-pressed={a === attemptId}
                      onClick={() => onSelectAttempt(a)}
                    >
                      {a}
                    </button>
                  ))}
                {attemptId !== undefined && c.sourceAttempts.includes(attemptId) && (
                  <AttemptItems detail={detail} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttemptItems({ detail }: { detail: ReturnType<typeof useAttemptDetail> }) {
  if (detail.status === "loading") return <div className={styles.loading}>Loading…</div>;
  if (detail.status === "not-found") return <div className={styles.loading}>No item detail for this attempt.</div>;
  if (detail.status === "error") return <div className={styles.error}>Failed to load: {detail.message}</div>;
  if (detail.status !== "loaded") return null;
  return (
    <div className={styles.item}>
      <div className={styles.itemLabel}>System prompt</div>
      <div className={styles.itemText}>{detail.detail.system_prompt_text}</div>
      {detail.detail.items.map((it) => (
        <div key={it.item_id} className={styles.item}>
          <div className={styles.itemLabel}>
            {it.prompt_name} ·{" "}
            <span className={styles.itemScore} data-band={scoreBand(it.score)}>
              score {it.score}
            </span>
            {it.samples !== undefined && ` · ${it.samples[0]}/${it.samples[1]} samples`}
          </div>
          {it.timing !== undefined && <div className={styles.itemLabel}>{formatItemTiming(it.timing)}</div>}
          <div className={styles.itemLabel}>Prompt</div>
          <div className={styles.itemText}>{it.prompt_text}</div>
          <div className={styles.itemLabel}>Output</div>
          <div className={`${styles.itemText} ${styles.scrollText}`}>{it.output}</div>
          <details className={styles.thinking}>
            <summary className={styles.thinkingSummary}>Thinking</summary>
            {it.reasoning !== null && it.reasoning !== "" ? (
              <div className={`${styles.itemText} ${styles.scrollText}`}>{it.reasoning}</div>
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
          {describeScorer(it.scorer, it.breakdown)}
        </div>
      ))}
    </div>
  );
}
