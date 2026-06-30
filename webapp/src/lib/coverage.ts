import type { BenchmarkResult } from "./data";

// ─── Challenge universe (coverage-adjusted scoring) ──────────────────────────
//
// The "universe" is the canonical challenge set derived purely from the records
// in `data.js`: per challenge_id, the highest-version (tie-broken by latest
// finished_at) instance, identified by its content hash. Its summed item count
// is the shared denominator that makes pass rates comparable across configs:
// a challenge a config never ran (or ran at a stale hash) counts as zeros.

// The canonical content hash for a challenge is recovered from the attempt id,
// minted as `att-{configHash}-{challengeHash}-{timestamp}` (see
// `src/orchestration/run-matrix.ts`). `data.js` carries no `challenge_hash`
// field of its own; the third dash-segment is it. If the id format changes,
// this helper's focused unit test fails loudly.
export const parseChallengeHash = (attemptId: string): string =>
  attemptId.split("-")[2] ?? "";

export interface CanonicalChallenge {
  challengeId: string;
  version: number;
  hash: string;
  itemCount: number;
  finishedAt: string;
}

export interface ChallengeUniverse {
  // Keyed by challenge_id.
  challenges: Map<string, CanonicalChallenge>;
  // Σ canonical item_count — the shared denominator.
  totalItems: number;
}

// The canonical record for a challenge is the highest challenge_version seen,
// tie-broken by latest finished_at.
const isMoreCanonical = (candidate: BenchmarkResult, current: BenchmarkResult): boolean =>
  candidate.challenge_version > current.challenge_version ||
  (candidate.challenge_version === current.challenge_version &&
    candidate.finished_at > current.finished_at);

export const buildChallengeUniverse = (records: BenchmarkResult[]): ChallengeUniverse => {
  const canonicalRecord = new Map<string, BenchmarkResult>();
  for (const r of records) {
    const prev = canonicalRecord.get(r.challenge_id);
    if (prev === undefined || isMoreCanonical(r, prev)) canonicalRecord.set(r.challenge_id, r);
  }

  const challenges = new Map<string, CanonicalChallenge>();
  let totalItems = 0;
  for (const [challengeId, r] of canonicalRecord) {
    challenges.set(challengeId, {
      challengeId,
      version: r.challenge_version,
      hash: parseChallengeHash(r.attempt_id),
      itemCount: r.item_count,
      finishedAt: r.finished_at,
    });
    totalItems += r.item_count;
  }
  return { challenges, totalItems };
};

export interface Coverage {
  // Universe challenges this config ran at the canonical hash.
  covered: number;
  // Universe size.
  total: number;
  // Universe challenge ids the config never ran or ran at a stale hash (sorted).
  missing: string[];
  // Σ passed_items over the config's canonical-hash attempts (latest per
  // challenge; re-runs are not double-counted).
  numeratorPassedItems: number;
  // The shared denominator (= universe.totalItems).
  denominatorItems: number;
}

// True when a config ran fewer than the universe's full challenge set (so
// un-run / stale challenges are dragging its adjusted score down with zeros).
// A degenerate empty universe (total 0) is not "incomplete".
export const isIncompleteCoverage = (c: {
  coveredChallenges: number;
  totalChallenges: number;
}): boolean => c.totalChallenges > 0 && c.coveredChallenges < c.totalChallenges;

// Tooltip copy for the incomplete-coverage flag, shared across surfaces so the
// ranking list and config summary can't drift.
export const coverageFlagTitle = (covered: number, total: number): string =>
  `Incomplete coverage: ${covered}/${total} challenges run — un-run and stale challenges scored as 0`;

export const computeCoverage = (
  configRecords: BenchmarkResult[],
  universe: ChallengeUniverse,
): Coverage => {
  // Latest canonical-hash attempt per challenge_id. Stale attempts (challenge
  // ran at a non-canonical hash) and challenges absent from the universe are
  // ignored here, so they fall through to `missing` and contribute nothing to
  // the numerator.
  const canonicalAttempt = new Map<string, BenchmarkResult>();
  for (const r of configRecords) {
    const canon = universe.challenges.get(r.challenge_id);
    if (canon === undefined || parseChallengeHash(r.attempt_id) !== canon.hash) continue;
    const prev = canonicalAttempt.get(r.challenge_id);
    if (prev === undefined || r.finished_at > prev.finished_at) canonicalAttempt.set(r.challenge_id, r);
  }

  let numeratorPassedItems = 0;
  for (const r of canonicalAttempt.values()) numeratorPassedItems += r.passed_items;

  const missing: string[] = [];
  for (const id of universe.challenges.keys()) {
    if (!canonicalAttempt.has(id)) missing.push(id);
  }
  missing.sort();

  return {
    covered: canonicalAttempt.size,
    total: universe.challenges.size,
    missing,
    numeratorPassedItems,
    denominatorItems: universe.totalItems,
  };
};
