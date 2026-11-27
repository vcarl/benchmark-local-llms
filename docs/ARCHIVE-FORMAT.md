# Archive Format

The harness stores work in two formats. `./bench run` writes **bundles** (schemaVersion 4) into the **store**; the schemaVersion 1–3 **legacy archives** are read in place and never written. Datasets, releases and snapshots sit on top of them. The data model and its rationale are in [the archive data model spec](./superpowers/specs/2026-11-17-archive-data-model-design.md); this document is the format reference.

## Store layout

```
store/                                          --store, default `store`; gitignored
  bundles/<bundleDigest>.jsonl                  sealed bundles, never modified
  open/<runId>-<configId>-<challenge>.jsonl     bundles still being written
  scores/<bundleDigest>.jsonl                   score records, append-only
  weights.json                                  weights-digest cache (path + size + mtime)
```

## Bundle (schemaVersion 4)

A bundle is one configuration executing one challenge's items on one machine in one run. Every line is `stableStringify(object) + "\n"` (sorted keys, no whitespace, no undefined values). Line 1 is the header; each further line is one execution. A bundle carries no score, failure kind or aggregate: grading is a separate record ([Score log](#score-log)), so nothing in a bundle changes when grading does.

### Header

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `4` | Format marker. |
| `configId` | `string` | Slug from `configs.yaml`. A display name, outside `config`: renaming it never changes `configDigest`. |
| `config` | object | The configuration's identity, below. |
| `configDigest` | `string` | `digestOf(config)`. |
| `release` | `string` | Release of the challenge directory the run used: `<name>` for `releases/<name>/challenges`, `draft` for any other directory. |
| `challenge` | `string` | Challenge id. |
| `run` | `{ id, contributor, startedAt, finishedAt }` | `id` is shared by every bundle one `./bench run` writes; `contributor` is `BENCH_CONTRIBUTOR` (default `local`); `finishedAt` is `null` while open. |
| `env` | object | Provenance, below. |
| `executions` | `number \| null` | Execution line count; `null` while open. |

`config`:

| Field | Type | Description |
|---|---|---|
| `artifact` | `string` | Model artifact (HF repo / path). |
| `weightsDigest` | `string \| null` | SHA-256 of the weights the server loads: the GGUF file (a split GGUF: the digest of its sorted `[shard, sha256]` pairs), or for mlx/omlx the digest of the sorted `[shard, sha256]` pairs of the model directory's `*.safetensors`. `null` when the weights cannot be located. Pins the claimed artifact; it does not prove the outputs came from it. |
| `runtime` | `"llamacpp" \| "mlx" \| "omlx"` | Server runtime. |
| `quant` | `string?` | Quantization tag; absent when the configuration omits it. |
| `temperature`, `maxTokens` | `number` | Sampling temperature; generation cap per item. |
| `sampling` | object | Only the keys the configuration sets, of `topP`, `topK`, `minP`, `presencePenalty`, `presenceContextSize`, `repetitionPenalty`, `repetitionContextSize`. |
| `chatTemplateKwargs` | `Record<string, string \| number \| boolean>?` | Chat-template variables as sent. |
| `chatTemplateDigest` | `string \| null` | SHA-256 of the vendored template file's bytes; `null` when no template is set. |
| `systemPrompt` | `string` | The resolved system-prompt text, not its registry key. |

`env` is recorded for audit and enters no config identity: `platform`, `runtimeVersion`, `nodeVersion`, `harnessGitSha`, `hardware` ([profile](#hardware-profile)), `hardwareId`, and optionally `ctxSize`, `extraArgs`, `serverFlags` (the harness's fixed llama-server flags) and `chatTemplate` (the template's name).

### Execution (lines 2+)

| Field | Type | Description |
|---|---|---|
| `item` | `string` | `<challengeId>/<itemId>`; a turn's `itemId` carries `#k`. |
| `sample` | `number` | 0-based sample index, always present. |
| `seed` | `number \| null` | Sampler seed sent with the request. |
| `messagesDigest` | `string` | `digestOf` of the exact `messages` array sent to the chat endpoint (system, history, prompt). The one builder, `chatMessages` in `src/llm/chat-completion.ts`, serves both the request and the digest. |
| `executedAt` | `string` | ISO timestamp at execution start. |
| `output`, `reasoning`, `rawOutput` | `string`, `string \| null`, `string` | Cleaned answer, separated chain-of-thought, unmodified API content. |
| `error` | `string \| null` | `null` on success; a tagged-error string on failure. |
| `stopReason` | `string \| null` | `"stop"`, `"length"`, `"loop"` (repetition detector), or `null`. |
| `measured` | object | `promptTokens`, `generationTokens`, `promptTps`, `generationTps`, `peakMemoryGb`, `wallTimeSec`, plus the optional timing fields of [Request timing](#request-timing). |

### Digests

Every v4 identity is a full SHA-256 as 64 lowercase hex characters. `digestOf(value)` is `sha256Hex(stableStringify(value))` (`src/store/digest.ts`). Readers re-derive a digest from the bytes it names before using them; a mismatch is a typed failure, never a fallback.

| Digest | Preimage |
|---|---|
| `configDigest` | the header's `config` |
| bundle digest | the sealed file's bytes; the file's name |
| execution digest | the execution line's object |
| `messagesDigest` | the messages array sent |
| `hardwareId` | the hardware profile with `os` left out |
| prompt digest | the prompt blob's bytes (the prompt text, or for turn k ≥ 2 the conversation JSON of gold history plus the turn's prompt) |
| scorer digest | the scorer blob's bytes ([SCORING.md § Scorer digest](./SCORING.md#scorer-digest-and-score-records)) |
| snapshot digest | the snapshot file's bytes |

### Lifecycle: open to sealed

1. **Open.** `createOpenBundle` writes the header (`finishedAt: null`, `executions: null`) to `store/open/<runId>-<configId>-<challenge>.jsonl`, never clobbering a file. `appendExecution` appends one line per execution as it finishes.
2. **Interrupt and resume.** A run that stops before sealing leaves its open file in `store/open/`; the report never reads an open file. The next `./bench run` of the cell adopts the open file whose config digest, `hardwareId`, release and challenge all match its own (any other open file is left alone and a fresh one started) and continues it: the header, with its original `run.id` and `run.startedAt`, is kept, executions already written are kept except harness failures (token-limit outcomes `context_exceeded` and `thinking_truncated` are the model's result and are kept), and the rest are executed and appended. A partial trailing line left by a crash mid-append is ignored on read (`readOpenBundle`).
3. **Seal.** `sealBundle` fills `finishedAt` and `executions`, keeps only the last line of a re-executed item × sample, re-serializes every line canonically, digests the bytes, writes `bundles/.<digest>.tmp`, renames it to `bundles/<digest>.jsonl`, and removes the open file. Sealing onto an existing file is a byte comparison; a different file under the same name is a `BundleConflict`, never an overwrite. A run that generated nothing seals no bundle.

### Complete runs

What makes a bundle complete, which complete bundle a cell counts, and when `./bench run` skips a cell are defined in [SCORING.md § Report rows](./SCORING.md#report-rows).

### Verifying reader

`readBundle` (`src/store/bundle.ts`) fails with `BundleInvalid` naming the check (`json`, `schema`, `canonical`, `name`, `configDigest`, `hardwareId`, `executions`, `duplicate`) unless: every line is JSON that decodes exactly (no excess fields); the file ends in a newline and equals its own canonical re-serialization byte for byte; `configDigest` re-derives from `config`; `hardwareId` re-derives from `env.hardware`; `executions` equals the line count; no item × sample repeats; and a file named `<64 hex>.jsonl` hashes to its name. The skip index, `./bench score`, `./bench report` and `./bench verify` all read sealed bundles through it. `./bench verify <bundle…>` runs it, then pins each bundle to its release under `--releases-dir`: the release is frozen (a draft passes with a warning), the challenge and every item are in it, and every `messagesDigest` equals the digest of the messages built from the release's prompt blob, the header's system prompt and the gold history. It prints `ok` or `FAILED` per file, exits nonzero on any failure, and writes nothing.

### Score log

`store/scores/<bundleDigest>.jsonl` holds one `stableStringify` line per score record, appended with O_APPEND and never rewritten:

```
{ execution, scorer, score, failureKind, details, nearMiss, breakdown, harnessGitSha, scoredAt }
```

`execution` is the execution digest and `scorer` the scorer digest, so a scorer or rules change adds records under a new scorer digest beside the old ones. Two records for the same (`execution`, `scorer`) that disagree on `score`, `failureKind`, `details`, `nearMiss` or `breakdown` fail the snapshot build ([SCORING.md § Score records](./SCORING.md#scorer-digest-and-score-records)). `./bench run` appends the records of a sealed bundle; `./bench score --dataset <name>` appends the ones a dataset's eval version needs and the log lacks ([SCORING.md](./SCORING.md#scorer-digest-and-score-records)).

## Releases

```
releases/<release>/
  release.json      { release, label?, date?, closed?, commitment?, committedAt?,
                      items: { "<challenge>/<item>": { prompt, scorer, scope, family } } }
  errata.yaml       the release's errata; a scorer-changing erratum records `scorers: { item: scorerDigest }`
  challenges/*.yaml
  blobs/<sha256>    every prompt and scorer blob the release has used, named by the SHA-256 of its bytes
```

`release.json` is written only by `./bench release commit` (and `./bench release sync` for the draft), with sorted keys, 2-space indent and a trailing newline. Each blob is checked against its name when the release loads (`ReleaseInvalid` on mismatch). `<release>` is `0` (the alpha challenge set), `YYYY.N` (N ≥ 1), or `draft`.

- **Release 0** (`label: initial-main-<sha>`) keeps the 12-hex `promptHash` / `scorerHash` values of the legacy archives as its item digests, because they name legacy executions; its blobs are the legacy content-store blobs, matched to an item by legacy key and named by full SHA-256. Every later release's prompt digest is the SHA-256 of the prompt blob and its scorer digest the SHA-256 of the scorer blob ([Digests](#digests)). It is `closed: "0.7"`: no further errata, and `./bench verify` rejects new bundles for it.
- **The draft** (`releases/draft/`) has no item-set digest. `./bench release sync draft` rewrites `release.json` from `challenges/` and writes any missing blobs, never deleting one; `npm test` fails when it is out of sync.
- **A frozen release** is cut by `./bench release commit <YYYY.N>` from the draft (`--from`, default `releases/draft`); it refuses a name that is not `YYYY.N`, does not follow the latest release, or already exists. It writes: challenges copied, `release.json` with the items, the item-set digest (`commitment`) and `committedAt`, blobs, and an empty `errata.yaml`. The item-set digest is the SHA-256 of `stableStringify` of the sorted `[key, promptDigest, scorerDigest]` triples; items are public, so it identifies the frozen set rather than hiding it. `./bench release verify <release>` re-derives every blob digest, re-resolves the challenges, applies the errata (the [coverage check](./ERRATA.md#the-coverage-check)) and recomputes the item-set digest, prints what matched, and exits nonzero on any mismatch; anyone holding the release directory can run it.
- **Eval versions** are `<release>.<n>` for the release's n errata: `2027.1.0` before any erratum, `0.7` for release 0. The scorer digest grading an item at version n is the latest erratum ≤ n recording one for it, else `release.json`'s ([ERRATA.md](./ERRATA.md)).

## Datasets

`datasets/<name>.yaml` lists exactly what a dataset contains; no directory scan or naming convention decides membership. A manifest is in exactly one format: `bundles` (v4) or `legacy` pins, never both.

```yaml
# v4
name: 2027.1
title: Release 2027.1
release: "2027.1"
evalVersion: "2027.1.2"
ranked: true
bundles:
  - 1b9e…   # qwen3.8-27b-omlx · math
```

```yaml
# legacy
name: alpha
title: …
release: "0"
evalVersion: "0.7"
ranked: true
legacy:
  hardware: { id: <hardwareId>, profile: {…} }   # machine attributed to pre-schemaVersion-3 attempts
  archives:
    <archive basename>:
      attempts: { <file name>: <sha256 of its bytes> }
      blobs: { "<kind>/<key>.<ext>": <sha256 of its bytes> }
```

`bundles` entries are 64-hex digests with a `# configId · challenge` comment; `./bench dataset add <name> <bundle…>` appends digests (skipping listed ones) with their comments. `rowsDigest` (optional) pins an archival dataset's rows: the SHA-256 of the snapshot's `rows`, and `./bench report` fails when a build's rows differ (alpha carries one). `ranked: false` shows a dataset without rank numbers or tiers (`./bench legacy freeze --unranked`); the first archive under `legacy.archives` is the dataset's own, later ones are reused. `./bench legacy freeze` writes legacy manifests ([below](#freezing-a-legacy-dataset)).

## Snapshots

`./bench report` builds one snapshot per manifest into `--output` (default `webapp/public/snapshots`, gitignored):

```
index.json              { snapshots: [ { dataset, title, release, evalVersion, ranked, legacy, digest, rows, challenges, span } ] }
<snapshotDigest>.json   one dataset at one eval version: stableStringify bytes
details/<id>.json       drilldown detail files, shared across snapshots
prompts/<sha256>.json   prompt packs: { item_id: prompt text }, shared across details
```

- A snapshot is `{ schemaVersion: 4, dataset: { label, title, release, version, ranked, legacy, archiveDir, challengesDir, errata }, inputs: { manifest, release, configs, itemDates, modelDates, runners, scoringRules, harnessGitSha, harnessDirty }, releaseFile, challengeSet, hardware, rows, timing }`. `timing` holds the evaluation-timing label counts per row and the dates behind them, beside `rows` so a `rowsDigest` never covers it; it is null for a dataset on release `0` or the draft ([EVAL-TIMING.md](./EVAL-TIMING.md#in-the-snapshot)). `inputs.itemDates` and `inputs.modelDates` are the SHA-256 of `item-dates.json` and `model-dates.yaml` (null when absent or, for alpha and draft, unread). `releaseFile` is the release's `release.json` without its items (label, dates, item-set digest). `inputs.manifest`, `inputs.release` and `inputs.configs` are the SHA-256 of the manifest file, `release.json` and `configs.yaml` (null when absent); `inputs.runners` and `inputs.scoringRules` are the sandbox runners and scoring rules versions that graded the counted executions (`1` for an alpha line that keeps its stored score); `./bench report` refuses a tree with tracked changes under `src/`, `releases/`, `datasets/`, `configs.yaml`, `system-prompts.yaml`, `item-dates.json` or `model-dates.yaml`, and `--allow-dirty` builds one anyway with `harnessDirty: true` and a `-dirty` sha; `errata` are the release's errata up to the eval version, public fields only. It carries no build timestamp, so anyone holding the manifest's inputs, the release and the harness at `harnessGitSha` rebuilds it byte for byte.
- Every config version is its own row (a row is one config hash × machine × contributor); the webapp shows a configId's versions as variant rows of its model.
- A snapshot file is never rewritten: an existing `<digest>.json` must hold identical bytes or the build fails with `SnapshotInvalid`. A new eval version or manifest change yields a new file and index entry; the index holds one snapshot per (dataset, eval version), the newest build, and a snapshot a newer build replaces is removed from the index and the output directory. Entries of other eval versions of the dataset stay while their file is present and still hashes to its digest; any other is dropped with a warning. A draft (null eval version) keeps its latest snapshot only.
- `details/<id>.json`: `id` is whatever a row's `sourceAttempts` holds, the `attemptId` for a legacy row and the bundle digest for a v4 row. Its `prompts` field names the prompt pack holding its items' prompt text (the SHA-256 of the pack's bytes); its items carry no `prompt_text`. `./bench report` removes a detail file that no indexed snapshot references.
- Index order: `alpha`, other legacy datasets, releases newest first, drafts last; within a dataset the newest eval version first.

See [ARCHITECTURE.md](./ARCHITECTURE.md#report-pipeline) for the pipeline and [SCORING.md § Report rows](./SCORING.md#report-rows) for selection.

### Freezing a legacy dataset

`./bench legacy freeze` writes a legacy manifest from an archive, reading it read-only; `--legacy-root` is the directory holding the `benchmark-archive*` directories. `legacy.hardware`, the machine pre-schemaVersion-3 attempts are attributed to, is kept from an existing manifest, so a re-freeze never re-attributes rows; a first freeze probes the current machine and records its id and profile, and an explicit `--legacy-hardware <id>` records that id without a profile.

```
./bench legacy freeze --dataset alpha --title "<title>" --release 0 --eval-version 0.7 \
  --archive benchmark-archive --challenges-dir releases/0/challenges \
  --legacy-root <dir>
```

It lists attempts that parse and belong to a challenge of `--challenges-dir`, leaving out those of `smoke-config`; `--reuse` adds the reused archive's attempts of the rows (config × machine) the own archive has. Alpha is closed at `0.7` and is not re-frozen. The draft's archive (`benchmark-archive-next`, reusing `benchmark-archive`) is frozen into `datasets/sources/draft-legacy.yaml`, the source record of its conversion.

### Converting a legacy dataset

A legacy execution enters a v4 dataset only by conversion, under [Provenance before reuse](./GUARANTEES.md#provenance-before-reuse):

```
./bench legacy convert --source datasets/sources/draft-legacy.yaml --dataset draft \
  --legacy-root <dir> [--store store] [--releases-dir releases] [--templates-dir templates] \
  [--report store/convert-report.json]
./bench score --dataset draft
./bench report --legacy-root <dir>
```

For each attempt the source manifest pins, in archive and file-name order:

1. **Source.** Read the file and check its bytes against the pin; parse it; require a complete attempt (`finishedAt` set, not `interrupted`); reconstruct it through the pinned blob reader, so the system, prompt and scorer blobs it references all match their pins and keys.
2. **Config.** Require a header that records every `configHash` input (`configHashRecomputable`: schemaVersion 3, or a schemaVersion 2 header that records any sampler setting) and recompute `configHash` from those fields and the pinned system prompt. The v4 config is built from the same fields: `artifact`, `runtime`, `quant`, `temperature`, `maxTokens`, the sampler settings that are set, `chatTemplateKwargs`, the system prompt text, `weightsDigest: null` (legacy attempts record none) and `chatTemplateDigest` — the SHA-256 of `templates/<chatTemplate>.jinja` when its 12-hex prefix is the recorded `chatTemplateSha`, else the attempt is not converted. The hardware profile is the header's, or the manifest's `legacy.hardware` profile for an attempt without one; its full `hardwareId` must start with the recorded 12-hex one.
3. **Prompt.** Per line (retired lines excluded): the item is in the release, its `promptHash` is the item's current one, and `messagesDigest` is `releaseMessagesDigest` of the release's prompt blob, the system prompt and the gold history.
4. **Output.** The execution carries the line's `output`, `reasoning`, `rawOutput`, `error`, `stopReason`, `executedAt`, `seed`, `sample` and measurements (timing fields included) as recorded; an absent `seed` or `stopReason` is `null`, as `./bench run` writes it.
5. **Link.** Each source attempt converts whole into one bundle, the complete run it records: a line the attempt replayed from the cache (`cachedFrom`) stays in it, as the run counted it. The bundle carries the header's `source: { file: "<archive>/<name>", sha256 }`, each execution's `sourceLine` (1 = the header), executions in line order, run id the attempt's `invocationId` (else its `attemptId`), contributor its `submitter` (else `local`), `harnessGitSha` its `benchmarkGitSha`.

No legacy score is carried; `./bench score` grades the converted bundles. Bundles are sealed canonically into `<store>/bundles/<digest>.jsonl` and re-read through the verifying reader. They hold no conversion time, so a second conversion writes byte-identical files. The command appends the digests (with `# configId · challenge` comments) to the v4 dataset `--dataset`, creating it from the source's name fields when absent; it refuses a legacy manifest there, since a dataset holds one format. The report (`--report`) lists every unconverted `(configId, configHash, challenge, item)` with its reason and line count, and `needsRerun`: per `configId@configHash`, the release items it has no converted execution of, with the reasons. Those configs need a rerun; their new bundles join the draft with `./bench dataset add draft <bundle…>`.

The alpha challenge set is never converted: it stays the archival legacy dataset its `rowsDigest` pins. The draft is converted: `datasets/draft.yaml` lists v4 bundles only, and its source manifest `datasets/sources/draft-legacy.yaml` sits outside `datasets/`'s top level, so the report builds no snapshot of it.

Converted bundles are selected like any v4 bundle ([SCORING.md § Report rows](./SCORING.md#report-rows)): a cell counts one complete run, the most recent, so where a legacy row took an earlier run's success for an item a later run failed, the converted row counts the later run as it ran.

### Inferred weights digests (draft, 2026-11)

Bundles run before the weights digest existed record `weightsDigest: null`. Before the draft's first release, a one-time backfill (`scripts/oneoff/backfill-weights-2026-11.ts`) copied 895 such bundles of 39 configs into bundles whose header adds the `weightsDigest` of the files on disk, with `source: { file: "bundles/<digest>.jsonl", sha256: <digest> }` naming the original; executions, run id and timestamps are unchanged. The digest is inferred, not recorded at run time: a config qualified only when one null-weights bundle per draft challenge held every current item under its current config on this machine, and every weights file (symlink and target) was last modified before the earliest of those runs started. `datasets/sources/weights-backfill-2026-11.jsonl` is the ledger: per config the digest, each file's modification time, and each `from` → `to` bundle. The draft lists the copies in place of the originals. Every other bundle's `weightsDigest` is the one `run` recorded.

## Hardware profile

`env.hardware` describes the machine that ran a bundle or attempt; `env.hardwareId` is the digest of its canonical JSON with `os` left out, so an OS update keeps a machine's identity: 64-hex `digestOf` in bundles, the 12-hex `shortSha256` in schemaVersion 3 attempts.

| Field | Type | Source (macOS / Linux) |
|---|---|---|
| `cpu` | `string` | CPU model (`os.cpus()`), e.g. `Apple M5 Max` |
| `cpuCores` | `number` | Logical CPU count |
| `coreTypes` | `Record<string, number>?` | Physical cores per `hw.perflevelN.name` (`{ Super: 6, Performance: 12 }`); macOS only |
| `gpu` | `string?` | `system_profiler SPDisplaysDataType` model / `nvidia-smi` name (`2× …` for several) |
| `gpuCores` | `number?` | Apple GPU core count |
| `gpuMemoryGb` | `number?` | Total NVIDIA GPU memory |
| `memoryGb` | `number` | System (unified) RAM, rounded to whole GB |
| `os` | `string` | `macOS <sw_vers>` / `/etc/os-release` `PRETTY_NAME`; falls back to kernel type and release |

The profile is probed once per process; any probe that fails leaves its field absent and never fails the run. It holds no hostname, serial number, username, or email.

## Memory

`peakMemoryGb` is best-effort. The supervisor samples the model server's RSS (`ps -o rss=`) once immediately after the health gate (post model-load) and then every 30 s. For an attempt shorter than the poll interval, the recorded value reflects the loaded footprint at health rather than a true sustained peak. `0` legitimately means "unknown" (no sample landed, or `ps` could not be read) — it is not a failure. On Apple Silicon the figure is RSS only and undercounts Metal/MLX wired GPU buffers.

## Request timing

The request-timing fields (`ttftMs` through `draftAcceptedTokens`) are optional and additive: lines without them read as "not measured", and they do not change `schemaVersion`. They are measurements only. No identity hash (`configHash`, `promptHash`, `itemHash`, `scorerHash`, `challengeHash`) reads them, and a cache-replayed line carries them with the rest of the line. Errored lines carry none of them.

The prefill/decode split is comparable within a `timingSource`, not across sources:

- **`server`** (llama.cpp). Values come from the `timings` object on the final stream chunk (`server_slot_stats::to_json`, `tools/server/server-common.cpp`). `prefillMs` covers only the `prefillTokens` that missed the cache.
- **`client`** (mlx_lm.server, oMLX, and a llama.cpp stream cut short by the loop detector). `prefillMs` is TTFT, so it also covers HTTP, tokenization and queueing. `decodeMs` starts at the first frame, so it excludes the first token's own decode.

`ttftMs` is always on the harness clock, on every runtime. The detail file's per-item `timing` object carries these fields plus wall time and token counts, and the drilldown prints them on each item.

## Legacy archives (schemaVersion 1–3)

The attempt archives (`benchmark-archive/`, `benchmark-archive-next/`) are read by the legacy reader in `src/legacy/` (`./bench report`, `audit`, `export-eee`) and never written. A line counts for an item when its prompt matches the item's current one; a line graded under another scorer than the item's current one takes its score from `<store>/scores/legacy.jsonl` ([SCORING.md § Score records](./SCORING.md#scorer-digest-and-score-records)). The reader loads only what a legacy dataset manifest pins, checking each file's bytes against the manifest's SHA-256 before parsing it ([Pinned reads](#pinned-reads)).

### The unit: one attempt

The harness records work in **attempts**. An attempt is one **configuration** (a model + runtime + quant + sampling settings + system prompt) executing one **challenge** (a named, versioned set of scored items). Every attempt is a single `(configuration × challenge)` pairing, and every attempt is one `.jsonl` file.

This grain is the organizing fact of the whole format. An attempt does not span models, does not span challenges, and does not pool across challenge versions — a challenge edited to a new version is a different challenge as far as the archive is concerned. Reports aggregate attempts into per-configuration and per-model views; the archive itself stays at the attempt level.

### File layout

Each attempt is `<attemptId>.jsonl` under the archive directory (default `benchmark-archive/`), where `attemptId` has the form `att-<configHash>-<challengeHash>-<timestamp>`.

- **Line 1** — the `AttemptManifest` header. `finishedAt: null` and `interrupted: true` mark an attempt that never finished.
- **Lines 2+** — one `ItemResult` per challenge item and sample, appended as each is scored. An item generated once has one line; a resampled item has one line per sample, consecutive, sample 0 first.

Alongside the `.jsonl` files, the archive directory holds a single shared `content/` directory — the **content store** (see [below](#content-store)). Together, an attempt's `.jsonl` plus the blobs it references are everything needed to reconstruct that attempt without any other input.

Blank lines are tolerated by the reader; the trailing newline on the last record produces an empty final segment that is skipped.

### AttemptManifest (line 1)

The header carries the attempt's full identity and provenance. Configuration and challenge identity are **denormalized** into the header so a single line is self-describing. The generation knobs (sampler settings, chat template, server flags) are recorded alongside as provenance; `configHash` is computed from the configuration, never read back from these fields.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1 \| 2 \| 3` | Format marker. Version `2` adds the content store; version `3` adds run provenance (`invocationId`, `submitter`, `lines`, `env.hardware`, `cachedFrom`). Readers accept all three and gate reconstruction-dependent features (drilldown, export, store re-scoring) on `2` or higher. |
| `attemptId` | `string` | Unique identity; matches the `.jsonl` filename stem. |
| `startedAt` | `string` | ISO timestamp written when the header is first flushed. |
| `finishedAt` | `string \| null` | ISO timestamp; `null` until the attempt finalizes. |
| `interrupted` | `boolean` | Starts `true`; flipped to `false` only on clean completion. |
| `configId` | `string` | Configuration id from `configs.yaml`. |
| `configHash` | `string` | 12-hex identity of the configuration (see [Hashing](#hashing)). |
| `artifact` | `string` | Model artifact (HF repo / path). |
| `runtime` | `"llamacpp" \| "mlx" \| "omlx"` | Server runtime that produced the results. |
| `quant` | `string?` | Quantization tag (e.g. `Q4_K_M`, `4bit`); absent when the configuration omits it. |
| `temperature` | `number` | Sampling temperature. |
| `systemPrompt` | `string` | System-prompt key from the configuration. |
| `maxTokens` | `number` | Generation cap per item. |
| `topP`, `topK`, `minP`, `presencePenalty`, `presenceContextSize`, `repetitionPenalty`, `repetitionContextSize` | `number?` | Sampler settings as sent; each present iff the configuration set it. |
| `chatTemplateKwargs` | `Record<string, string \| number \| boolean>?` | Chat-template variables as sent. |
| `ctxSize` | `number?` | Context-window override passed to the server. |
| `extraArgs` | `string[]?` | Extra server CLI args as passed (mlx/omlx). |
| `chatTemplate` | `string?` | Vendored template name (`templates/<name>.jinja`) passed to llama-server. |
| `chatTemplateSha` | `string?` | 12-hex SHA-256 prefix of that template file's content at run time; part of `configHash`. |
| `serverFlags` | `string[]?` | The harness's fixed llama-server flags (KV-cache type, reasoning format, `--jinja`); llamacpp only. |
| `challengeId` | `string` | Challenge id. |
| `challengeVersion` | `number` | Challenge version; a different version is a distinct challenge. |
| `challengeHash` | `string` | 12-hex identity of the challenge's resolved items (see [Hashing](#hashing)). |
| `restampedFrom` | `string?` | `attemptId` this attempt was re-stamped from; its embedded `challengeHash` is the identity the model ran against. Absent on attempts as run. |
| `passThreshold` | `number?` | Fraction of items that must score perfect for the attempt to pass. |
| `staleScoreItems` | `string[]?` | `promptName`s of items whose score comes from an earlier scorer because their prompt drifted from the challenge — the attempt's scores come from mixed scorers. Absent when every line's score came from the scorer its `scorerHash` names. |
| `retiredItems` | `string[]?` | `promptName`s of lines whose item has since been removed from this challenge version. The lines stay in the file; the aggregate, report, and audit count only the remaining items. Absent when none. See [Retired items](#retired-items). |
| `invocationId` | `string?` | The run's id: a random UUID shared by every attempt one run wrote. Absent before schemaVersion 3. |
| `submitter` | `string?` | The contributor who produced the attempt, a public handle (default `local`). Absent before schemaVersion 3. |
| `lines` | `{ generated, replayed }?` | Item lines this attempt executed vs copied from the cross-attempt cache (`cachedFrom` set); filled at finalize. Absent before schemaVersion 3. |
| `env` | `RunEnv` | Provenance: `{ platform, runtimeVersion, nodeVersion, benchmarkGitSha, hardware, hardwareId }` (see [Hardware profile](#hardware-profile)). Archives before schemaVersion 3 carry `hostname` instead of `hardware`/`hardwareId`. Recorded for audit; **not** part of any identity hash. |
| `aggregate` | `{ score, passed }` | Zeroed at header-write, filled at finalize. See [Aggregate](#aggregate). |

### ItemResult (lines 2+)

One line per challenge item — the item's execution metrics, the model's output, and its per-item score. Identity hashes are denormalized onto each line so the result stream is directly queryable.

| Field | Type | Description |
|---|---|---|
| `itemId` | `string` | Item identity within the challenge (the inline item's `name`). |
| `promptName` | `string` | The inline item's `name`. |
| `promptHash` | `string` | 12-hex hash of the prompt text (with empty system text); key into the content store's `prompts/`. |
| `itemHash` | `string` | 12-hex hash of `promptHash` + scorer; the per-item cache key. |
| `scorerHash` | `string?` | 12-hex hash of the scorer config; key into the content store's `scorers/`. |
| `parentItemId` | `string?` | For a turn of a multi-turn item, the item's `name` (`itemId` is `name#k`). Absent on single-shot items. |
| `turn` | `number?` | 1-based turn index within `parentItemId`. Absent on single-shot items. |
| `sample` | `number?` | 0-based sample index of a repeated generation of the item. Absent on sample 0, so a single-sample line carries no sample field. |
| `seed` | `number?` | Sampler seed sent with the request (a random 31-bit integer per fresh execution; llama-server, mlx_lm.server, and oMLX all accept `seed`). Absent on lines executed before seeds were sent. |
| `executedAt` | `string` | ISO timestamp at execution start. Orders samples and replays: the most recent wins. |
| `cachedFrom` | `{ attemptId, executedAt }?` | Present iff the line was copied from the cross-attempt cache: the attempt that **executed** it. A replay of a replay keeps the original. Absent on lines this attempt generated and on lines written before schemaVersion 3. |
| `promptTokens` | `number` | Tokens in the prompt. |
| `generationTokens` | `number` | Tokens generated. |
| `promptTps` | `number` | Prompt-eval throughput (tokens/sec). |
| `generationTps` | `number` | Decode throughput (tokens/sec), prefill excluded: llama.cpp's `timings.predicted_per_second`, or on MLX/oMLX the tokens after the first over the time between the first and last streamed content frames (total wall time only when neither is measurable). 0 on error and aborted lines. |
| `peakMemoryGb` | `number` | Peak server RSS in GB; `0` means "unknown" (see [Memory](#memory)). |
| `wallTimeSec` | `number` | End-to-end wall time for the item. |
| `ttftMs` | `number?` | Time to first token: request sent to the first streamed content or reasoning frame, on the harness clock. All runtimes. See [Request timing](#request-timing). |
| `prefillMs` | `number?` | Prefill time. llama.cpp: `timings.prompt_ms`. MLX/oMLX: equal to `ttftMs`. |
| `decodeMs` | `number?` | Decode time. llama.cpp: `timings.predicted_ms`. MLX/oMLX: first to last content or reasoning frame; absent when the stream carried one frame. |
| `timingSource` | `"server" \| "client"`? | Where `prefillMs`/`decodeMs` came from: `server` = llama.cpp's `timings` block, `client` = the harness's frame clock. |
| `prefillTokens` | `number?` | Prompt tokens actually evaluated, cache hits excluded (llama.cpp `timings.prompt_n`). llama.cpp only. |
| `cachedPromptTokens` | `number?` | Prompt tokens served from the KV/prefix cache: llama.cpp `timings.cache_n`, MLX/oMLX `usage.prompt_tokens_details.cached_tokens`. |
| `draftTokens` | `number?` | Speculative decoding: tokens drafted (llama.cpp `timings.draft_n`). Present only when drafting ran. |
| `draftAcceptedTokens` | `number?` | Speculative decoding: drafted tokens accepted (`timings.draft_n_accepted`). |
| `output` | `string` | Cleaned answer the scorer consumes; equals `rawOutput` when no thinking-tag stripping happened. |
| `reasoning` | `string \| null` | Separated chain-of-thought, when the runtime emitted it as a distinct field or it was extracted from inline `<think>` / channel markers. `null` when nothing was stripped. |
| `rawOutput` | `string` | Unmodified API content, always retained for audit. |
| `error` | `string \| null` | `null` on success; a tagged-error string on failure. An item with a non-null `error` scores `0`. |
| `stopReason` | `string \| null`? | Why generation stopped: the server's `finish_reason` (`"stop"`, `"length"`), or `"loop"` when the repetition detector cancelled the stream. |
| `score` | `number` | Per-item score in `[0, 1]`. |
| `failureKind` | `string \| null`? | Why the item fell short of a full pass; `null` when `score` is `1`. One of `wrong`, `no_answer`, `length_cutoff`, `thinking_truncated`, `loop`, `scorer_error`, `execution_error`, `context_exceeded`, `near_miss` — see [SCORING.md § Failure kind](./SCORING.md#failure-kind). Absent on lines not yet (re-)scored by a harness that records it. |
| `scoreDetails` | `string`? | The scorer's human-readable verdict (e.g. `expected 42, got 41`, or the scorer error). Absent when the item was not scored. |
| `nearMiss` | `string`? | The `slip` of the declared near miss that set `score`; present iff `failureKind` is `near_miss`. |
| `breakdown` | `{ passed, failed, errored }`? | Constraint-scorer per-check names; absent for other scorers. |

### Aggregate

The attempt's headline score is **pooled over items**: `score = (items scoring exactly 1) / (total items)`, where retired items are not counted. A resampled item counts once, at the fraction of its samples scoring exactly 1 (see [SCORING.md § Repeated samples](./SCORING.md#repeated-samples)). Partial credit on an item (`0 < score < 1`) does not count toward the passing count. The attempt `passed` when `score >= passThreshold`. An attempt with no items scores `{ score: 0, passed: false }`.

The same definition drives the report: a "pass" anywhere downstream means an item scored exactly `1`.

### Content store

The `content/` directory is content-addressed sidecar storage holding the full text behind each archived hash:

```
content/
  system/<configHash>.txt     the resolved system-prompt text
  prompts/<promptHash>.txt     each item's full prompt text (for turn k > 1, the conversation JSON)
  scorers/<scorerHash>.json    each item's scorer config
```

Blobs are keyed by the identity hashes already carried on the manifest and item lines, so the store deduplicates automatically — two items sharing a prompt share one blob, and identical scorers collapse to one file.

#### Verification

Every read goes through a dataset manifest's pins ([Pinned reads](#pinned-reads)); a blob that passes its pin is then checked against the key it is stored under, by recomputing that key from its bytes:

| Kind | Check |
|---|---|
| `prompts/` | `computePromptHash(bytes, "")` — the 12-hex SHA-256 prefix of `<bytes>\|` — equals `promptHash`. |
| `scorers/` | the 12-hex SHA-256 prefix of the exact stored bytes equals `scorerHash`. This holds for the few blobs carrying a bare `undefined` token (see `src/legacy/parse-scorer-content.ts`): their keys were computed from those same bytes. |
| `system/` | `computeConfigHash(manifest, bytes)` — the manifest's configuration fields plus the blob as system text — equals the manifest's `configHash`. |

One class of system blob cannot be checked: a schemaVersion 2 manifest that records none of `repetitionPenalty`, `repetitionContextSize`, `topP`, `topK`, `minP`, `presencePenalty`, `chatTemplateKwargs`, `chatTemplateSha` was written before manifests recorded those fields, while its `configHash` already includes any the configuration set. Its system blob is read unverified. Every schemaVersion 3 manifest, and every v2 manifest that records any of those fields, records all of them, so its system blob is always checked.

A blob that fails the check fails the read with `BlobDigestMismatch { kind, key, actual }`, where `actual` is the key its bytes hash to. Reconstruction surfaces a mismatch as `NotReconstructible`.

The store is what makes an attempt **self-sufficient**. Given only the `.jsonl` and its referenced blobs, the harness can rebuild the exact system prompt, per-item prompt text, and scorer config that produced the attempt — with no access to the original challenge YAML. That capability powers the drilldown:

- **Drilldown** — the report emits a per-attempt detail file exposing the prompt, output, reasoning, and scorer behind every number.

Reconstruction is all-or-nothing per attempt: a missing blob or an item without a `scorerHash` fails the whole reconstruction with a typed "not reconstructible" result rather than degrading. An archive without a content store is still read and still aggregates into the report — only its reconstruction-dependent features are unavailable, reported as skipped rather than failed.

### Hashing

Five 12-hex hashes (SHA-256 prefixes over canonical, key-sorted JSON) give the format stable identity:

| Hash | Preimage | Meaning |
|---|---|---|
| `configHash` | `artifact \| runtime \| quant \| temperature \| maxTokens \| systemPromptText`, then each of `repetitionPenalty`, `repetitionContextSize`, `topP`, `topK`, `minP`, `presencePenalty`, `presenceContextSize`, `chatTemplateKwargs`, and the chat-template file's content hash (`chatTemplateSha`) only when set | Identity of the configuration — the knobs a user sets. Code version (`env.benchmarkGitSha`), `ctxSize`, `extraArgs`, and `serverFlags` are excluded; the manifest records them as provenance. |
| `promptHash` | `promptText \| ` with empty system text; for turn `k > 1` of a multi-turn item, `promptText` is replaced by the conversation JSON (gold history + the turn's prompt) | The user-side text the model sees; changes when the prompt or any earlier turn's prompt or gold answer changes. The system prompt is part of `configHash`, not `promptHash`. |
| `scorerHash` | the scorer config | Identity of the scorer. Kept **separate** — it is never folded into `itemHash`, `configHash`, `challengeHash`, or `attemptId`. |
| `itemHash` | `promptHash \| scorer` | Per-item identity. A scorer-only edit changes `itemHash` but leaves `promptHash` untouched. |
| `challengeHash` | the ordered list of each item's `promptHash : scorer` | Identity of the whole challenge's resolved items. |

Because `scorerHash` sits outside every other preimage, adding or recomputing it never perturbs `challengeHash` or `configHash` — a property worth asserting whenever hashing-adjacent code changes.

### Retired items

Removing an item from a challenge (see [ERRATA.md](./ERRATA.md)) keeps the challenge's id and version. A legacy line whose item is absent from the same challenge version is **retired**: the line is kept byte-for-byte, its `promptName` is listed in the header's `retiredItems`, and the aggregate is computed over the remaining items. The report's per-attempt record (`item_count`, `passed_items`, token and time sums, failure kinds) and the drilldown detail file skip retired lines; `./bench audit` ignores them.

### Reading

An attempt line with `cachedFrom` is a replay: its values were copied verbatim (original timestamp, token counts, throughput, wall time and request timing) from the attempt that executed it, and `cachedFrom` names that attempt. A replay's machine is the executor's `env.hardwareId`; an attempt without one is attributed to the manifest's `legacy.hardware`. Samples `0..k-1` of an item are consecutive lines, sample 0 first; sample 0 is the single-sample result. An attempt with `interrupted: true` is incomplete: it is counted for cell status and kept out of the rows. The reader keeps only completed attempts (`finishedAt` set, `interrupted: false`), deduplicates by `attemptId` (first wins), and flattens each to a per-attempt record. Rows are selected per configuration × machine ([SCORING.md § Report rows](./SCORING.md#report-rows)); a reconstructible attempt also yields a drilldown detail file.

### Pinned reads

A legacy manifest's `legacy.archives.<basename>.attempts` maps each attempt file to the SHA-256 of its bytes, and `.blobs` maps each content-store blob (`<kind>/<key>.<ext>`, a path under `<archive>/content/`) to the SHA-256 of its bytes. The reader reads an attempt only when it is listed, and a blob only when it is pinned; a missing or differing file fails with `LegacyDigestMismatch`, and an unpinned blob leaves its attempt not reconstructible. The 12-hex content keys of the legacy store are forgeable, and the system blob of a schemaVersion 2 manifest that records no sampler settings cannot be checked against its `configHash`, so the pinned digests are what make legacy reads reproducible. A blob that passes its pin is also checked against its 12-hex key as in [Verification](#verification). The `chains` attempts and `smoke-config` attempts are listed nowhere.

## Implementation pointers

| Concern | File |
|---|---|
| Bundle schema, sealing, verifying reader | `src/store/bundle.ts` |
| Digests | `src/store/digest.ts` |
| Complete-bundle skip index | `src/store/store-index.ts` |
| Score log | `src/store/scores.ts` |
| Weights digest | `src/store/weights.ts` |
| Releases, item-set digest, verify | `src/release/release.ts` |
| Dataset manifests | `src/dataset/manifest.ts` |
| Snapshots, index | `src/report/index.ts` |
| v4 rows | `src/report/v4-rows.ts` |
| Request timing capture (SSE) | `src/llm/chat-completion.ts` |
| Hardware profile | `src/orchestration/hardware.ts`, `src/schema/run-manifest.ts` |
| Legacy manifest + item schema | `src/schema/attempt.ts` |
| Legacy content store, pinned reads | `src/legacy/content-store.ts`, `src/legacy/pinned.ts` |
| Legacy freeze | `src/legacy/freeze.ts` |
| Legacy reconstruction | `src/legacy/reconstruct.ts` |
| Legacy rows (selection) | `src/legacy/rows.ts` |
| Challenge resolution + legacy hashing | `src/config/challenges.ts`, `src/config/hashing.ts` |
