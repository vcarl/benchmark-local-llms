# Webapp Parity Dashboard — Design

**Date:** 2026-06-19
**Branch:** `challenge-config-reframe` (UNMERGED; stacks on the archival-reconstruction work @ `0a107bf`)
**Predecessor specs:** `2026-06-19-phase-3-report-webapp-design.md`, `2026-06-19-archival-reconstruction-content-store-design.md`
**Recovery reference:** the original dashboard @ git `1bc370e` (rewire, don't paste).

## 1. Goal

Restore the model-comparison dashboard that Phase 3 reduced, rewired to the current **per-attempt (config × challenge)** data model and enriched with fields the v2 archive now carries. The work is fundamentally a **recovery** of the design at `1bc370e`, not a clean-sheet redesign — adapt the original to the new data shape and new fields, preserving its appearance and information density.

Deliverables:

1. **Aggregate leaderboard** — restore the original ranked, grouped leaderboard (lead row + collapsible variants, family-colored bar, stats block, two-axis sort). **Replaces** the Phase-3 per-challenge matrix.
2. **Scatter** — restore the cost-vs-quality scatter: Σ tokens (x, log) vs. pass-rate (y), one dot per config, colored by family.
3. **Filters** — restore the filter panel, rewired to the per-attempt dimensions, **recomputing** the scatter, leaderboard, and the two scores over the selection.
4. **Per-item drilldown** — newly possible from the v2 archive: prompt / system / output / per-item score / scorer text, plus the **per-challenge breakdown** (which the leaderboard no longer carries). In-page expand with **URL state** (shareable, no new route).

### Why the matrix goes

The per-challenge matrix (`RunGroupTable` with one column per `challenge_id`) was *introduced* in Phase 3; it was never part of the original design. It hard-codes the assumption that the challenge set is small, fixed, and uniformly run across models. The moment challenges are added, **revised (version bumps)**, or run on different model subsets, a wide matrix goes sparse and misleading. The challenge set must be free to grow and churn while different models run different subsets — so the primary views aggregate across whatever challenges are present, and per-challenge detail is on-demand in the drilldown.

## 2. Scope decisions (resolved in brainstorming)

| Decision | Choice |
| --- | --- |
| Leaderboard structure | **Restore the original aggregate leaderboard** (`1bc370e`); **drop** the Phase-3 per-challenge matrix. |
| Headline pass-rate grain | **Pooled over items** — `Σ passed_items / Σ item_count` across the config's attempts. Stays comparable as the challenge set churns. |
| Challenge revisions | **Distinct `(challenge_id, version)`, show all** — never pooled across versions; surfaced in the drilldown breakdown and the challenge filter. |
| Per-item wire format | **Lazy per-attempt files** — one JSON per attempt, keyed by `attempt_id`, fetched on drilldown open. |
| Build/validation data | **Fresh v2 from one small model** — generate clean v2 archives; ignore the v1 pile. |
| Filter behavior | **Recompute from selection** — filtered record set drives scatter + leaderboard + both scores. |
| Drilldown UI | **In-page expand/panel with URL state** — TanStack Router search params, no `run.$model.$variant` route revival. |

Out of scope: scenario views (`ScenarioView`/`ScenarioList`/scenario routing — removed harness-wide); model `params` in the archive (`modelSizeB(artifact)` suffices); any change to hashing (golden `challengeHash 71c5f440ce49` must not move); merging the branch (single eventual merge via `finishing-a-development-branch`).

## 3. Backend: enrich the contract

### 3.1 `WebappRecord` / `BenchmarkResult` new fields

The original leaderboard's stats block showed tokens · gen-tps · mem · wall-time; tokens and wall-time already exist on the record, so restoring it needs two new attempt-grain fields (plus `prompt_tps` for completeness). Add to `WebappRecord` (`src/report/webapp-contract.ts`) and mirror **field-for-field** into `BenchmarkResult` + `normalizeRecord` (`webapp/src/lib/data.ts`) — the field-for-field identity is a standing cross-task invariant.

| Field | Type | Aggregation in `toWebappRecord` (over the attempt's `ItemResult[]`) |
| --- | --- | --- |
| `peak_memory_gb` | `number` | **max** of `item.peakMemoryGb` (a memory ceiling is the meaningful number; `0` if no items) |
| `generation_tps` | `number` | **mean** of `item.generationTps`, rounded 2dp (`0` if no items) |
| `prompt_tps` | `number` | **mean** of `item.promptTps`, rounded 2dp (`0` if no items) |

`family` is **not** stored — the webapp derives it from `artifact` via the existing `modelFamily()` (and `familyColor()`). `params` is **not** added — `modelSizeB(artifact)` covers the size encoding, and params isn't in the archive. `passed_items` / `item_count` already exist and now drive the pooled pass-rate (§4.1). `toWebappRecord` already sums `generation_tokens` / `wall_time_sec`; the additions mirror that loop. One new backend test asserts max/mean on a multi-item fixture.

### 3.2 Per-item detail channel (lazy files)

For each **completed, deduped, v2** attempt, emit `webapp/public/details/<attempt_id>.json` (static-asset path so the built app and dev server `fetch()` it lazily). Shape:

```jsonc
{
  "attempt_id": "...",
  "config_id": "...", "config_hash": "...",
  "artifact": "...", "challenge_id": "...", "challenge_version": 1,
  "system_prompt_text": "...",
  "items": [
    { "item_id": "...", "prompt_name": "...",
      "prompt_text": "...", "output": "...", "reasoning": null,
      "score": 1, "error": null,
      "scorer": { /* ScorerConfig as stored */ } }
  ]
}
```

A new `write-details.ts` writer, per completed attempt, calls `loadAttemptReconstruction(file)` (gives `systemPromptText` + per-item `promptText` + `scorer`) and joins it with the in-memory `ItemResult` fields (`output`, `reasoning`, `score`, `error`). This requires threading the **source file path** through `loadAttemptArchives` → `aggregateAttempts` so the writer knows which file to reconstruct. v1 attempts (`loadAttemptReconstruction` rejects them) are **skipped gracefully** — the record still appears in `data.js`, only its drilldown is unavailable. `runReport` gains a step after `writeDataJs`; `ReportSummary` gains `detailsWritten` / `detailsSkipped`. Additive — the leaderboard/scatter path is untouched. Tests: detail-writer shape on a v2 fixture, v1-skip.

## 4. Webapp: aggregate leaderboard (restore `1bc370e`)

Recover `RunGroupTable.tsx` / `RunRowItem.tsx` / `RunTable.module.css` from `1bc370e` and rewire to the per-attempt model. **Delete the Phase-3 matrix** versions currently in the tree.

### 4.1 Aggregation (pipeline)

Replace `aggregateMatrix` with a per-config aggregate (no challenge columns). Group records by `config_hash` → one row; group rows by `artifact` → one model group with a lead row + collapsible variant rows. Update `computeConfigScores` to the **pooled-over-items** pass-rate:

- `passRate = Σ passed_items / Σ item_count` over the config's attempts (was: fraction of attempts passed). Falls back to `0` when `Σ item_count == 0`.
- `efficiency` keeps its formula `(passRate × uniqueChallenges × completed) / (Σ gen_tokens × Σ wall_time) × 1e6`, now consuming the pooled `passRate`; `null` on zero denom (unchanged, `EFFICIENCY_SCALE = 1e6`, `formatEfficiency` null→`—`).
- New per-row aggregates for the stats block: `Σ generation_tokens`, `mean generation_tps`, `max peak_memory_gb`, `Σ wall_time_sec`, and **coverage** = `uniqueChallenges` (distinct `(challenge_id, version)` count) and `Σ item_count`.

### 4.2 Row anatomy & visuals (faithful to `1bc370e`)

Per config row, preserving the original treatment (recover the CSS variables, score bands, family palette):

- **Rank** badge on the lead row (by primary sort).
- **Model / variant** — lead row: `artifact` + sub-line `runtime · quant · t{temp}`; compact variant rows: the monospace variant tag.
- **Family-colored score/tokens bar** — top fill = pass-rate %, bottom fill = tokens % (glow), colored by `familyColor(modelFamily(artifact))`.
- **Score** — pass-rate %, colored by `scoreBand` (`green ≥.8 / yellow-green ≥.6 / yellow ≥.4 / orange ≥.2 / red`); efficiency sub-line.
- **Stats block** (2×2) — tokens · gen-tps · mem · wall-time, right-aligned with unit labels.
- **Coverage** — surface `N challenges · M items` (new; needed because models run different subsets — without it the aggregate is misleading). Placement: alongside the stats block or under the variant tag.
- **Two-axis sort controls** — `models by:` / `runs by:` over `score | efficiency | memory` (default `score` desc); expand/collapse-all.
- **Lead + collapsible variants** — expand toggle ("N more"), compact row styling for non-lead variants.

A family-color chip on the group header is a small, in-keeping addition. No new runtime deps — the bar/heatmap are CSS, as before.

## 5. Webapp: scatter (restore `1bc370e`)

Recover `Scatter.tsx` / `ScatterLegend.tsx` / `lib/colors.ts`, rewired to one dot **per config**. New pure `computeScatterPoints(records): ScatterPoint[]` in `pipeline.ts`:

```ts
interface ScatterPoint {
  config_hash: string; artifact: string; family: string;
  runtime: string; quant: string | null; temperature: number;
  x: number;          // Σ generation_tokens  (cost, log axis)
  y: number;          // passRate 0..1        (quality)
  efficiency: number | null;
  sizeB: number | null;   // modelSizeB(artifact)
  peak_memory_gb: number; // max over the config's attempts
  generation_tps: number; // mean over the config's attempts
}
```

X = Σ generation tokens (log) = cost; Y = pass-rate = quality; color = `familyColor(family)`; dot size = `modelSizeB(artifact)` (constant fallback when null); tooltip carries efficiency, peak mem, tps, config identity. Hand-rolled SVG (no charting lib). The original's richer encodings (opacity = tps, star-points = wall-time, per-model trajectories) are **deferred** — re-add from `1bc370e` only if wanted after the core lands.

> **Review flag:** the scatter encoding is the most visual / iterable piece. The default above mirrors the original (tokens-x / passRate-y / family-color); an axis toggle (tokens ↔ efficiency ↔ wall-time) is an easy follow-on.

## 6. Webapp: filters (restore `1bc370e`)

Recover `FilterPanel.tsx` + `filter-state.ts` + `applyFilters`, rewired to the per-attempt dimensions:

- **family** (multi) — via `modelFamily(artifact)`
- **runtime** (multi)
- **quant** (multi; `null` → "—")
- **temperature** (multi over observed values)
- **challenge** (multi over distinct `(challenge_id, version)`)

Dropped vs. the original: `tags`, `category`, `scenario` (gone from the harness); the params/duration range sliders are **deferred** (re-add if needed). All filter state lives in **TanStack Router search params** on the root route (CSV per dimension, omitted when unconstrained). `applyFilters(records, search)` narrows the set; the root route feeds the filtered records into **both** `computeScatterPoints` and the leaderboard aggregate, so both views and the two scores recompute over the selection.

## 7. Webapp: per-item drilldown + per-challenge breakdown

In-page expand, no new route. URL-tracked expansion via root-route search params:

- `?config=<config_hash>` — expand a leaderboard row to its **per-challenge breakdown**: one line per distinct `(challenge_id, version)` the config ran (pass-rate, score band, item coverage). This is where per-challenge detail now lives.
- `?attempt=<attempt_id>` — expand a challenge line to its items: `fetch()` `/details/<attempt_id>.json` (lazy, cached in state) and render prompt text, system prompt, output, reasoning, per-item score (`scoreBand`), scorer config, error.

A new `DrilldownPanel.tsx` + a small `useAttemptDetail(attempt_id)` fetch hook; explicit loading / not-found (v1 attempt, no detail file) states. URL state makes an expanded view shareable and reload-safe. `ShiftFrame` is retained for the transition (already wired in `__root`).

## 8. Data prerequisite (do early)

Generate the build/validation dataset fresh as **v2** from one small model (ignore the 266 v1 archives). Use `./bench submit` over the real challenge set. The leaderboard and scatter are per-config, so a single config yields a single row/dot — run a small **fan of configs of the same model** (e.g. 2–3 temperatures and/or system prompts) to populate several rows and scatter points. Then `./bench report` to (re)generate `data.js` + `public/details/`. Confirm `schemaVersion: 2` + `scorerHash` present, and that detail files materialize. The UI code targets arbitrary families/configs; this dataset is sparse-but-real, for structural validation.

> Default to the `/qa` Tier-B small model (Qwen2.5-0.5B Q4_K_M) at ~3 temperatures across the challenge set. Cost is small; cross-run cache won't help across distinct temperatures since outputs differ.

## 9. Sequencing (for the plan)

Backend is the contract the UI consumes, so it lands first:

1. `WebappRecord` + `BenchmarkResult` enrichment (§3.1).
2. Per-item detail channel (§3.2) — file-path threading + `write-details.ts` + `runReport` wiring.
3. Data prerequisite (§8) — regenerate `data.js` + `public/details/` so steps 4–7 build against real enriched data.
4. Aggregate leaderboard (§4) — pipeline pooled pass-rate + per-config/artifact aggregate; recover + rewire `RunGroupTable`/`RunRowItem`/CSS; delete the matrix.
5. Scatter (§5) — `computeScatterPoints`, recover `colors.ts`/`Scatter`/`ScatterLegend`.
6. Filters (§6) — recover `filter-state`/`applyFilters`/`FilterPanel`; root-route wiring + recompute.
7. Drilldown + per-challenge breakdown (§7) — detail fetch hook + `DrilldownPanel` + URL state.

## 10. Testing & conventions

- Pure functions get vitest `*.test.ts` (combined root `npm test` count): `toWebappRecord` enrichment, detail-writer shape + v1-skip, the pooled-pass-rate `computeConfigScores`, the per-config/artifact aggregate, `computeScatterPoints`, `applyFilters` + recompute. `.tsx` is eyeballed (webapp is Biome-excluded, no `.test.tsx`).
- **No new runtime deps** — scatter + bars stay hand-rolled SVG/CSS.
- Biome bans `!` and `throw` in non-test `src/`; `lint-strict.sh` bans `try/catch` even in `*.test.ts` (use Effect channels / vitest lifecycle hooks). `FileIOError` needs `{path, operation, cause}`. `Runtime` literals `"llamacpp"`/`"mlx"`.
- Don't perturb hashing (golden `challengeHash 71c5f440ce49`).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Final whole-branch review on opus; on **any** adversarial-review failure, STOP and escalate via AskUserQuestion (standing directive).

## 11. Out of scope / deferred

Scenario views; model `params` in the archive; scatter opacity/star-point/trajectory encodings; params/duration range filters; the 266 v1 archives (left in place, drilldown-unavailable, until/unless re-run). Windows path-join hardening in the content store (macOS/Linux/mlx-only harness).
