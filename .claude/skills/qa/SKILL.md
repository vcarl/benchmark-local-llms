---
name: qa
description: Use when asked to QA / smoke-test / end-to-end check the benchmark harness — to confirm the `./bench` CLI, config resolution, store and archive I/O, report snapshots, and the webapp are "basically functional" from a cold start (the real surface unit tests mock out). For human-invoked verification after changes, not a CI step or a re-run of `npm test`.
---

# QA — end-to-end harness smoke check

## Overview

Exercises the **real** `./bench` CLI / archive / report / webapp surface that the unit
tests mock out, asserting the harness is basically functional from a blank session. Core
principle: **evidence, not vibes** — every PASS cites a concrete observable; failure is failure.

## Principles

| Principle | Rule |
| --- | --- |
| **Isolation** | Write ONLY to scratch dirs from `mktemp -d`. NEVER touch `./benchmark-archive/` or `./store/`. Remove `webapp/public/snapshots/` and `webapp/dist/` if A6 created them. End with a clean-working-tree confirmation. |
| **Tiered** | Tier A (model-free) ALWAYS runs. Tier B (live) runs ONLY if a cached model + runtime binary is detected; else SKIP with enable instructions. State which tier(s) ran. |
| **Evidence-not-vibes** | Every PASS cites a concrete observable (exit code, bundle line count, sealed bundle digest, 12-hex hash, snapshot row count, `verify` ok, skipped-vs-fresh executions). No "looks fine." |

All commands run from the repo root. `./bench` is the repo-root executable.

## Setup / probe

1. `SCRATCH_ARCH=$(mktemp -d)`, `SCRATCH_STORE=$(mktemp -d)`, `SCRATCH_OUT=$(mktemp -d)`, `SEED="$SCRATCH_ARCH/att-seed.jsonl"`.
2. Note whether `webapp/public/snapshots/` exists (it is gitignored); A6 writes it only when it does not.
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
| A1 | `./bench --help` | exit 0; output lists the pipeline subcommands: `run`, `verify`, `report`, `list-models`, `list-prompts`. `score` and `export` are absent. Assert these are present — do **not** gate on an exact count, since extra/legacy subcommands may also appear. |
| A2 | `./bench list-models` | exit 0; ≥1 non-empty model row printed. |
| A3 | `./bench list-prompts` | exit 0; prompt count in the ~90 ballpark across the 6 categories. |
| A4 | `node_modules/.bin/tsx .claude/skills/qa/check-resolution.ts` | exit 0; prints `configHash`/`challengeHash`/`itemHash` (each 12-hex) and `RESOLUTION OK` (identical on re-resolve = deterministic). The golden-`challengeHash` invariant for the canonical challenge is pinned by `src/config/challenges.test.ts` (unit), not re-checked here. |
| A5 | `node_modules/.bin/tsx .claude/skills/qa/seed-archive.ts "$SEED"`, then `./bench legacy freeze --dataset draft --title "Pre-release (draft)" --release draft --archive "$(basename "$SCRATCH_ARCH")" --challenges-dir releases/draft/challenges --legacy-root "$(dirname "$SCRATCH_ARCH")" --legacy-hardware unknown --datasets-dir "$SCRATCH_OUT/datasets"`, then `./bench report --datasets-dir "$SCRATCH_OUT/datasets" --legacy-root "$(dirname "$SCRATCH_ARCH")" --output "$SCRATCH_OUT/snapshots"` | `SEED OK`; freeze logs `1 attempts, 4 blobs`; report logs `draft: 1 rows over … challenges → <digest>.json` and `details 1 written, 0 skipped` — the seed is self-sufficient, so its drilldown is reconstructed; `$SCRATCH_OUT/snapshots/index.json` lists the snapshot, whose file hashes (`shasum -a 256`) to its name. |
| A6 | **JUDGMENT PAUSE** (below) | webapp builds; screenshot captured; user confirms the model list renders. |
| A7 | `./bench verify "$SEED"` (the legacy seed is not a schemaVersion 4 bundle) | exits nonzero; prints `FAILED` for the file; writes nothing (`git status` and `$SCRATCH_ARCH` unchanged). |
| A8 | reconstruction / drilldown JSON (below) | the A5 detail file exists, parses, and carries the reconstructed `system_prompt_text`, per-item `prompt_text`, and `scorer` — proving the content store round-trips. |

Verify A5 row count with:
`node -e 'const fs=require("fs"),d=process.argv[1],i=JSON.parse(fs.readFileSync(d+"/index.json"));console.log(JSON.parse(fs.readFileSync(d+"/"+i.snapshots[0].digest+".json")).rows.length)' "$SCRATCH_OUT/snapshots"`

### A6 — Webapp render (JUDGMENT PAUSE)

1. `cp -R "$SCRATCH_OUT/snapshots" webapp/public/snapshots` (only when Setup found none there).
2. `cd webapp && npm run build` — PASS requires it to exit 0 (`webapp/dist/` produced).
3. `cd webapp && npm run dev` (vite, ~port 5173); screenshot the page.
4. **ASK the user** to confirm the model list and scatter render (the seeded row listed with
   its score and completeness). Their confirmation is the evidence.
5. **Clean up regardless of outcome**: `rm -r webapp/public/snapshots webapp/dist` (the paths A6
   created). Stop the dev server gracefully (SIGTERM, not SIGKILL).

### A8 — reconstruction / drilldown JSON

A5's report emits one drilldown file per completed, reconstructible attempt at
`$SCRATCH_OUT/snapshots/details/<attemptId>.json`. PASS: that file exists, parses as JSON, and
its payload carries the reconstructed `system_prompt_text`, an `items[]` array where each item has a
non-empty `prompt_text` and a `scorer` object, and the recorded `output`/`score`. This proves the
content store round-trips end-to-end.
Verify with:
`node -e 'const d=require(process.argv[1]);if(!d.system_prompt_text||!d.items[0].prompt_text||!d.items[0].scorer)process.exit(1);console.log("DETAIL OK",d.items.length,"items")' "$SCRATCH_OUT/snapshots/details/"*.json`

## Tier B — live (only if detected)

**B0 gate** — if `TIER_B=off`, SKIP B1–B4 and print exact enable instructions: cache
`Qwen/Qwen2.5-0.5B-Instruct-GGUF` (quant `Q4_K_M`) under `~/.cache/huggingface/hub/`, and
provide `llama-server` on PATH (or `mlx_lm` via venv). Tier A still passes; Tier B SKIP is
expected, not a failure.

When `TIER_B=on`:

| # | Command | PASS assertion (evidence) |
| --- | --- | --- |
| B1 | `./bench run --configs smoke-config --challenges smoke --store "$SCRATCH_STORE"` | exit 0; `$SCRATCH_STORE/open/` is empty and one `bundles/<digest>.jsonl` exists whose name is the SHA-256 of its bytes (`shasum -a 256`); header sealed (`finishedAt` set, `executions` = 4); **exactly 4** execution lines after the header (one per item in `challenges/smoke.yaml`); `scores/<digest>.jsonl` holds 4 score records; a live per-cell line printed (e.g. `[1/1 smoke-config] smoke@1 → … PASS\|FAIL`) and an end-of-run grid. THE core e2e assertion. Record the digest. |
| B2 | `./bench verify "$SCRATCH_STORE"/bundles/*.jsonl` | exit 0; prints `ok` for the bundle. |
| B3 | Re-run the SAME `./bench run --configs smoke-config --challenges smoke --store "$SCRATCH_STORE"` | exit 0; every item × sample is skipped (held execution found); **no new file** in `bundles/` (still one bundle, same digest). |
| B4 | Re-run with `--no-skip` added | a **second** bundle appears in `bundles/` with fresh `executedAt` values (re-executed despite the populated store); `./bench verify` passes on it. |

## Output

Final summary TABLE — one row per behavior:

| Behavior | Tier | PASS/FAIL/SKIP | Evidence |
| --- | --- | --- | --- |
| A1 `--help` | A | … | pipeline subcommands present, exit 0 |
| A7 `verify` negative | A | … | legacy file FAILED, exit nonzero |
| A8 reconstruction | A | … | detail JSON has system/prompt/scorer text |
| … | … | … | … |

Followed by a cleanup-confirmation line: scratch dirs removed, A6's `webapp/public/snapshots/`
and `webapp/dist/` removed, `git status` clean.

## Cleanup

1. `rm -rf "$SCRATCH_ARCH" "$SCRATCH_STORE" "$SCRATCH_OUT"` and any temp backup files.
2. Remove A6's `webapp/public/snapshots/` and `webapp/dist/` if not already done.
3. Run `git status` and confirm the working tree matches its pre-QA state (no stray
   modifications). The skill must NOT claim success until this is confirmed.

## Common mistakes / red flags

- Leaving A6's `webapp/public/snapshots/` behind (A6 must clean up even on failure).
- Writing to `./benchmark-archive/` or `./store/` instead of the `mktemp -d` scratch dir.
- Claiming PASS without a concrete observable ("looks fine" is not evidence).
- Running Tier B assertions when no model/binary is present — that must be SKIP, not FAIL.
- Treating a Tier B SKIP (no model/binary present) as a FAIL — that is an environment gap, not a harness bug.
