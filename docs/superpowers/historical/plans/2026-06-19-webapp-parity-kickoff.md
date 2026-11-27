# Webapp Parity Rebuild — Session Kickoff

> Handoff for a fresh session. **Goal: rebuild the dashboard UI that was deleted in Phase 3, now that
> the data model carries everything it needs.** The hard parts — the score×efficiency **scatter**,
> the **filters**, and the brand-new **per-item drilldown** — are the priority; the leaderboard table
> already exists in reduced form. This is the downstream payoff of the just-finished
> archival-reconstruction work. Sequence: `brainstorming → writing-plans → subagent-driven-development`.

## 0. Where we are

Branch `challenge-config-reframe` @ **`0a107bf`**, **UNMERGED**. `npm test` = **594 passing / 93 files**,
typecheck + lint clean. The branch stacks phases 0–4 + bug fixes + archival reconstruction; per the
prior directive it is NOT merged yet — everything merges in one pass at the very end via
`finishing-a-development-branch`.

Just-landed work (read these first): the **archival-reconstruction** feature made v2 attempt archives
self-sufficient.
- Spec: `docs/superpowers/specs/2026-06-19-archival-reconstruction-content-store-design.md`
- Plan: `docs/superpowers/plans/2026-06-19-archival-reconstruction-content-store.md`
- Per-task detail: `.superpowers/sdd/progress.md`; high-level summary appended to `.git/sdd/progress.md`
  (the authoritative ledger — **read it first**).

**Working-tree caveats:** untracked `benchmark-archive.bak-*.tar.gz` and
`docs/.../2026-06-19-phase-4-session-kickoff.md` — leave alone. `webapp/src/data/data.js` is
**gitignored** (stubbed to `[]` locally); regenerate with `./bench report --archive-dir benchmark-archive
--output <dir>` then copy its `data.js` into `webapp/src/data/`.

## 1. The goal, precisely

Restore the model-comparison dashboard, rewired to the current **per-attempt (config × challenge)** data
model and enriched with fields the archive now carries. Three deliverables, hardest first:
1. **Scatter** — efficiency vs. score, per config, colored by family. The signature view; needs
   `peak_memory`/`tps`/`family` surfaced.
2. **Filters** — by family / runtime / quant / challenge etc. (dropped entirely in Phase 3).
3. **Per-item drilldown** — prompt view + output + per-item score + scorer. **This was impossible
   before** and is the real unlock from the reconstruction work.
The reduced **leaderboard/matrix** (`RunGroupTable`) already renders and just needs the new columns.

## 2. What exists now

**Backend contract** — `src/report/webapp-contract.ts`: `WebappRecord` is per-attempt, snake_case,
emitted by `toWebappRecord(manifest, items)`. It carries config identity + `score, passed,
generation_tokens, wall_time_sec, item_count, passed_items`. It **drops** `peak_memory`, `tps`,
derived `family`, model `params`, and **all per-item detail**. The report path is
`loadAttemptArchives → aggregateAttempts → toWebappRecord → write-data-js` (see `src/report/`,
`src/cli/commands/report.ts`).

**Webapp** — `webapp/src/lib/data.ts`: `BenchmarkResult` mirrors `WebappRecord` field-for-field;
`modelFamily()` / `modelSizeB()` already derive family/size from the artifact/name string.
`webapp/src/lib/pipeline.ts`: `computeConfigScores` (passRate + efficiency = `(passRate × uniqueChallenges
× completed)/(Σgen_tokens × Σwall_time) × 1e6`, null on zero denom), `bestAttempt`, `aggregateMatrix`.
`webapp/src/constants`: `EFFICIENCY_SCALE = 1e6`, `formatEfficiency` (null → `—`). The route `__root`
calls `aggregateMatrix(DATA)` and renders `RunGroupTable` (artifact groups, challenge columns + Pass% +
Efficiency, expand/collapse). **No filtering, no nav, no scatter, no drilldown** — all removed in Phase 3.

## 3. What's missing / what's recoverable

The full dashboard (scatter + leaderboard + filters + per-config drilldown + scenario views) was deleted
in Phase 3 (commits `79868ce`, `41913b6`) and is **recoverable from git @ `1bc370e`**:
`Scatter.tsx`, `ScatterLegend.tsx`, `FilterPanel.tsx`, `lib/colors.ts`, `lib/run-summary.ts`,
`lib/format.ts`, and the `run.$model.$variant.*` routes. **It is NOT a clean revert** — those components
were written against the old **per-run (model × scenario)** data shape and must be rewired to the current
**per-attempt (config × challenge)** model plus the new fields (§4). **Scenario views are OUT OF SCOPE**
— the scenario arm was removed harness-wide; do not bring back `ScenarioView`/`ScenarioList` or any
scenario routing. Per-item drilldown (event log / prompt view) is now newly *possible* because per-item
content lives in the archive.

To recover a deleted file for reference: `git show 1bc370e:webapp/src/components/Scatter.tsx` etc.
Treat them as design references, not paste targets.

## 4. The data-model change that enables this (the key detail)

Two new capabilities from the reconstruction work:
- **Per-attempt enrichment is now derivable.** `peak_memory` and `tps` are present per-item in
  `ItemResult` (`src/schema/attempt.ts`); `family` derives from `artifact` (webapp `modelFamily`).
  `WebappRecord`/`toWebappRecord` just don't surface them yet. Decide whether to sum/avg `peak_memory`
  and `tps` at attempt grain in `toWebappRecord` (mirror how `generation_tokens`/`wall_time_sec` are
  already summed there).
- **Per-item content is reconstructable from the archive alone.** `src/report/reconstruct.ts`
  `loadAttemptReconstruction(file)` returns `{ manifest, systemPromptText, items: [{ item, promptText,
  scorer }] }` purely from the v2 `.jsonl` + content store (`<archiveDir>/content/`). This is the source
  for the drilldown's prompt/system/scorer text. **Decide the wire shape:** add a per-item channel to
  the report output (a second JSON, or a per-attempt detail file) rather than bloating the per-attempt
  `data.js` with 80 items × N attempts. v2 archives carry `ItemResult.scorerHash` + `passThreshold`;
  v1 archives have neither and `loadAttemptReconstruction` rejects them (see §6).

## 5. Decisions to resolve in brainstorming

- **Per-item wire format** — extend `data.js`, or a sibling `details.js` / per-attempt files keyed by
  `attempt_id`? Lazy-load drilldown vs. ship all of it? (Favor a separate channel; 80-item attempts.)
- **`WebappRecord` enrichment scope** — `peak_memory`, `tps`, `family` for sure; `params`? (params is
  NOT in the archive — `submit` doesn't read `models.yaml`; only worth wiring if the leaderboard needs
  exact param counts beyond `modelSizeB(artifact)`.)
- **Filter set** — which dimensions, and do filters recompute the matrix/scatter or just hide rows?
  (Phase 3 deleted `filter-state`/`applyFilters`; rebuild against the per-attempt shape.)
- **Scatter axes/encoding** — efficiency (x) vs. score (y), color = family, size = params? Rewire
  `lib/colors.ts` to family-keyed.
- **Routing** — bring back a per-config detail route (rewired from `run.$model.$variant`) for drilldown,
  or an in-page expand? The webapp uses TanStack Router (`routeTree` regenerated via `vite build`).

## 6. Data prerequisite (do this early)

The 6 existing Qwen archives in `benchmark-archive/` are **v1** (coexistence-only; no migration was
built — see the reconstruction spec §3). They have **no content store**, so they cannot power the
per-item drilldown and won't carry the enriched fields. **Re-run them via `submit` to get v2 data
cheaply:** the cross-run cache copies the measured results (≈ no model calls) while the v2 writer
populates the content store from the resolved items — so you get complete v2 archives with full per-item
content for free. Build the UI against that real enriched data, not the stub. (Alternatively run a fresh
small model.) Confirm with `./bench report` + check `schemaVersion`/`scorerHash` in the regenerated
archives.

## 7. How to start

1. Read `.git/sdd/progress.md` + the reconstruction spec/plan (§0) + `src/report/webapp-contract.ts` +
   `src/report/reconstruct.ts` + `webapp/src/lib/{data,pipeline}.ts` + current `webapp/src/routes/__root`.
2. `git show 1bc370e:webapp/src/components/Scatter.tsx` (and `FilterPanel.tsx`, `lib/colors.ts`,
   `lib/run-summary.ts`) to study the old shapes you're rewiring.
3. Re-run the 6 archives to v2 (§6); regenerate `data.js`.
4. `brainstorming` the enriched record + per-item channel + scatter/filters/drilldown, resolving §5.
5. → `writing-plans` → `subagent-driven-development`. Backend enrichment first (it's the contract the
   UI consumes), then UI. opus for the final whole-branch review. **On ANY adversarial-review failure:
   STOP and escalate via AskUserQuestion** (standing directive).

## 8. Conventions carried forward

- Biome bans `!` and `throw` in non-test `src/`. `scripts/lint-strict.sh` additionally bans
  **`try/catch` even in `*.test.ts`** (only the `throw` ban is test-exempt) — use Effect channels or
  vitest lifecycle hooks for cleanup. `FileIOError` needs `{path, operation, cause}`. `Runtime` literals
  `"llamacpp"`/`"mlx"`. **No new runtime deps.**
- **Webapp is excluded from Biome and has no `.test.tsx`** — eyeball `.tsx` changes; root `npm test`
  globs `webapp/src/**/*.test.ts` into the one combined number (594).
- Golden hashes are pinned (`challengeHash 71c5f440ce49`); webapp work shouldn't touch hashing, but
  don't perturb it.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `.claude/skills/` is tracked; rest of `.claude/` and `.superpowers/` are ignored. Don't merge the
  branch — finish the webapp work, then `finishing-a-development-branch` for a single merge of everything.
