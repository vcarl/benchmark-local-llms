# Phase 3 — Report/webapp re-axis

> Status: design approved 2026-06-19. Builds on the Challenge × Configuration reframe
> (`docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`, §"Report + webapp")
> and Phase 2 (real challenge set). Branch: `challenge-config-reframe` (Phase 0–2 complete,
> 664 tests green, unmerged — Phase 3 stacks on the same branch).

## Problem

`./bench submit` writes per-attempt archives in the new `AttemptManifest` + `ItemResult` format,
but **the report/webapp layer cannot read them.** Everything in `src/report/`
(`load-archives.ts` → `aggregate.ts` → `toWebappRecord`) is built around the legacy
`RunManifest`/`ExecutionResult` format and is keyed on the **model** axis. A `submit`-written
archive fails schema decode and is silently counted as a load issue. The webapp groups runs by
model variant; there is no notion of a configuration attempting a challenge.

Phase 3 re-axes the report and webapp onto the new entity model: **configuration rows × challenge
columns**, with two configuration-level scores (pass rate + efficiency), reading the new attempt
archives.

## Goals

- The report ingests the new `AttemptManifest`/`ItemResult` attempt archives.
- The webapp presents **configuration rows × challenge columns**: each cell is a config's result on
  a challenge; each row carries a **pass rate** and an **efficiency score**.
- Config rows are grouped under their model/artifact (expand/collapse), preserving the existing
  table UX re-keyed from model to artifact.
- The two scores are computed per the foundational spec's "Two configuration-level scores" section.

## Non-goals

- **Per-config / per-item drill-down detail view.** The matrix + scores ship this phase; clicking a
  row only expands/collapses its group. The detail view (a config's attempts and per-item rows) is a
  deferred follow-on. (Consequence: the entire `/run/$model/$variant/*` route subtree is removed, not
  re-keyed.)
- **Scatter view re-axis.** The existing model-variant scatter aggregation is removed from the
  re-axed path; a config efficiency-vs-pass scatter is a later concern.
- **Scenario / game support.** The new `ItemResult` format has no scenario fields and v1 challenges
  exclude the 3 game prompts. The `ScenarioWebappRecord` arm, `write-events.ts` side-files, and
  scenario routes are dropped. (Re-add the scenario arm if game challenges return; the Phase 0–1
  scenario code remains in git history.)
- **Legacy-archive migration.** The ~259 old `ExecutionResult` archives are dropped (clean break).
  The legacy read path is retired, not dual-maintained.
- **Cache/resume** (Phase 4).

## Design

### Decisions (resolved during brainstorming)

1. **Clean-break ingestion** — the report reads ONLY new attempt archives; the
   `RunManifest`/`ExecutionResult` read path is retired.
2. **Single prompt-record contract** — no scenario union arm.
3. **Config rows grouped under artifact** — nested, expand/collapse, mirroring today's model groups.
4. **Cell = best attempt; row score = honest pooled rate** — the grid is a best-case capability
   matrix; the row Pass % is the pooled attempt-level rate, so flakiness still surfaces at the row
   level (consistent with the project's pass-rate-is-signal stance). This cell/row divergence is
   **intentional**, not a bug.
5. **Matrix-only this phase** — per-config detail deferred (see Non-goals).

### Source format (input — already exists, Phase 0–1)

`AttemptManifest` (`src/schema/attempt.ts:37`) — one `.jsonl` per `(config × challenge)` attempt;
line 1 is the manifest header, lines 2..N are `ItemResult` records. Default archive dir
`benchmark-archive/`. Relevant fields:

- *Config identity (denormalized):* `configId`, `configHash`, `artifact` (NOT `model`), `runtime`,
  `quant` (optional), `temperature`, `systemPrompt` (the key/name, not text), `maxTokens`.
- *Challenge identity:* `challengeId`, `challengeVersion`, `challengeHash`.
- *Lifecycle:* `attemptId`, `startedAt`, `finishedAt` (`null` until finalized), `interrupted`
  (`true` until finalized), `env` provenance.
- *Aggregate* (filled at finalize): `{ score: number, passed: boolean }`.

`ItemResult` (`src/schema/attempt.ts:6`) — per body line: `itemId`, `promptName`, `promptHash`,
`executedAt`, `promptTokens`, `generationTokens`, `promptTps`, `generationTps`, `peakMemoryGb`,
`wallTimeSec`, `output`, `reasoning`, `rawOutput`, `error`, `score`. **`generationTokens` and
`wallTimeSec` are per-item** — the efficiency inputs are summed across body lines (no per-attempt
wall-time aggregate exists in the manifest).

### Part A — Webapp contract (`src/report/webapp-contract.ts` + `webapp/src/lib/data.ts` mirror)

**Grain changes from per-item to per-attempt.** The matrix and both scores need only attempt-level
data; per-item data is omitted (detail deferred). One `WebappRecord` per **completed attempt**.

`WebappRecord` (single shape — the `ScenarioWebappRecord` arm is removed):

| Field | Type | Source |
|---|---|---|
| `configId` | string | manifest |
| `configHash` | string | manifest |
| `artifact` | string | manifest |
| `runtime` | string | manifest |
| `quant` | string \| null | manifest (optional) |
| `temperature` | number | manifest |
| `systemPrompt` | string | manifest |
| `maxTokens` | number | manifest |
| `challengeId` | string | manifest |
| `challengeVersion` | number | manifest |
| `attemptId` | string | manifest |
| `finishedAt` | string | manifest |
| `score` | number | manifest `aggregate.score` |
| `passed` | boolean | manifest `aggregate.passed` |
| `generationTokens` | number | Σ `ItemResult.generationTokens` |
| `wallTimeSec` | number | Σ `ItemResult.wallTimeSec` |
| `itemCount` | number | count of `ItemResult` lines |
| `passedItems` | number | count of `ItemResult` with `score === 1` |

`itemCount`/`passedItems` support cell banding/tooltips and a future detail view at low cost.

**Completed-attempt filter:** only attempts with `finishedAt !== null`, `interrupted === false`, and
no attempt-level error are emitted. Unfinalized/interrupted attempts are dropped at ingestion.

`webapp/src/lib/data.ts`'s mirror types (`CommonBenchmarkFields` / `PromptBenchmarkResult` /
`normalizeRecord`) are updated to match this shape; the scenario mirror is removed.

### Part B — Ingestion (`src/report/`)

- **New `loadAttemptArchives(dir)`** (replaces the `RunManifest` path in `load-archives.ts`):
  for each `.jsonl`, decode line 1 as `AttemptManifest` and the rest as `ItemResult`. Skip files
  that fail decode, collecting them as `issues` (same as today). No prompt-corpus cross-reference is
  required — the manifest already carries challenge identity and the aggregate.
- **New aggregate step** (replaces `aggregate.ts`'s corpus-matching loop): for each completed
  attempt, sum `generationTokens` and `wallTimeSec` over its `ItemResult` lines, read the aggregate
  from the manifest, and emit one `WebappRecord`. Drop incomplete attempts. Dedup by `attemptId`.
- **Retire:** the `RunManifest`/`ExecutionResult` decoders in the report path, the corpus-match
  logic, and `write-events.ts` (no scenario event side-files). `src/archive/loader.ts`'s
  legacy decoders may remain if still used elsewhere, but the report no longer calls them.
- `writeDataJs` (emits `webapp/src/data/data.js` as `globalThis.__BENCHMARK_DATA = [...]`) is
  unchanged except for the new record shape.

### Part C — Pipeline + two scores (`webapp/src/lib/pipeline.ts`)

- **Rows** keyed by `configHash` (one row per configuration). **Columns** = the sorted set of
  `challengeId`s present in the data.
- **Cell (config × challenge) = best attempt:** among that config's completed attempts of that
  challenge, the one with the highest `score` (its `passed`/`score` is shown). Empty cell if the
  config has no completed attempt of that challenge.
- **Grouping:** replace `groupRunsByModel` with grouping by `artifact`; each group is an
  expand/collapse unit (re-keyed from `baseModel`). Drop `run_id` from all variant/group keys
  (config identity is stable across bench runs; attempts pool).
- **Per-config scores**, computed over that config's **completed attempts** across all challenges:
  1. **Pass rate** = `(# attempts passed) / (# attempts completed)`, 0–1, rendered as %.
  2. **Efficiency score** (foundational spec §"Two configuration-level scores"):
     ```
     (percentCorrect × uniqueChallengesCompleted × totalAttemptsCompleted)
     ─────────────────────────────────────────────────────────────────────
                       (overallTokens × timeSpent)
     ```
     - `percentCorrect` = the pass rate above (attempts passed / completed).
     - `uniqueChallengesCompleted` = distinct `(challengeId, challengeVersion)` with ≥1 completed
       attempt.
     - `totalAttemptsCompleted` = count of completed attempts.
     - `overallTokens` = Σ `generationTokens` over all items of all completed attempts (prompt tokens
       not counted).
     - `timeSpent` = Σ `wallTimeSec` over all completed attempts.
     - **Zero-denominator guard:** `overallTokens × timeSpent === 0` → render `—` (matches the
       existing `peakMemoryGb === 0 → —` convention), never `NaN`/`∞`.
     - **Display scaling** is presentation-only (raw value is tiny): scale by a constant (e.g. ×10⁶)
       so values are readable for ranking. Not part of the stored contract.

`isPass` (`score === 1`, per-item) in `webapp/src/lib/constants.ts` is retained for the
`passedItems` count; challenge cells use the stored attempt `passed`.

### Part D — UI render (`webapp/src/components/`, `webapp/src/routes/`)

- **`__root.tsx`:** swap the `aggregateForRunList` + `groupRunsByModel` calls for the new config-axis
  aggregator. The row-click handler expands/collapses the group (no navigation).
- **`RunGroupTable`:** group header = artifact (expand/collapse keyed on artifact, was `baseModel`);
  the "N models · M runs" label becomes "N artifacts · M configs" (or similar). Columns = challenge
  columns + a **Pass %** column + an **Efficiency** column.
- **`RunRowItem` (config row):** identity cell shows the config's distinguishing fields
  (`quant · temperature · systemPrompt`); challenge cells render best-attempt pass/score, color-banded
  via `scoreBand`; Pass % and Efficiency columns at the right; Efficiency shows `—` on zero
  denominator.
- **Remove:** the scenario routes and the `/run/$model/$variant/*` detail route subtree;
  `RunHeader`/`run-summary.ts`'s model-variant detail wiring (or stub to the deferred detail).
  `VariantKey`/`variantsForModel` are detail-pane specific and removed with the routes.

### Component / file responsibilities

- `src/report/webapp-contract.ts` — define the single `WebappRecord`; `toWebappRecord(manifest,
  items)` producing one record per completed attempt with summed efficiency inputs.
- `src/report/load-attempts.ts` (new, replacing the report's use of `load-archives.ts`) — decode
  attempt `.jsonl` files into `{ manifest, items }`, collect issues.
- `src/report/aggregate.ts` — map completed attempts → `WebappRecord[]`, dedup by `attemptId`.
- `src/report/index.ts` — wire loader → aggregate → `writeDataJs`; drop `writeEventFiles`.
- `webapp/src/lib/data.ts` — mirror types + `normalizeRecord` for the new shape.
- `webapp/src/lib/pipeline.ts` — config-axis aggregation, matrix build, two-score computation,
  artifact grouping.
- `webapp/src/components/RunGroupTable.tsx`, `RunRowItem.tsx`, `webapp/src/routes/__root.tsx` —
  render the matrix; remove scenario/detail routes.

## Testing

- **Ingestion:** decode a fixture attempt archive (header + item lines) → one `WebappRecord` with
  correct summed `generationTokens`/`wallTimeSec`; an unfinalized/interrupted attempt is dropped; a
  malformed line becomes an issue, not a crash.
- **Contract:** `toWebappRecord` emits the new shape; the scenario arm is gone.
- **Pipeline:** config grouping under artifact; best-attempt cell selection (highest score wins over
  more-recent); Pass % = pooled passed/completed; Efficiency formula incl. zero-denominator → `—`;
  `run_id` no longer in keys.
- **UI:** re-fixtured `RunGroupTable`/`RunRowItem` tests for artifact groups + challenge columns +
  two score columns; removed `groupRunsByModel` and scenario tests.
- Full suite green; lint + typecheck clean (both root and `webapp/`).

## Phasing within Phase 3

Sequential (each depends on the prior's contract):

1. **3a — Contract + ingestion (backend):** new `WebappRecord`, `loadAttemptArchives`, aggregate,
   retire legacy read path + event files, emit `data.js`. Unit-tested against fixture archives.
2. **3b — Pipeline + two scores (webapp lib):** config-axis aggregation, matrix, both scores.
3. **3c — UI render:** table re-axis, artifact grouping, score columns, remove scenario/detail routes.

(The foundational kickoff allowed 3d-UI to fork from a frozen contract; with a single execution
pipeline, strict sequencing 3a→3b→3c is simpler and avoids a contract-drift race.)

## Risks

- **Contract grain change (per-item → per-attempt)** ripples through `webapp/src/lib/data.ts` and
  every consumer of the old record fields. Mitigation: 3a freezes the new shape first; the webapp
  lib/UI build against it.
- **Efficiency-score correctness** (units, zero guard, what counts as "completed"). Mitigation:
  explicit unit tests over the formula with hand-computed expected values, including the zero-
  denominator and single-attempt cases.
- **Dead code from removals** (scenario arm, detail routes, legacy decoders). Mitigation: the final
  whole-branch review checks for orphaned exports/tests left behind by the clean break.
