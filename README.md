# llm-bench

> _Last verified: 2026-06-20 against `9a651b2`._

TypeScript + Effect-TS harness for benchmarking local LLMs.

The harness runs one **configuration** against one **challenge** and records the result as a single, self-sufficient attempt archive. A configuration is a model plus its runtime, quantization, sampling settings, and system prompt, defined in [`configs.yaml`](./configs.yaml). A challenge is a named, versioned set of scored items, defined in [`challenges/*.yaml`](./challenges/). The unit of work is an **attempt** — one `(configuration × challenge)` pairing — written as one `.jsonl` file beside a shared content store. A static webapp reads the aggregated results.

## Quickstart

```bash
npm install

./bench list-models          # sanity-check the configured models
./bench list-prompts         # sanity-check the inline challenge items

# Smallest end-to-end attempt — the smoke configuration against the smoke challenge:
./bench submit --config smoke-config --challenge challenges/smoke.yaml --archive-dir /tmp/bench-smoke

# Aggregate the attempt archives into the webapp data file + per-attempt detail files:
./bench report --archive-dir /tmp/bench-smoke

# Open the webapp:
cd webapp && npm install && npm run dev
```

`submit` writes `att-<configHash>-<challengeHash>-<timestamp>.jsonl` plus a `content/` store into the archive directory. `report` reads those archives and writes `webapp/src/data/data.js` (and the drilldown detail files); the webapp renders it.

To run a real benchmark, add a configuration to `configs.yaml` (a model artifact, runtime, quant, sampling, and system-prompt key) and point `submit` at a challenge suite under `challenges/`.

## Prerequisites

- `llama-server` (llama.cpp) — install a pinned release tarball (see [`llama-cpp-guide.md`](./llama-cpp-guide.md)) and put it on `PATH`. Required for any configuration with `runtime: llamacpp`.
- `python3 -m mlx_lm.server` (MLX runtime, mlx-lm) — `pip install mlx-lm` into a venv, default `~/llm-env`. Required for any configuration with `runtime: mlx`.

A configuration's `runtime` field selects which server the harness launches per attempt; you only need the runtime(s) your configurations use.

## Where things live

| Path | Purpose |
|---|---|
| `bench` | Shell launcher — `tsx src/cli/main.ts` |
| `src/cli/` | `@effect/cli` subcommands: `submit`, `report`, `score`, `export`, `list-models`, `list-prompts` |
| `src/orchestration/` | Per-attempt orchestrator — resolves the configuration + challenge, runs each item, aggregates, finalizes the archive |
| `src/llm/` | OpenAI-compatible ChatCompletion client; llama-server / MLX supervisor |
| `src/scoring/` | Scorer dispatch — `exact_match`, `constraint`, `code_exec`, `game` |
| `src/config/` | YAML loaders for `configs.yaml`, inline `challenges/*.yaml`, and root `system-prompts.yaml`; identity hashing |
| `src/archive/` | Attempt archive writer (header / append / finalize / atomic rewrite), content store, cross-attempt item cache |
| `src/report/` | Attempt archives → webapp `data.js` + per-attempt detail files; reconstruction from the content store |
| `src/schema/` | `@effect/schema` definitions for the attempt manifest, item results, scorers, configurations, challenges |
| `src/errors/` | Typed `Data.TaggedError` classes grouped by domain |
| `challenges/` | Challenge suites (one YAML per suite), each a versioned set of fully-inline scored items, plus any companion `code_exec` `.test.py` files |
| `scenarios/` | Multi-turn game scenarios, loaded separately (see `docs/SCENARIOS.md`) |
| `configs.yaml` | Configuration registry: `id`, `artifact`, `runtime`, `quant`, `temperature`, `systemPrompt`, `maxTokens` |
| `system-prompts.yaml` | System-prompt registry (key → text); a configuration selects one via `systemPrompt:` |
| `benchmark-archive/` | Default archive output — attempt `.jsonl` files plus the shared `content/` store |
| `webapp/` | Static report viewer; consumes `webapp/src/data/data.js` written by `./bench report` |

## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer map, attempt lifecycle, report pipeline, troubleshooting
- [`docs/GUARANTEES.md`](./docs/GUARANTEES.md) — invariants the harness commits to
- [`docs/CONFIG.md`](./docs/CONFIG.md) — YAML schemas for configurations, inline challenge items, and system prompts
- [`docs/ARCHIVE-FORMAT.md`](./docs/ARCHIVE-FORMAT.md) — attempt manifest + item-result format and content store
- [`docs/SCORING.md`](./docs/SCORING.md) — scorer dispatch and the constraint-check catalog

## CLI reference

All subcommands take `--help`. Paths default to convention.

```
./bench submit --config TEXT --challenge FILE
               [--system-prompts-file FILE] [--configs-file FILE] [--archive-dir DIR]
               [--no-cache] [--resume ATTEMPT_ID] [--verbose]

./bench report [--archive-dir DIR] [--output DIR] [--verbose]

./bench score --archive FILE
              [--challenges-dir DIR] [--challenge FILE]
              [--corpus] [--dry-run] [--verbose]

./bench export <attempt> [--archive-dir DIR] [--out PATH] [--dir] [--verbose]

./bench list-models [--models FILE]
./bench list-prompts [--challenges DIR] [--scenarios DIR]
```

- **`submit`** runs one configuration against one challenge, executing each item (or serving it from the cross-attempt cache) and writing a finalized attempt archive. `--resume <attemptId>` continues an interrupted attempt, executing only the items it lacks; `--no-cache` forces fresh execution of every item. Prints a one-line aggregate verdict.
- **`report`** scans the archive directory, keeps only completed attempts, deduplicates by `attemptId`, and writes `data.js` plus a per-attempt detail file for every reconstructible attempt. It prints an audit block: attempts loaded, dropped (incomplete / duplicate), cells written, and details written / skipped.
- **`score`** re-applies scorers to an attempt's stored outputs and rewrites the archive in place — no model call. By default it re-scores from the content store; `--corpus` instead re-resolves the current challenge inline from `challenges/` so an edited scorer takes effect. `--dry-run` reports the changes without writing.
- **`export`** bundles an attempt's `.jsonl` and exactly the content blobs it references into a portable, self-verifying archive — a `.tar.gz` by default, or a plain directory with `--dir`. Accepts an `attemptId` (resolved under `--archive-dir`) or a direct `.jsonl` path.
- **`list-models`** reads `models.yaml` and prints one line per model (`artifact`, `runtime`, `quant`). **`list-prompts`** aggregates every challenge file's inline items and prints each item's name, category, and tier (tab-separated), followed by a `# Scenarios` section. Both are read-only sanity checks.

For invariants the harness commits to (cache validity, scope-managed cleanup, archive immutability, error-channel discipline) see [`docs/GUARANTEES.md`](./docs/GUARANTEES.md).

### Logging

`./bench submit` writes a terse per-item progress stream to stderr and a one-line aggregate verdict to stdout. Pass `--verbose` (`-v`) to add intra-call detail: HTTP requests, cache scans, health polls, and server lifecycle events.

## Dev loop

```bash
npm run test         # vitest
npm run typecheck    # tsc --noEmit
npm run lint         # biome + scripts/lint-strict.sh (bans try/catch/throw/console outside CLI)
npm run lint:fix     # biome --write
```

`scripts/lint-strict.sh` enforces the Effect error-channel discipline: `throw`, `try`/`catch`, and `console.*` are only allowed inside `src/cli/`. Everything else surfaces errors through tagged `Data.TaggedError` classes in `src/errors/`.
