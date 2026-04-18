# llm-bench

> _Last verified: 2026-04-17 against commit `0d008c4`. Update this line when edits to the doc are prompted by code changes._

TypeScript + Effect-TS harness for benchmarking local LLMs. Rewrite of the Python prototype (`benchmark.py`, `runner.py`, `common.py`, etc., still in-tree until the migration is diffed).

## Quickstart

```bash
npm install

./bench list-models          # sanity-check models.yaml
./bench list-prompts         # sanity-check prompts/ corpus

# Smallest end-to-end smoke run — 3 prompts, one model, no scenarios:
./bench run --model-name qwen3.5-9b --prompts-dir smoke-prompts --scenarios none --max-tokens 128 --archive-dir /tmp/bench-smoke --fresh

# Generate the webapp data file from archived runs:
./bench report
```

Prerequisites:

- `llama-server` on PATH (llamacpp runtime) — see [`llama-cpp-guide.md`](./llama-cpp-guide.md).
- `python3 -m mlx_lm.server` available (MLX runtime) — `pip install mlx-lm` into a venv, default `~/llm-env`.
- Admiral checkout + game server binary only needed when `--scenarios != none`. Pass via `--admiral-dir` / `--game-server-binary`.

## Where things live

| Path | Purpose |
|---|---|
| `bench` | Shell launcher — `tsx src/cli/main.ts` |
| `src/cli/` | `@effect/cli` subcommands: `run`, `report`, `score`, `migrate`, `list-models`, `list-prompts` |
| `src/schema/` | `@effect/schema` definitions for `RunManifest`, `ExecutionResult`, scorers, constraints, etc. |
| `src/config/` | YAML loaders for `models.yaml`, `prompts/*.yaml`, `prompts/system-prompts.yaml`, `scenarios/*.yaml` |
| `src/llm/` | OpenAI-compatible ChatCompletion client; llama-server / MLX supervisor |
| `src/game/` | Admiral HTTP + SSE client, gameserver supervisor, per-scenario session + cutoff watchdog |
| `src/orchestration/` | Top-level run loop, per-model orchestrator, prompt/scenario phases, cross-run cache |
| `src/scoring/` | `exact_match`, `constraint` (20 check types), `code_exec` (Python subprocess), `game` (14 scenario scorers) |
| `src/archive/` | `RunManifest` read/write, cross-run cache lookup |
| `src/report/` | Archive → webapp `data.js` serializer |
| `src/migrate/` | One-shot port of prototype `benchmark-execution/*.jsonl` → `RunManifest` archives |
| `src/errors/` | Typed `Data.TaggedError` classes grouped by domain |
| `prompts/` | Prompt corpus (one YAML per variant) + `scenarios/` + `system-prompts.yaml` |
| `smoke-prompts/` | 3-prompt subset used for fast end-to-end verification |
| `models.yaml` | Model registry: `artifact`, `runtime`, `quant`, optional `name`/`params`/`ctxSize`/`active` |
| `benchmark-archive/` | Canonical output directory for full runs (`{runId}.jsonl`) |
| `smoke-archive/` | Output dir for smoke runs |
| `v1-archive/`, `benchmark-execution/` | Legacy prototype archives; sources for `./bench migrate` |
| `webapp/` | Static report viewer; consumes `webapp/src/data/data.js` written by `./bench report` |

For deeper internals see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## CLI reference

All subcommands take `--help`. Paths default to convention:

```
./bench run [--model-name TEXT] [--max-tokens INT] [--scenarios TEXT]
            [--scenarios-only] [--fresh] [--no-save]
            [--temperatures "0.7,1.0"] [--idle-timeout INT]
            [--archive-dir DIR] [--models-file FILE] [--prompts-dir DIR]
            [--admiral-dir DIR] [--game-server-binary FILE]

./bench report [--archive-dir DIR] [--output DIR]
               [--scoring as-run|current] [--prompts-dir DIR]

./bench score --archive FILE

./bench migrate [--input DIR] [--output DIR] [--prompts-dir DIR] [--dry-run]

./bench list-models [--models FILE]
./bench list-prompts [--prompts DIR]
```

Key behaviors:

- **Cross-run cache.** `./bench run` reuses prior `(artifact, promptName, promptHash, temperature)` results by scanning `--archive-dir`. `--fresh` bypasses it.
- **Self-contained archives.** Each `.jsonl` embeds the `promptCorpus` + `scenarioCorpus` used at execution time, so re-scoring (`./bench score`, `./bench report --scoring as-run`) never needs the filesystem corpus.
- **Scope-based teardown.** LLM servers, Admiral, gameserver, and SSE connections are wrapped in `Scope`-managed finalizers. Ctrl-C causes SIGTERM→SIGKILL with a 10s budget and still writes a trailer marking the manifest `interrupted: true`.

### Logging

`./bench run` writes a terse per-prompt / per-scenario progress stream to
stderr, plus an end-of-model summary block. Stdout stays machine-readable —
one tab-separated record per model with `completed=`, `cached=`, `errors=`,
`wall=`, `genTps=`, `interrupted=`, `archive=` fields.

Pass `--verbose` (`-v`) to add intra-call detail (HTTP requests, cache
scans, health polls, SSE events, watchdog ticks).

## Dev loop

```bash
npm run test         # vitest — ~440 tests
npm run typecheck    # tsc --noEmit
npm run lint         # biome + scripts/lint-strict.sh (bans try/catch/throw/console outside CLI)
npm run lint:fix     # biome --write
```

`scripts/lint-strict.sh` enforces the Effect error-channel discipline: `throw`, `try`/`catch`, and `console.*` are only allowed inside `src/cli/`. Everything else surfaces errors through tagged `Data.TaggedError` classes in `src/errors/`.
