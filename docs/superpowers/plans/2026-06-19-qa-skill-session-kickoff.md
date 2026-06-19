# QA Skill + Bug-Hunt — Session Kickoff

> Handoff for a fresh session. This supersedes `2026-06-19-phase-4-session-kickoff.md`
> (Phase 4 is now complete). It says where we are, the decisions to make first, what to read,
> and the two work streams: **(A) refine the `/qa` skill to a committable state, then (B) use it
> to uncover and fix bugs.**

## 0. Where we are

Branch `challenge-config-reframe` @ **`1df00bc`**, **UNMERGED**. `npm test` = **561 passing / 89 files**,
typecheck + lint clean.

- **All four phases of the Challenge × Configuration reframe are done** (Phases 0–3 prior; **Phase 4
  cache + resume landed this session**, 7 code commits `5016cf0..0576b38`). Phase 4's opus
  whole-branch review returned READY-TO-MERGE-WITH-FIXES; the two comment-only Minors were applied
  (`0576b38`). Cross-run item cache, `--no-cache`, resume-by-`attemptId` + `--resume` all in and tested.
- **A draft `/qa` project skill exists and is registered** (invocable as `/qa`):
  `.claude/skills/qa/{SKILL.md, check-resolution.ts, seed-archive.ts}` (`2bdbf9f`, reframed in `1df00bc`).
  Both scratch scripts were verified to run; the A5 report→`data.js` chain was verified end-to-end.
- The branch is still unmerged — finishing it (merge/PR of all four phases to `main`) remains an open
  option, deferred per the standing stack decision.

**Sources of truth:**
- **Read the ledger first after any compaction:** `.git/sdd/progress.md`
  (`cat "$(git rev-parse --git-path sdd)/progress.md"`). It records every Phase 4 task + the final review.
  Trust it + `git log --oneline` over recollection.
- QA skill spec: `docs/superpowers/specs/2026-06-19-qa-skill-design.md`.
- Phase 4 spec/plan: `docs/superpowers/specs/2026-06-19-phase-4-cache-resume-design.md`,
  `docs/superpowers/plans/2026-06-19-phase-4-cache-resume.md`.
- The `score` bug (Stream B's first target) is recorded in auto-memory `project_score_legacy_format`.

## 1. First decisions (resolve before work)

- **(a) Validate `/qa` with a real cold-start run.** A procedure skill's RED/GREEN *is* running it.
  Tier A runs on any machine. **Tier B (the live model path) needs `smoke-config`'s Qwen2.5-0.5B
  cached + a binary** (`llama-server` on PATH, or `mlx_lm` via `$VIRTUAL_ENV`/`~/llm-env`). Decide
  whether this machine has them: if yes, the run exercises B1–B4 (the only parts not yet validated
  against a live model); if no, Tier B SKIPs and we refine Tier A. Run `/qa` from a **blank** session
  (not a context-heavy one) for a faithful test.
- **(b) Finish the branch now, or after the bug-hunt?** Recommendation: **after** — Stream B (`score`
  migration + whatever `/qa` surfaces) will produce fixes that should land on this same branch before
  a single merge. Run `superpowers:finishing-a-development-branch` once the bug-hunt settles.

## 2. Stream A — refine `/qa` to a committable state

The draft is functional but only Tier A + the two scripts are proven. Refinement = run it, find rough
edges, tighten, final-commit.

- **Live-path validation (the real gap):** B1 (live submit), B2 (cache hit ⇒ new attempt item
  `executedAt` *equals* the first), B3 (`--no-cache` ⇒ fresh `executedAt`), B4 (resume executes only
  the missing item + finalizes over the union; mismatch ⇒ `ResumeMismatchError`). These are
  code-reasoned, not yet observed against a live model — confirm the assertions actually hold.
- **A6 webapp judgment-pause:** confirm the save/restore of the committed `webapp/src/data/data.js`
  is clean (working tree returns to baseline), `npm run build` succeeds on real data, and the matrix
  renders. Tighten the pause wording if it's ambiguous.
- **A7 is currently recorded FAIL (known `score` bug)** — it flips to a real PASS once Stream B lands.
- **writing-skills discipline:** the skill wasn't pressure/scenario-tested (the live run is its test).
  Decide whether a formal `writing-skills` RED/GREEN is warranted for a procedure skill or the run
  suffices. Keep the description triggering-conditions-only (no workflow summary) if you touch it —
  editing a skill re-triggers the Iron Law.
- **Output:** a `/qa` we trust + a final commit (it's currently a draft commit).

## 3. Stream B — uncover & fix bugs (start with `score`)

- **First confirmed bug — `score` migration.** `./bench score` reads the **legacy**
  `RunManifest`/`ExecutionResult` format (`src/archive/loader.ts`); `submit`/`report` use the new
  `AttemptManifest`/`ItemResult` format (`src/report/load-attempts.ts`), so `score` over an attempt
  archive fails with `JsonlCorruptLine`. Migrate `score` onto the attempt format — its own
  **brainstorm → writing-plans → subagent-driven-development** cycle. The Phase 4 *additive* cache
  pattern (new reader alongside the still-live legacy `run`/`findCachedResult` path) is the template
  for how to treat `score`'s legacy path without breaking `run`. After it lands, `/qa` A7 = PASS.
- **Then triage whatever else `/qa` surfaces** (legacy `run` path, scorers, webapp render). Use
  `systematic-debugging` per finding; **red→green proof required** — observe the original symptom
  flip, not a mid-pipeline artifact.

## 4. Context to read first (next session)

This doc → the QA spec → the draft `SKILL.md` + the two scripts (all small) → the `score` memory →
`.git/sdd/progress.md` for Phase 4 detail. Don't re-derive; the ledger + `git log` are authoritative.

## 5. Conventions & gotchas carried forward

- **Aggressive context management:** subagents do the work; the controller coordinates and keeps its
  context lean (this is a long-lived session). Use `subagent-driven-development`'s `scripts/task-brief`
  + `scripts/review-package`; ledger every completed task; opus for the final whole-branch review.
- **Standing user directive (CRITICAL):** on ANY adversarial-review failure, STOP and escalate via
  `AskUserQuestion` — do not auto-patch and continue.
- Skip section-by-section design walkthroughs; write the spec directly once direction is approved.
- **`/qa` isolation:** writes only to `mktemp -d` scratch; **never** `./benchmark-archive/`;
  saves+restores `webapp/src/data/data.js`; confirms a clean tree at the end.
- `Runtime` enum is `Schema.Literal("llamacpp", "mlx")` — never `"llama-server"`.
  `FileIOError` needs `{ path, operation, cause }`. Biome bans `!` and `throw` in non-test `src/`
  (`*.test.ts` exempt from the throw ban only). No new runtime deps.
- Root `npm test` globs `webapp/src/**/*.test.ts` too — the suite is one combined number (561).
  The **webapp is excluded from biome and has no `.test.tsx`**, so eyeball `.tsx` changes.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `.claude/skills/` is now **tracked** (`.gitignore` ignores `.claude/*` but negates `.claude/skills/`);
  the rest of `.claude/` stays ignored.
- **Leave untracked alone:** `benchmark-archive.bak-*.tar.gz` and the old phase-4 kickoff doc.

## 6. How to start

1. Read this doc + `.git/sdd/progress.md`.
2. Resolve §1 decisions (Tier B availability; finish-branch timing).
3. **Stream A:** `/qa` from a blank session → capture rough edges → refine → final commit.
4. **Stream B:** brainstorm the `score` migration → spec → plan → implement; then run `/qa` again to
   confirm A7 flips to PASS and triage anything else it surfaces.
