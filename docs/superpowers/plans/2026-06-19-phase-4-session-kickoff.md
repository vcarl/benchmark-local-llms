# Challenge × Configuration — Phase 4 Session Kickoff

> Handoff for a fresh session. Phases 0–3 are complete on branch `challenge-config-reframe`
> (`@ 41913b6`, **unmerged**, 547 tests green across root + webapp). This doc says where we are,
> the one decision to make first, what context to read, and the Phase 4 design sketch.

## 0. Where we are

The Challenge × Configuration reframe has landed Phases 0–3 on `challenge-config-reframe`:

- **Phase 0–1:** entity model (Configuration / Challenge / Result), content hashing, custom
  subprocess scorer, per-attempt archive writer, `runChallenge`, `./bench submit`.
- **Phase 2:** the ~80-prompt corpus rewritten self-contained (`system:` dropped, output contracts
  folded into prompt text), the system-prompt menu trimmed to `{default, concise, cot}` personas,
  and six per-category challenge YAMLs (`challenges/{code,constraint,effect-ts,factual,logic,math}.yaml`,
  uniform `passThreshold 0.8`).
- **Phase 3:** report + webapp re-axed onto **configuration rows × challenge columns** with two
  per-config scores (pass rate + efficiency). Clean-break ingestion of the new attempt archives;
  scenario half, per-config detail, and filtering deferred/removed.

**Sources of truth:**
- Foundational spec (entities, invariants, Phase 2–4 sketch incl. the Archive+cache section):
  `docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`
- Phase specs/plans under `docs/superpowers/specs/` and `docs/superpowers/plans/` (dated `2026-06-18`/`-19`).
- **The SDD ledger — read it first:** `.git/sdd/progress.md` (`cat "$(git rev-parse --git-path sdd)/progress.md"`).
  It records every task, every adjudicated finding, and the deferred Minors. After any compaction,
  trust the ledger + `git log --oneline` over recollection.

## 1. First decision (resolve before any work)

The branch is **not merged**. Phases 0–3 are self-contained, reviewed, and green. Choose:

- **(a) Keep stacking** Phase 4 on `challenge-config-reframe` (simplest; consistent with how 2–3 ran).
- **(b) Land Phases 0–3 to `main` first**, then branch Phase 4 fresh. Cleaner history; de-risks the
  large stack. Run `superpowers:finishing-a-development-branch`. Note: `webapp/src/data/data.js` is
  gitignored and currently a `[]` stub — regenerate it (`./bench report`) over a real
  `benchmark-archive/` before anyone expects live data. A pre-existing untracked backup tarball
  (`benchmark-archive.bak-*.tar.gz`) sits in the tree — leave it; it is not part of this work.

Recommendation: **(b)** if anyone else needs the foundation; otherwise (a) is fine — Phase 4 is small.

## 2. Phase 4 — Cache + resume (the work)

Phase 4 is the smallest, most self-contained phase: make repeated runs cheap and interrupted runs
resumable, under the new identity model. Two pieces.

### 2a. Cross-run item cache, re-keyed

Today `src/archive/cache.ts` (`findCachedResult`) keys on `(artifact, runId, promptName, promptHash,
temperature)` and scans the **old** `ExecutionResult` archives — it is part of the legacy `run`
path and is **not wired into `runChallenge`/`submit` at all**. The new `submit` path always
re-executes every item.

The foundational spec specifies the new key: **`(configHash, challengeId, version, itemHash)`**. A
cache hit reuses a prior item result for the same configuration attempting the same challenge-item
content; `attemptId` scoping replaces `runId` scoping. Concretely:

- Add a cache reader that scans `benchmark-archive/*.jsonl` **attempt archives** (header
  `AttemptManifest` + body `ItemResult` lines — schema in `src/schema/attempt.ts`) and, for a target
  `(configHash, challengeId, challengeVersion, itemHash)`, returns a prior completed `ItemResult`.
  Only **completed** attempts are eligible (`finishedAt !== null && interrupted === false`) — mirror
  the `isCompleted` predicate already in `src/report/aggregate.ts`.
- `itemHash` is the per-item identity. Confirm what uniquely pins an item: today an item resolves to a
  prompt with a `promptHash` (over prompt text + system, computed in `src/config/prompt-corpus.ts`)
  plus its scorer rules. Decide whether `itemHash` is the existing `promptHash`, or a new hash over
  `(promptHash + resolved scorer JSON)` so that changing an item's scorer invalidates its cache
  (consistent with how `challengeHash` already folds scorer rules — see `src/config/challenges.ts`).
  Resolve this in the brainstorm; it is the one real design question.
- Wire the lookup into `runChallenge` (`src/orchestration/run-challenge.ts`) **before** executing each
  item: on hit, write the cached `ItemResult` straight to the attempt body (via `appendItem`) and skip
  the model call; on miss, execute as today. Add a `--no-cache` escape hatch on `./bench submit`.

### 2b. Resume by `attemptId`

An attempt archive is written incrementally: `writeAttemptHeader` (interrupted=true) → `appendItem`
per item → `finalizeAttempt` (sets `finishedAt`, `interrupted=false`, fills `aggregate`). If a run is
killed mid-challenge, the archive is left with `interrupted: true` and a partial body.

- Add `./bench submit --resume <attemptId>`: load that archive, read which `itemId`s already have a
  body line, execute only the missing items (appending to the **same** file), then finalize. This
  composes naturally with 2a (resume is "cache scoped to one attempt"), but they are separable —
  build the cache first, then resume.
- Decide finalize semantics on resume (recompute the aggregate over all body lines — the writer
  likely already does this at finalize; confirm in `src/archive/attempt-writer.ts`).

### Testing & risks

- Unit-test the cache reader against fixture attempt archives (hit, miss on differing
  `configHash`/`itemHash`/`version`, ignore incomplete attempts). Mirror the loader test style in
  `src/report/load-attempts.test.ts`.
- Integration-test `runChallenge` with a fake LLM: first run populates the archive; second run with
  cache on issues **zero** model calls and produces an identical aggregate; `--no-cache` re-executes.
- Resume test: write a partial (interrupted) archive, resume, assert only-missing items executed and
  the finalized aggregate is correct.
- **Risk — cache staleness:** the key must invalidate on any change that alters the answer
  (config fields via `configHash`, challenge content/version, item content/scorer via `itemHash`).
  Getting `itemHash` wrong silently serves stale results — the highest-value test target.

## 3. Context to gather first

Read directly (controller): the foundational spec's **Archive + cache** section and `.git/sdd/progress.md`.
Then read the four touch-point files yourself — they are small: `src/archive/cache.ts` (the legacy
key to replace), `src/archive/attempt-writer.ts` (`writeAttemptHeader`/`appendItem`/`finalizeAttempt`),
`src/orchestration/run-challenge.ts` (where to inject the lookup; `attemptId` is already threaded),
and `src/cli/commands/submit.ts` (where `--no-cache`/`--resume` flags land). One Explore agent over
`src/config/{prompt-corpus,challenges,hashing}.ts` can return the exact `promptHash`/`challengeHash`
inputs so you can settle the `itemHash` definition without reading all three yourself.

## 4. Execution approach & conventions (carry forward)

Run it exactly like Phases 2–3: **brainstorming → writing-plans → subagent-driven-development**, one
fresh implementer subagent per task, adversarial review after each (use `<SKILL>/scripts/task-brief`
and `review-package`), ledger every completed task, opus for the final whole-branch review. The goal here is to aggressively manage context; The vast majority of your context should be reports from subagents, so we can eliminate chaff from debug sessions and quick investigations — this session will live for a long time across many tasks, so it's important we not do our actual work here.

**Standing user directive (CRITICAL):** on ANY adversarial-review failure, STOP and escalate to the
user via AskUserQuestion — do not auto-patch and continue.

**Gotchas this stack taught us:**
- `Runtime` enum is `Schema.Literal("llamacpp", "mlx")` — never use `"llama-server"` in fixtures.
- `FileIOError` requires `{ path, operation, cause }`.
- Webapp records are **snake_case**; backend manifests/items are camelCase (the contract maps).
- Biome bans non-null assertions (`!`) and unused `any` in `src/` (and `*.test.ts` is exempt from the
  throw ban). No `throw` in non-test `src/`.
- Root `npm test` globs `webapp/src/**/*.test.ts` too — the combined count is one number (547).
- The **webapp is excluded from biome and has no `.test.tsx`**, so React render bugs (e.g. missing
  keys) are CI-invisible; eyeball `.tsx` changes.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Deferred (out of scope unless raised):** per-config/per-item webapp detail view; config-axis
filtering; scatter re-axis; legacy-archive migration; the small Minors logged in the Phase 3 ledger
(a stale `"read-archive-dir"` string in `cache.ts` — which Phase 4 rewrites anyway — and a few
test-assertion niceties).
