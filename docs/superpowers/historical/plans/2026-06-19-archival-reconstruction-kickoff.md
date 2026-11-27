# Archival Reconstruction + WebappRecord — Session Kickoff

> Handoff for a fresh session. **Goal: make an attempt archive a complete, self-sufficient
> record — you should be able to reconstruct an attempt *entirely* from its produced archive,
> with no dependency on the external corpus/config/model files as they exist at read time.**
> Getting this right is the essential detail; the richer webapp (scatter/leaderboard/filters)
> is the downstream payoff, not the driver. Supersedes
> `2026-06-19-stream-b-score-migration-kickoff.md` (that stream is complete).

## 0. Where we are

Branch `challenge-config-reframe` @ **`c33d3c7`**, **UNMERGED**. `npm test` = **570 passing / 89 files**,
typecheck + lint clean.

Recent landed work (this session):
- **`/qa` validated incl. live Tier B**; **bug #1 fixed** — smoke-config quant `q4-k-m`→`Q4_K_M` (`f5e8ee2`).
- **bug #2 fixed** — `score` migrated to the attempt format, re-scores in place (`760bc7f` spec, `9fb7a53` impl).
  Adversarial-reviewed (APPROVE-WITH-MINORS, all addressed). A7 now PASS.
- **First real run**: added `qwen2.5-7b-mlx` config (`c33d3c7`) and ran Qwen 2.5 7B Instruct (MLX 4-bit,
  t0.7, default prompt) across all 6 challenges → 6 finalized `att-*.jsonl` in `benchmark-archive/`
  (code 1.00, factual 1.00, logic 0.90, constraint 0.80, math 0.54, effect-ts 0.08; 67% pass).

**Working-tree caveats for next session:**
- `webapp/src/data/data.js` is **modified, uncommitted** — it holds the Qwen run's report. Regenerate
  anytime with `./bench report --archive-dir benchmark-archive --output <dir>` then copy its `data.js`.
  (A `/tmp/qwen7b-data-backup.js` baseline backup was made but `/tmp` may not survive.) Decide whether
  to restore the committed baseline or keep the run data early on.
- A vite dev server may still be running on :5173 (started this session). Kill stray `vite` if needed.
- Untracked, leave alone: `benchmark-archive.bak-*.tar.gz`, `docs/.../2026-06-19-phase-4-session-kickoff.md`.
- `.git/sdd/progress.md` is the authoritative ledger — read it first.

## 1. The goal, precisely

**An attempt archive must be enough, on its own, to fully reconstruct the attempt** — what was asked,
what the model produced, how it was scored, and under what configuration — even if `prompts/`,
`configs.yaml`, `system-prompts.yaml`, `challenges/`, and `models.yaml` have all changed or vanished
since. This is the "archival recordkeeping" property.

Two consumers benefit, in priority order:
1. **Faithful reconstruction / audit** (the essential goal): replay exactly what happened.
2. **Richer reporting** (the downstream payoff): the old scatter/leaderboard/filters/drilldown
   (deleted in Phase 3, recoverable from git @ `1bc370e`) need fields the archive doesn't yet carry.
   A complete archive subsumes most of what they need.

## 2. Current archive shape (what we have)

- **`src/schema/attempt.ts`** — `AttemptManifest` (line 1) + `ItemResult` (lines 2..).
  - Manifest carries config IDENTITY: `configId, configHash, artifact, runtime, quant?, temperature,
    systemPrompt` (the **key**, e.g. "default"), `maxTokens`; challenge identity: `challengeId,
    challengeVersion, challengeHash`; `env` (RunEnv provenance incl. harness git sha); `aggregate`.
  - `ItemResult` carries execution: `itemId, promptName, promptHash, itemHash, executedAt,
    promptTokens, generationTokens, promptTps, generationTps, peakMemoryGb, wallTimeSec, output,
    reasoning, rawOutput, error, score`.
- **`src/report/webapp-contract.ts`** — `WebappRecord` (attempt-grain, snake_case) emitted to the
  webapp. Carries `score, passed, generation_tokens, wall_time_sec, item_count, passed_items` + config
  identity. Drops `peak_memory`, derived `family`, model `params`, `tps`, and all per-item detail.

## 3. The reconstruction gaps (verified, this is the work)

| To reconstruct… | Carried in archive? | Gap |
| --- | --- | --- |
| The exact **prompt sent** (rendered user prompt) | ❌ only `promptName`/`promptHash` | the prompt **text** is NOT stored; needs the corpus at the matching hash |
| The **system prompt** actually used | ❌ only the **key** (`systemPrompt: "default"`) | the resolved **text** is NOT stored (and the key→text map can drift; note `configHash` is computed over the *text*) |
| The **scorer** applied per item | ❌ not stored | `score` re-scoring already has to re-resolve it externally → `promptHash`-drift fallback exists *because* of this gap |
| Model output / reasoning / raw / error / score | ✅ in `ItemResult` | — |
| tokens / tps / **peak memory** / wall time | ✅ in `ItemResult` | present per-item; `WebappRecord` just doesn't surface memory/tps |
| Model **params** (size) + **family** | ❌ not in attempt | params lives only in `models.yaml`; family is derivable from `artifact` |
| Harness/runtime provenance | ✅ `env` (RunEnv) | confirm it's sufficient (versions, git sha) |

**Headline gaps:** the **prompt text**, the **resolved system-prompt text**, and the **scorer config**
are the three things that make an attempt non-reconstructible today. Everything else is either present
or trivially derivable.

## 4. Design space to resolve (brainstorm these)

This is a schema/contract change with hashing + file-size implications — run it through
`brainstorming → writing-plans → subagent-driven-development`. Key questions:

- **A) Per-item denormalization** — add `promptText` + `scorer` (ScorerConfig) to each `ItemResult`,
  and resolved `systemPromptText` (+ maybe model `params`/`name`/`family`) to the manifest. Maximal
  self-containment; larger files; some cross-attempt duplication.
- **B) Embedded resolved snapshot** — embed a once-per-attempt resolved-challenge snapshot in the
  manifest (prompts + scorers + system-prompt text + model metadata). **Note: the LEGACY format did
  exactly this** (`manifest.promptCorpus`); Phase 3's clean break removed it. Reintroducing a *scoped*
  version (only this attempt's challenge) is a natural middle ground.
- **C) Content-addressed sidecar** — archive keeps hash references; a companion content store resolves
  prompt/scorer/system-prompt by hash. Self-contained as a *set*, not per-file. Best dedup, more moving
  parts.

Cross-cutting decisions:
- **Hash stability**: `configHash`/`challengeHash`/`itemHash`/`attemptId` MUST NOT change for existing
  archives. Added fields must be denormalized *content*, not hash inputs. Verify against the golden
  hash tests (`challengeHash` golden is pinned).
- **`schemaVersion` bump**: `AttemptManifest.schemaVersion` is `Literal(1)` today. A reconstruction-
  complete format is likely v2. Decide migration/coexistence (loaders must handle both, or a one-way
  migrate; mirror the additive pattern used elsewhere).
- **Consistency with `score`**: once prompt/scorer are in the archive, `score` re-scoring no longer
  needs the external corpus and the `promptHash`-drift fallback can become a *true* in-archive check.
  Fold this into the design (it both validates and simplifies the score path).
- **File size / dedup**: 80-item attempts × embedded prompt+scorer text. Measure; decide if acceptable
  or if (C) is warranted.
- **`WebappRecord` enrichment**: once the data exists, carry `peak_memory`, `tps` (derive), `family`
  (derive from artifact), `params` (from embedded model metadata) up into `WebappRecord` so the
  recoverable scatter/leaderboard can consume them. This is the bridge to webapp parity.

## 5. Webapp parity context (downstream, not this session's core)

The old dashboard (scatter + leaderboard + filters + per-config drilldown + scenario views) was
deleted in Phase 3 (`79868ce`, `41913b6`) and is fully recoverable from git @ `1bc370e`
(`Scatter.tsx`, `ScatterLegend.tsx`, `FilterPanel.tsx`, `lib/colors.ts`, `lib/run-summary.ts`,
`lib/format.ts`, the `run.$model.$variant.*` routes, etc.). It's not a clean revert: those components
were written against the old per-run (model×scenario) data shape and need rewiring to the per-attempt
(config×challenge) model + the fields added in §4. **Scenario views are out of scope** (the scenario
arm was removed harness-wide). Sequence: get §4 (archive completeness) right *first*, then rebuild the
scatter/leaderboard/filters from the enriched `WebappRecord` in a follow-on session. Per-item drilldown
(event log / prompt view) becomes possible once per-item content is in the archive.

## 6. How to start (next session)

1. Read this doc + `.git/sdd/progress.md` + `src/schema/attempt.ts` + `src/report/webapp-contract.ts`
   + the `project_score_legacy_format` memory (score now re-scores in place — relevant to §4).
2. Resolve the working-tree caveats in §0 (restore or keep `data.js`; kill stray vite).
3. `brainstorming` on the reconstruction-complete archive format: pick among §4 A/B/C, settle the
   hashing/`schemaVersion`/size/migration questions, and define exactly which fields land where.
   Pressure-test against "reconstruct an attempt with the corpus deleted."
4. → `writing-plans` → `subagent-driven-development`. Additive, golden-hash-safe, red→green.
   Adversarial review before commit; escalate on review failure (standing directive).
5. Then (optionally, later) the webapp parity rebuild from the enriched record.

## 7. Conventions carried forward

- Aggressive context discipline; subagents do the work, controller coordinates. opus for final
  whole-branch review. **On ANY adversarial-review failure: STOP and escalate via AskUserQuestion.**
- Biome bans `!` and `throw` in non-test `src/` (`*.test.ts` exempt from throw ban). `FileIOError`
  needs `{path, operation, cause}`. `Runtime` literals `"llamacpp"`/`"mlx"`. No new runtime deps.
- Root `npm test` globs `webapp/src/**/*.test.ts` too — one combined number (570). Webapp is excluded
  from biome and has no `.test.tsx` — eyeball `.tsx` changes.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `.claude/skills/` is tracked; rest of `.claude/` ignored. Don't merge the branch yet — finish the
  bug-hunt/feature work first, then `finishing-a-development-branch` for a single merge of everything.
