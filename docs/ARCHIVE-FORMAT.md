# Archive Format

> _Last verified: 2026-06-20 against `9a651b2`._

## The unit: one attempt

The harness records work in **attempts**. An attempt is one **configuration** (a model + runtime + quant + sampling settings + system prompt) run against one **challenge** (a named, versioned set of scored items). Every attempt is a single `(configuration × challenge)` pairing, and every attempt is one `.jsonl` file.

This grain is the organizing fact of the whole format. An attempt does not span models, does not span challenges, and does not pool across challenge versions — a challenge edited to a new version is a different challenge as far as the archive is concerned. Reports aggregate many attempts back up into per-configuration and per-model views; the archive itself stays at the attempt level.

## File layout

Each attempt is `<attemptId>.jsonl` under the archive directory (default `benchmark-archive/`), where `attemptId` has the form `att-<configHash>-<challengeHash>-<timestamp>`.

- **Line 1** — the `AttemptManifest` header. Written once when the attempt starts (in an open state), then rewritten exactly once when the attempt finishes.
- **Lines 2+** — one `ItemResult` per challenge item, appended as each item is scored.

Alongside the `.jsonl` files, the archive directory holds a single shared `content/` directory — the **content store** (see [below](#content-store)). Together, an attempt's `.jsonl` plus the blobs it references are everything needed to reconstruct, re-score, or export that attempt without any other input.

Blank lines are tolerated by the reader; the trailing newline on the last record produces an empty final segment that is skipped.

## AttemptManifest (line 1)

The header carries the attempt's full identity and provenance. Configuration and challenge identity are **denormalized** into the header so a single line is self-describing.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1 \| 2` | Format marker. Archives the harness writes carry `2` and include the content store; readers accept either, and gate reconstruction-dependent features (drilldown, export, store re-scoring) on `2`. |
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
| `challengeId` | `string` | Challenge id. |
| `challengeVersion` | `number` | Challenge version; a different version is a distinct challenge. |
| `challengeHash` | `string` | 12-hex identity of the challenge's resolved items (see [Hashing](#hashing)). |
| `passThreshold` | `number?` | Fraction of items that must score perfect for the attempt to pass. |
| `env` | `RunEnv` | Provenance: `{ hostname, platform, runtimeVersion, nodeVersion, benchmarkGitSha }`. Recorded for audit; **not** part of any identity hash. |
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
| `executedAt` | `string` | ISO timestamp at execution start. Cache tie-breaker — most recent wins. |
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
| `score` | `number` | Per-item score in `[0, 1]`. |

## Aggregate

The attempt's headline score is **pooled over items**: `score = (items scoring exactly 1) / (total items)`. Partial credit on an item (`0 < score < 1`) does not count toward the passing count. The attempt `passed` when `score >= passThreshold`. An attempt with no items scores `{ score: 0, passed: false }`.

The same definition drives the report: a "pass" anywhere downstream means an item scored exactly `1`.

## Content store

The `content/` directory is content-addressed sidecar storage holding the full text behind each archived hash:

```
content/
  system/<configHash>.txt     the resolved system-prompt text
  prompts/<promptHash>.txt     each item's full prompt text
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
| `configHash` | `artifact \| runtime \| quant \| temperature \| maxTokens \| systemPromptText` | Identity of the configuration — the knobs a user sets. Code version (`env.benchmarkGitSha`) is deliberately excluded. |
| `promptHash` | `promptText \| resolvedSystemText` | What the model sees; changes when either the prompt or the system prompt changes. |
| `scorerHash` | the scorer config | Identity of the scorer. Kept **separate** — it is never folded into `itemHash`, `configHash`, `challengeHash`, or `attemptId`. |
| `itemHash` | `promptHash \| scorer` | Per-item identity; the cross-attempt cache key. A scorer-only edit changes `itemHash` (so re-scoring applies) but leaves `promptHash` untouched. |
| `challengeHash` | the ordered list of each item's `promptHash : scorer` | Identity of the whole challenge's resolved items. |

Because `scorerHash` sits outside every other preimage, adding or recomputing it never perturbs `challengeHash` or `configHash` — a property worth asserting whenever hashing-adjacent code changes.

## Lifecycle and atomicity

An attempt is written in three phases:

1. **Header** — line 1 is written in the open state (`finishedAt: null`, `interrupted: true`, zeroed aggregate). The system-prompt blob is written to the content store.
2. **Append** — for each challenge item, the prompt and scorer blobs are written to the store, the item is executed or served from cache, and its `ItemResult` is appended as a new line.
3. **Finalize** — line 1 is rewritten with `finishedAt`, `interrupted: false`, and the filled aggregate. The body lines are left byte-for-byte untouched.

Finalize overwrites only the header line; appended `ItemResult` records are never modified once written. An attempt that is interrupted before finalize keeps `interrupted: true` and `finishedAt: null` — and the report ignores it (see [Reporting](#reporting)).

In-place re-scoring (`bench score`) is the one path that rewrites the whole file. It is **atomic**: the new contents are written to a sibling temp file and renamed over the target, so a failed or partial write never corrupts the existing archive.

## Cache and resume

**Cross-attempt cache.** When executing an item, the harness first looks for a completed attempt in the same directory whose header matches `(configHash, challengeId, challengeVersion)` and that contains an item with the same `itemHash`; the most recent `executedAt` wins. A hit is copied **verbatim** — original timestamp, token counts, throughput, and wall time preserved — so efficiency metrics always reflect real measured cost, never a cache artifact. `--no-cache` forces fresh execution of every item.

**Resume.** An interrupted attempt (`interrupted: true`) can be resumed by its `attemptId`. The harness re-resolves the configuration and challenge, validates that their hashes match the partial archive's header (a mismatch fails loudly and leaves the archive untouched), executes only the items not already present, re-aggregates over the union, and finalizes. The partial archive's own `interrupted: true` state keeps it out of the cache scan, so resume reads its existing items explicitly.

## Reporting

The report consumes attempt archives, keeps only **completed** attempts (`finishedAt` set and `interrupted: false`), deduplicates by `attemptId` (first wins), and flattens each to a per-attempt record for the webapp. Incomplete and duplicate attempts are counted and dropped, not failed. Each completed, reconstructible attempt also yields a per-attempt detail file for the drilldown. See [ARCHITECTURE.md](./ARCHITECTURE.md#report-pipeline) for the full pipeline.

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
| Challenge resolution + hashing | `src/config/challenges.ts`, `src/config/hashing.ts` |
