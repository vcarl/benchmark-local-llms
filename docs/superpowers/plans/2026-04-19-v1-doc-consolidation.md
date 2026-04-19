# v1 Documentation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current docs (Python-era plans/specs + monolithic ARCHITECTURE.md) with a topical v1 doc set: README + 5 focused `docs/*.md` files, each describing how the harness works and what it guarantees.

**Architecture:** Mine canonical info from `src/` (the v1 truth). Delete obsolete plans/specs/blog outline. Write 4 new docs (GUARANTEES, CONFIG, ARCHIVE-FORMAT, SCORING). Trim ARCHITECTURE.md and revise README.md. Verify with grep + an independent subagent read-through.

**Tech Stack:** Markdown only. Source citations resolve into `src/` paths. Reference commit for `Last verified` headers: `eae465c` (date `2026-04-19`).

**Spec:** `docs/superpowers/specs/2026-04-19-v1-doc-consolidation-design.md` — read this first for design rationale, deletion list, file outlines, and verification criteria.

---

## File Structure

| File | State | Owner of |
|---|---|---|
| `README.md` | revise | Quickstart, prerequisites, layout, CLI ref, dev loop |
| `docs/ARCHITECTURE.md` | trim | Layer map, lifecycle, data flow, troubleshooting, conventions |
| `docs/GUARANTEES.md` | new | Invariants with canonical refs |
| `docs/CONFIG.md` | new | YAML schemas (models / prompts / scenarios / system prompts) |
| `docs/ARCHIVE-FORMAT.md` | new | RunManifest + ExecutionResult JSONL format |
| `docs/SCORING.md` | new | Scorer dispatch, scorer types, constraint + game catalogs |

Deleted: `docs/superpowers/plans/*` (5 files), `docs/superpowers/specs/2026-04-04-*` and `2026-04-07-*` (2 files), `docs/blog-post-outline.md`. The `docs/superpowers/specs/` dir is preserved with this plan's design doc as its sole resident.

---

### Task 1: Source intelligence — capture canonical references

**Files:**
- Read only: `src/schema/`, `src/scoring/`, `src/orchestration/`, `src/llm/servers/supervisor.ts`, `src/archive/`, `src/config/`, `scripts/lint-strict.sh`

This task produces nothing on disk; its output is a notes buffer the implementer carries into Tasks 5–8. Doing it once up front avoids repeated source reads while drafting.

- [ ] **Step 1: Enumerate the constraint check types**

Read: `src/schema/constraints.ts` and `src/scoring/constraint-checks.ts`

Capture the full list of check `type` discriminator values. The spec says 20; verify the actual count and the canonical names. Note one-line semantics for each (look at handler functions in `constraint-checks.ts`).

- [ ] **Step 2: Enumerate the game scorers**

Read: `src/scoring/game.ts`

Capture the full list of scenario scorer names registered (likely a `GAME_SCORERS` map). The spec says 14; verify the actual count and canonical names. Note one-line semantics for each.

- [ ] **Step 3: Capture the schema field shapes**

Read: `src/schema/model.ts`, `src/schema/prompt.ts`, `src/schema/scenario.ts`, `src/schema/run-manifest.ts`, `src/schema/execution.ts`, `src/schema/scorer.ts`, `src/schema/enums.ts`.

For each, capture the field names + types as they are *currently* defined. This is the source-of-truth for CONFIG.md and ARCHIVE-FORMAT.md.

- [ ] **Step 4: Confirm the lint-strict rules**

Read: `scripts/lint-strict.sh`

Capture the exact patterns it bans (`throw`, `try`/`catch`, `console.*`) and the exact directory exception (`src/cli/`). Used in GUARANTEES.md.

- [ ] **Step 5: Confirm the supervisor SIGTERM→SIGKILL behavior**

Read: `src/llm/servers/supervisor.ts`

Capture the timeout budget (spec says 10s; verify) and the interruptibility wrapper detail. Used in GUARANTEES.md.

No commit — this task produces only notes for downstream tasks.

---

### Task 2: Delete the obsolete docs

Doing the deletions early gets the old material out of the way so the verification subagent in Task 11 doesn't see it.

**Files:**
- Delete: `docs/superpowers/plans/2026-03-24-split-benchmark-modules.md`
- Delete: `docs/superpowers/plans/2026-04-04-separate-execution-from-scoring.md`
- Delete: `docs/superpowers/plans/2026-04-04-summary-charts.md`
- Delete: `docs/superpowers/plans/2026-04-07-spacemolt-scenarios.md`
- Delete: `docs/superpowers/plans/2026-04-10-benchmark-reset-and-scenarios.md`
- Delete: `docs/superpowers/plans/` (the empty dir itself)
- Delete: `docs/superpowers/specs/2026-04-04-summary-charts-design.md`
- Delete: `docs/superpowers/specs/2026-04-07-spacemolt-scenarios-design.md`
- Delete: `docs/blog-post-outline.md`
- Keep: `docs/superpowers/specs/2026-04-19-v1-doc-consolidation-design.md` (this work's design doc)
- Keep: `docs/superpowers/plans/2026-04-19-v1-doc-consolidation.md` (this plan — keep until execution finishes; deletion of the plans dir happens after the plan is no longer needed; for now `git rm` everything *except* this plan, then delete the plan only at the end)

Note: this task **does not** delete `docs/superpowers/plans/` yet, because this plan file lives there. The empty-dir cleanup happens in Task 12.

- [ ] **Step 1: Remove the 7 historical files**

Run:
```bash
git rm docs/superpowers/plans/2026-03-24-split-benchmark-modules.md \
       docs/superpowers/plans/2026-04-04-separate-execution-from-scoring.md \
       docs/superpowers/plans/2026-04-04-summary-charts.md \
       docs/superpowers/plans/2026-04-07-spacemolt-scenarios.md \
       docs/superpowers/plans/2026-04-10-benchmark-reset-and-scenarios.md \
       docs/superpowers/specs/2026-04-04-summary-charts-design.md \
       docs/superpowers/specs/2026-04-07-spacemolt-scenarios-design.md \
       docs/blog-post-outline.md
```

- [ ] **Step 2: Verify the keep list survived**

Run:
```bash
ls docs/superpowers/specs/ docs/superpowers/plans/
```
Expected: each dir contains exactly the `2026-04-19-*` file from this work.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: drop Python-era plans, specs, and blog outline"
```

---

### Task 3: Write `docs/GUARANTEES.md`

**Files:**
- Create: `docs/GUARANTEES.md`

Pulls all invariants out of the current `docs/ARCHITECTURE.md` (cache, supervisor shutdown, archive format, conventions) into a dedicated reference. Source-of-truth for "what does this system promise."

- [ ] **Step 1: Write the file**

Create `docs/GUARANTEES.md` with this structure (fill body from Task 1 notes — do not transcribe anything you haven't verified against `src/`):

```markdown
# Guarantees

> _Last verified: 2026-04-19 against commit `eae465c`._

The harness commits to a small set of invariants. Each section names the invariant, explains what it means, and points at the canonical implementation.

## Scope-managed resources

Every subprocess, HTTP session, and SSE connection is acquired inside an `Effect.Scope`. Closing the scope runs all registered finalizers in LIFO order. Acquisition implies guaranteed release; there is no path through normal completion or interruption that leaves a process running.

Ref: `src/orchestration/run-model.ts` (scope wrapping), `src/llm/servers/supervisor.ts` (server finalizer registration).

## Graceful shutdown: SIGTERM → SIGKILL

The server supervisor sends SIGTERM, waits up to 10s for clean exit, then escalates to SIGKILL. Both kill calls are wrapped in `Effect.interruptible` so the finalizer can preempt a hung child.

Ref: `src/llm/servers/supervisor.ts`.

## Interruption safety

Ctrl-C does not skip archive finalization. The manifest header is rewritten with `finishedAt` and final `stats` regardless of how the run ended; `interrupted: true` is set when the run did not reach normal completion.

Ref: `src/orchestration/finalize-archive.ts`, `src/orchestration/run-model.ts`.

## Archive atomicity

Line 1 of each `.jsonl` is the `RunManifest` and is overwritten exactly once at finalize. Lines 2+ are `ExecutionResult` records and are append-only — once written, they are never modified or removed.

Ref: `src/archive/writer.ts`.

## Cross-run cache validity

A cached result is reused only when `(artifact, promptName, promptHash, temperature)` match exactly. Cache validation rejects entries where `error !== null`, and (for prompt results) where `output` is empty. Ties broken by `executedAt` — most recent wins. `--fresh` bypasses the scan entirely.

Ref: `src/archive/cache.ts` (scan), `src/orchestration/cache.ts` (validation).

## Self-contained archives

Each manifest embeds the `promptCorpus` and `scenarioCorpus` keyed by name. Re-scoring (`./bench score`, `./bench report --scoring as-run`) reads straight from the manifest and never touches the YAML corpus on disk.

Ref: `src/schema/run-manifest.ts`, `src/orchestration/run-model.ts`.

## Fail-fast config

All YAML loaders fully decode at startup. A malformed `prompts/*.yaml` cannot delay an error until prompt-run time.

Ref: `src/config/`.

## Error-channel discipline

Every fallible operation returns `Effect<A, TaggedError, R>`. Tagged errors live in `src/errors/<domain>.ts`. The patterns `throw`, `try`/`catch`, and `console.*` are banned outside `src/cli/`, enforced by `scripts/lint-strict.sh` in `npm run lint`.

Ref: `src/errors/`, `scripts/lint-strict.sh`.

## Re-scoring stability

`./bench score --archive FILE` and `./bench report --scoring as-run` produce identical scoring output for a given archive across runs, as long as the scorer code is unchanged. `--scoring current` re-scores against the current `prompts/` corpus on disk.

Ref: `src/scoring/score-result.ts`, `src/cli/commands/`.
```

If Task 1 found the actual SIGTERM budget differs from 10s, update §"Graceful shutdown" before committing.

- [ ] **Step 2: Verify all `src/...` paths exist**

Run, for each `src/...` path cited in the file:
```bash
ls <path>
```
All must exist. If one doesn't, find the correct path and fix the doc.

- [ ] **Step 3: Commit**

```bash
git add docs/GUARANTEES.md
git commit -m "docs: add GUARANTEES.md — system invariants with canonical refs"
```

---

### Task 4: Write `docs/ARCHIVE-FORMAT.md`

**Files:**
- Create: `docs/ARCHIVE-FORMAT.md`

- [ ] **Step 1: Write the file**

Create `docs/ARCHIVE-FORMAT.md`. Use Task 1 notes for the actual `RunManifest` and `ExecutionResult` field shapes — do not invent fields.

```markdown
# Archive Format

> _Last verified: 2026-04-19 against commit `eae465c`._

## File layout

One `.jsonl` per `(model, runtime, quant)` run, named `{runId}.jsonl`, written under `--archive-dir` (default `benchmark-archive/`).

- **Line 1**: `RunManifest` — header, rewritten exactly once at finalize.
- **Lines 2+**: `ExecutionResult` records — append-only.

## RunManifest

[Insert the field table from Task 1 notes. Columns: field name, type, description.]

The manifest is rewritten on finalize via a read-truncate-append helper in `src/orchestration/finalize-archive.ts`. The trailer adds `finishedAt`, `interrupted`, and final `stats`. The embedded `promptCorpus` and `scenarioCorpus` are written once at header time and never modified.

Ref: `src/schema/run-manifest.ts`.

## ExecutionResult

[Insert the field table from Task 1 notes. Columns: field name, type, description.]

Each record represents one prompt × temperature execution or one scenario execution. `error` is `null` on success and a tagged error tag on failure.

Ref: `src/schema/execution.ts`.

## Self-contained archives

The manifest embeds the corpus that was used at execution time. This means:

- Re-scoring an old archive does not require the original `prompts/` corpus to still exist on disk.
- A corpus change (renaming a prompt, editing a constraint) does not retroactively change historical archive scoring unless `--scoring current` is passed.

## Re-scoring CLIs

| Command | Behavior |
|---|---|
| `./bench score --archive FILE` | Score one archive against its embedded corpus. |
| `./bench report --scoring as-run` | Render report, scoring each archive against its own embedded corpus. |
| `./bench report --scoring current` | Render report, scoring each archive against the current `prompts/` on disk. |

## Implementation pointers

| Concern | File |
|---|---|
| Header / append / trailer rewrite | `src/archive/writer.ts` |
| Streaming JSONL reader | `src/archive/reader.ts` |
| Cross-run cache scan | `src/archive/cache.ts` |
| Manifest finalize handler | `src/orchestration/finalize-archive.ts` |
```

- [ ] **Step 2: Verify all `src/...` paths exist**

Same procedure as Task 3 Step 2.

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHIVE-FORMAT.md
git commit -m "docs: add ARCHIVE-FORMAT.md — manifest + execution JSONL schema"
```

---

### Task 5: Write `docs/CONFIG.md`

**Files:**
- Create: `docs/CONFIG.md`

- [ ] **Step 1: Write the file**

Create `docs/CONFIG.md`. Use Task 1 notes for accurate field names and types.

```markdown
# Configuration

> _Last verified: 2026-04-19 against commit `eae465c`._

All YAML config is loaded and decoded at startup (see [GUARANTEES.md § Fail-fast config](./GUARANTEES.md)). Any decode error aborts before any LLM call is made.

## `models.yaml`

Registry of models the harness can run.

[Insert minimal example using actual field names from `src/schema/model.ts`. Required fields and optionals from Task 1 notes.]

Ref: schema `src/schema/model.ts`, loader `src/config/models.ts`.

## `prompts/*.yaml`

One file per prompt variant. Each entry is a `PromptCorpusEntry`.

[Insert minimal example using actual field names from `src/schema/prompt.ts`. Show one example per scorer variant: exact_match, constraint, code_exec.]

The `scorer` field is a discriminated union; see [SCORING.md](./SCORING.md) for the per-variant shape and the catalog of constraint check types.

Ref: schema `src/schema/prompt.ts`, loader `src/config/prompt-corpus.ts`.

## `prompts/scenarios/*.yaml`

One file per scenario. Each entry is a `ScenarioCorpusEntry`.

[Insert minimal example using actual field names from `src/schema/scenario.ts`.]

The `scorer` field is one of the game scorer names cataloged in [SCORING.md](./SCORING.md).

Ref: schema `src/schema/scenario.ts`, loader `src/config/scenario-corpus.ts`.

## `prompts/system-prompts.yaml`

Registry of named system prompts referenced by `PromptCorpusEntry`.

[Insert minimal example based on actual loader behavior in `src/config/system-prompts.ts`.]

Ref: loader `src/config/system-prompts.ts`.
```

- [ ] **Step 2: Verify all `src/...` paths exist and the YAML examples decode**

For each `src/...` path: `ls <path>`.

For the YAML examples: confirm by reading the schema file that every field shown is real and every required field is present.

- [ ] **Step 3: Commit**

```bash
git add docs/CONFIG.md
git commit -m "docs: add CONFIG.md — YAML schemas for models, prompts, scenarios"
```

---

### Task 6: Write `docs/SCORING.md`

**Files:**
- Create: `docs/SCORING.md`

This is the largest new doc — it includes the full constraint check catalog and game scorer catalog enumerated in Task 1.

- [ ] **Step 1: Write the file**

Create `docs/SCORING.md`. The constraint and game catalogs come from Task 1 enumeration — do **not** transcribe from memory; the counts (spec said 20 constraint checks, 14 game scorers) are nominal and may have drifted.

```markdown
# Scoring

> _Last verified: 2026-04-19 against commit `eae465c`._

## Dispatch

`scoreExecution(result, corpusEntry, systemPrompts)` picks a scorer based on the corpus entry type and (for prompts) the scorer variant.

| Corpus entry type | Scorer variant | Handler |
|---|---|---|
| `PromptCorpusEntry` | `exact_match` | `src/scoring/exact-match.ts` |
| `PromptCorpusEntry` | `constraint`  | `src/scoring/constraint.ts` |
| `PromptCorpusEntry` | `code_exec`   | `src/scoring/code-exec.ts` |
| `PromptCorpusEntry` | `game`        | rejected — `ScorerNotFound` (game scorers only valid on scenarios) |
| `ScenarioCorpusEntry` | (game scorer name) | `src/scoring/game.ts::GAME_SCORERS[name]` |

Ref: `src/scoring/score-result.ts`.

## Score shape

All scorers return:

```ts
type Score = {
  score: number      // [0, 1]
  details: string
  breakdown?: ...    // scorer-specific structured detail
}
```

Ref: `src/schema/scorer.ts`.

## Failure handling

Scorer failures (process timeout, unknown constraint type, etc.) propagate as tagged errors. The report layer catches them, emits `score: 0` with `score_details: "scorer error: <tag>"`, and continues.

## `exact_match`

Pure string compare against `expectedOutput` after `strip-thinking` removes `<think>` and `reasoning_content` blocks from the model output.

Ref: `src/scoring/exact-match.ts`, `src/scoring/strip-thinking.ts`.

## `constraint`

Each prompt declares a list of `checks`; the scorer evaluates each check against the model output and returns the fraction passed.

### Check catalog

[Insert the catalog enumerated in Task 1 Step 1. One row per check `type` discriminator. Format:

| `type` | Semantics |
|---|---|
| `<name>` | <one-line semantics from handler> |
| ... | ... |

Order them as they appear in `src/schema/constraints.ts`.]

Ref: schema `src/schema/constraints.ts`, handlers `src/scoring/constraint-checks.ts`, dispatcher `src/scoring/constraint.ts`.

## `code_exec`

Extracts a code block from the model output, executes it as Python via `@effect/platform Command` with a 10s wall-clock timeout, then runs the prompt's assertions against stdout. Score is the fraction of assertions that pass.

Ref: `src/scoring/code-exec.ts`, `src/scoring/extract-code.ts`.

## `game`

Each scenario declares a `scorer` name; the named scorer evaluates the scenario session's recorded events.

### Game scorer catalog

[Insert the catalog enumerated in Task 1 Step 2. One row per registered name. Format:

| Name | Semantics |
|---|---|
| `<name>` | <one-line semantics from implementation> |
| ... | ... |

Order them as registered in `src/scoring/game.ts`.]

Ref: `src/scoring/game.ts`.
```

- [ ] **Step 2: Verify the catalogs are exhaustive**

Cross-check the constraint catalog against the union members in `src/schema/constraints.ts` — no missing or extra rows.
Cross-check the game scorer catalog against `GAME_SCORERS` (or equivalent) in `src/scoring/game.ts` — no missing or extra rows.

- [ ] **Step 3: Verify all `src/...` paths exist**

Same procedure as Task 3 Step 2.

- [ ] **Step 4: Commit**

```bash
git add docs/SCORING.md
git commit -m "docs: add SCORING.md — dispatch, scorer types, constraint + game catalogs"
```

---

### Task 7: Trim `docs/ARCHITECTURE.md`

**Files:**
- Modify: `docs/ARCHITECTURE.md`

Remove the four sections that have migrated to dedicated files. Keep the layer map, lifecycle, scope-close order, troubleshooting table, and conventions. Slim the conventions section to one-line entries with cross-links to GUARANTEES.

- [ ] **Step 1: Remove migrated sections**

Read the current `docs/ARCHITECTURE.md`. Delete:
- The `## Cross-run cache` section (entire — content lives in GUARANTEES § Cross-run cache validity).
- The `## Supervisor shutdown — interruptibility gotcha` section (entire — content lives in GUARANTEES § Graceful shutdown).
- The `## Archive format` section (entire — content lives in ARCHIVE-FORMAT.md).
- The `## Scorer dispatch` section (entire — content lives in SCORING.md).

- [ ] **Step 2: Add a short data-flow summary after Lifecycle**

Insert a new short subsection after the `## Lifecycle: one run invocation` section:

```markdown
## Data flow

```
CLI flag parsing
  → orchestration (run loop, per-model scope)
    → llm (server supervisor + ChatCompletion client)
    → game (Admiral, gameserver, session) [scenarios only]
    → scoring (dispatch by corpus entry + scorer)
    → archive (manifest header + appended results)
report subcommand
  → archive (read .jsonl)
    → scoring (re-score against embedded or current corpus)
    → webapp data.js
```
```

- [ ] **Step 3: Slim the Conventions section**

Replace the `## Conventions` section with a one-line-per-rule version that cross-links to GUARANTEES:

```markdown
## Conventions

- **Effect error channel.** No thrown exceptions outside `src/cli/`. → see [GUARANTEES § Error-channel discipline](./GUARANTEES.md).
- **Scope propagation.** Anything that acquires a subprocess, HTTP connection, or temporary file takes `Scope` in its environment. → see [GUARANTEES § Scope-managed resources](./GUARANTEES.md).
- **Fail-fast config.** All YAML loaders fully decode at startup. → see [GUARANTEES § Fail-fast config](./GUARANTEES.md).
- **Self-contained archives.** Corpus travels in the archive. → see [GUARANTEES § Self-contained archives](./GUARANTEES.md).
- **One file per concept.** Files small enough to hold in context; split when a module approaches 300 lines along the boundary that makes parts independently testable.
```

- [ ] **Step 4: Update the `Last verified` line**

Replace the existing header line with:

```markdown
> _Last verified: 2026-04-19 against commit `eae465c`. Update this line when edits to the doc are prompted by code changes._
```

- [ ] **Step 5: Verify all `src/...` paths still cited exist**

Same grep procedure as Task 3 Step 2.

- [ ] **Step 6: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: trim ARCHITECTURE.md — migrate cache/shutdown/format/scoring to dedicated docs"
```

---

### Task 8: Revise `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove the `Key behaviors` block**

Read `README.md`. Locate the `Key behaviors:` bullet list (currently three bullets: cross-run cache, self-contained archives, scope-based teardown). Delete the heading and all three bullets.

- [ ] **Step 2: Replace with a single cross-link line**

In the same place, insert one paragraph:

```markdown
For invariants the harness commits to (cache validity, scope-managed cleanup, archive immutability, error-channel discipline) → see [`docs/GUARANTEES.md`](./docs/GUARANTEES.md).
```

- [ ] **Step 3: Update the cross-link list at the bottom**

Find the line `For deeper internals see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).` Replace with:

```markdown
## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer map, lifecycle, troubleshooting
- [`docs/GUARANTEES.md`](./docs/GUARANTEES.md) — invariants the harness commits to
- [`docs/CONFIG.md`](./docs/CONFIG.md) — YAML schemas for models, prompts, scenarios
- [`docs/ARCHIVE-FORMAT.md`](./docs/ARCHIVE-FORMAT.md) — `.jsonl` manifest + result format
- [`docs/SCORING.md`](./docs/SCORING.md) — scorer dispatch, constraint + game scorer catalogs
```

Move it so it sits after the `## Where things live` section (its current home). It does not need to be at the end of the file.

- [ ] **Step 4: Update the `Last verified` line**

Replace the existing header line with:

```markdown
> _Last verified: 2026-04-19 against commit `eae465c`. Update this line when edits to the doc are prompted by code changes._
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: trim README — link Key behaviors to GUARANTEES; add cross-link list"
```

---

### Task 9: Verification — canonical refs and stale code refs

**Files:** none modified; pure check.

- [ ] **Step 1: Confirm every cited `src/...` path resolves**

Run:
```bash
grep -rohE 'src/[a-zA-Z0-9_./-]+(\.ts|/)' docs/*.md README.md | sort -u > /tmp/cited-paths.txt
while IFS= read -r path; do
  test -e "$path" || echo "MISSING: $path"
done < /tmp/cited-paths.txt
```

Expected: no `MISSING:` output. If any path is missing, fix the doc that cites it.

- [ ] **Step 2: Confirm no stale Python-era refs**

Run:
```bash
grep -nE '\b(benchmark\.py|runner\.py|common\.py|report\.py)\b' docs/*.md README.md
```

Expected: no matches. If any match exists, fix the doc.

- [ ] **Step 3: Confirm scripts/lint-strict.sh exists if cited**

Run:
```bash
test -f scripts/lint-strict.sh && echo OK
```

Expected: `OK`. If the file doesn't exist, the citation in GUARANTEES needs to be revised.

- [ ] **Step 4: Commit any doc fixes from steps 1–3**

If steps 1–3 caused edits:
```bash
git add docs/*.md README.md
git commit -m "docs: fix stale or missing source references"
```

If no edits were needed, no commit.

---

### Task 10: Verification — independent subagent read-through

**Files:** none modified; pure check.

- [ ] **Step 1: Dispatch a fresh Explore subagent**

Send the following prompt to a fresh subagent (Explore type) — it must have no prior context for this work:

> You are reading the documentation for an LLM benchmarking harness. Read **only** these files (do not read any source code or other docs):
> - `README.md`
> - `docs/ARCHITECTURE.md`
> - `docs/GUARANTEES.md`
> - `docs/CONFIG.md`
> - `docs/ARCHIVE-FORMAT.md`
> - `docs/SCORING.md`
>
> Then answer two questions in plain prose:
>
> 1. Walk through the lifecycle of a single `./bench run` invocation. What happens in order, what cleanup is guaranteed, what happens on Ctrl-C?
> 2. List every guarantee the system makes — what is promised to remain true, regardless of how the run ends?
>
> Be specific. If the docs leave any part of those questions unanswered, say "the docs do not specify X" rather than guessing.
>
> Report under 600 words.

- [ ] **Step 2: Compare the subagent's answers to ARCHITECTURE + GUARANTEES**

For each "the docs do not specify X" the subagent reports, decide whether it represents a real gap (add the missing info) or an out-of-scope question (acceptable). Likely real gaps to fix: anything about the standard scope-close order, anything about what `interrupted` means, anything about cache eligibility rules.

- [ ] **Step 3: Apply any fixes and commit**

If gaps were fixed:
```bash
git add docs/*.md README.md
git commit -m "docs: close gaps surfaced by independent read-through"
```

If no gaps, no commit.

---

### Task 11: Final cleanup — remove `docs/superpowers/plans/`

**Files:**
- Delete: `docs/superpowers/plans/2026-04-19-v1-doc-consolidation.md` (this plan)
- Delete: `docs/superpowers/plans/` (the now-empty dir)

This plan has done its job. Per the spec, `docs/superpowers/specs/` is preserved (as a record of the design decision); `docs/superpowers/plans/` is not.

- [ ] **Step 1: Remove the plan and its dir**

Run:
```bash
git rm docs/superpowers/plans/2026-04-19-v1-doc-consolidation.md
rmdir docs/superpowers/plans/
```

- [ ] **Step 2: Verify the surviving tree**

Run:
```bash
ls docs/
ls docs/superpowers/
ls docs/superpowers/specs/
```

Expected:
- `docs/` contains: `ARCHITECTURE.md`, `ARCHIVE-FORMAT.md`, `CONFIG.md`, `GUARANTEES.md`, `SCORING.md`, `superpowers/`
- `docs/superpowers/` contains: `specs/` only
- `docs/superpowers/specs/` contains: `2026-04-19-v1-doc-consolidation-design.md` only

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: remove now-completed v1 consolidation plan"
```
