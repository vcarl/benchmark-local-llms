# Webapp Parity Dashboard — Design

**Date:** 2026-06-19
**Branch:** `challenge-config-reframe` (UNMERGED; stacks on the archival-reconstruction work @ `0a107bf`)
**Predecessor specs:** `2026-06-19-phase-3-report-webapp-design.md`, `2026-06-19-archival-reconstruction-content-store-design.md`

## 1. Goal

Restore the model-comparison dashboard that Phase 3 reduced to a bare leaderboard, rewired to the current **per-attempt (config × challenge)** data model and enriched with fields the v2 archive now carries. Three UI deliverables, hardest first, plus the leaderboard columns:

1. **Scatter** — the signature view: cost (x) vs. quality (y), one dot per config, colored by family.
2. **Filters** — by family / runtime / quant / temperature / challenge, **recomputing** the scatter, matrix, and the two scores over the selected records.
3. **Per-item drilldown** — prompt / system / output / per-item score / scorer text, newly possible from the v2 archive. In-page expand with **URL state** (shareable, no new route).
4. **Leaderboard columns** — surface the new enriched fields on the existing `RunGroupTable`.

This is the downstream payoff of the archival-reconstruction work: `reconstruct.ts:loadAttemptReconstruction` already yields full per-item content from a v2 archive alone, and `ItemResult` already carries `peakMemoryGb` / `promptTps` / `generationTps`. The backend just doesn't surface any of it yet.

## 2. Scope decisions (resolved in brainstorming)

| Decision | Choice |
| --- | --- |
| Per-item wire format | **Lazy per-attempt files** — one JSON per attempt, keyed by `attempt_id`, fetched on drilldown open. |
| Build/validation data | **Fresh v2 from one small model** — generate clean v2 archives; ignore the v1 pile. |
| Filter behavior | **Recompute from selection** — filtered record set drives scatter + matrix + both scores. |
| Drilldown UI | **In-page expand/panel with URL state** — TanStack Router search params, no `run.$model.$variant` route revival. |

Out of scope (carried from kickoff): scenario views (`ScenarioView`/`ScenarioList`/scenario routing — removed harness-wide); model `params` in the archive (`modelSizeB(artifact)` suffices); any change to hashing (golden `challengeHash 71c5f440ce49` must not move); merging the branch (single eventual merge via `finishing-a-development-branch`).

## 3. Backend: enrich the contract

### 3.1 `WebappRecord` / `BenchmarkResult` new fields

Add three attempt-grain fields to `WebappRecord` (`src/report/webapp-contract.ts`) and mirror them **field-for-field** into `BenchmarkResult` + `normalizeRecord` (`webapp/src/lib/data.ts`) — the field-for-field identity is a standing cross-task invariant.

| Field | Type | Aggregation in `toWebappRecord` (over the attempt's `ItemResult[]`) |
| --- | --- | --- |
| `peak_memory_gb` | `number` | **max** of `item.peakMemoryGb` (a memory ceiling is the meaningful number; `0` if no items) |
| `generation_tps` | `number` | **mean** of `item.generationTps`, rounded to 2dp (`0` if no items) |
| `prompt_tps` | `number` | **mean** of `item.promptTps`, rounded to 2dp (`0` if no items) |

`family` is **not** stored — the webapp derives it from `artifact` via the existing `modelFamily()`. `params` is **not** added — `modelSizeB(artifact)` covers the leaderboard/scatter size encoding, and params isn't in the archive.

`toWebappRecord` already sums `generation_tokens` / `wall_time_sec` the same way; the three additions mirror that loop. One new backend test asserts the max/mean aggregation on a multi-item fixture.

### 3.2 Per-item detail channel (lazy files)

A new report output: for each **completed, deduped, v2** attempt, emit `webapp/public/details/<attempt_id>.json`. Static-asset path (`public/`) so the built webapp and dev server can `fetch()` it lazily by `attempt_id`. Shape:

```jsonc
{
  "attempt_id": "...",
  "config_id": "...", "config_hash": "...",
  "artifact": "...", "challenge_id": "...", "challenge_version": 1,
  "system_prompt_text": "...",
  "items": [
    {
      "item_id": "...", "prompt_name": "...",
      "prompt_text": "...", "output": "...", "reasoning": null,
      "score": 1, "error": null,
      "scorer": { /* ScorerConfig as stored */ }
    }
  ]
}
```

Built by a new `write-details.ts` writer that, per completed attempt, calls `loadAttemptReconstruction(file)` (gives `systemPromptText` + per-item `promptText` + `scorer`) and joins it with the in-memory `ItemResult` fields (`output`, `reasoning`, `score`, `error`). This requires threading the **source file path** through `loadAttemptArchives` → `aggregateAttempts` so the writer knows which file to reconstruct (currently the loaded attempt doesn't carry its path). v1 attempts (`loadAttemptReconstruction` rejects them) are **skipped gracefully**: the record still appears in `data.js`, the drilldown is simply unavailable for it.

`runReport` gains a step after `writeDataJs`; `ReportSummary` gains `detailsWritten: number` and `detailsSkipped: number`. Wiring is additive — the matrix/scores path is untouched. Tests: a detail-writer test on a v2 fixture (correct shape + content), and a v1-skip test.

## 4. Webapp: scatter

One dot **per config** (`config_hash`), aggregated from that config's attempts. New pure function `computeScatterPoints(records): ScatterPoint[]` in `pipeline.ts`:

```ts
interface ScatterPoint {
  config_hash: string; artifact: string; family: string;
  runtime: string; quant: string | null; temperature: number;
  x: number;          // Σ generation_tokens  (cost)
  y: number;          // passRate 0..1        (quality)
  efficiency: number | null;
  sizeB: number | null;   // modelSizeB(artifact)
  peak_memory_gb: number; // max over the config's attempts
  generation_tps: number; // mean over the config's attempts
}
```

**Encoding (default, flagged for review):** X = Σ generation tokens (log scale) = cost; Y = pass-rate = quality; color = `familyColor(family)`; dot size = `modelSizeB(artifact)` (constant fallback when null); tooltip carries efficiency, peak memory, tps, config identity. Efficiency is the derived diagonal of this cost/quality plane. Hand-rolled SVG (no charting lib — **no new runtime deps**), rewired from the deleted `Scatter.tsx` but simplified: the old opacity=tps / star-points=wallTime / per-model trajectories encodings are **deferred** (re-add only if the review wants them). `lib/colors.ts` is rebuilt family-keyed (palette recovered from `1bc370e`), depending on `modelFamily()`. `ScatterLegend` rebuilt for the family + size encodings actually used.

> **Review flag:** the scatter encoding is the most visual / iterable piece. The default above (tokens-x / passRate-y / family-color / size-by-params) is a starting point; an axis toggle (tokens ↔ efficiency ↔ wall-time) is an easy follow-on if wanted.

## 5. Webapp: filters

Rebuild the filter layer Phase 3 deleted (`filter-state.ts`, `applyFilters`, `FilterPanel.tsx`), rewired to the per-attempt shape. Dimensions:

- **family** (multi-select) — derived via `modelFamily(artifact)`
- **runtime** (multi-select)
- **quant** (multi-select; `null` shown as "—")
- **temperature** (multi-select over observed values)
- **challenge** (multi-select over `challenge_id`)

Dropped vs. the old panel: `tags`, `category`, `scenario` (gone from the harness), and the params/duration range sliders (deferred — add back only if needed). All filter state lives in **TanStack Router search params** on the root route (CSV per dimension, omitted when a dimension is unconstrained). `applyFilters(records, search)` narrows the record set; the root route feeds the filtered records into `aggregateMatrix` **and** `computeScatterPoints`, so both views and the two scores recompute over the selection. Pure-function tests for `applyFilters` and the recompute path.

## 6. Webapp: per-item drilldown

In-page expand, no new route. Two levels of URL-tracked expansion via root-route search params:

- `?config=<config_hash>` — expand a leaderboard row to list its attempts (per challenge).
- `?attempt=<attempt_id>` — expand an attempt to show its items.

On `?attempt` set, the component `fetch()`es `/details/<attempt_id>.json` (lazy; cached in component state), then renders the per-item list: prompt text, system prompt, output, reasoning, per-item score (via `scoreBand`), scorer config, and error. A new `DrilldownPanel.tsx` + a small `useAttemptDetail(attempt_id)` fetch hook. Loading / not-found (v1 attempt, no detail file) states are handled explicitly. Because state is in the URL, an expanded view is shareable and survives reload. `ShiftFrame` is retained for the expand transition (already wired in `__root`).

## 7. Webapp: leaderboard columns

`RunGroupTable` / `RunRowItem` already render challenge columns + Pass% + Efficiency. Add columns surfacing the new fields: **Peak mem (GB)**, **Gen tok/s**, **Size (B)** (`modelSizeB`), and a **family** chip/color on the artifact group header. Pure display additions; no aggregation changes beyond reading the new record fields.

## 8. Data prerequisite (do early)

Generate the build/validation dataset fresh as **v2** from one small model (ignore the 266 v1 archives). Use `./bench submit` over the real 6-challenge set. The scatter and leaderboard are per-config, so a single config yields a single dot — run a small **fan of configs of the same model** (e.g. 2–3 temperatures and/or system prompts) to populate several scatter points and several leaderboard rows. Then `./bench report` to (re)generate `data.js` + `public/details/`. Confirm `schemaVersion: 2` and `scorerHash` present in the regenerated archives, and that detail files materialize. The UI code is written for arbitrary families/configs; this dataset is sparse-but-real and exists to validate structure, not to be the final benchmark.

> The exact config fan and model are an operator choice at implementation time; default to the `/qa` Tier-B small model (Qwen2.5-0.5B Q4_K_M) at ~3 temperatures across the 6 challenges. Cost is small (one tiny model); cross-run cache won't help across distinct temperatures since outputs differ.

## 9. Sequencing (for the plan)

Backend is the contract the UI consumes, so it lands first:

1. `WebappRecord` + `BenchmarkResult` enrichment (§3.1) — three fields, mirrored both sides.
2. Per-item detail channel (§3.2) — file-path threading + `write-details.ts` + `runReport` wiring.
3. Data prerequisite (§8) — regenerate `data.js` + `public/details/` so steps 4–7 build against real enriched data.
4. Scatter (§4) — `computeScatterPoints`, `colors.ts`, `Scatter`, `ScatterLegend`.
5. Filters (§5) — `filter-state`, `applyFilters`, `FilterPanel`, root-route wiring + recompute.
6. Drilldown (§6) — detail fetch hook + `DrilldownPanel` + URL state.
7. Leaderboard columns (§7) — display-only.

## 10. Testing & conventions

- Pure functions get vitest `*.test.ts` (in the combined root `npm test` count): `toWebappRecord` enrichment, detail-writer shape + v1-skip, `computeScatterPoints`, `applyFilters` + recompute. `.tsx` is eyeballed (webapp is Biome-excluded and has no `.test.tsx`).
- **No new runtime deps** — scatter stays hand-rolled SVG.
- Biome bans `!` and `throw` in non-test `src/`; `lint-strict.sh` bans `try/catch` even in `*.test.ts` (use Effect channels / vitest lifecycle hooks). `FileIOError` needs `{path, operation, cause}`. `Runtime` literals `"llamacpp"`/`"mlx"`.
- Don't perturb hashing (golden `challengeHash 71c5f440ce49`).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Final whole-branch review on opus; on **any** adversarial-review failure, STOP and escalate via AskUserQuestion (standing directive).

## 11. Out of scope / deferred

Scenario views; model `params` in the archive; scatter opacity/star-point/trajectory encodings; params/duration range filters; the 266 v1 archives (left in place, drilldown-unavailable, until/unless re-run). Windows path-join hardening in the content store (macOS/Linux/mlx-only harness).
