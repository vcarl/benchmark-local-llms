# Archive Format

> _Last verified: 2026-06-20 against `9a651b2`._

## The unit: one attempt

The harness records work in **attempts**. An attempt is one **configuration** (a model + runtime + quant + sampling settings + system prompt) run against one **challenge** (a named, versioned set of scored items). Every attempt is a single `(configuration × challenge)` pairing, and every attempt is one `.jsonl` file.

This grain is the organizing fact of the whole format. An attempt does not span models, does not span challenges, and does not pool across challenge versions — a challenge edited to a new version is a different challenge as far as the archive is concerned. Reports aggregate many attempts back up into per-configuration and per-model views; the archive itself stays at the attempt level.

## File layout

Each attempt is `<attemptId>.jsonl` under the archive directory (default `benchmark-archive/`), where `attemptId` has the form `att-<configHash>-<challengeHash>-<timestamp>`.

- **Line 1** — the `AttemptManifest` header. Written once when the attempt starts (in an open state), then rewritten exactly once when the attempt finishes.
- **Lines 2+** — one `ItemResult` per challenge item and sample, appended as each is scored. An item run once has one line; a resampled item has one line per sample, consecutive, sample 0 first.

Alongside the `.jsonl` files, the archive directory holds a single shared `content/` directory — the **content store** (see [below](#content-store)). Together, an attempt's `.jsonl` plus the blobs it references are everything needed to reconstruct, re-score, or export that attempt without any other input.

Blank lines are tolerated by the reader; the trailing newline on the last record produces an empty final segment that is skipped.

## AttemptManifest (line 1)

The header carries the attempt's full identity and provenance. Configuration and challenge identity are **denormalized** into the header so a single line is self-describing. The generation knobs (sampler settings, chat template, server flags) are recorded alongside as provenance; `configHash` is computed from the configuration, never read back from these fields.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1 \| 2 \| 3` | Format marker. Archives the harness writes carry `3`: the content store (from `2`) plus run provenance (`invocationId`, `submitter`, `lines`, `env.hardware`, `cachedFrom`). Readers accept all three and gate reconstruction-dependent features (drilldown, export, store re-scoring) on `2` or higher. |
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
| `topP`, `topK`, `minP`, `presencePenalty`, `repetitionPenalty`, `repetitionContextSize` | `number?` | Sampler settings as sent; each present iff the configuration set it. |
| `chatTemplateKwargs` | `Record<string, string \| number \| boolean>?` | Chat-template variables as sent. |
| `ctxSize` | `number?` | Context-window override passed to the server. |
| `extraArgs` | `string[]?` | Extra server CLI args as passed (mlx/omlx). |
| `chatTemplate` | `string?` | Vendored template name (`templates/<name>.jinja`) passed to llama-server. |
| `chatTemplateSha` | `string?` | 12-hex SHA-256 prefix of that template file's content at run time; part of `configHash`. |
| `serverFlags` | `string[]?` | The harness's fixed llama-server flags (KV-cache type, reasoning format, `--jinja`); llamacpp only. |
| `challengeId` | `string` | Challenge id. |
| `challengeVersion` | `number` | Challenge version; a different version is a distinct challenge. |
| `challengeHash` | `string` | 12-hex identity of the challenge's resolved items (see [Hashing](#hashing)). |
| `restampedFrom` | `string?` | Original `attemptId` of an attempt `score --corpus` re-stamped onto the current challenge identity after a scorer-only change; its embedded `challengeHash` is the identity the model ran against. Absent when identity is as-run. |
| `passThreshold` | `number?` | Fraction of items that must score perfect for the attempt to pass. |
| `staleScoreItems` | `string[]?` | `promptName`s of items whose score `bench score` kept from an earlier scorer because their prompt drifted from the current challenge — the attempt's scores come from mixed scorers. Absent when every line's score came from the scorer its `scorerHash` names. |
| `retiredItems` | `string[]?` | `promptName`s of lines whose item has since been removed from this challenge version. The lines stay in the file; the aggregate, report, and audit count only the remaining items. Absent when none. See [Retired items](#retired-items). |
| `invocationId` | `string?` | Random UUID shared by every attempt one `./bench run` writes. Absent before schemaVersion 3. |
| `submitter` | `string?` | Who produced the attempt: `BENCH_SUBMITTER`, default `local`. A public handle; a value containing `@` is refused at run start. Absent before schemaVersion 3. |
| `lines` | `{ generated, replayed }?` | Item lines this attempt executed vs copied from the cache (`cachedFrom` set); filled at finalize. Absent before schemaVersion 3. |
| `env` | `RunEnv` | Provenance: `{ platform, runtimeVersion, nodeVersion, benchmarkGitSha, hardware, hardwareId }` (see [Hardware profile](#hardware-profile)). Archives before schemaVersion 3 carry `hostname` instead of `hardware`/`hardwareId`. Recorded for audit; **not** part of any identity hash. |
| `aggregate` | `{ score, passed }` | Zeroed at header-write, filled at finalize. See [Aggregate](#aggregate). |

## ItemResult (lines 2+)

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
| `sample` | `number?` | 0-based sample index of a repeated generation of the item. Absent on sample 0, so a single-run line carries no sample field. |
| `seed` | `number?` | Sampler seed sent with the request (a random 31-bit integer per fresh execution; llama-server, mlx_lm.server, and oMLX all accept `seed`). Absent on lines executed before seeds were sent. |
| `executedAt` | `string` | ISO timestamp at execution start. Cache tie-breaker — most recent wins. |
| `cachedFrom` | `{ attemptId, executedAt }?` | Present iff the line was copied from the cross-attempt cache: the attempt that **executed** it. A replay of a replay keeps the original. Absent on lines this attempt generated and on lines written before schemaVersion 3. |
| `promptTokens` | `number` | Tokens in the prompt. |
| `generationTokens` | `number` | Tokens generated. |
| `promptTps` | `number` | Prompt-eval throughput (tokens/sec). |
| `generationTps` | `number` | Generation throughput (tokens/sec). |
| `peakMemoryGb` | `number` | Peak server RSS in GB; `0` means "unknown" (see [Memory](#memory)). |
| `wallTimeSec` | `number` | End-to-end wall time for the item. |
| `output` | `string` | Cleaned answer the scorer consumes; equals `rawOutput` when no thinking-tag stripping happened. |
| `reasoning` | `string \| null` | Separated chain-of-thought, when the runtime emitted it as a distinct field or it was extracted from inline `<think>` / channel markers. `null` when nothing was stripped. |
| `rawOutput` | `string` | Unmodified API content, always retained for audit. |
| `error` | `string \| null` | `null` on success; a tagged-error string on failure. An item with a non-null `error` scores `0`. |
| `stopReason` | `string \| null`? | Why generation stopped: the server's `finish_reason` (`"stop"`, `"length"`), or `"loop"` when the repetition detector cancelled the stream. |
| `score` | `number` | Per-item score in `[0, 1]`. |
| `failureKind` | `string \| null`? | Why the item fell short of a full pass; `null` when `score` is `1`. One of `wrong`, `no_answer`, `length_cutoff`, `thinking_truncated`, `loop`, `scorer_error`, `execution_error`, `near_miss` — see [SCORING.md § Failure kind](./SCORING.md#failure-kind). Absent on lines not yet (re-)scored by a harness that records it. |
| `scoreDetails` | `string`? | The scorer's human-readable verdict (e.g. `expected 42, got 41`, or the scorer error). Absent when the item was not scored. |
| `nearMiss` | `string`? | The `slip` of the declared near miss that set `score`; present iff `failureKind` is `near_miss`. |
| `breakdown` | `{ passed, failed, errored }`? | Constraint-scorer per-check names; absent for other scorers. |

## Hardware profile

`env.hardware` describes the machine that ran the attempt; `env.hardwareId` is the 12-hex `shortSha256` of its canonical JSON with `os` left out, so an OS update keeps a machine's identity.

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

## Aggregate

The attempt's headline score is **pooled over items**: `score = (items scoring exactly 1) / (total items)`, where retired items are not counted. A resampled item counts once, at the fraction of its samples scoring exactly 1 (see [SCORING.md § Repeated samples](./SCORING.md#repeated-samples)). Partial credit on an item (`0 < score < 1`) does not count toward the passing count. The attempt `passed` when `score >= passThreshold`. An attempt with no items scores `{ score: 0, passed: false }`.

The same definition drives the report: a "pass" anywhere downstream means an item scored exactly `1`.

## Content store

The `content/` directory is content-addressed sidecar storage holding the full text behind each archived hash:

```
content/
  system/<configHash>.txt     the resolved system-prompt text
  prompts/<promptHash>.txt     each item's full prompt text (for turn k > 1, the conversation JSON)
  scorers/<scorerHash>.json    each item's scorer config
```

Blobs are keyed by the identity hashes already carried on the manifest and item lines, so the store deduplicates automatically — two items sharing a prompt share one blob, and identical scorers collapse to one file. Writes are atomic (temp + rename) and idempotent: a blob that already exists is left untouched.

The store is what makes an attempt **self-sufficient**. Given only the `.jsonl` and its referenced blobs, the harness can rebuild the exact system prompt, per-item prompt text, and scorer config that produced the run — with no access to the original challenge YAML. That single capability powers three features:

- **Re-scoring from the store** — apply an edited scorer to the recorded outputs without the challenge YAML on disk.
- **Export** — bundle a `.jsonl` with exactly the blobs it references into a portable, self-verifying archive (`bench export`).
- **Drilldown** — the report emits a per-attempt detail file exposing the prompt, output, reasoning, and scorer behind every number.

Reconstruction is all-or-nothing per attempt: a missing blob or an item without a `scorerHash` fails the whole reconstruction with a typed "not reconstructible" result rather than degrading. An archive without a content store is still read and still aggregates into the report — only its reconstruction-dependent features are unavailable, reported as skipped rather than failed.

## Hashing

Five 12-hex hashes (SHA-256 prefixes over canonical, key-sorted JSON) give the format stable identity:

| Hash | Preimage | Meaning |
|---|---|---|
| `configHash` | `artifact \| runtime \| quant \| temperature \| maxTokens \| systemPromptText`, then each of `repetitionPenalty`, `repetitionContextSize`, `topP`, `topK`, `minP`, `presencePenalty`, `chatTemplateKwargs`, and the chat-template file's content hash (`chatTemplateSha`) only when set | Identity of the configuration — the knobs a user sets. Code version (`env.benchmarkGitSha`), `ctxSize`, `extraArgs`, and `serverFlags` are excluded; the manifest records them as provenance. |
| `promptHash` | `promptText \| resolvedSystemText`; for turn `k > 1` of a multi-turn item, `promptText` is replaced by the conversation JSON (gold history + the turn's prompt) | What the model sees; changes when the prompt, the system prompt, or any earlier turn's prompt or gold answer changes. |
| `scorerHash` | the scorer config | Identity of the scorer. Kept **separate** — it is never folded into `itemHash`, `configHash`, `challengeHash`, or `attemptId`. |
| `itemHash` | `promptHash \| scorer` | Per-item identity; the cross-attempt cache key. A scorer-only edit changes `itemHash` (so re-scoring applies) but leaves `promptHash` untouched. |
| `challengeHash` | the ordered list of each item's `promptHash : scorer` | Identity of the whole challenge's resolved items. |

Because `scorerHash` sits outside every other preimage, adding or recomputing it never perturbs `challengeHash` or `configHash` — a property worth asserting whenever hashing-adjacent code changes.

## Lifecycle and atomicity

An attempt is written in three phases:

1. **Header** — line 1 is written in the open state (`finishedAt: null`, `interrupted: true`, zeroed aggregate). The system-prompt blob is written to the content store.
2. **Append** — for each challenge item, the prompt and scorer blobs are written to the store, the item is executed or served from cache, and its `ItemResult` is appended as a new line.
3. **Finalize** — line 1 is rewritten with `finishedAt`, `interrupted: false`, the filled aggregate, and the `lines` counts. The body lines are left byte-for-byte untouched.

Finalize overwrites only the header line; appended `ItemResult` records are never modified once written. An attempt that is interrupted before finalize keeps `interrupted: true` and `finishedAt: null` — and the report ignores it (see [Reporting](#reporting)).

In-place re-scoring (`bench score`) is the one path that rewrites the whole file. It is **atomic**: the new contents are written to a sibling temp file and renamed over the target, so a failed or partial write never corrupts the existing archive. After a scorer-only challenge edit or an item retirement (same challenge id/version, every current item present in the attempt with unchanged `promptHash`), `score --corpus` re-stamps the attempt onto the current identity: `challengeHash`, each item's `itemHash` and `scorerHash`, and `attemptId` take the current values, `restampedFrom` keeps the original `attemptId`, and the file is written atomically under the new `<attemptId>.jsonl` before the old one is removed. Blobs keyed by `configHash` and `promptHash` are unchanged; the current scorer blobs are written before the archive. Re-stamped items carry the current `itemHash`, so they serve the cross-attempt cache for the current scorer.

Without a re-stamp (`score --corpus` on an attempt with prompt drift), each re-scored item still takes the current `itemHash` and `scorerHash` — every line names the scorer that produced its score — and the current scorer blobs are written first. Drifted items keep their stored score and hashes, and the header's `staleScoreItems` lists them. Every re-scored line also gets a fresh `failureKind` and `scoreDetails`.

## Retired items

Removing an item from a challenge (see [ERRATA.md](./ERRATA.md)) keeps the challenge's id and version, so existing attempts carry forward. `score --corpus` (and `--stale`) treats an archived line whose item is absent from the same challenge version as **retired**: the line is kept byte-for-byte, its `promptName` is listed in the header's `retiredItems`, and the aggregate is computed over the remaining items. The attempt then re-stamps onto the current identity like a scorer-only edit, so every config's results stay comparable at one `challengeHash`. The report's per-attempt record (`item_count`, `passed_items`, token and time sums, failure kinds) and the drilldown detail file skip retired lines; `./bench audit` ignores them. An attempt of a different challenge version is never retired — a line missing from the resolved challenge keeps its stored score and is listed in `staleScoreItems`.

## Cache and resume

**Cross-attempt cache.** When executing an item, the harness first looks for a completed attempt in the same directory whose header matches `(configHash, challengeId, challengeVersion)`, that ran on this machine (same `env.hardwareId`; an attempt without one predates hardware profiles and counts as local), and that contains an item with the same `itemHash` and sample index (`sample`, absent = 0); the most recent `executedAt` wins per sample. A hit is copied **verbatim** — original timestamp, token counts, throughput, and wall time preserved — so efficiency metrics always reflect real measured cost, never a cache artifact. The copy gains `cachedFrom`, naming the executing attempt: the line's own `cachedFrom` if it has one, else the attempt it was found in, preferring among identical lines one whose attempt started before the line executed (the executor, not an earlier replay). `--no-cache` forces fresh execution of every item.

**Repeated samples.** `./bench run --samples k` holds samples `0..k-1` of every item (or, with `--items`, of the matching items; the rest hold sample 0 only). Each sample is served from the cache when present and generated otherwise, so asking for `k = 5` on an item with sample 0 cached generates four. Sample 0 is the single-run result, so existing archives need no re-keying. The new attempt carries every held sample's line, which is what the report and audit aggregate.

**Resume.** An interrupted attempt (`interrupted: true`) can be resumed by its `attemptId`. The harness re-resolves the configuration and challenge, validates that their hashes match the partial archive's header (a mismatch fails loudly and leaves the archive untouched), executes only the items not already present, re-aggregates over the union, and finalizes. The partial archive's own `interrupted: true` state keeps it out of the cache scan, so resume reads its existing items explicitly.

## Reporting

The report consumes attempt archives, keeps only **completed** attempts (`finishedAt` set and `interrupted: false`), deduplicates by `attemptId` (first wins), and flattens each to a per-attempt record for the webapp. Incomplete and duplicate attempts are counted and dropped, not failed. Each completed, reconstructible attempt also yields a per-attempt detail file for the drilldown. From the same attempts it selects one row per configuration × machine against the challenge set ([SCORING.md § Report rows](./SCORING.md#report-rows)). See [ARCHITECTURE.md](./ARCHITECTURE.md#report-pipeline) for the full pipeline.

## Ingesting a contributor's archive

A contributor sets `BENCH_SUBMITTER` to a public handle, runs `./bench run` into a fresh archive directory with the dataset's challenge directory, and bundles each attempt with `./bench export`. The maintainer unpacks the bundles into the dataset's archive directory and re-runs `./bench report`. Each submitted attempt carries its own `hardwareId` and `submitter`, so it forms its own rows and never merges into another machine's; the hardware-scoped cache never replays it into a local run. Submissions are accepted only at schemaVersion 3: an older archive has no hardware profile and the report would attribute it to `--legacy-hardware`.

## Memory

`peakMemoryGb` is best-effort. The supervisor samples the model server's RSS (`ps -o rss=`) once immediately after the health gate (post model-load) and then every 30 s. For an attempt shorter than the poll interval, the recorded value reflects the loaded footprint at health rather than a true sustained peak. `0` legitimately means "unknown" (no sample landed, or `ps` could not be read) — it is not a failure. On Apple Silicon the figure is RSS only and undercounts Metal/MLX wired GPU buffers.

## Implementation pointers

| Concern | File |
|---|---|
| Manifest + item schema | `src/schema/attempt.ts` |
| Header write / append / finalize / atomic rewrite | `src/archive/attempt-writer.ts` |
| Content store (blob read/write, `scorerHash`) | `src/archive/content-store.ts` |
| Reconstruction from `.jsonl` + store | `src/report/reconstruct.ts` |
| Cross-attempt item cache | `src/archive/cache.ts` |
| Hardware profile + `hardwareId` | `src/orchestration/hardware.ts` |
| Report rows (selection) | `src/report/rows.ts` |
| Challenge resolution + hashing | `src/config/challenges.ts`, `src/config/hashing.ts` |
