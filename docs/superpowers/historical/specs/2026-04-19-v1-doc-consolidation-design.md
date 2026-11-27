---
name: v1 documentation consolidation
description: Drop implementation-history plans/specs and restructure project docs into a topical v1 set optimized for fast agent context loading
type: design
date: 2026-04-19
---

# v1 Documentation Consolidation — Design

## Goal

Replace the current mix of implementation-history plans, design specs, and a single ARCHITECTURE.md with a deliberate, topical v1 doc set that lets a reader (the user, or a future agent session) quickly answer two questions:

1. **How does this work?** (architecture, lifecycle, data flow)
2. **What does it guarantee?** (invariants, error semantics, cleanup, archive integrity)

Audience: the user and future agent sessions. Optimize for "load context fast" — terse, dense, assumes Effect-TS familiarity, links to canonical source rather than transcribing it.

## Non-goals

- Public-facing onboarding docs (README continues to serve that role at minimum viability).
- Preserving implementation history (the Python-era plans describe code that no longer exists; git keeps them).
- Documenting the root-level `local-*.md` / `llama-cpp-guide.md` research notes (out of scope for this work).
- Mining the deleted plans/specs for content (they describe Python; the v1 truth is the TypeScript code itself).

## Deletions

- `docs/superpowers/plans/2026-03-24-split-benchmark-modules.md`
- `docs/superpowers/plans/2026-04-04-separate-execution-from-scoring.md`
- `docs/superpowers/plans/2026-04-04-summary-charts.md`
- `docs/superpowers/plans/2026-04-07-spacemolt-scenarios.md`
- `docs/superpowers/plans/2026-04-10-benchmark-reset-and-scenarios.md`
- `docs/superpowers/plans/` (empty dir, remove)
- `docs/superpowers/specs/2026-04-04-summary-charts-design.md`
- `docs/superpowers/specs/2026-04-07-spacemolt-scenarios-design.md`
- `docs/blog-post-outline.md`

`docs/superpowers/specs/` is **kept**, with this design doc as its sole resident (a record of the v1 doc decisions).

## Surviving / new file set

| File | State | Approx size | Purpose |
|---|---|---|---|
| `README.md` | revised | ~95 lines / ~5k chars | Quickstart, prerequisites, layout, CLI ref, dev loop |
| `docs/ARCHITECTURE.md` | trimmed | ~140 lines / ~7k chars | Layer map, lifecycle, data flow, troubleshooting, conventions |
| `docs/GUARANTEES.md` | new | ~90 lines / ~5k chars | 9 invariants with canonical refs |
| `docs/CONFIG.md` | new | ~75 lines / ~4k chars | YAML schemas for models / prompts / scenarios / system prompts |
| `docs/ARCHIVE-FORMAT.md` | new | ~75 lines / ~4k chars | RunManifest + ExecutionResult JSONL format, re-scoring semantics |
| `docs/SCORING.md` | new | ~165 lines / ~8k chars | Dispatch + 4 scorer types + 20 constraint checks + 14 game scorers |

Total surviving footprint: ~640 lines / ~33k chars. Roughly 5–6× smaller than today's plans+specs+docs combined.

## File contents

### `README.md`

Keep:
- Quickstart block (npm install, smoke run, report)
- Prerequisites (llama-server, mlx_lm.server, optional Admiral)
- "Where things live" table
- CLI reference block
- Dev loop (test/typecheck/lint)
- `scripts/lint-strict.sh` callout

Remove:
- "Key behaviors" bullets — replaced with one-line `→ see docs/GUARANTEES.md` pointer.

Add:
- Cross-link list at bottom: ARCHITECTURE, GUARANTEES, CONFIG, ARCHIVE-FORMAT, SCORING.

### `docs/ARCHITECTURE.md`

Sections:
- Layer map (current ASCII tree, verbatim)
- Lifecycle: one `run` invocation (current diagram)
- Scope-close order (4 finalizers, LIFO)
- Data flow summary: CLI → orchestration → llm/game → scoring → archive → report
- "Where to look when…" troubleshooting table (current)
- Conventions (one line each — details belong in GUARANTEES)

Removed (migrated to other files):
- Cross-run cache → GUARANTEES
- Supervisor shutdown / interruptibility → GUARANTEES
- Archive format → ARCHIVE-FORMAT
- Scorer dispatch → SCORING

### `docs/GUARANTEES.md`

Each invariant: heading, 3–6 lines of explanation, canonical code reference.

1. **Scope-managed resources** — LIFO finalizer ordering; acquisition implies guaranteed release. Ref: `src/orchestration/run-model.ts`.
2. **Graceful shutdown** — SIGTERM → 10s budget → SIGKILL. Ref: `src/llm/servers/supervisor.ts`.
3. **Interruption safety** — manifest trailer always written; `interrupted: true` on Ctrl-C. Ref: `src/orchestration/finalize-archive.ts`.
4. **Archive atomicity** — header rewrite at finalize; lines 2+ append-only. Ref: `src/archive/writer.ts`.
5. **Cross-run cache validity** — match `(artifact, promptName, promptHash, temperature)`; reject `error !== null` and empty output; most recent wins; `--fresh` bypasses. Ref: `src/archive/cache.ts`, `src/orchestration/cache.ts`.
6. **Self-contained archives** — `promptCorpus` + `scenarioCorpus` embedded in manifest; re-scoring is filesystem-independent. Ref: `src/schema/run-manifest.ts`.
7. **Fail-fast config** — all YAML decoded at startup; malformed corpus can't surface as a runtime error. Ref: `src/config/`.
8. **Error-channel discipline** — all fallible operations return `Effect<A, TaggedError, R>`; `throw`/`try`/`catch`/`console.*` banned outside `src/cli/`. Enforced by `scripts/lint-strict.sh`.
9. **Re-scoring stability** — `./bench score` and `./bench report --scoring as-run` produce identical output for a given archive. Ref: `src/scoring/score-result.ts`.

### `docs/CONFIG.md`

For each YAML, give a minimal example and point at the canonical schema:

- **`models.yaml`** — `artifact`, `runtime`, `quant`, optional `name`/`params`/`ctxSize`/`active`. Ref: `src/schema/model.ts`, loader: `src/config/models.ts`.
- **`prompts/*.yaml`** — `PromptCorpusEntry`: `name`, `tier`, `style`, `category`, `prompt`, `scorer` (one of 4 variants). Ref: `src/schema/prompt.ts`. For scorer-specific fields → SCORING. For constraint check shapes → SCORING.
- **`prompts/scenarios/*.yaml`** — `ScenarioCorpusEntry`: `name`, `scorer` (game scorer enum), `scorerParams`. Ref: `src/schema/scenario.ts`.
- **`prompts/system-prompts.yaml`** — registry of named system prompts referenced by `PromptCorpusEntry`. Ref: `src/schema/`, loader: `src/config/system-prompts.ts`.

### `docs/ARCHIVE-FORMAT.md`

- File naming: `{runId}.jsonl` per `(model, runtime, quant)` run.
- Line 1: `RunManifest` (header, rewritten at finalize with `finishedAt`, `interrupted`, final `stats`).
- Lines 2+: `ExecutionResult`, append-only.
- Embedded `promptCorpus` + `scenarioCorpus` make archives self-contained.
- Re-scoring CLIs:
  - `./bench score --archive FILE` — score one archive against embedded corpus.
  - `./bench report --scoring as-run` — re-render report using embedded corpus.
  - `./bench report --scoring current` — re-render using current `prompts/` on disk.
- Canonical schemas: `src/schema/run-manifest.ts`, `src/schema/execution.ts`. Writer: `src/archive/writer.ts`. Reader: `src/archive/reader.ts`.

### `docs/SCORING.md`

- Dispatch table: `(corpusEntryType × scorerType) → handler`. Ref: `src/scoring/score-result.ts`.
- `Score` shape: `{ score: number [0,1], details: string, breakdown?: ... }`. Ref: `src/schema/scorer.ts`.
- Failure handling: scorer errors propagate as tagged errors; report layer catches → emits `score: 0`, `score_details: "scorer error: <tag>"`.
- **`exact_match`** — pure string compare after `strip-thinking` removes `<think>` / `reasoning_content` blocks. Ref: `src/scoring/exact_match.ts`, `src/scoring/strip-thinking.ts`.
- **`constraint`** — 20 check types, each listed with one-line semantics. Ref: `src/scoring/constraint.ts`, `src/schema/constraints.ts`.
- **`code_exec`** — Python subprocess via `@effect/platform Command`, 10s timeout, stdout assertions. Ref: `src/scoring/code_exec.ts`.
- **`game`** — 14 scenario scorers, each listed with one-line semantics. Ref: `src/scoring/game.ts`. Catalog includes: `bootstrap_grind`, `navigation`, … *(populated from source at write time)*.

The 20 constraint check types and 14 game scorers are enumerated by reading `src/schema/constraints.ts` and `src/scoring/game.ts` at write time — do not transcribe from memory.

## Verification

Before marking docs complete:

1. **Canonical refs exist.** Grep every `src/...` file path cited in the new docs; all must resolve.
2. **No stale code refs.** Search the new docs for `benchmark.py`, `runner.py`, `common.py`, `report.py` — must be zero.
3. **`Last verified` header.** Each new/revised doc gets `> _Last verified: 2026-04-19 against commit <sha>._` at the top.
4. **Independent read-through.** Dispatch a fresh subagent with no prior context: "Given only README.md + docs/*.md, explain the lifecycle of `./bench run` and list the system's guarantees." Compare to ARCHITECTURE + GUARANTEES. Gaps in the answer = doc bugs.

## Out of scope

- The root-level `local-*.md` and `llama-cpp-guide.md` research notes — left alone.
- The `webapp/` directory — already self-contained; not part of this consolidation.
- Adding new content beyond what the source code documents (no aspirational guarantees).
