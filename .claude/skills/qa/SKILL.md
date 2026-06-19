---
name: qa
description: Use when asked to QA / smoke-test / end-to-end check the benchmark harness — to confirm the `./bench` CLI, config resolution, archive I/O, report `data.js`, and the webapp are "basically functional" from a cold start (the real surface unit tests mock out). For human-invoked verification after changes, not a CI step or a re-run of `npm test`.
---

# QA — end-to-end harness smoke check

## Overview

Exercises the **real** `./bench` CLI / archive / report / webapp surface that the 561 unit
tests mock out, asserting the harness is basically functional from a blank session. Core
principle: **evidence, not vibes** — every PASS cites a concrete observable; failure is failure.

## Principles

| Principle | Rule |
| --- | --- |
| **Isolation** | Write ONLY to scratch dirs from `mktemp -d`. NEVER touch `./benchmark-archive/`. Save+restore the committed `webapp/src/data/data.js`. End with a clean-working-tree confirmation. |
| **Tiered** | Tier A (model-free) ALWAYS runs. Tier B (live) runs ONLY if a cached model + runtime binary is detected; else SKIP with enable instructions. State which tier(s) ran. |
| **Evidence-not-vibes** | Every PASS cites a concrete observable (exit code, archive line count, finalized header fields, 12-hex hash, `data.js` record count, matching-vs-fresh `executedAt`). No "looks fine." |

All commands run from the repo root. `./bench` is the repo-root executable.

## Setup / probe

1. `SCRATCH_ARCH=$(mktemp -d)`, `SCRATCH_OUT=$(mktemp -d)`, `SEED="$SCRATCH_ARCH/att-seed.jsonl"`.
2. Save the committed webapp data: `cp webapp/src/data/data.js /tmp/qa-data-backup.js`
   (or `git stash push -- webapp/src/data/data.js`). This is restored in A6 and Cleanup.
3. **Probe Tier B** — both must hold:
   - **Model cached** for `smoke-config` (`Qwen/Qwen2.5-0.5B-Instruct-GGUF`, quant `Q4_K_M`):
     a `.gguf` matching the quant under `~/.cache/huggingface/hub/models--Qwen--Qwen2.5-0.5B-Instruct-GGUF/`.
   - **Binary present**: `llama-server` on `PATH`, OR `mlx_lm` importable via the first working
     of `$VIRTUAL_ENV/bin/python3` → `~/llm-env/bin/python3` → `python3`.
   - Set `TIER_B=on` only if both hold, else `TIER_B=off`. State the decision and which tier(s)
     will run before proceeding.

## Tier A — model-free (always runs)

| # | Command | PASS assertion (evidence) |
| --- | --- | --- |
| A1 | `./bench --help` | exit 0; output lists all 6 subcommands: `run report score submit list-models list-prompts`. |
| A2 | `./bench list-models` | exit 0; ≥1 non-empty model row printed. |
| A3 | `./bench list-prompts` | exit 0; prompt count in the ~90 ballpark across the 6 categories. |
| A4 | `node_modules/.bin/tsx .claude/skills/qa/check-resolution.ts` | exit 0; prints `configHash`/`challengeHash`/`itemHash` (each 12-hex) and `RESOLUTION OK` (identical on re-resolve = deterministic). |
| A5 | `node_modules/.bin/tsx .claude/skills/qa/seed-archive.ts "$SEED"` then `./bench report --archive-dir "$SCRATCH_ARCH" --output "$SCRATCH_OUT"` | `SEED OK`; report logs `loaded 1 attempts` / `dropped 0 (incomplete)`; `$SCRATCH_OUT/data.js` parses and `globalThis.__BENCHMARK_DATA.length >= 1`. |
| A6 | **JUDGMENT PAUSE** (below) | webapp builds; screenshot captured; user confirms the matrix renders. |
| A7 | `./bench score --archive "$SEED"` | **FAIL (known bug)** — `score` reads legacy format only (below). |

Verify A5 record count with:
`node -e 'globalThis.__BENCHMARK_DATA=[];require(process.argv[1]);console.log(globalThis.__BENCHMARK_DATA.length)' "$SCRATCH_OUT/data.js"`

### A6 — Webapp render (JUDGMENT PAUSE)

1. `cp "$SCRATCH_OUT/data.js" webapp/src/data/data.js` (original already backed up in Setup).
2. `cd webapp && npm run build` — PASS requires it to exit 0 (`webapp/dist/` produced).
3. `cd webapp && npm run dev` (vite, ~port 5173); screenshot the page.
4. **ASK the user** to confirm the config×challenge matrix renders (rows = configs, columns =
   challenges, score cells). Their confirmation is the evidence.
5. **Restore regardless of outcome**: `cp /tmp/qa-data-backup.js webapp/src/data/data.js`
   (or `git stash pop`). Stop the dev server gracefully (SIGTERM, not SIGKILL).

### A7 — `score` over the seed (KNOWN BUG — tracked for fix)

`score` reads the **legacy** `RunManifest`/`ExecutionResult` archive format
(`src/archive/loader.ts`), whereas `submit`/`report` use the new `AttemptManifest`/`ItemResult`
attempt format (`src/report/load-attempts.ts`). The A5 seed is the attempt format, so
`./bench score --archive "$SEED"` fails with `JsonlCorruptLine`. This is a **known harness bug**
(`score` was never migrated to the attempt format) accepted for a fix — not a seed defect.
Until that fix lands, record A7 as **FAIL (known bug)** with the `JsonlCorruptLine` as evidence.
Once `score` reads attempt archives, A7 becomes a real PASS (exit 0, scores printed).

## Tier B — live (only if detected)

**B0 gate** — if `TIER_B=off`, SKIP B1–B4 and print exact enable instructions: cache
`Qwen/Qwen2.5-0.5B-Instruct-GGUF` (quant `Q4_K_M`) under `~/.cache/huggingface/hub/`, and
provide `llama-server` on PATH (or `mlx_lm` via venv). Tier A still passes; Tier B SKIP is
expected, not a failure.

When `TIER_B=on`:

| # | Command | PASS assertion (evidence) |
| --- | --- | --- |
| B1 | `./bench submit --config smoke-config --challenge challenges/smoke.yaml --archive-dir "$SCRATCH_ARCH"` | exit 0; an `att-*.jsonl` written; header **finalized** (`interrupted:false`, `finishedAt` set); **exactly 1** `ItemResult` line; one-line summary printed. THE core e2e assertion. Record the item's `executedAt`. |
| B2 | Re-run the SAME submit into the SAME `$SCRATCH_ARCH` | new attempt's item `executedAt` **EQUALS** B1's (cache hit = verbatim copy, not re-executed). |
| B3 | Re-run with `--no-cache` | new attempt's item `executedAt` is **fresh/newer** (re-executed despite populated archive). |
| B4 | Resume (+ mismatch) — below | only the missing item runs; header finalizes over the union; mismatch fails with `ResumeMismatchError`, archive untouched. |

### B4 — Resume (+ negative mismatch)

1. Pick a **2-item** challenge (e.g. a 2-item subset/small challenge) and do a real `submit`
   into `$SCRATCH_ARCH` to learn its real `configHash`/`challengeHash` (or read them from A4
   against that challenge).
2. Synthesize a **partial** archive under a NEW `attemptId` (`att-<configHash>-<challengeHash>-<ts>.jsonl`):
   header `interrupted:true`, `finishedAt:null`, with the **first item only** and the **matching
   hashes**. (Reuse `seed-archive.ts` as a template; set `interrupted:true` and drop item 2.)
3. `./bench submit --resume <attemptId> --config <cfg> --challenge <that-challenge> --archive-dir "$SCRATCH_ARCH"`
   — PASS: only the missing 2nd item executes; finalized header has **both** items, `interrupted:false`,
   aggregate covering all items.
4. **Negative**: `./bench submit --resume <attemptId> --config <cfg> --challenge <DIFFERENT challenge> --archive-dir "$SCRATCH_ARCH"`
   — PASS: fails loudly with `ResumeMismatchError`; the partial archive is left untouched.

## Output

Final summary TABLE — one row per behavior:

| Behavior | Tier | PASS/FAIL/SKIP | Evidence |
| --- | --- | --- | --- |
| A1 `--help` | A | … | 6 subcommands, exit 0 |
| … | … | … | … |

Followed by a cleanup-confirmation line: scratch dirs removed, `webapp/src/data/data.js`
restored, `git status` clean.

## Cleanup

1. `rm -rf "$SCRATCH_ARCH" "$SCRATCH_OUT"` and any temp backup files.
2. Restore `webapp/src/data/data.js` from the backup (or `git stash pop`) if not already done.
3. Run `git status` and confirm the working tree matches its pre-QA state (no stray
   modifications). The skill must NOT claim success until this is confirmed.

## Common mistakes / red flags

- Forgetting to restore `webapp/src/data/data.js` (A6 must restore even on failure).
- Writing to `./benchmark-archive/` instead of the `mktemp -d` scratch dir.
- Claiming PASS without a concrete observable ("looks fine" is not evidence).
- Running Tier B assertions when no model/binary is present — that must be SKIP, not FAIL.
- Treating a Tier B SKIP (no model/binary present) as a FAIL — that is an environment gap, not a harness bug. (A7, by contrast, IS a tracked harness bug → record it FAIL.)
