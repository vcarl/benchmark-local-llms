# QA skill — end-to-end harness smoke check

> Status: design approved 2026-06-19. Builds on the Challenge × Configuration reframe
> (`docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`) and Phases 2–4
> (cache + resume: `docs/superpowers/specs/2026-06-19-phase-4-cache-resume-design.md`).
> Branch: `challenge-config-reframe`. An implementation plan follows via writing-plans.

## Problem

The benchmark harness has 561 unit tests, but they mock out the real surface: the actual `./bench`
CLI, real config resolution against `configs.yaml`, a real model run, real archive I/O, `data.js`
generation, and the webapp. Nothing today asserts, from a cold start, that those pieces actually
fit together. After a multi-phase reframe (identity model, cross-run cache, resume), "the tests
pass" and "the harness is basically functional" are not the same claim.

There is no fast, repeatable way for a human (or Claude in a fresh session) to confirm the harness
still works end-to-end without manually reconstructing the command sequence each time — and doing it
by hand risks polluting the real `./benchmark-archive/` or leaving `webapp/src/data/data.js`
modified.

## Goal

A `/qa` **project skill** that, from a blank session, exercises enough **real** end-to-end behaviors
to assert the harness is basically functional — narrating PASS/FAIL/SKIP with concrete evidence,
pausing only for human-judgment calls, and ending in a summary table. Its value is exercising the
real surface the unit tests mock out, **not** re-testing what those tests already cover.

## Non-goals

- **Re-running the unit suite.** Already covered by `npm test`; QA does not duplicate it.
- **Exhaustive coverage.** No testing of every challenge/scorer combination — one tiny challenge
  through one tiny config is enough to assert "basically functional."
- **Any model download or network fetch.** Tier B runs only against an already-cached model; it
  never downloads.
- **Modifying the harness or CLI.** No new flags, no new code in `src/`. QA works with the CLI
  surface as-is and orchestrates it with small scratch scripts.
- **CI automation.** This is a human-invoked skill, not a pipeline step.

## Ground truth (verified harness facts the skill builds on)

These are stated so the skill does not have to re-derive them.

- **`./bench`** is an executable bash script at repo root that runs
  `node_modules/.bin/tsx src/cli/main.ts "$@"`.
- **Six subcommands:** `run`, `report`, `score`, `submit`, `list-models`, `list-prompts`. There is
  **no dry-run / fake-LLM mode in the CLI** — fakes are test-only
  (`src/orchestration/__tests__/fixtures.ts`), **not** usable from the CLI.
  - `submit --config <id> --challenge <file> [--prompts-dir prompts] [--configs-file configs.yaml]
    [--archive-dir benchmark-archive] [--no-cache] [--resume <attemptId>] [--verbose]` — runs one
    configuration against one challenge.
  - `report [--archive-dir ./benchmark-archive] [--output ./webapp/src/data] [--verbose]` — reads
    `*.jsonl` attempt archives, writes `<output>/data.js` as `globalThis.__BENCHMARK_DATA = [...]`.
  - `score --archive <file.jsonl> [--verbose]` — re-scores an existing archive without running a
    model.
  - `list-models [--models models.yaml]`, `list-prompts [--prompts prompts]` — pure file reads, zero
    runtime deps.
- **A real `submit` / `run` requires** both: a runtime binary (`llama-server` on PATH, or
  `mlx_lm.server` via Python — resolution order: `$VIRTUAL_ENV/bin/python3`, then
  `~/llm-env/bin/python3`, then `python3`) **and** the model cached locally (llamacpp probes
  `~/.cache/huggingface/hub/{artifact}` for a `.gguf` matching the quant; mlx resolves a local
  snapshot). No downloads — prechecks fail cleanly if either is absent.
- **`configs.yaml`** (repo root) `smoke-config` entry:
  `{ id: smoke-config, artifact: Qwen/Qwen2.5-0.5B-Instruct-GGUF, runtime: llamacpp, quant: q4-k-m,
  temperature: 0.0, systemPrompt: concise, maxTokens: 128 }` — a tiny 0.5B model intended for
  exactly this kind of smoke run.
- **Challenges** in `challenges/`: smoke (1 item), math (13), code (12), constraint (12),
  factual (9), logic (11), effect-ts (26). **Prompts:** ~90 YAML files in `prompts/` +
  `system-prompts.yaml`.
- **Webapp** at `webapp/` (Vite + React 19): `npm run dev` (vite dev, ~port 5173),
  `npm run build` (to `webapp/dist/`). It reads `webapp/src/data/data.js` at runtime. That file is
  committed and **currently a stub** (`globalThis.__BENCHMARK_DATA = [];`).
- **Schemas** (`src/schema/attempt.ts`): `AttemptManifest` header + `ItemResult` body lines.
  `ItemResult` now has a **required** `itemHash` field (Phase 4). Hashes are 12-hex
  (`shortSha256`); `itemHash = shortSha256(\`${promptHash}|${scorerKey(scorer)}\`)`, where
  `scorerKey` uses the deterministic `stableStringify`. `isCompleted` =
  `finishedAt !== null && interrupted === false`.
- **Phase 4 behaviors:** cross-run cache (verbatim copy on hit — a cached `ItemResult` keeps its
  **original** `executedAt`), `--no-cache`, and `resumeChallenge` + `--resume` (re-resolve from CLI
  args, validate `configHash` + `challengeHash` against the partial header, fail loudly with
  `ResumeMismatchError`, execute only missing items, re-finalize over the union).

## Design

### The deliverable

A project skill at `.claude/skills/qa/` (invokable as `/qa`). **There is no `.claude/skills/`
directory in this repo yet, so this skill establishes one.** The deliverable is:

- `.claude/skills/qa/SKILL.md` — the procedure Claude follows.
- Any small scratch-script **templates** the procedure needs (the resolution/determinism verifier
  and the schema-valid seed generator — see A4, A5).

The skill is a **procedure**, not harness code. From a blank/fresh session it probes the
environment, runs each behavior in turn, narrates PASS/FAIL/SKIP with concrete evidence, pauses only
for human-judgment calls, and ends with a summary table.

### Three load-bearing principles

**1. Isolation — never pollute real data.**
QA writes only to a scratch directory created with `mktemp -d`; it **never** writes to
`./benchmark-archive/`. The webapp step (A6) **saves** `webapp/src/data/data.js` before overwriting
it (e.g. a `git stash` of that one file, or a copy) and **restores** it afterward regardless of
outcome. A final cleanup step removes the scratch directories and confirms the working tree is back
to its prior state. This honors the standing user rule against destructive or polluting operations
on data directories.

**2. Tiered execution.**
**Tier A (model-free) ALWAYS runs.** **Tier B (live)** runs only if the skill detects that
`smoke-config`'s model is cached **and** a runtime binary is present; otherwise Tier B is **SKIPPED**
with exact, actionable instructions to enable it (which model to cache, which binary/venv to
provide). The skill must clearly report which tier(s) ran.

**3. Evidence, not vibes.**
Every PASS cites a concrete observable — an exit code, an archive line count, finalized header
fields, a 12-hex hash shape, a `data.js` record count, a matching-vs-differing `executedAt`. No
"looks fine" without evidence.

### Tier A — model-free (runs anywhere)

- **A1 — `./bench --help`.** All 6 subcommands present; exit 0. *Evidence:* the 6 subcommand names
  in the output, exit code 0.
- **A2 — `./bench list-models`.** Reads `models.yaml`, prints rows; exit 0. *Evidence:* non-empty
  row output, exit 0.
- **A3 — `./bench list-prompts`.** ~90 prompts across the 6 categories; exit 0. *Evidence:* prompt
  count in the expected ballpark, exit 0.
- **A4 — Resolution + hashing + DETERMINISM.** A small (~20-line) scratch `tsx` script (written into
  the scratch dir, run via `node_modules/.bin/tsx`) that imports the **real** loaders
  (`loadConfigurations`, `loadChallenge`, `loadPromptCorpus`, `loadSystemPrompts` from
  `src/config/*`), resolves `configs.yaml` + a challenge, and asserts:
  - `configHash`, `challengeHash`, and `itemHash` each match the 12-hex shape; **and**
  - a **second** resolution yields **identical** hashes (covers the Phase 4 deterministic
    `stableStringify` work).
  *Evidence:* the three 12-hex hashes and the "identical on re-resolve" assertion result.
- **A5 — `report` → `data.js`.** Seed a **schema-valid** attempt archive into the scratch archive
  dir by generating it through the **real** `AttemptManifest` / `ItemResult` Schema encoders (a small
  scratch `tsx` generator), so the seed cannot drift when schemas change and the required `itemHash`
  is always present. Then run `./bench report --archive-dir <scratch> --output <scratch-out>` and
  assert `<scratch-out>/data.js` parses and contains ≥1 record. *Evidence:* `data.js` record count
  ≥ 1.
- **A6 — Webapp render (JUDGMENT PAUSE).** Save the original `webapp/src/data/data.js`, copy the A5
  `data.js` into `webapp/src/data/data.js`, run `npm run build` in `webapp/` and assert it succeeds,
  then bring up `npm run dev` and screenshot it. **ASK the user** to confirm the config×challenge
  matrix renders (rows / columns / scores). **Restore the original `data.js` afterward regardless of
  outcome.** *Evidence:* successful build, screenshot, and the user's confirmation.
- **A7 — `score` over the seed archive.** `./bench score --archive <seed.jsonl>` re-scores without a
  model; exit 0, prints scores. *Evidence:* exit 0, printed scores.

### Tier B — live (only if a model + binary detected)

- **B0 — Probe (the gate).** Detect a cached model for `smoke-config` **and** a runtime binary. On
  absence, **SKIP Tier B** and print exact, actionable enable instructions (which model to cache,
  which binary/venv to provide).
- **B1 — Live `submit`.** Run `smoke-config` × `challenges/smoke.yaml` into the scratch archive dir.
  Assert: exit 0; an `att-*.jsonl` is written; its header is **finalized** (`interrupted: false`,
  `finishedAt` set); **exactly 1** scored item line; the one-line summary is printed. **This is THE
  core end-to-end assertion.** *Evidence:* exit 0, archive filename, header fields, 1 item line,
  summary line.
- **B2 — Cache hit.** Re-run the same submit into the **same** scratch archive dir; assert the new
  attempt's item `executedAt` **EQUALS** B1's item `executedAt` (verbatim copy from cache ⇒ it was
  not re-executed). *Evidence:* matching `executedAt` values.
- **B3 — `--no-cache`.** Re-run with `--no-cache`; assert the new attempt's item `executedAt` is
  **fresh/newer** (re-executed despite a populated archive). *Evidence:* a newer `executedAt`.
- **B4 — Resume (+ mismatch).** From a real run over a **2-item** challenge, synthesize a **partial**
  archive (`interrupted: true`, only the first item present, with the **same** hashes as the real
  run, under a new `attemptId`). Run `./bench submit --resume <attemptId> --config ... --challenge
  <that challenge> --archive-dir <scratch>`; assert **only the missing item executes**, the header
  finalizes over the **union** (all items present, `interrupted: false`), and the aggregate covers
  all items. Then a **negative** case: `--resume` with a deliberately **mismatched** challenge fails
  loudly (`ResumeMismatchError`) and leaves the archive untouched. *Evidence:* union item count,
  finalized header, and the `ResumeMismatchError` on the negative case.

### Output

A **summary table** with columns: **behavior | tier | PASS/FAIL/SKIP | evidence** — one row per
behavior above. Followed by a **cleanup-confirmation line**: scratch directories removed,
`webapp/src/data/data.js` restored, working tree clean.

## Scope / YAGNI

- **B4's mismatch case** and **A7 (`score`)** are explicitly the most trimmable steps if a leaner
  pass is wanted.
- The seed archive (A5) is generated through the **real schema encoders** specifically so the skill
  does not rot when the schemas change — the seed and the required `itemHash` stay in sync with
  `src/schema/attempt.ts` automatically.

## Constraints to honor

- QA must **never** touch `./benchmark-archive/` and must **never** leave `webapp/src/data/data.js`
  modified.
- **No harness/CLI code changes** — the skill only orchestrates existing commands plus small scratch
  scripts. No new CLI flags.
- The `.claude/skills/qa/` skill (SKILL.md + any seed/verifier scratch-script templates) is the
  deliverable.

## Risks

- **Pollution risk is the central risk.** A mishandled archive dir or an un-restored `data.js` would
  corrupt real data or leave the working tree dirty. Mitigated by the `mktemp -d` scratch dir, the
  save/restore around A6, and the final cleanup-confirmation line — which must assert a clean working
  tree before the skill claims success.
- **Tier B unavailability is expected, not a failure.** When no model/binary is present, Tier B
  SKIPs with enable instructions; the skill still reports a successful Tier A pass.
