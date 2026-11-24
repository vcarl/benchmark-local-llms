# Challenge × Configuration — Phase 2–4 Session Kickoff

> Handoff for a fresh session. Phase 0–1 is complete on branch `challenge-config-reframe`
> (commits `680357b`..`741b08e`, 652 tests green, **unmerged**). This doc says what context
> to gather first, what the next steps are, and how to group/parallelize them.

## 0. Where we are

- **Done (Phase 0–1):** the Configuration / Challenge / Result entity model, content hashing,
  custom subprocess scorer + shared dispatch, per-attempt archive writer, system-prompt-as-config
  refactor, the `runChallenge` orchestrator, `./bench submit`, and an end-to-end smoke test.
- **Source of truth:** `docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`
  (entities + invariants + Phase 2–4 sketch, incl. the **two-score webapp model**).
- **What landed, task by task + carried fast-follows:** `.git/sdd/progress.md` (the SDD ledger —
  read it; it lists the deferred Minors).
- **Deferred to Phase 2–4:** corpus rewrite + real challenge set, report/webapp re-axis (incl.
  pass-rate + efficiency score), cache/resume under the new identity.

### First decision (resolve before any work)

The feature branch is **not merged**. Choose one:
- **(a) Keep building on `challenge-config-reframe`** — Phase 2–4 stack on the same branch. Simplest
  if no one else needs Phase 0–1 yet.
- **(b) Merge Phase 0–1 to `main` first, branch Phase 2 fresh** — cleaner history; do this if the
  foundation is stable enough to land. (Run the finishing-a-development-branch flow.)

Recommendation: **(b)** — Phase 0–1 is self-contained, reviewed, and green; landing it de-risks the
bigger Phase 3 work and keeps each phase's branch small.

---

## 1. Base context to gather at session start

The new session is cold. Read the two small foundational docs **yourself** (they're the contract,
not delegatable), then **fan out Explore subagents in parallel** for the bulky surveys so your own
context stays lean. Each Explore agent returns a tight structured summary, not file dumps.

**Read directly (controller):**
- `docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md` — entities + invariants.
- `.git/sdd/progress.md` — what landed + the carried Minors.

**Dispatch in parallel (one message, 3 Explore agents):**

- **Agent A — "New-entity code map."** Return the exact exports/signatures of the Phase 0–1
  surface so later phases build on it without re-reading:
  `src/schema/{configuration,challenge,attempt,scorer}.ts`,
  `src/config/{configurations,challenges,hashing}.ts`,
  `src/scoring/{dispatch,custom,score-result}.ts`,
  `src/archive/attempt-writer.ts`,
  `src/orchestration/{run-challenge,run-prompt}.ts`,
  `src/cli/commands/submit.ts`. Include: `ResolvedConfiguration`/`ResolvedChallenge`/`ResolvedItem`
  shapes, `computeConfigHash`/`challengeHash` inputs, `AttemptManifest`/`ItemResult` fields,
  `runChallenge` input/return + its env requirements.

- **Agent B — "Prompt corpus inventory" (for Phase 2).** Survey `prompts/*.yaml` (~81 files).
  Return a table: prompt `name`, `category`, `tier`, `scorer` (exact_match/constraint/code_exec),
  and its `system:` key — flagging which prompts carry **task-framing in the system prompt** (e.g.
  `code_tdd` → "practice TDD; given these tests…", `code_direct` → "output only the function",
  `structured`, `code_docstring`) vs. which have a neutral system prompt. The framing-carriers are
  the hard rewrite cases. Also list the `system-prompts.yaml` keys and which prompts use each.

- **Agent C — "Report/webapp pipeline map" (for Phase 3).** Map the data flow from archive →
  `webapp/src/data/data.js`: `src/report/webapp-contract.ts` (`WebappRecord` + `toWebappRecord`),
  the rest of `src/report/`, `webapp/src/lib/pipeline.ts` (`groupRunsByModel`, the
  `model|runtime|quant|temperature|run_id` key, aggregation), `webapp/src/lib/constants.ts`
  (`isPass` = `score === 1`), and where the webapp renders rows/columns + the score. Return the
  structures and functions Phase 3 must change, with file:line anchors.

That's enough to plan any of Phase 2–4 without holding the whole tree in context.

---

## 2. Next steps, grouped & parallelized

Recommended order: **Phase 2 → Phase 3 → Phase 4** (Phase 3 wants real challenge data to display;
Phase 4 is an optimization on top). Each phase gets its **own** `writing-plans` plan, then
`subagent-driven-development`, exactly as Phase 0–1 ran.

### Phase 2 — Corpus rewrite + real challenge set

This is the parallelizable phase. Three sub-steps:

- **2a — Challenge-set design (NOT parallel; needs you + human).** Decide which prompts group into
  which named challenges, their `passThreshold`s, and any per-item custom scorers. This is a design
  decision — run a short **brainstorming** pass with the user (what capabilities should each
  challenge certify?). Output: a list of `(challengeId, version, items[], thresholds)`. Blocks 2c.

- **2b — Corpus rewrite to self-contained prompts (HIGH parallelism).** Each of the ~81 prompts
  folds its system-prompt framing into the prompt **text**, drops the `system:` field, and re-hashes.
  This is **semantic, not mechanical** (preserve meaning; the system prompt carried real task
  framing), so structure it as a **pipeline with a verification stage**:
  - Fan out by **category batch** (from Agent B's inventory: code / constraint / exact_match /
    others), one implementer subagent per batch, all working from a shared one-page **rewrite spec**
    (rules + 2–3 worked examples, esp. a framing-carrier like `code_tdd`). Use `isolation: "worktree"`
    only if batches touch shared files — they don't (one file per prompt), so plain parallel is fine.
  - Each batch is followed by an **adversarial verifier** subagent: confirm each rewritten prompt is
    semantically equivalent to the original (system+prompt combined), is now self-contained, dropped
    `system:`, and re-hashed correctly. Pipeline so a batch verifies as soon as it's rewritten.
  - Land the **`challengeHash` golden-value regression test** here (carried Minor) — it pins the
    drift-detection guarantee the challenge set now depends on.

- **2c — Author challenge YAMLs (depends on 2a + 2b).** Write `challenges/*.yaml` from the 2a design
  against the rewritten corpus; add any custom Python scorers (`scorers/*.py`) for items that need
  them. A handful of files — one or two subagents.

### Phase 3 — Report / webapp re-axis (the big single chunk)

Less parallel (shared contract). Plan it as a mostly-sequential pipeline, with one fork once the
contract is frozen:
- **3a — Freeze the contract:** extend `WebappRecord` with config fields (incl. `systemPrompt`) +
  challenge fields (`challengeId`, `version`, `passed`, `score`); update `toWebappRecord`.
- **3b — Pipeline re-grouping:** rewrite `pipeline.ts` from `groupRunsByModel` to config-rows ×
  challenge-columns; keep `isPass` for item cells, use stored `passed` for challenge cells.
- **3c — Two scores:** implement the **pass rate** (unchanged) AND the **efficiency score**
  `(percentCorrect × uniqueChallengesCompleted × totalAttemptsCompleted) / (generationTokens × timeSpent)`
  per the spec's "Two configuration-level scores" section (percentCorrect = challenge pass-rate;
  `overallTokens` = **generationTokens only**; zero-denominator → `—`).
- **3d — Webapp UI:** render the new axis + both scores. **This forks from 3b**: once the contract
  (3a) is frozen, the backend (3b+3c) and the frontend rendering (3d) can run as two parallel tracks
  that meet at the contract.

### Phase 4 — Cache + resume

Smallest, sequential, follow-on: re-key the cross-run cache to
`(configHash, challengeId, version, itemHash)`; resume by `attemptId`; tests. One short plan.

### Carried fast-follows (from the final review — fold in, don't forget)

Cheap debt; slot where noted:
- `challengeHash` golden test → **do in Phase 2b**.
- `custom.ts` `catchAll` folds infra errors (e.g. `python3` missing) into `CodeExecFailed` — give
  spawn failures a distinct tag → **Phase 2b/2c**, before custom scorers are exercised for real.
- `submit.ts` reads `loadSystemPrompts` twice → swap to `Layer.succeed` on the loaded map (quick win).
- `attempt-writer.ts` `firstNewline < 0` branch lacks an explicit `return yield* Effect.fail` (cosmetic,
  mirrors `writer.ts`).

---

## 3. Suggested first moves in the new session

1. Resolve the **branch decision** (§0) — merge Phase 0–1 or keep stacking.
2. Read the spec + ledger; **dispatch Explore agents A/B/C** (§1) in one message.
3. Run a short **brainstorming** pass for the **challenge set** (Phase 2a) — this is the one piece
   that genuinely needs human direction before anything else can proceed.
4. With Agent B's inventory + the 2a design, write the **Phase 2 plan** (`writing-plans`), then
   execute it with `subagent-driven-development` (rewrite-batch → verify pipeline).
