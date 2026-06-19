# Stream B — `score` migration — Session Kickoff

> Handoff for a fresh session. Supersedes `2026-06-19-qa-skill-session-kickoff.md`.
> Stream A (`/qa`) is **done and validated live**; this session paused before Stream B's
> headline task: migrating `score` off the legacy archive format.

## Where we are

Branch `challenge-config-reframe` @ **`c64b055`**, **UNMERGED**. `npm test` = **561 passing / 89 files**,
typecheck + lint clean. Working tree clean except two known untracked files
(`benchmark-archive.bak-*.tar.gz`, `2026-06-19-phase-4-session-kickoff.md`) — leave them.

**This session (QA + first bug fix):**
- Ran `/qa` end-to-end **including the live Tier B path for the first time ever** (pre-cached
  `Qwen/Qwen2.5-0.5B-Instruct-GGUF` Q4_K_M; `llama-server` on PATH). A1–A6 PASS, A7 FAIL (known
  `score` bug), **B1–B4 all PASS** (live submit / cache-hit `executedAt` equality / `--no-cache`
  freshness / resume-only-missing + `ResumeMismatchError` with archive untouched).
- **Fixed bug #1 (commit `f5e8ee2`):** `smoke-config` had `quant: q4-k-m` (dashes), which the
  llamacpp GGUF resolver never matched against `…q4_k_m.gguf` — so *every* live llamacpp run via
  smoke-config died pre-launch, silently, because Tier B had never been exercised. Now `Q4_K_M`.
  Red→green proven by the live B1–B4 run. 561 tests green.
- **Skill consistency (commit `c64b055`):** updated `/qa` SKILL.md probe text + `seed-archive.ts`
  to `Q4_K_M` to match the fix.

## Next: the `score` migration (bug #2, A7)

The only outstanding QA finding. `./bench score --archive <attempt.jsonl>` fails with
`JsonlCorruptLine` at `src/archive/loader.ts:50`. Root cause: `score` reads the **legacy**
`RunManifest`/`ExecutionResult` format (`src/archive/loader.ts`), while `submit`/`report` use the
new `AttemptManifest`/`ItemResult` format (`src/report/load-attempts.ts`). `score` was never
migrated. Tracked in auto-memory `project_score_legacy_format`.

**Approach (its own brainstorm → writing-plans → subagent-driven-development cycle):**
- Migrate `score` onto the attempt format (`load-attempts.ts`).
- **Template:** the Phase-4 *additive* pattern — add the new reader path without breaking the still-live
  legacy `run`/`findCachedResult` consumers of `loader.ts`. Don't rip out the legacy loader; `run`
  still uses it.
- **Red→green proof required:** reproduce the `JsonlCorruptLine` on an attempt archive first, then
  show `score` exits 0 and prints scores over that same archive. Re-run `/qa` afterward — **A7 must
  flip to a real PASS**.

## After Stream B settles

Finish the branch (all four reframe phases + these fixes) via
`superpowers:finishing-a-development-branch` — single merge/PR to `main`, per the standing
stack decision.

## How to start

1. Read this doc + `.git/sdd/progress.md` + the `project_score_legacy_format` memory.
2. `systematic-debugging` on `score`: reproduce `JsonlCorruptLine` on a fresh attempt archive
   (use `/qa`'s `seed-archive.ts` as a quick attempt-format generator).
3. brainstorm → plan → implement the additive migration.
4. Re-run `/qa`; confirm A7 PASS; then finish the branch.
