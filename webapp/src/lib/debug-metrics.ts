import type { AttemptDetailItem } from "./use-attempt-detail";
import type { ChallengeBreakdownRow } from "./pipeline";

export interface ItemTally {
  total: number;
  passed: number;
  wrong: number;
  errored: number;
  // Distinct error messages across errored items, in first-seen order.
  errorMessages: string[];
}

/**
 * Classify attempt-detail items into passed / wrong / errored buckets.
 *
 * - errored: the item has a non-null `error` (a runtime/scoring failure).
 * - passed:  no error AND score > 0.
 * - wrong:   no error AND score <= 0 (the model simply got it wrong).
 *
 * An errored item is never also counted as wrong/passed, even if its score is
 * 0 — the error is the more actionable signal.
 */
export const tallyItems = (items: readonly AttemptDetailItem[]): ItemTally => {
  let passed = 0;
  let wrong = 0;
  let errored = 0;
  const seen = new Set<string>();
  const errorMessages: string[] = [];
  for (const it of items) {
    if (it.error !== null && it.error !== "") {
      errored += 1;
      if (!seen.has(it.error)) {
        seen.add(it.error);
        errorMessages.push(it.error);
      }
    } else if (it.score > 0) {
      passed += 1;
    } else {
      wrong += 1;
    }
  }
  return { total: items.length, passed, wrong, errored, errorMessages };
};

/** Format a wall-time in seconds as a compact human string (e.g. "1m 03s", "4.2s"). */
export const formatWallTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
};

/** Format an ISO-ish timestamp into a readable local string; falls back to the raw value. */
export const formatFinishedAt = (finishedAt: string): string => {
  if (finishedAt === "") return "—";
  const d = new Date(finishedAt);
  if (Number.isNaN(d.getTime())) return finishedAt;
  return d.toLocaleString();
};

// ─── Config-level summary derivations (config drilldown) ─────────────────────

export interface FinishedSpan {
  // null when no parseable timestamps were present.
  earliest: string | null;
  latest: string | null;
}

/**
 * Earliest → latest `finished_at` across a config's records. Compares on the
 * raw ISO strings (lexicographic order matches chronological for the ISO-8601
 * form the harness emits) but only considers non-empty values; returns the
 * original string values (not Date objects) so callers can format them with
 * `formatFinishedAt`. Empty/whitespace-only timestamps are ignored.
 */
export const finishedSpan = (finishedAts: readonly string[]): FinishedSpan => {
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const ts of finishedAts) {
    if (ts === "") continue;
    if (earliest === null || ts < earliest) earliest = ts;
    if (latest === null || ts > latest) latest = ts;
  }
  return { earliest, latest };
};

export interface ChallengeDistribution {
  total: number;
  // passRate === 1 (and itemCount > 0)
  fullyPassed: number;
  // 0 < passRate < 1
  partial: number;
  // passRate === 0 (with at least one item)
  zero: number;
  best: ChallengeBreakdownRow | null;
  worst: ChallengeBreakdownRow | null;
}

/**
 * Summarize per-challenge breakdown rows into a "where is this config strong /
 * weak" distribution: counts of fully-passed (100%) / partial / zero challenges,
 * plus the best and worst challenge by pass rate.
 *
 * Best is the highest pass rate; worst is the lowest. Ties are broken
 * deterministically by `challengeKey` (lexicographic) so repeated calls and
 * snapshot tests are stable. Rows with `itemCount === 0` are still counted in
 * `total` but treated as `zero` (a 0% pass rate) for distribution purposes, and
 * remain eligible for `worst`.
 */
export const challengeDistribution = (
  rows: readonly ChallengeBreakdownRow[],
): ChallengeDistribution => {
  let fullyPassed = 0;
  let partial = 0;
  let zero = 0;
  let best: ChallengeBreakdownRow | null = null;
  let worst: ChallengeBreakdownRow | null = null;
  for (const row of rows) {
    if (row.passRate >= 1) fullyPassed += 1;
    else if (row.passRate > 0) partial += 1;
    else zero += 1;

    if (
      best === null ||
      row.passRate > best.passRate ||
      (row.passRate === best.passRate && row.challengeKey < best.challengeKey)
    ) {
      best = row;
    }
    if (
      worst === null ||
      row.passRate < worst.passRate ||
      (row.passRate === worst.passRate && row.challengeKey < worst.challengeKey)
    ) {
      worst = row;
    }
  }
  return { total: rows.length, fullyPassed, partial, zero, best, worst };
};
