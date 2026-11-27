# Coverage-adjusted scoring (webapp)

**Date:** 2026-06-30
**Status:** Approved, ready to implement
**Scope:** Webapp display layer only. No changes to runs, the report generator, the archive format, or the `data.js` contract.

## Problem

The headline score in the webapp is a pass rate over the challenges a config actually ran. A config that ran only a subset of challenges (e.g. 104 of 171) and scored 82% on that subset is shown as 82% — ranking it alongside or above configs that completed the full set. Incomplete coverage is invisible and effectively rewarded.

We want incomplete configs penalized: un-run (and stale) challenges count as a score of 0, so scores reflect performance against the full current challenge set and become directly comparable across configs.

## Decisions (locked)

1. **Adjusted replaces raw.** The coverage-adjusted score becomes the headline everywhere (scatter Y-axis, ranking list, config summary). There is no separate raw-subset score surface. Coverage count is shown as *context*, not as a second score.
2. **Denominator = union of challenges seen in the data.** Derived purely from `data.js`; no on-disk catalog, no report/pipeline change. A challenge that no config has ever run does not exist in the universe and penalizes nobody.
3. **Item-weighted.** Keep the existing item-level pass-rate metric; extend its denominator with the items of missing challenges as zeros. (Equals the naive `rate × ran/total` only when challenges have equal item counts.)
4. **Stale counts as missing.** Coverage is keyed on the challenge *content hash*. A config that ran an older version/hash of a challenge is not credited for the current one.

## Metric

For every config, the denominator is the **same fixed total** — the summed item count of the canonical challenge set (the "universe"):

```
adjusted_passRate(config) =  Σ passed_items over the config's *canonical-hash* attempts
                            ──────────────────────────────────────────────────────────
                              Σ canonical item_count over all challenges in the universe
```

Properties:
- Identical denominator across configs ⇒ scores are directly comparable.
- A never-run challenge contributes 0 to the numerator and its `item_count` to the denominator.
- A **stale** attempt (challenge ran at a non-canonical hash) is excluded from the numerator; the challenge's canonical `item_count` still sits in the denominator as zeros. Stale attempts are never double-counted.
- A config that ran every challenge at its canonical hash yields exactly today's pass rate.
- Sanity check: uniform item counts, 82% on 104 of 171 → `0.82·104 / 171 = 49.9%`.

**Efficiency metric is unchanged** — it remains a measure of completed work, not coverage.

## The challenge universe — `webapp/src/lib/coverage.ts` (new)

Pure functions, fully unit-tested, derived only from existing `WebappRecord`s.

### `parseChallengeHash(attempt_id: string): string`
`attempt_id` has the form `att-{configHash}-{challengeHash}-{timestamp}` (12-hex segments, numeric timestamp, no internal dashes). Extract the third segment as the challenge content hash. `data.js` does not carry `challenge_hash` as its own field, so we recover it here.

> **Coupling note:** this depends on the `attemptId` format minted in `src/orchestration/run-matrix.ts`. The helper has a focused unit test; if the id format ever changes, that test fails loudly. (Alternative considered and deferred: add a `challenge_hash` field to the report contract — rejected to keep the change strictly webapp-side.)

### `buildChallengeUniverse(records): ChallengeUniverse`
Over the full record set (subject to the challenge-filter scoping rule below), compute for each `challenge_id`:
- **canonical version** = highest `challenge_version` seen, tie-broken by latest `finished_at`;
- **canonical hash** = the `parseChallengeHash` of a record at that canonical version/finished_at;
- **canonical item_count** = the `item_count` of that canonical record (stable per hash).

Returns the per-challenge canonical map plus `totalItems` (Σ canonical item_count) — the shared denominator.

### `computeCoverage(configRecords, universe)`
Returns, for one config: covered challenge count, total challenge count (`universe` size), the list of missing challenge ids (never-run + stale), `numeratorPassedItems` (Σ `passed_items` over the config's canonical-hash attempts), and `denominatorItems` (= `universe.totalItems`).

## Wiring

- `computeConfigScores` (`webapp/src/lib/pipeline.ts`) gains the `universe` as an input and returns the adjusted `passRate` using the formula above. Because this is the single aggregation point feeding `aggregateRuns` / `computeScatterPoints`, the adjusted value flows automatically to all headline surfaces.
- The universe is computed **once** from the full `DATA` near the top of the data pipeline (e.g. in `__root.tsx` alongside the existing derived lists) and threaded down. It is **not** recomputed per filtered view.

## Display

- **Scatter Y-axis, ranking list, config summary:** show adjusted `passRate`. No code change beyond the new metric value flowing through.
- **Coverage indicator:** the existing "`N challenges`" line becomes `covered / total challenges (current)` (e.g. `104 / 171 challenges`). Context, not a score.
- **Drilldown:** the per-config challenge breakdown gains rows for missing/stale challenges, rendered as `0%` and labeled "not run" or "stale — counts as 0", so the source of the penalty is visible.

## Filter interaction

- The universe **respects the active challenge filter** but is **independent of config and other filters.** Filtering to "economics" recomputes the universe (and therefore the denominator and coverage) within economics; hiding configs never changes the denominator.
- Implementation: build the universe from all records whose challenge passes the active challenge-filter, ignoring config selection.

## Testing

Unit tests (vitest, colocated `*.test.ts`):
- `parseChallengeHash`: well-formed id, and that it ignores the numeric timestamp tail.
- `buildChallengeUniverse`: canonical selection by max version; tie-break by `finished_at`; `totalItems` sum.
- `computeCoverage` / adjusted `computeConfigScores`:
  - full coverage ⇒ unchanged pass rate;
  - never-run challenge ⇒ penalized by its item share;
  - stale attempt ⇒ excluded from numerator, counted as missing, no double-count;
  - non-uniform item counts weight larger challenges more;
  - the 82%/104/171 uniform case ⇒ 49.9%;
  - challenge-filter scoping: universe shrinks to filtered challenges; config filter does not change it.

## Out of scope

Report generator, archive format, `data.js` contract, run/selection logic, the efficiency metric, and any on-disk challenge catalog.
