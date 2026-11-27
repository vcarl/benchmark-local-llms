# llm-bench

TypeScript + Effect-TS harness for benchmarking local LLMs.

The harness sweeps a set of **configurations** against a set of **challenges** and records each pairing as a sealed, content-addressed bundle. A configuration is a model plus its runtime, quantization, sampling settings, and system prompt, defined in [`configs.yaml`](./configs.yaml). A challenge is a named, versioned set of scored items, defined in [`releases/<release>/challenges/*.yaml`](./releases/). The unit of work is a **bundle** — one `(configuration × challenge)` pairing executed within a run — written as one `.jsonl` file in the store. A static webapp reads the aggregated results.

## Quickstart

```bash
npm install

./bench list-models          # sanity-check the configured models
./bench list-prompts         # sanity-check the inline challenge items

# Smallest end-to-end sweep — smoke-config against the smoke challenge:
./bench run --configs smoke-config --challenges smoke --store /tmp/bench-smoke

# Check the sealed bundle the run wrote:
./bench verify /tmp/bench-smoke/bundles/*.jsonl

# Build the snapshots (store/scores is gitignored, so a fresh checkout grades first):
./bench score --dataset alpha
./bench score --dataset draft
./bench report

# Open the webapp:
cd webapp && npm install && npm run dev
```

`run` writes one sealed bundle, `bundles/<digest>.jsonl`, plus its score records into the store for each matched configuration × challenge cell. A dataset manifest (`datasets/<name>.yaml`) lists the bundles a dataset counts; `report` builds one snapshot per manifest into `webapp/public/snapshots/` (and the drilldown detail files); the webapp renders them.

To run a real benchmark, add a configuration to `configs.yaml` (a model artifact, runtime, quant, sampling, and system-prompt key) and point `run` at a challenge suite under `releases/draft/challenges/`.

## Prerequisites

- `llama-server` (llama.cpp) — install a pinned release tarball (see [`llama-cpp-guide.md`](./llama-cpp-guide.md)) and put it on `PATH`. Required for any configuration with `runtime: llamacpp`.
- `python3 -m mlx_lm.server` (MLX runtime, mlx-lm) — `pip install mlx-lm` into a venv, default `~/llm-env`. Required for any configuration with `runtime: mlx`.
- `omlx` (oMLX) — `brew tap jundot/omlx https://github.com/jundot/omlx && brew install jundot/omlx/omlx`, or `pip install -e .` from a source checkout. Required for any configuration with `runtime: omlx`. The harness runs `omlx serve` under a scratch `HOME`, so it boots from stock defaults and neither reads nor writes the `~/.omlx/settings.json` your desktop oMLX install owns.

A configuration's `runtime` field selects which server the harness launches per configuration; you only need the runtime(s) your configurations use.

## Where things live

| Path | Purpose |
|---|---|
| `bench` | Shell launcher — `tsx src/cli/main.ts` |
| `src/cli/` | `@effect/cli` subcommands: `run`, `verify`, `score`, `release`, `legacy`, `dataset`, `report`, `list-models`, `list-prompts` |
| `src/orchestration/` | Per-bundle orchestrator — resolves the configuration + challenge, runs each item, seals the bundle, appends score records |
| `src/llm/` | OpenAI-compatible ChatCompletion client; llama-server / MLX supervisor |
| `src/scoring/` | Scorer dispatch — `exact_match`, `constraint`, `code_exec`, `game` |
| `src/config/` | YAML loaders for `configs.yaml`, inline `releases/<release>/challenges/*.yaml`, and root `system-prompts.yaml`; identity hashing |
| `src/store/` | Bundle writer / sealer / verifier, skip index, weights digest, score records |
| `src/legacy/` | Read-only reader for the legacy schemaVersion 1–3 attempt archives, with its content store |
| `src/report/` | Dataset manifests → immutable snapshots (`<digest>.json`), the snapshot index and detail files |
| `src/schema/` | `@effect/schema` definitions for the bundle header, executions, scorers, configurations, challenges |
| `src/errors/` | Typed `Data.TaggedError` classes grouped by domain |
| `releases/<release>/` | A release: `challenges/` (one YAML per suite, each a versioned set of fully-inline scored items, plus any companion `code_exec` `.test.py` files), `release.json` (item digests and the item-set digest), `errata.yaml`, `blobs/`. `releases/0/` is the alpha challenge set, `releases/draft/` the draft (see `docs/ERRATA.md`) |
| `scenarios/` | Multi-turn game scenarios, loaded separately (see `docs/SCENARIOS.md`) |
| `configs.yaml` | Configuration registry: `id`, `artifact`, `runtime`, `quant`, `temperature`, `systemPrompt`, `maxTokens` |
| `system-prompts.yaml` | System-prompt registry (key → text); a configuration selects one via `systemPrompt:` |
| `store/` | Default `--store` — `open/` (bundles being written), `bundles/<digest>.jsonl` (sealed), `scores/<digest>.jsonl` (score records), `scores/legacy.jsonl` (regraded legacy alpha lines), `weights.json` (local weights-digest cache) |
| `benchmark-archive/` | Legacy attempt archives (schemaVersion 1–3): `.jsonl` files plus the shared `content/` store; read by `report`, `audit`, `export-eee` |
| `datasets/` | Default `--datasets-dir`: dataset manifests, the bundles (v4) or pinned legacy attempts a dataset counts, its release and eval version |
| `webapp/` | Static report viewer; reads `webapp/public/snapshots/` written by `./bench report` |

## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer map, run lifecycle, report pipeline, troubleshooting
- [`docs/GUARANTEES.md`](./docs/GUARANTEES.md) — invariants the harness commits to
- [`docs/CONFIG.md`](./docs/CONFIG.md) — YAML schemas for configurations, inline challenge items, and system prompts
- [`docs/ARCHIVE-FORMAT.md`](./docs/ARCHIVE-FORMAT.md) — the store (bundles, score log), releases, dataset manifests and snapshots, and the read-only legacy attempt format (schemaVersion 1–3); the design rationale is in [`docs/superpowers/specs/2026-11-17-archive-data-model-design.md`](./docs/superpowers/specs/2026-11-17-archive-data-model-design.md)
- [`docs/SCORING.md`](./docs/SCORING.md) — scorer dispatch and the constraint-check catalog
- [`docs/ERRATA.md`](./docs/ERRATA.md) — errata registry, release file, eval versions, and the release command
- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — publishing the report to GitHub Pages behind `vcarl.com/evals`, and the agent-facing `llms.txt`

## CLI reference

All subcommands take `--help`. Paths default to convention.

```
./bench run [--configs GLOB] [--challenges GLOB]
            [--challenges-dir DIR] [--system-prompts-file FILE] [--configs-file FILE]
            [--store DIR] [--samples K] [--items FILE|LIST]
            [--no-skip] [--verbose]

./bench verify <bundle>... [--releases-dir DIR]

./bench score --dataset NAME [--datasets-dir DIR] [--store DIR] [--releases-dir DIR]
              [--legacy-root DIR]

./bench release sync|verify <release> [--releases-dir DIR]
./bench release commit <YYYY.N> [--from DIR] [--releases-dir DIR]

./bench dataset add <name> <bundle>... [--datasets-dir DIR] [--store DIR]

./bench legacy freeze --dataset NAME --title TEXT --release 0|draft [--eval-version V]
                      --archive NAME [--reuse NAME] --challenges-dir DIR [--legacy-root DIR]
                      [--legacy-hardware ID] [--unranked] [--datasets-dir DIR]
./bench legacy convert --source FILE --dataset NAME [--datasets-dir DIR] [--legacy-root DIR]
                       [--store DIR] [--releases-dir DIR] [--templates-dir DIR] [--report FILE]

./bench report [--datasets-dir DIR] [--store DIR] [--releases-dir DIR] [--legacy-root DIR]
               [--output DIR] [--configs-file FILE] [--allow-dirty] [--verbose]

./bench audit [--archive-dir DIR] [--challenge ID] [--flag suspect-key|saturated|edge|zero-failure]
              [--min-n N] [--edge-top K] [--json] [--verbose]

./bench export-eee <attempt> [--dataset NAME] [--datasets-dir DIR] [--legacy-root DIR] [--out DIR] [--collection NAME]
                   [--relationship third_party|first_party|collaborative|other] [--verbose]

./bench list-models [--configs-file FILE] [--system-prompts-file FILE]
./bench list-prompts [--challenges DIR] [--scenarios DIR]
```

- **`run`** sweeps matched configurations against matched challenges (globs over config ids and challenge stems), executing each configuration × challenge cell, printing a live per-cell result line, and finishing with a summary grid. It writes schemaVersion 4 bundles into `--store` (default `store`): `store/open/<runId>-<configId>-<challengeId>.jsonl` while running, sealed to `store/bundles/<bundleDigest>.jsonl`, then score records appended to `store/scores/<bundleDigest>.jsonl`. A configuration × challenge that executes nothing writes no bundle. `--challenges-dir` (default `releases/draft/challenges`) names the release: a path `.../releases/<name>/challenges` is release `<name>`, any other directory the release `draft`; release `0`, the alpha challenge set, is refused. A cell is skipped whole only when one bundle in the store already holds all of it at the current config and prompt, and an interrupted cell resumes its open file ([run skip](docs/SCORING.md#report-rows)); `--no-skip` runs every cell. The contributor is `BENCH_CONTRIBUTOR` (default `local`; a value containing `@` is refused). `--samples K` sets each item's sample set to 0..K-1 (see [Repeated samples](docs/SCORING.md#repeated-samples)); `--items` limits that to the matching `challengeId/itemName` globs — a file with one per line or a comma list; a multi-turn item's name selects all its turns — and fails if a pattern matches no item.
- **`verify`** checks bundle files: every line canonical, the digest equal to the file name, `configDigest` and `hardwareId` re-derived, the `executions` count, no duplicate item × sample; then release pinning against `--releases-dir` (default `releases`): the release is frozen (a draft passes with a warning), the challenge and every item are in it, and every `messagesDigest` matches the release's prompt blob, the header's system prompt and the gold history. It prints `ok` / `FAILED` per file, exits nonzero on any failure, and writes nothing.
- **`score --dataset <name>`** appends the score records a v4 dataset manifest (`datasets/<name>.yaml`) needs at its eval version and `store/scores/` lacks, grading each execution with the scorer blob the release puts in effect; it never rewrites a record. For the legacy alpha dataset (`--legacy-root`, default `.`) it grades the counted archive lines whose recorded scorer is not their item's current one into `store/scores/legacy.jsonl`.
- **`release sync|commit|verify`** keeps `releases/draft/release.json` and its blobs in step with the draft, freezes the draft's item set as a `YYYY.N` release, and verifies a release; see [ERRATA.md](docs/ERRATA.md#cutting-a-release).
- **`dataset add <name> <bundle…>`** appends bundle digests, each with a `# configId · challenge` comment, to a v4 manifest. New runs join the draft this way: `./bench run`, then `./bench dataset add draft <bundle…>`, `./bench score --dataset draft`, commit `datasets/draft.yaml`, then `./bench report` (it refuses an uncommitted manifest). **`legacy freeze`** writes a legacy manifest pinning an archive's attempts and blobs by SHA-256, reading the archive in place (alpha: `--dataset alpha --release 0 --eval-version 0.7 --archive benchmark-archive --challenges-dir releases/0/challenges --legacy-root <dir>`; release 0 is closed, so it is not re-frozen). **`legacy convert`** turns a legacy manifest's pinned attempts into v4 bundles, converting an execution only when its provenance is proven, and lists them in a v4 dataset; the rest are reported with their reasons and need a rerun. See [ARCHIVE-FORMAT.md § Converting a legacy dataset](docs/ARCHIVE-FORMAT.md#converting-a-legacy-dataset):

  ```
  ./bench legacy convert --source datasets/sources/draft-legacy.yaml --dataset draft --legacy-root <dir>
  ```

  **Provenance before reuse.** Every evaluation result keeps its provenance: a result in an older format is reused only when its provenance is proven while converting it, otherwise the evaluation is rerun, and each dataset holds exactly one format. See [GUARANTEES.md § Provenance before reuse](docs/GUARANTEES.md#provenance-before-reuse).
- **`audit`** reads a legacy archive's completed attempts, takes each config's latest result per challenge, and prints one row per item; see [Item audit](docs/SCORING.md#item-audit).
- **`report`** builds one snapshot per manifest in `--datasets-dir` (default `datasets`) into `--output` (default `webapp/public/snapshots`): `<digest>.json` named by the SHA-256 of its bytes and never rewritten, `details/<id>.json`, and `index.json`. A v4 dataset reads its bundles from `--store` and their score records at its eval version (a missing record fails the build: run `./bench score --dataset` first); a legacy dataset reads its pinned attempt files under `--legacy-root` and fails on any file that no longer matches its pin. It prints one line per snapshot and the detail counts; see [ARCHITECTURE.md § Report pipeline](docs/ARCHITECTURE.md#report-pipeline).
- **`export-eee`** writes one completed legacy attempt as Every Eval Ever (schema 0.3.0) JSON plus an instance-level samples JSONL, locally; see [EEE-EXPORT.md](docs/EEE-EXPORT.md).
- **`list-models`** reads `configs.yaml` and prints one line per configuration (`id`, `artifact`, `runtime`, `quant`, `active`). **`list-prompts`** aggregates every challenge file's inline items and prints each item's name, category, and tier (tab-separated), followed by a `# Scenarios` section. Both are read-only sanity checks.

For invariants the harness commits to (complete-run skip, scope-managed cleanup, archive immutability, error-channel discipline) see [`docs/GUARANTEES.md`](./docs/GUARANTEES.md).

### Logging

`./bench run` prints a live per-cell result line to stdout as each configuration × challenge cell completes, then prints a summary grid. Pass `--verbose` (`-v`) to add intra-call detail: HTTP requests, store scans, health polls, and server lifecycle events.

## Dev loop

```bash
npm run test         # vitest
npm run typecheck    # tsc --noEmit
npm run lint         # biome + scripts/lint-strict.sh (bans try/catch/throw/console outside CLI)
npm run lint:fix     # biome --write
```

`scripts/lint-strict.sh` enforces the Effect error-channel discipline: `throw`, `try`/`catch`, and `console.*` are only allowed inside `src/cli/`. Everything else surfaces errors through tagged `Data.TaggedError` classes in `src/errors/`.
