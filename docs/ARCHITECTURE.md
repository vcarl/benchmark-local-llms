# Architecture

The harness benchmarks local LLMs. Its atomic unit of work is a **bundle**: one configuration executing one challenge's items within a run. A configuration is a model + runtime + quant + sampling settings + system prompt; a challenge is a named, versioned set of scored items. One bundle is one sealed, content-addressed file — see [the archive data model spec](./superpowers/specs/2026-11-17-archive-data-model-design.md); the legacy attempt format (schemaVersion 1–3) is in [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md).

The codebase is layered, and three rules hold across every layer:

- **All subprocess and HTTP lifecycle is `Scope`-managed.** The LLM server is acquired inside an `Effect.scoped` region; when the scope closes — normally or on interrupt — its finalizer tears the process down (SIGTERM, then SIGKILL).
- **Errors travel as typed `Data.TaggedError` in the Effect channel.** A failure is a value with a `_tag`, not a thrown exception. Operational outcomes (a scorer rejecting an answer, an LLM timing out) are folded into results; only genuine defects use `orDie`.
- **`try` / `throw` / `console.*` are banned outside `src/cli/`**, enforced by `scripts/lint-strict.sh`. The CLI layer is the one place allowed to touch `process`, log to the console, and use `try`/`throw`, because it owns the boundary with the outside world.

## Vocabulary

These words have one meaning each across code, docs, CLI and webapp. The target data model, and the terms it adds, is in [the archive data model spec](./superpowers/specs/2026-11-17-archive-data-model-design.md#glossary).

| Term | Meaning |
|---|---|
| **Config** | One model build to evaluate: weights artifact, runtime, quant, sampling settings, chat template, system prompt. Declared in `configs.yaml`, identified by its `configHash`. |
| **Run** | One `./bench run`. Every bundle it writes shares its `run.id`. |
| **Bundle** | One config executing one challenge's items within a run, on one machine: one sealed `.jsonl` file in `store/bundles/`, named by the SHA-256 of its bytes. A legacy **attempt** is the same unit in the schemaVersion 1–3 archive. |
| **Item** | One prompt plus its scorer, keyed `challengeId/itemName`. Each turn of a multi-turn item is an item. |
| **Challenge** | A named suite of items on one topic, one `releases/<release>/challenges/<id>.yaml`. |
| **Scorer** | How an item's output is graded (exact/regex/numeric, constraint checks, set/ordered match, `code_exec`, `custom`). Its result is the item's **score**, in `[0, 1]`. |
| **Contributor** | The public handle a bundle names as its producer (`run.contributor`, set by `BENCH_CONTRIBUTOR`, default `local`). |
| **Release** | A frozen item set, `0` (the alpha challenge set) or `YYYY.N`, in `releases/<release>/`. Its **release file**, `release.json`, records each item's prompt and scorer digest and, once frozen, a digest over the item set. |
| **Erratum** | A documented change to items after a release, numbered `<release>.<n>`, in the release's `errata.yaml`. |
| **Eval version** | A release plus its errata 1..n, written `<release>.<n>`. Fixes which scorer grades each item. |
| **Dataset** | `datasets/<name>.yaml`: a release, an eval version, and exactly the bundles (v4) or pinned legacy attempts that count — one data format per dataset. The report scores them against that release's challenge set and ranks them together. The archival `alpha` dataset is release `0` (the alpha challenge set) in the legacy format; the `draft` dataset is the pre-release, v4 only. |
| **Draft** | The complete set of the upcoming release under development: `releases/draft/challenges/` holds every release item an erratum does not retire (identical to `releases/0/challenges/` unless a pending-next-release erratum names it) plus the new candidate items. Reported as the `draft` dataset. |
| **Row** | One config on one machine within a dataset: config digest × hardwareId × contributor for v4, `configHash × hardwareId` for legacy. Every config version is its own row. The unit that is ranked. |
| **Cell** | One row's results for one challenge. |
| **Pass rate** | Fraction of a row's (or cell's) items whose score is exactly 1, coverage-adjusted over the dataset's challenges: a challenge the row did not run counts as failed. |
| **Partial pass rate** | The same fraction over only the challenges the row ran. |

A row has a pass rate, never a score.

## Layer map

```
src/cli/                 process boundary — argv, exit codes, console, subprocess safety net
  main.ts                wires subcommands (run, verify, score, release, legacy, dataset, report, audit, export-eee, list-models, list-prompts)
  commands/run.ts        sweep matched configurations × challenges → one bundle per cell
  commands/report.ts     dataset manifests → snapshots, the snapshot index and detail files
  commands/verify.ts     verify sealed bundle files
  commands/list.ts       read-only challenge-item / model sanity checks
  deps.ts                production wiring of the LLM-server factory
  subprocess-registry.ts process-level safety net (SIGHUP / uncaughtException / exit)
  logger.ts, paths.ts    log layer + canonical path helpers

src/orchestration/
  run-challenge.ts       bundle orchestrator: scope, server boot, complete-bundle cell skip, per-item execute, seal, score; aggregate()
  run-prompt.ts          one prompt → completion → output/reasoning split → result assembly
  run-loop.ts, hardware.ts  run env: git sha, hardware profile + hardwareId (probed once per process)

src/llm/
  chat-completion.ts     OpenAI-compatible HTTP client for both runtimes (port per runtime)
  servers/supervisor.ts  generic server supervisor: health gate, SIGTERM→SIGKILL finalizer, peak-RSS sampling
  servers/*              runtime-specific spawners (llamacpp, mlx, omlx), artifact + runtime-version resolution

src/scoring/
  dispatch.ts            scoreByConfig: dispatch a scorer config to its scorer by type
  strip-thinking.ts      split reasoning from answer when the runtime inlined it
  exact-match.ts, constraint.ts, code-exec.ts, custom.ts   the scorers
  sandbox.ts             isolated Docker runner for code_exec / custom scorers

src/config/
  configurations.ts      load configs.yaml, resolve identity (configHash)
  challenges.ts          load a challenge YAML, resolve its inline items + challengeHash
  system-prompts.ts      load the root system-prompts.yaml registry
  hashing.ts             12-hex scenario hash (12-hex hashes are legacy only; v4 identities are full SHA-256 digests); yaml.ts the parser

src/schema/              Effect Schema definitions: attempt (manifest + item), configuration,
                         challenge, prompt, model, scorer, enums; run-manifest.ts exports RunEnv

src/store/
  digest.ts              stableStringify and SHA-256 digests
  bundle.ts              open-file writer, canonical sealing, verifying reader
  store-index.ts         skip index over sealed bundles
  weights.ts             weights digest, cached in store/weights.json
  scores.ts              score records, scorer digests

src/scoring/rules.ts     SCORING_RULES, the harness-wide scoring rules version

src/report/
  index.ts               pipeline entry (runReport, buildSnapshot), the snapshot index
  v4-rows.ts             a v4 dataset's rows: bundles + score records, detail files
  model-key.ts           modelKey: the model identity GGUF / MLX builds share

src/legacy/              the schemaVersion 1-3 attempt reader (the only code that reads them)
  content-store.ts       content-addressed blob keys and verification (prompts / scorers / system)
  load-attempts.ts       parse *.jsonl archives into LoadedAttempt
  aggregate.ts           completed-only filter and dedup: the attempts that get a detail file
  rows.ts                selection: rows per config × machine over the challenge set; cell and row math shared with v4 rows
  write-details.ts       emit per-attempt drilldown JSON
  reconstruct.ts         rebuild an attempt from .jsonl + content store

src/errors/              typed Data.TaggedError classes, re-exported from index.ts
```

## Bundle lifecycle

`run` executes each `(configuration × challenge)` cell as one bundle, in order:

1. **Resolve inputs.** Load `configs.yaml`, the challenge YAML, and the system-prompt registry. Find the configuration by id (an unknown id is a hard `dieMessage`). Resolve the challenge's inline items, the config digest, the weights digest (cached in `store/weights.json`) and the hardware id. The release is taken from `--challenges-dir`.
2. **Skip, resume or open.** A cell one sealed bundle already holds whole is skipped ([SCORING.md § Report rows](./SCORING.md#report-rows), run skip). Otherwise, inside `Effect.scoped`, the cell's matching open file in `store/open/` is resumed, or a new one is written: line 1 is the header, then one execution per line ([ARCHIVE-FORMAT.md § Lifecycle](./ARCHIVE-FORMAT.md#lifecycle-open-to-sealed)). `--no-skip` runs every cell.
3. **Boot the LLM server.** `run` boots the runtime's server **once per configuration** and reuses it across that configuration's challenges. A server that won't boot skips the whole configuration's row — every cell is recorded `SKIPPED` and the sweep continues to the next configuration. (The single-attempt `runChallenge` wrapper instead `orDie`s, having nothing to recover to.) The supervisor spawns the process, waits on its health endpoint, registers it with the process-level safety net, and forks a peak-RSS poller. Health alone does not prove the model loaded — `mlx_lm.server` and oMLX answer `/v1/models` before the weights are in memory, and `mlx_lm.server` keeps answering after its load has failed while every completion hangs — so after the chat-template gate the supervisor sends a one-token completion. A non-2xx answer, no answer within the load budget, or (mlx) the generation thread's crash header on the server's output aborts the boot with a typed `ModelLoadError` carrying the server's last output lines, and the row is `SKIPPED` with that reason. mlx requests name the model `default_model`, the id `mlx_lm.server` gives its `--model` path; any other id makes it reload the model by that id.
4. **Run each item.** Execute every item and each of its samples (one unless `--samples`) via `runPrompt` with a random seed and append the execution line.
5. **Seal.** Fill `finishedAt` and the `executions` count, re-serialize every line canonically, and write the bytes to `store/bundles/<bundleDigest>.jsonl`, the name being their SHA-256. A cell that executed nothing writes no bundle.
6. **Score.** Score each execution with `scoreByConfig` — a scorer error folds to score 0 — and append one score record per execution to `store/scores/<bundleDigest>.jsonl`. An execution that carried an `error` scores 0.

An interrupted run leaves its open file in `store/open/`; the report never reads it, and re-running `run` resumes it. Sealed bundles are never modified. `./bench verify` re-checks a sealed bundle without writing anything.

## Report pipeline

`report` builds one **snapshot** per dataset manifest in `--datasets-dir` (D11 in the data-model spec):

```
per manifest:  rows (legacy: pinned attempts; v4: bundles + score records)
               → <output>/<sha256>.json
then:          details/<id>.json + prompts/<sha256>.json (index order) → index.json → prune details
```

1. **Release.** `loadRelease(releases/<release>)` reads `release.json`, `errata.yaml` and the blobs. The challenge set is every challenge loadable from `releases/<release>/challenges/`, never inferred from the records; families and scopes come from it. The snapshot's errata are the release's errata up to the manifest's eval version (a draft: none), without `notes` or `scorers`.
2. **Challenge set.** The release's challenge YAML, every file of which must load (a failure names the file), checked against `release.json` as `./bench release verify` checks it (`challengeDrift`): a draft must match exactly, a release must be covered by its errata. Drift fails the build, naming the items.
3. **Rows.**
   - A **legacy** manifest is read by `loadLegacyDataset`: only the attempt files it lists, each checked against its SHA-256 before it is parsed, and blobs through a reader that checks their pins (a mismatch or a missing file fails the report). `buildRows` (`src/legacy/rows.ts`) selects one row per `configHash × hardwareId`; attempts without a hardware profile belong to the manifest's `legacy.hardware`.
   - A **v4** manifest is read by `scoredExecutions` (`src/report/v4-rows.ts`): every listed bundle through the verifying reader, naming the manifest's release, each execution with our score record under the scorer digest in effect at the eval version. A missing record fails the build (`./bench score --dataset <name>` first); records of one execution and scorer that disagree fail it naming the item. `v4RowsOf` selects one row per config digest × hardwareId × contributor.
   Both build cells with `buildCell` and rows with `assembleRows`, so a cell means the same thing in either; the rules are in [SCORING.md § Report rows](./SCORING.md#report-rows).
4. **Snapshot file.** The snapshot's canonical bytes, written to `<sha256 of the bytes>.json` and never rewritten; its fields and `inputs` are in [ARCHIVE-FORMAT.md § Snapshots](./ARCHIVE-FORMAT.md#snapshots). `configs.yaml` enters `inputs` because its `modelKey` overrides group rows.
5. **Details.** `details/<id>.json` per `sourceAttempts` id: a legacy attempt's (`writeDetails`, joining the reconstructed prompt / scorer / system text with the in-memory output, reasoning, score, error and per-item timing; a non-reconstructible attempt is skipped and its row still counts it) or a bundle's (the same JSON, `detailPayload`, with prompt text from the release's prompt blob). Each item's prompt text goes to a prompt pack, `prompts/<sha256>.json` (`{ item_id: text }`), named by the detail's `prompts` field, so every config's detail for a challenge shares one pack. An id shared by two datasets is written by the first in index order.
6. **Index.** `index.json` = `{ snapshots: [{ dataset, title, release, evalVersion, ranked, legacy, digest, rows, challenges, span }] }`: this build's snapshots plus earlier entries whose file is still in the output and still hashes to its digest (any other is dropped with a warning); alpha first, then other legacy datasets, releases newest first (within a dataset the newest eval version, then this build's snapshot), drafts last.
7. **Prune.** A detail file that no indexed snapshot's `sourceAttempts` names is removed.

`RowsDataset` (`src/legacy/rows.ts`) is the backend→webapp contract. `webapp/src/lib/rows.ts` mirrors the fields the webapp reads; there is no compile-time link between the two files, so a change to one must be mirrored in the other.

`scripts/deploy-pages.sh` builds the snapshots, the webapp and `webapp/src/llms/` markdown into a static site and publishes it to GitHub Pages: [DEPLOY.md](./DEPLOY.md).

## Reasoning split

A completion's text is separated into `output` / `reasoning` / `rawOutput` / `error` **once**, at completion time, in `run-prompt.ts`:

- If the runtime already split reasoning into a distinct API field (`reasoning_content` on llama.cpp, `reasoning` on mlx_lm.server), that body is trusted verbatim and no stripping occurs — except that a `length`-stopped `output` identical to its `reasoning` (oMLX flushes unclosed thinking into `content` when the budget runs out) is no answer: `output` becomes `""` (`echoesTruncatedReasoning` in `src/scoring/failure-kind.ts`; `bench score` applies the same rule to archived lines).
- Otherwise the model may have inlined thinking into the answer (`<think>…</think>` or Harmony channel markers). `stripThinkingTags` recovers it: cleaned answer → `output`, extracted thinking → `reasoning`, and `error: "thinking_truncated"` when an unclosed think block means no answer was produced.
- `rawOutput` always preserves the original API content for audit.

Scorers consume the already-cleaned `output` and never re-strip. The split happens exactly once and lives entirely outside the scoring layer.

## Where to look when…

| You want to… | Start here |
|---|---|
| Add a new scorer type | `src/schema/scorer.ts` (add the config variant), then a new case in `src/scoring/dispatch.ts` and its scorer module |
| Add a new runtime | `src/llm/servers/` (a spawner over `supervisor.ts`), the port map in `src/llm/chat-completion.ts`, the `Runtime` enum in `src/schema/enums.ts`, and the factory in `src/cli/deps.ts` |
| Debug a shutdown that hangs | `src/llm/servers/supervisor.ts` — the SIGTERM→SIGKILL finalizer and its bounded, interruptible kill timeouts |
| Add a new report field | `src/legacy/rows.ts` **and** `webapp/src/lib/rows.ts` together (the contract is hand-maintained) |
| Know what counts as a pass | An item passes when its `score === 1`; the same definition (`passFraction`) drives the attempt aggregate and each cell's `passed` |

## Conventions

- **Effect error channel.** Failures are typed `Data.TaggedError` values; expected outcomes are folded into results, and only defects use `orDie`. See [GUARANTEES.md](./GUARANTEES.md#error-channel-discipline).
- **Scope propagation.** Every subprocess and server is acquired in an `Effect.scoped` region whose finalizer guarantees teardown. See [GUARANTEES.md](./GUARANTEES.md#scope-managed-resources) and [#graceful-shutdown-sigterm--sigkill](./GUARANTEES.md#graceful-shutdown-sigterm--sigkill).
- **Fail-fast config.** Configuration and challenge resolution validates eagerly; an unknown id or an undecodable YAML stops the run before any model is touched. See [GUARANTEES.md](./GUARANTEES.md#fail-fast-config).
- **Self-sufficient archives.** A legacy attempt's `.jsonl` plus its referenced content blobs are everything needed to reconstruct it; a sealed bundle carries its own header, config and executions. See [GUARANTEES.md](./GUARANTEES.md#legacy-pins) and [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md#content-store).
- **One file per concept.** Each module owns a single concern — one scorer per file, one writer for the store, one client for completions — so the layer map above reads as a table of contents.
