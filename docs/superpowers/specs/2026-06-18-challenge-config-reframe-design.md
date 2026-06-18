# Challenge × Configuration reframe

> Status: design approved 2026-06-18. Clean-break rewrite; no migration of existing archives.

## Problem

The harness is model-centric. `./bench run` filters a list of models from `models.yaml` and, for each model, runs the *entire* prompt + scenario corpus inside one scope, emitting one `.jsonl` archive per `(model, runtime, quant)`. A "fresh run" is a new `runId` re-attempting that same whole corpus.

This framing hides the thing we actually care about: **a specific configuration of a model attempting a specific, isolated test of ability.** Several concepts that should be first-class are instead scattered or implicit:

- **Configuration** (weights, quant, temperature, system prompt, runtime engine) is split across `models.yaml` entries and per-prompt fields, with the system prompt bound to the *prompt* rather than the run. There is no named, hashable configuration entity.
- **Challenge** (a quiz / exam / certification — a named, versioned proof of a capability) does not exist. The corpus runs whole; `category` / `tier` / `tags` are inert report-only metadata.
- A **result** is shaped as "a model ran the corpus," not "configuration X attempted challenge Y and scored Z."

We want to reposition the project so that submitting LLM configurations to isolated challenges accumulates results that read as real-world proof of ability: *config `qwen3.5-9b-q4-direct` passed challenge `instruction-following@v1` with score 0.83.*

## Goals

- Make **Configuration**, **Challenge**, and **Result** first-class, named, content-hashed entities.
- A result is the pairing of one configuration attempting one challenge, producing per-item scores **and** a challenge-level aggregate (score + pass/fail).
- System prompt becomes a **configuration axis**; challenges are system-prompt-agnostic and self-contained.
- Challenges may supply **custom scoring functions**, not just the built-in scorer catalog.
- Preserve the existing self-contained-archive guarantee (archives remain re-scorable on their own).
- Get a vertical slice running end-to-end early to de-risk the schema before the expensive corpus rewrite and report re-axis.

## Non-goals

- **Migration of the ~259 existing archives.** This is a clean break. Old archives are discarded or kept only behind a frozen legacy report. No migrator, no historical system-prompt rebind.
- Custom **challenge-level aggregate** scoring functions in this pass. Aggregation is a simple `passThreshold` over item scores. Custom scoring is per-item only (see Scoring). Section-weighted / must-pass-gate rollups are a later concern.
- Matrix-expansion of configs (auto-generating `model × systemPrompt × temperature`). Configs are explicitly authored and named; expansion can come later.
- Cross-machine / concurrent execution. Unchanged from today.

## Design

### Entities

Three entities replace the model-centric `RunManifest` / `ExecutionResult` identity.

#### Configuration

Explicitly authored and named in a new `configs.yaml`. One entry per configuration:

```yaml
- id: qwen3.5-9b-q4-direct
  artifact: Qwen/Qwen2.5-9B-Instruct-GGUF
  runtime: llamacpp
  quant: q4-k-m
  temperature: 0.7
  systemPrompt: direct        # key into system-prompts.yaml
  maxTokens: 8096
  ctxSize: 8192               # optional
  active: true                # optional, default true
```

- `configHash = hash(artifact, runtime, quant, temperature, resolvedSystemPromptText, maxTokens)`. Stable identity for accumulation.
- **Harness / runtime-engine versions are NOT part of `configHash`.** They are captured as result **provenance** (in the result's `env` block) and surfaced in the report. Folding code version into config identity would fork the identity on every code change and fragment accumulated results. (The "benchmarking harness" the user named as part of config is therefore recorded and displayed, but does not partition the configuration's identity.)
- Configs are explicitly named rather than matrix-expanded so that "proof of ability" has a stable handle to point at.

#### Challenge

A named, versioned suite defined in `challenges/*.yaml`:

```yaml
id: instruction-following
version: 1
passThreshold: 0.8            # challenge passes when item-pass fraction ≥ threshold
items:
  - prompt: json-output          # ref into the prompt corpus
    scorer: { kind: constraint }  # optional per-item scorer override (see Scoring)
  - prompt: word-count-limit
  - prompt: weird-task
    scorer: { kind: custom, script: scorers/weird_task.py }
```

- `(id, version)` is the human handle. A challenge is edited by bumping `version`, never by mutating a published version in place.
- `challengeHash = hash(ordered resolved item prompt-hashes + each item's scoring rule)`. Detects drift between what a result claims it attempted and the current challenge definition (mirrors today's promptHash drop-on-mismatch semantics).
- Item prompts reference the existing (rewritten, self-contained) prompt corpus by name.

#### Result

One archive file per **attempt** of a `(config × challenge)` pairing, named by `attemptId`.

- **Manifest header**: config identity (`configId`, `configHash`, denormalized config fields), challenge identity (`challengeId`, `version`, `challengeHash`), `attemptId`, `startedAt` / `finishedAt` / `interrupted`, `env` provenance (hostname, platform, runtime-engine version, node version, harness git sha), and the challenge-level **aggregate** (`{ score, passed }`, filled at finalize).
- **Body lines**: per-item results — today's `ExecutionResult` with model-denorm fields replaced by config-denorm fields, plus `itemId`. Each carries its per-item `score`, `output` / `reasoning` / `rawOutput` / `error`, throughput/memory stats, and (for scenario items) the existing scenario fields + blob pool.
- **Aggregate**: `score = fraction of items with per-item score === 1`; `passed = score ≥ challenge.passThreshold`.
- `attemptId` replaces `runId` as the freshness mechanism. Re-attempting is simply a new attempt of the same `(config, challenge)`; there is no separate "fresh run" flag semantics — each `submit` is one attempt.

### System prompt as a config axis

The system prompt moves off the prompt and onto the configuration. When a completion is built, the system prompt comes from `config.systemPrompt` (resolved against `system-prompts.yaml`), not from the prompt entry.

Consequence: the corpus must be **rewritten to be self-contained.** Prompts whose framing was carried by a per-prompt system prompt (`code_tdd` → "practice TDD; given these tests, write the function; output only code", `code_direct` → "output only the function", `structured`, etc.) fold that framing into the prompt **text**, drop the `system:` field, and re-hash. After the rewrite, a prompt is a self-contained question that any configuration can be pointed at. (See Phase 2.)

### Orchestration

The run loop flips from "filter models, run whole corpus per model" to a submission model:

```
for each submitted (config, challenge):
  scope:
    boot LLM server for config's weights (llama-server / mlx)   [reused]
    for each challenge item:
      run item at config.temperature with config.systemPrompt    [run-prompt, reused]
      score item (built-in dispatch or custom subprocess)
    aggregate item scores → { score, passed }
    write archive (header + per-item lines + finalize trailer)
```

`run-prompt.ts` is reused almost verbatim — it already accepts a system prompt; the source changes from `prompt.system.text` to the config. `run-model.ts`'s server-scope lifecycle is reused. `run-loop.ts` is rewritten around the `(config × challenge)` iteration axis.

### Scoring

The existing scorer dispatch (`exact_match`, `constraint` with 20 checks, `code_exec`, `game`) is retained. A **fifth variant** is added to the scorer union:

```
{ kind: "custom", script: "scorers/weird_task.py" }
```

- The custom scorer is a subprocess script (Python), reusing the existing `code_exec` subprocess + sandbox infrastructure (`@effect/platform` `Command`).
- Contract: the harness writes `{ output, prompt, meta }` as JSON on **stdin**; the script returns `{ score: number /* 0.0–1.0 */, breakdown?: {...} }` as JSON on **stdout**. Non-zero exit or malformed output is a tagged scorer error (per-item `error`, score 0), consistent with existing scorer error handling.
- A challenge item's `scorer` field selects the scorer; when omitted, the scorer falls back to the prompt corpus entry's own scorer (so existing built-in-scored prompts work unchanged inside a challenge).
- Custom scorer scripts live alongside challenges (e.g. `scorers/`) and their path is part of the item's scoring-rule hash, so editing a scorer drifts the `challengeHash`.

### Archive + cache

- New manifest/result schema as above; `src/archive/writer.ts`, `loader.ts`, `finalize-archive.ts` adjust mechanically to the new header/body shape.
- Cache key → `(configHash, challengeId, version, itemHash)`. A cache hit reuses a prior item result for the same config + challenge-item content. `attemptId` scoping replaces `runId` scoping.

### Report + webapp (Phase 3)

- New axis: **configuration rows × challenge columns**, cells = challenge score / pass.
- `webapp-contract.ts`'s `WebappRecord` gains config fields (including `systemPrompt`) and challenge fields (`challengeId`, `version`, `passed`, `score`).
- `pipeline.ts` grouping rewrites from `groupRunsByModel` / key `model|runtime|quant|temperature|run_id` to grouping by `configId` (or `configHash`) with challenge as the column dimension. `isPass` (per-item `score === 1`) is retained for item cells; challenge cells use the stored aggregate `passed`.

## Phasing

The build is sequenced **vertical-slice-first** to prove the loop before the expensive corpus rewrite and report re-axis.

- **Phase 0 — Foundation.** New `Configuration` and `Challenge` schemas + loaders + content hashing; new result schema; custom-scorer union variant + subprocess scorer. Unit tests per module.
- **Phase 1 — Proof of life.** `./bench submit --config <id> --challenge <id>`: boots the server, runs a small hand-authored challenge over a handful of (hand-moved, self-contained) prompts, scores items, writes one archive with the aggregate, prints score + pass/fail. **No webapp.** This is "it runs."
- **Phase 2 — Corpus + challenges.** Rewrite the ~81 prompts to be self-contained (fold framing into prompt text, drop `system:`, re-hash); author the real challenge set. Parallelizable across subagents.
- **Phase 3 — Report / webapp re-axis.** Config-rows × challenge-columns; extend the webapp contract and pipeline.
- **Phase 4 — Cache + resume** under the new `(configHash, challengeId, version, itemHash)` identity.

## Effort summary

| Area | Size | Reuse |
|---|---|---|
| Configuration entity + hashing | S–M | ~80% of today's `models.yaml` entry |
| Challenge entity + loader + hashing | M | net-new |
| Result schema reshape | M–L | clean rewrite, no migrator |
| Custom subprocess scorer | M | reuses `code_exec` infra |
| Corpus rewrite (~81 prompts) | M | mechanical, parallelizable |
| Orchestration (submission loop) | M | `run-prompt` / server scope reused |
| CLI (`submit`, `list-configs`, `list-challenges`) | S–M | mirrors `run` / `list` |
| Archive + cache | M | mechanical follow-on |
| Report + webapp re-axis | L | biggest single chunk |

Big rocks: report/webapp re-axis (L), result-schema reshape (M–L), corpus rewrite + custom scorer (M each).

## Open sub-decisions (deferred, not blocking)

- Whether to later add matrix-expansion of configs as an authoring convenience.
- Whether challenges eventually need custom **aggregate** rollups (weighted sections, must-pass gates) beyond `passThreshold`.
- Disposition of the legacy archive corpus and report (discard vs frozen read-only view).
