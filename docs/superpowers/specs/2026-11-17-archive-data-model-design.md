# Archive data model: executions, scores, datasets, snapshots

> Design record (2026-11-17). Not maintained; current behavior is in [docs/](../../) — see [ARCHIVE-FORMAT.md](../../ARCHIVE-FORMAT.md), [GUARANTEES.md](../../GUARANTEES.md) and [SCORING.md § Report rows](../../SCORING.md#report-rows).

## Problem

One archived item line mixes three things: a fact (what the model said), a judgment (how it was graded), and identity stamps that are rewritten whenever grading changes. Datasets are whatever a directory scan yields: the archive directory at its release, plus a `-next` suffix for the draft. Identity uses 48-bit hash prefixes that nothing re-derives. Every figure on the site is rebuilt from files that `./bench score` rewrites in place. That was workable while one machine produced every byte. It does not survive accepting runs from contributors we don't control: the report would rank edited scores, a submitted blob could stand in for ours, and re-scoring would execute contributor-supplied text on the maintainer's machine.

This spec splits the data into four layers, each either immutable or derived, gives each layer a small fixed vocabulary, and defines the gate a contributor's bundle passes before it can appear on the site. It composes with the release cycle in [2026-11-17-release-cycle-design.md](./2026-11-17-release-cycle-design.md): a frozen release fixes the canonical (public) prompts and scorers, and the ingest gate checks every submission against them.

## The four layers

| Layer | Holds | Written by | Mutability |
|---|---|---|---|
| **1 · Executions** | What a model produced for a prompt: bundles of executions | anyone (our runs, contributors) | immutable, content-addressed |
| **2 · Scores** | Our grade of each execution under each scorer | us only, in the sandbox | derived, append-only |
| **3 · Datasets** | Releases, errata, and the manifests saying which bundles count under which eval version | maintainers, by commit | versioned in git |
| **4 · Snapshots** | What the website loads: one frozen file per dataset × eval version | `./bench report` | never edited, only superseded |

Each layer reads only the layers above it. Layer 1 is the only one that accepts outside input; every fact in it is either checked at the ingest gate, recomputed by layer 2, or carried forward labelled as self-reported.

## Glossary

The canonical vocabulary. Each term has one meaning and belongs to one layer. Code, docs, CLI flags and the webapp use these words and no others for these concepts.

### Executions

| Term | Meaning |
|---|---|
| **Config** | One model build to evaluate: weights artifact, runtime, quant, sampling settings, chat template, system prompt. Identified by its **config digest**. The `configId` slug is a display name, not an identity. |
| **Hardware profile** | The machine a bundle claims to have run on (CPU, cores, memory, GPU), and its `hardwareId`. Self-reported. |
| **Run** | One invocation of `./bench run`. Produces one bundle per config × challenge it executes. Identified by `runId`. |
| **Bundle** | The immutable record of one config executing one challenge's items on one machine in one run: a header plus executions. Identified by its **bundle digest**, the SHA-256 of its bytes. The unit of storage, export, submission and admission. |
| **Execution** | One generation inside a bundle: one item, one sample, the model's output, reasoning, raw output, stop reason, and measurements. Identified by its **execution digest**. |
| **Sample** | The index (0..k-1) of a repeated execution of the same item by the same config. |
| **Measurement** | A number an execution reports about its own cost: wall time, prompt/generation tok/s, peak memory, token counts. Self-reported unless recomputed (token counts) or produced by us. |
| **Contributor** | The public handle a bundle names as its producer. Unauthenticated until the identity scheme lands (open question). |

### Scores

| Term | Meaning |
|---|---|
| **Scorer** | How an item's output is graded (exact/regex/numeric, constraint checks, set/ordered match, `code_exec`, `custom`). Identified by its **scorer digest**. |
| **Sandbox** | The isolated runner every code scorer (`code_exec`, `custom`) executes in: a pinned container image with no network, a read-only root, and CPU, memory, process and time limits. |
| **Score record** | Our grade of one execution under one scorer: score, failure kind, details, near miss, breakdown. Keyed by execution digest × scorer digest. Derived and append-only. |
| **Failure kind** | Why a score fell short of 1 (`wrong`, `no_answer`, `length_cutoff`, …). Part of a score record. |

### Datasets

| Term | Meaning |
|---|---|
| **Item** | One prompt plus its scorer, keyed `challengeId/itemName`. Each turn of a multi-turn item is an item (`name#k`). Carries a **scope** (`core` or `stretch`) and a **family** (cluster for the standard error). |
| **Challenge** | A named suite of items on one topic. Versioned only by the release that contains it. |
| **Release** | A frozen, public item set, named CalVer `YYYY.N`; `0` is the alpha challenge set. Its **release file** lists every item's prompt digest and scorer digest. |
| **Draft** | An unfrozen release: candidate items under development. Its items change freely, without errata, until the release is cut. Datasets over a draft are ranked like any other. |
| **Pre-release** | A synonym of Draft: whichever challenge-set revision is in development (`releases/draft/`). When a draft is released, a new pre-release begins. |
| **Alpha challenge set** | Release `0`: the root `challenges/`, `release-baseline.json`, `errata.yaml` and `benchmark-archive/`, a frozen legacy corpus that predates the release process. |
| **Blob** | A content-addressed file in a release's blob directory, named by the full SHA-256 of its bytes: prompt texts and scorer configs, every version that was ever in effect. |
| **Erratum** | A documented change to items of a frozen release, numbered `<release>.<n>`. Draft items need none. |
| **Eval version** | A release plus its errata 1..n, written `<release>.<n>` (`2027.1.0` before any erratum). Fixes exactly which scorer digest grades each item. |
| **Dataset** | A manifest naming a release, an eval version, and the exact bundle digests that count. Nothing appears on the site unless a dataset lists it. |
| **Ingest** | The gate a bundle passes before a maintainer may list it in a dataset (§ Ingest gate). Produces an **ingest record**. |
| **Replication** | Re-running a sample of a row's items on hardware we control and testing consistency with the row's pass rate. |
| **Legacy archive** | A schemaVersion 1–3 attempt directory, read in place and never written. Its lines are graded by their items' current scorers. |

### Snapshots

| Term | Meaning |
|---|---|
| **Snapshot** | The frozen rows of one dataset at one eval version, as one file named by its digest. |
| **Row** | One config on one hardware profile from one contributor. The unit that is ranked. |
| **Cell** | One row's results for one challenge. |
| **Selection** | The rule picking, per row × item × sample, which execution a cell counts (§ Snapshots). |
| **Pass rate** | Fraction of a row's (or cell's) items whose score is exactly 1, coverage-adjusted over the dataset's challenges. **Partial pass rate**: the same over only the challenges the row ran. |
| **Standard error**, **Tier**, **Efficiency**, **Model key** | Statistics and groupings computed over a snapshot's rows in the webapp, as defined in [SCORING.md](../../SCORING.md). |
| **Detail file** | Per-bundle JSON with prompt, output, reasoning and score record for every execution, fetched by the drilldown. |

"Score" means only the per-execution value in a score record. A row has a pass rate, never a score.

### Renamed and retired terms

| Old term | Now | Why |
|---|---|---|
| attempt, `attemptId`, `att-<cfg>-<chal>-<ms>.jsonl` | **bundle**, bundle digest | The id was predictable and could be shadowed; a digest cannot. "Attempt" remains the on-disk name inside legacy archives only. |
| item line | **execution** | The line no longer carries a score. |
| manifest (line 1 of an attempt) | **bundle header** | "Manifest" means only a dataset manifest. |
| invocation, `invocationId` | **run**, `runId` | "Run" was used for invocation, attempt and pass alike; it means only the invocation. |
| submitter, `BENCH_SUBMITTER` | **contributor**, `BENCH_CONTRIBUTOR` | One word for the person in the ingest gate and on the site. |
| cache replay, `cachedFrom` | retired | A run skips items the store already holds; bundles never copy executions from other bundles. Legacy replays resolve to their original execution on read. |
| content store, `content/{system,prompts,scorers}` | system prompt inline in the bundle header; prompts and scorers as **release blobs** | Submitted prompt and scorer copies are never trusted, so a bundle carries none. |
| restamp, `restampedFrom`, `staleScoreItems`, `retiredItems` | retired | Scores are keyed by execution × scorer; nothing is rewritten to follow a scorer change. |
| `aggregate` on the header | retired | Derived in the snapshot. |
| export bundle, "self-verifying" export | **bundle** (the file is the export); `./bench verify` | An export that verified nothing is replaced by a check that does. |
| baseline, `release-baseline.json` | **release file**, `releases/<release>/release.json` | One word, release, for the frozen set and its file. |
| release `0` as "pre-release" | **alpha challenge set** | "Pre-release" names whichever revision is in development, so it cannot also name release `0`. |
| errata level, `-eN` (`2027.1-e3`) | **eval version** (`2027.1.3`) | Errata are `<release>.<n>` sub-releases; the eval version is the same number. |
| `dataset.version` | `evalVersion` | Names what it is. |
| pass, `passes.yaml` | **dataset**, `datasets/<name>.yaml` | A pass was a dataset defined by config hashes; a manifest lists bundles. "Pass" survives only in "pass rate". |
| `exclude` | retired | An unlisted bundle is in no dataset. |
| pilot, `pilot1`, `challenges-next/`, `benchmark-archive-next/`, `-next` | **draft**, `releases/draft/` | No naming convention decides membership. |
| "main" (default archive directory) | **store**, `store/` | "main" means only the git branch. |
| "main" (fallback dataset for unlisted configs) | retired | See `exclude`. |
| running score | **partial pass rate** | A rate, not a score. |
| `data.js`, `__BENCHMARK_ROWS` | **snapshot index** + snapshots | One file per dataset × eval version, fetched on demand. |
| `configHash`, `promptHash`, `scorerHash`, `hardwareId` (12 hex) | config / prompt / scorer digest, `hardwareId` (64 hex) | "Digest" always means a full SHA-256; there are no prefixes. |
| `itemHash`, `challengeHash`, `challengeVersion` | retired | The release file identifies items and challenges; the score key replaces the cache key. |

## Digests

Every identity is a full SHA-256, written as 64 lowercase hex characters with no algorithm prefix. Tradeoff: no algorithm agility; a change of algorithm is a schemaVersion bump. JSON preimages use `stableStringify` (recursively sorted keys, no undefined values, no whitespace). Every reader re-derives a digest from the bytes it names before using them; a mismatch is a typed failure, never a fallback.

| Digest | Preimage |
|---|---|
| config digest | the header's `config` object |
| bundle digest | the bundle file's bytes |
| execution digest | the execution line's object |
| messages digest | the exact chat messages sent for an execution (system, history, prompt) as JSON |
| prompt digest | the prompt blob's bytes (prompt text, or the conversation JSON for turn k > 1) |
| scorer digest | the scorer blob's bytes: `{ config, rules, runner? }` (below) |
| `hardwareId` | the hardware profile with `os` left out |
| snapshot digest | the snapshot file's bytes |

A scorer blob is the canonical JSON `{ "config": <scorer config>, "rules": <n>, "runner": "<image>@sha256:<digest>" }`. `rules` is the harness-wide scoring-rules version (output cleaning, thinking-truncation handling, failure-kind classification); bumping it is an erratum covering every item. `runner` is present only for code scorers, so a new sandbox image changes exactly the code items' scorer digests and the errata coverage check demands an erratum for them. A `custom` scorer's config carries its script source inline, not a path, so editing the script changes the digest.

## Layer 1: Executions

### Store layout

```
store/
  bundles/<bundleDigest>.jsonl     sealed bundles, never modified
  open/<runId>-<configId>-<challengeId>.jsonl   bundles still being written
  scores/<bundleDigest>.jsonl      score records (layer 2)
  ingest/<bundleDigest>.json       ingest records (layer 3)
```

`store/` is the default `--store` for every command. A bundle's file name is its digest, so two bundles cannot share a name, and storing a bundle that is already present is a byte comparison, never an overwrite.

### Bundle (schemaVersion 4)

Line 1, the header:

```json
{
  "schemaVersion": 4,
  "configId": "qwen3.8-27b-omlx",
  "config": {
    "artifact": "mlx-community/Qwen3.8-27B-4bit",
    "weightsDigest": "9c1e…",
    "runtime": "omlx",
    "quant": "4bit",
    "temperature": 0.6,
    "maxTokens": 8192,
    "sampling": { "topP": 0.95, "topK": 20 },
    "chatTemplateKwargs": { "enable_thinking": true },
    "chatTemplateDigest": null,
    "systemPrompt": "You are a careful assistant…"
  },
  "configDigest": "3ac6…",
  "release": "2027.1",
  "challenge": "math",
  "run": { "id": "5b0e…", "contributor": "vcarl", "startedAt": "…", "finishedAt": "…" },
  "env": {
    "platform": "darwin", "runtimeVersion": "…", "nodeVersion": "…", "harnessGitSha": "…",
    "ctxSize": 32768, "extraArgs": [], "serverFlags": [],
    "hardware": { "cpu": "Apple M5 Max", "cpuCores": 18, "memoryGb": 128, "os": "macOS 27.0" },
    "hardwareId": "e41f…"
  },
  "executions": 40
}
```

Lines 2+, one execution each:

```json
{
  "item": "math/compound_interest",
  "sample": 0,
  "seed": 1938475,
  "messagesDigest": "77ad…",
  "executedAt": "2027-03-14T10:22:31.112Z",
  "output": "…", "reasoning": null, "rawOutput": "…",
  "error": null, "stopReason": "stop",
  "measured": {
    "promptTokens": 212, "generationTokens": 640,
    "promptTps": 812.4, "generationTps": 41.7,
    "peakMemoryGb": 18.2, "wallTimeSec": 16.3
  }
}
```

Decisions:

- **`configId` is a top-level header field outside `config`.** The slug is a display name, so renaming it never changes the config digest; the slug is not identity.
- **The system prompt is inline in the config.** It is part of the config digest's preimage and small; a separate blob only added a lookup that could be swapped.
- **`weightsDigest`** is the SHA-256 of the weights file(s) the server loaded (GGUF file, or the sorted safetensors shards' digests), computed once per artifact and cached by path + size + mtime. It pins the claimed artifact; it does not prove the outputs came from it (that is replication's job). `null` only when the runtime loads from a hub cache the harness cannot locate.
- **Execution-level provenance stays out of the config digest**: `ctxSize`, `extraArgs`, `serverFlags` live in `env`.
- **No score, no failure kind, no aggregate, no identity stamps on executions.** Nothing in a bundle changes when grading changes.
- **No `interrupted` flag.** A bundle being written lives in `store/open/`; a clean finish fills `finishedAt` and `executions`, re-serializes the file canonically (each line `stableStringify` + `\n`), computes the digest and renames it into `bundles/`. An open file is never continued and never read by the report; an interrupted cell is run again whole into a new bundle.
- **No replays; complete runs only.** A bundle is complete when it holds every item of its challenge with the full sample set 0..k-1. `./bench run` skips a whole cell only when the store already holds a complete bundle for it (current config digest, items, samples, prompt); otherwise it runs the whole cell into a new bundle (`--no-skip` forces a run). Nothing is copied or pooled across runs: a cell takes exactly one complete bundle, the most recent by `run.startedAt`, ties to the lower digest; an incomplete bundle never counts, and with none the cell is `not_run`.

### Export and verify

There is no `./bench export`: a sealed bundle file is the export. `./bench verify <bundle…>` runs ingest steps 1–2 (envelope and release pinning) and prints the result; it writes nothing.

## Layer 2: Scores

A **score record**:

```json
{
  "execution": "a91f…",
  "scorer": "d07c…",
  "score": 0,
  "failureKind": "wrong",
  "details": "expected 1628.89, got 1628.9",
  "nearMiss": null,
  "breakdown": null,
  "harnessGitSha": "…",
  "scoredAt": "…"
}
```

- Records live in `store/scores/<bundleDigest>.jsonl`, one file per bundle, appended only. Tradeoff: a per-bundle file keeps locality for the common read (all scores of the bundles in one dataset) at the cost of scanning a file to find one record, which is cheap at bundle size.
- A score is a pure function of (execution, scorer blob): the scorer reads only the execution's fields and the blob. `./bench score` computes the records a dataset's eval version needs and that are missing, and appends them. It never edits a bundle and never rewrites an earlier record.
- Two of our records for the same key that disagree mean a nondeterministic scorer; the snapshot build fails naming the item.
- The score log is a cache of a deterministic computation over layers 1 and 3. Deleting it loses time, not information. It is kept append-only so our own grading history stays auditable.
- Code scorers execute only in the sandbox. The image is pinned by digest and named in the scorer blob, so a figure is reproducible down to the interpreter.
- A contributor's own score records may accompany a bundle at ingest. They are compared with ours and the disagreement count goes into the ingest record; they are never stored in `scores/`.

## Layer 3: Datasets

### Releases

```
releases/<release>/
  release.json     { release, commitment?, committedAt?, items: { "<challenge>/<item>": { prompt, scorer, scope, family } } }
  errata.yaml      the release's errata; each scorer-changing erratum records { item: newScorerDigest }
  challenges/*.yaml
  blobs/<digest>   every prompt and scorer blob the release has ever used
```

- The scorer digest that grades an item at eval version `<release>.<n>` is the one set by the latest erratum ≤ n naming the item, else `release.json`'s. Every such blob stays in `blobs/` forever, so any eval version can be re-scored without git history.
- The errata coverage check (`npm test`) runs per release against its `release.json` and additionally fails when an erratum's recorded scorer digest does not match the resolved item.
- Items are public. `commitment` is a digest over the frozen item set; a released item changes only through a published erratum (release-cycle spec).
- **Draft.** `releases/draft/` has the same layout without `release.json`'s `commitment`. A dataset over the draft is ranked.
- The root `challenges/`, `release-baseline.json` and `errata.yaml` become `releases/0/`. Release 0's item digests stay the legacy 12-hex values (they name legacy executions); its `blobs/` are populated from the legacy content store. Its errata record the 12-hex `scorers` (the `scorerHash` in effect after each erratum, per item). The six intermediate release-0 scorer blobs for errata 0.1–0.3 are reconstructions from the definitions the published `scoresChanged` counts were measured with, not stored bytes.

### Dataset manifests

```yaml
# datasets/2027.1.yaml
name: 2027.1
title: Release 2027.1
release: "2027.1"
evalVersion: "2027.1.2"
bundles:
  - 1b9e…   # qwen3.8-27b-omlx · math
  - 77c0…   # qwen3.8-27b-omlx · logic
```

- A dataset is exactly its listed bundles. No directory scan, config list, exclusion list, suffix convention or fallback decides membership. A smoke config is absent because nobody listed it.
- Every listed bundle must name the manifest's release, and (for a contributed bundle) have an ingest record that passed. `./bench report` fails on either.
- Raising `evalVersion` is a one-line maintainer commit; it is the act that publishes the re-scored snapshot. Earlier eval versions' snapshots stay published.
- `./bench dataset add <name> <bundle…>` appends digests with their comment; listing is otherwise a hand edit reviewed in a PR.

### Ingest gate

`./bench ingest <bundle…> --dataset <name>` runs six steps and writes `store/ingest/<bundleDigest>.json`. It never writes into another bundle; an accepted bundle is copied into `store/bundles/` under its digest.

1. **Envelope.** schemaVersion is 4; header and every execution decode; the file equals its own canonical re-serialization; `executions` matches the line count; no duplicate item × sample; the digest is computed. (The contributor signature over the bundle digest slots in here; scheme is an open question.)
2. **Pin to the release.** The release is frozen (never the draft). The challenge is in it. Every execution's item is in it, and its `messagesDigest` equals the digest we compute from the release's prompt blob, the header's system prompt and the gold history. Any unknown item or mismatch rejects the bundle. Submitted prompt and scorer content is never read; there is none in the format.
3. **Re-score in the sandbox.** Compute our score record for every execution at the dataset's eval version. If the contributor sent their own score records, count disagreements; a nonzero count is recorded, not fatal.
4. **Recompute.** Completeness (items and samples present per challenge); output token counts with the config's tokenizer where the harness has it, recording `measured.generationTokens` as confirmed or disputed.
5. **Replicate.** Seam for replication: the ingest record has a `replication` section filled by `./bench replicate`. Budget and pass/fail policy are open questions.
6. **Admit by listing.** The ingest record says accepted or rejected with reasons. A maintainer adds the digest to the dataset manifest in a commit; only then can a snapshot include it.

Ingest record:

```json
{
  "bundle": "1b9e…", "dataset": "2027.1", "evalVersion": "2027.1.2",
  "checkedAt": "…", "harnessGitSha": "…",
  "envelope": "ok", "release": "ok",
  "scores": { "executions": 40, "contributorDisagreements": 0 },
  "recomputed": { "complete": true, "tokens": { "confirmed": 40, "disputed": 0, "unavailable": 0 } },
  "replication": null,
  "accepted": true, "reasons": []
}
```

## Layer 4: Snapshots

### Rows and selection

- A row is config digest × hardwareId × contributor. Rows from different contributors never merge, even with the same config and claimed hardware. Tradeoff: a contributor who reproduces our setup shows as a separate row rather than adding samples to ours; in exchange, a self-reported hardware profile or `executedAt` can never displace our executions.
- Selection: an execution counts only when its `messagesDigest` equals the digest computed from the release's current prompt blob, the header's system prompt and the gold history; any other is stale. A dataset expresses complete runs: a cell (row × challenge) counts the executions of exactly one complete bundle, one run of the config on the challenge, never items pooled across runs, so a run that failed an item never borrows another run's success. Within a row, per challenge, the cell counts the most recently started bundle holding a current execution of every item of the challenge with the full sample set, a tie going to the lower bundle digest; an incomplete bundle never counts, and with no complete bundle the cell is not run. A challenge not run counts 0 in the denominator (coverage adjustment).
- Each counted execution's score is our score record at the dataset's eval version. A missing record fails the build; `./bench score` must run first.
- Every config version is kept. A row is one config digest, so a configId whose config changed has one row per version; the webapp shows them in the model's group as variant rows whose variant label names what differs (`maxTokens 8192` vs `maxTokens 32768`), ranked like any row. Within one run a configId has one digest.
- A dataset's `ranked` flag decides whether the webapp shows rank numbers and tiers for it.

### Files

```
<report output>/                  `./bench report --output`, default `webapp/public/snapshots`
  index.json                    the only mutable file: one entry per published snapshot
  <snapshotDigest>.json         rows + cells for one dataset at one eval version
  details/<id>.json             detail files, shared across snapshots; id = the row's `sourceAttempts` entry (bundle digest for v4, attemptId for legacy)
```

```json
{
  "schemaVersion": 4,
  "dataset": {
    "label": "2027.1", "title": "Release 2027.1",
    "release": "2027.1", "version": "2027.1.2", "ranked": true, "legacy": false,
    "archiveDir": "store", "challengesDir": "challenges",
    "errata": [ … the errata ≤ evalVersion, public fields only … ]
  },
  "inputs": {
    "manifest": "<sha256 of datasets/2027.1.yaml>",
    "release": "<sha256 of releases/2027.1/release.json>",
    "configs": "<sha256 of configs.yaml>",
    "runners": ["python:3.9-slim@sha256:…"],
    "scoringRules": [2],
    "harnessGitSha": "…",
    "harnessDirty": false
  },
  "releaseFile": { "release": "2027.1", "commitment": "…", "committedAt": "…" },
  "challengeSet": [ … ], "hardware": { … },
  "rows": [ … RowsDataset rows … ]
}
```

- A snapshot contains no build timestamp and serializes with `stableStringify`, so anyone holding the bundles, the release and the harness at `harnessGitSha` rebuilds it byte-for-byte and checks the digest.
- The snapshot JSON nests the dataset fields under `dataset` (`label`, `title`, `release`, `version` = the eval version, `ranked`, `legacy`, …) as the webapp consumes them. The index entry is `{ dataset, title, release, evalVersion, ranked, legacy, digest, rows, challenges, span }`. The webapp loads the index, shows it as the dataset column, and fetches one snapshot when it is selected; the drilldown fetches detail files by id. The snapshot digest is shown beside the dataset so a reader can cite it.
- A snapshot file is never edited. A new eval version, or a manifest change, produces a new snapshot and a new index entry; the previous entry stays in the index. The webapp shows each dataset's current snapshot.

## Legacy archives

The existing archives (schemaVersion 1–3: `benchmark-archive/`, `benchmark-archive-next/`) are read in place and never written. The rule for reusing them is [Provenance before reuse](../../GUARANTEES.md#provenance-before-reuse): a conversion to v4 is allowed only when it proves each execution's provenance, and an execution it cannot prove is rerun instead. Each dataset holds exactly one format. The alpha challenge set is never converted; the draft's archive is converted by `./bench legacy convert` into the v4 draft dataset ([ARCHIVE-FORMAT.md § Converting a legacy dataset](../../ARCHIVE-FORMAT.md#converting-a-legacy-dataset)).

- `./bench legacy freeze` turns the archive into the alpha manifest (`release: "0"`, eval version `0.7`) and the draft archive into `datasets/sources/draft-legacy.yaml`, the source record of the draft's conversion, each with a `legacy` block listing the attempt files by SHA-256 of their bytes: `legacy: { hardware: {id, profile}, archives: { <basename>: { attempts: {file: sha256}, blobs: {"kind/key.ext": sha256} } } }`. `legacy.hardware` pins the machine attributed to attempts without a hardware profile, so a snapshot never depends on the machine that builds it. The first archive is the dataset's own; later ones are reused for the rows (config × machine) the own archive has. Attempts of the harness's `smoke-config` are listed nowhere. The `chains` suite is draft content: the chains attempts in `benchmark-archive/` belong to no challenge of release 0 and are listed nowhere.
- The legacy `blobs` map pins, by full SHA-256, every content-store blob the listed attempts reference. Key checks alone cannot cover the legacy store: a 12-hex key is forgeable, and the system blob of a schemaVersion 2 attempt that recorded no sampler settings cannot be checked against its `configHash` at all (2352 such manifests across the two archives). The freeze-time digests close both gaps.
- The legacy reader lives in `src/legacy/`, behind the same in-memory execution model: an attempt line becomes an execution and a `cachedFrom` replay resolves to its original. Its stored `score`/`failureKind` are kept only when its recorded `scorerHash` is the item's current one; otherwise the line is regraded (below). It checks each attempt file and blob against the manifest's digests before reading it, and tolerates the two known legacy scorer blobs serialized with a literal `undefined`.
- **Legacy lines count by prompt.** An archived line counts for an item when its `promptHash` matches the item's current prompt; only a prompt change leaves a cell `stale_hash`. Counted lines are graded through layer 2, in `<store>/scores/legacy.jsonl`, keyed by the line's **legacy execution digest**: the SHA-256 of `stableStringify({ configHash, challengeId, itemId, promptHash, sample, executedAt, output, reasoning, error, stopReason })`, so every copy of one execution (a replay, a re-stamp) shares it. `./bench score --dataset <legacy name>` appends missing records; a missing one fails `./bench report`. The archives are never written.
- **The draft is the live dataset, in v4.** `datasets/draft.yaml` lists the bundles converted from the draft archive and the bundles of new runs; every execution is graded by its item's full scorer digest at the dataset's eval version (`release.json`'s: scorer config, scoring rules version and sandbox runner). The snapshot records the rules versions in `inputs.scoringRules`; the digests are `release.json`'s, pinned by `inputs.release`.
- **Alpha is closed and archival.** Release 0 is closed at eval version `0.7` (`release.json` records `closed: "0.7"`): no further `0.x` errata and no new legacy bundles. In a closed release a line whose 12-hex `scorerHash` is its item's current one keeps its stored score (Rules 1), and any other is graded by the item's current scorer config. The alpha manifest pins its rows by `rowsDigest`, the SHA-256 of the snapshot's `rows`; a build whose rows differ fails, so no harness change moves an alpha row silently.
- Legacy snapshots carry `legacy: true`.
- There is no legacy writer, `./bench score --corpus`, restamping, cross-attempt cache or `./bench export`; the legacy reader is the only code that knows schemaVersion 1–3.

## Phases

1. **Safety and vocabulary** (done). Code scorers run in the sandbox (`src/scoring/sandbox.ts`, `python:3.9-slim` pinned by digest; it re-scored all 2928 archived `code_exec` lines identically); content-store blobs are verified against their keys on every read. Docs use this glossary. Cheap code renames: pilot → draft, invocation → run in prose. `passes.yaml`, `exclude` and the fallback dataset are deleted: the archive is one dataset, release 0 at eval 0.7, without the harness `smoke-config`; the `chains` suite moves to the draft. Nothing changes on disk.
2. **Executions v4** (done). `src/store/`: bundle schema, open → sealed lifecycle, full digests, `weightsDigest`, the complete-bundle cell skip. `./bench run` writes v4 into `store/`. `./bench verify`. Legacy reader moved to `src/legacy/` and kept working for the current report.
3. **Scores** (done). Scorer blobs `{ config, rules, runner }`, the score log, `./bench score` appending records for a dataset's eval version. The report reads scores from the log for v4 bundles.
4. **Releases and datasets** (done). `releases/<release>/` (absorbs release-cycle phase 2), `releases/0/` and `releases/draft/`, per-release errata coverage with recorded scorer digests, dataset manifests, `./bench legacy freeze`, `./bench dataset add`. `evalVersion()` emits `<release>.0` before any erratum; a uniform three-part number sorts and names snapshot files without a special case. The `-next` detection is deleted.
5. **Snapshots** (done). `snapshots/` with the index, content-addressed snapshot files and per-bundle detail files; the webapp loads the index and fetches on demand. `data.js` is deleted.
6. **Ingest** (not started). `./bench ingest` steps 1–4 and 6 with the ingest record; token recomputation for runtimes whose tokenizer the harness can load. Steps 1 (signature) and 5 (replication) fill their seams when the open questions below are settled.

Phases 2–6 each leave the report producing the same rows for the legacy datasets; the check for each is a snapshot of the current legacy rows diffed before and after.

## Open questions

- **Replication budget.** How many items per submitted row we re-run, how consistency is tested, and whether a row that fails is rejected or shown flagged.
- **Contributor identity and signing.** Whether a GitHub account with an SSH signing key suffices, the signed message (the bundle digest is the natural one), and whether first-time contributors need an approval step.
- **Self-reported measurements.** Whether external efficiency figures are shown with a marker, ranked separately, or excluded until replicated. The format already separates `measured` from everything else and rows already separate contributors.
- **Bundle hosting.** Where published bundles, release blobs and snapshots live (object storage, release assets, a data repository), which also decides how a reader downloads and rebuilds a snapshot.
