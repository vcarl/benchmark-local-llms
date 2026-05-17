# Archive Format

> _Last verified: 2026-05-12 against the migration commit on `main`._

## File layout

One `.jsonl` per `(model, runtime, quant)` per `./bench run` invocation, named `{archiveId}.jsonl`, written under `--archive-dir` (default `benchmark-archive/`). Multiple archives produced by the same invocation share a `runId` (the logical-run group id); see [Run state and resume](#run-state-and-resume).

- **Line 1**: `RunManifest` — header, rewritten exactly once at finalize.
- **Lines 2+**: `ExecutionResult` records — append-only.

Interior blank lines are tolerated by the loader; the trailing `\n` on every appended line produces an empty final split entry which is skipped.

## RunManifest

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` (literal) | Always `1`. The loader does not branch on this field — it's a label, not a versioning lever. Required-field additions to `ExecutionResult` invalidate older archives in-place; there is no in-tree migration path (the migrate tool was removed in `9f2aae7`). |
| `archiveId` | `string` | Per-archive identity; matches the `.jsonl` filename stem. |
| `runId` | `string` | Logical-run group id; same value across every archive produced by one `./bench run` invocation, and across resume invocations of the same run. |
| `startedAt` | `string` | ISO timestamp written when the header is first flushed. |
| `finishedAt` | `string \| null` | ISO timestamp; `null` until the trailer rewrite completes. |
| `interrupted` | `boolean` | Starts `true`; flipped to `false` only on natural completion. |
| `artifact` | `string` | Model artifact identifier (fast-filter key for the cache scan). |
| `model` | `string` | Display model name. |
| `runtime` | `"llamacpp" \| "mlx"` | Server runtime that produced the results. |
| `quant` | `string` | Quantization tag, lowercase-hyphenated for llama.cpp (e.g. `q4-k-m`, `q6-k`, `q8-0`) or `Nbit` for MLX (e.g. `4bit`, `8bit`). |
| `env` | `RunEnv` | `{ hostname, platform, runtimeVersion, nodeVersion, benchmarkGitSha }`. |
| `temperature` | `number` | Sampling temperature executed in this run. |
| `promptCorpus` | `Record<string, PromptCorpusEntry>` | Embedded prompt corpus keyed by prompt `name`. |
| `scenarioCorpus` | `Record<string, ScenarioCorpusEntry>` | Embedded scenario corpus keyed by scenario `name`. |
| `stats` | `RunStats` | `{ totalPrompts, totalExecutions, completed, skippedCached, errors, totalWallTimeSec }`; zeroed in the header, filled at finalize. |

The trailer rewrite in `src/orchestration/finalize-archive.ts` re-encodes the whole header from a finalized `RunManifest` and appends the preserved body byte-for-byte. In practice the only fields that change between header and trailer are `finishedAt`, `interrupted`, and `stats`. Everything else — `startedAt`, `env`, `temperature`, the embedded corpora, identity fields — is set once at header-write time and is not touched again. The body (lines 2+) is never round-tripped through the decoder during finalize.

Ref: `src/schema/run-manifest.ts`.

## ExecutionResult

One line per `(prompt, temperature)` pair for prompt runs; one line per scenario for scenario runs. Model identity is denormalized from the manifest so the flat result stream is directly queryable.

| Field | Type | Description |
|---|---|---|
| `archiveId` | `string` | Back-reference to the owning archive (matches the manifest's `archiveId`). |
| `runId` | `string` | Logical-run group id; denormalized from the manifest. Cache scoping key. |
| `executedAt` | `string` | ISO timestamp at execution start. Tie-breaker for cache dedup (most recent wins). |
| `promptName` | `string` | Prompt or scenario name. |
| `temperature` | `number` | Sampling temperature used. |
| `model` | `string` | Denormalized from the manifest. |
| `runtime` | `"llamacpp" \| "mlx"` | Denormalized from the manifest. |
| `quant` | `string` | Denormalized from the manifest. |
| `promptTokens` | `number` | Tokens in the prompt. |
| `generationTokens` | `number` | Tokens generated. |
| `promptTps` | `number` | Prompt-eval throughput (tokens/sec). |
| `generationTps` | `number` | Generation throughput (tokens/sec). |
| `peakMemoryGb` | `number` | Peak RSS of the supervised LLM server, in GB. See note below — `0` is the "unknown" sentinel. |
| `wallTimeSec` | `number` | End-to-end wall time in seconds. |
| `output` | `string` | Cleaned final answer the scorers consume; equals `rawOutput` when no thinking-tag stripping happened. Empty string on failure and for scenario rows. |
| `reasoning` | `string \| null` | Separated thinking, populated either from the runtime's structured reasoning field (`reasoning_content` / `reasoning` in the OpenAI shape) or extracted from inlined `<think>…</think>` / Harmony channel markers. `null` when nothing was stripped and on scenario rows. |
| `rawOutput` | `string` | Unmodified `content` from the API response, always populated for audit. Equals `output` when no stripping happened. Empty string on scenario rows. |
| `error` | `string \| null` | `null` on success; tagged-error string on failure. |
| `promptHash` | `string` | Hash of the prompt text; scenario rows carry the scenario hash here too. |
| `scenarioHash` | `string \| null` | Non-null for scenario runs. |
| `scenarioName` | `string \| null` | Non-null for scenario runs. |
| `terminationReason` | `"completed" \| "wall_clock" \| "tokens" \| "tool_calls" \| "error" \| null` | Why the session ended; `null` for prompt runs. |
| `toolCallCount` | `number \| null` | Tool calls issued during the session; `null` for prompt runs. |
| `finalPlayerStats` | `Record<string, unknown> \| null` | Opaque game-side snapshot; `null` for prompt runs. |
| `events` | `ReadonlyArray<AgentEvent> \| null` | Normalized game event stream; `null` for prompt runs. |
| `blobPool` | `Record<string, unknown> \| null` | Per-row intern table for deduped chat-message bodies referenced from `turn_end.data.context.messagesRef`. Keyed by full SHA-256 hex of canonical JSON. `null` for prompt rows; populated only on scenario rows whose `events` carry refs. Absent in pre-migration archives; defaults to `null` on read. See [Blob pool](#blob-pool). |

`error` is the success discriminator: `null` means the row completed end-to-end; any non-null value is a tagged-error string emitted by the orchestrator. Cache validation rejects rows with `error !== null`; prompt rows additionally require non-empty `output`, scenario rows require non-null `terminationReason`.

`terminationReason` applies only to scenario rows and records why the session ended — the scenario's end condition fired (`completed`), a cutoff tripped (`wall_clock` / `tokens` / `tool_calls`), or an unrecoverable failure (`error`). Prompt rows leave it `null`.

`events` is `ReadonlyArray<AgentEvent>` where each `AgentEvent` is `{ event: AgentEventType, tick, ts, data }` — see `src/schema/execution.ts` and the `AgentEventType` literal in `src/schema/enums.ts`.

`peakMemoryGb` is sampled by the supervisor every 30s via `ps -o rss=` against the LLM server's pid, not measured per-execution. Three caveats follow from that:

- It's a **server-lifetime running peak**, so every result against the same supervised server stamps the same value (rising monotonically as the run progresses), not a per-prompt high-water mark.
- `0` is the **"unknown" sentinel** — emitted when no sample has landed yet (short runs that finish before the first 30s tick) or when the poller couldn't read `ps`. The webapp renders `0` as `—`.
- It's **`ps` RSS only**: on Apple Silicon this excludes Metal/MLX wired GPU buffers, so it under-counts MLX peak vs. the Python prototype's `mlx.core.metal.get_peak_memory`.

Ref: `src/schema/execution.ts`, `src/llm/servers/peak-rss.ts`.

## Blob pool

The mapped `llm_call → turn_end` event carries the admiral `detail` body verbatim, including a `context` object of shape `{ messageCount, estimatedTokens, systemPromptTokens, messages }`. The `messages` array grows by ~two entries per turn (assistant reply + tool result) and dominates archive size — sampling 245 archives showed ~97% of event bytes were duplicated chat history. Each message is interned into a per-row `blobPool` to remove the quadratic duplication.

- **Scope**: per-`ExecutionResult` row. Pool entries do not cross row boundaries. Prompt rows store `blobPool: null`.
- **Hash**: full SHA-256 hex (64 lowercase chars, no truncation), computed over canonical JSON of the value (object keys sorted ascending, no whitespace). Full hashes eliminate collision risk at row scope.
- **What gets pooled**: each entry of `turn_end.data.context.messages` is hashed individually and interned. Inside the rewritten event, `context.messages` is replaced by `context.messagesRef: string[]` — ordered pool hashes, one per message. The scalar context fields (`messageCount`, `estimatedTokens`, `systemPromptTokens`) stay inlined.
- **Absent context / messages**: if the source `llm_call` carried no `context` object, or its `context.messages` was missing or not an array, the detail is passed through unchanged. Absent fields are never encoded as empty arrays.
- **Other detail fields** (`usage`, `response`, `model`, sampler params, …) stay inlined per turn. The `totalTokensIn` / `totalTokensOut` overlay still wins over duplicate keys.

Existing archives written before the migration carry inline `messages` inside `turn_end.data.context` and have no `blobPool` field on the row. The one-shot rewriter at `scripts/migrate-scenario-events.ts` migrates them in place; the script is idempotent (re-running it on a migrated file is a byte-identical no-op).

## Self-contained archives

Each manifest embeds the corpus that was used at execution time:

- Re-scoring an old archive does not require the original `prompts/` corpus to still exist on disk.
- A corpus change (renaming a prompt, editing a constraint) drops affected cells from the report rather than retroactively rescoring historical archives — see [`docs/superpowers/specs/2026-04-27-archive-cache-semantics-design.md`](./superpowers/specs/2026-04-27-archive-cache-semantics-design.md) for drop semantics.

See [`GUARANTEES.md`](./GUARANTEES.md) for the full self-contained-archives invariant.

## Run state and resume

`./bench run` persists the active logical-run id in `{archiveDir}/.run-state.json`:

```json
{ "runId": "r-2026-04-25-7f3a9c", "createdAt": "2026-04-25T15:04:32.118Z" }
```

The state file is created on a fresh start, read on subsequent invocations to resume the same logical run, and removed when every planned cell has a valid result tagged with that `runId`. `--fresh` deletes the state file before generating a new id. `--no-save` skips state I/O entirely; the run gets an ephemeral id thrown away on exit.

Cache lookup is scoped to the active `runId` — only results carrying that id satisfy a hit, so resume produces a complete dataset under one id rather than mixing in older archives.

## Failure-mode artifacts

The writer's lifecycle is `writeManifestHeader` → N × `appendResult` → `finalizeArchive`. An interruption between any two of those steps leaves an artifact on disk.

- **Header-only stubs** — process killed before the first `appendResult` completes. The file is one line: the manifest with `interrupted: true`, `finishedAt: null`, and `stats` zeroed. The loader reads it as a successful load with `results: []`. The report's audit block currently counts these in `loaded N archives` but they contribute zero cells, so a directory full of stubs reports as a healthy load with zero output. Cleanup is manual: identify by `data.results.length === 0` after loading, then delete by exact path.
- **Header + partial body** — interrupted mid-run after some results were appended. The manifest stays in its initial `interrupted: true` state because `finalizeArchive` never ran. The body lines are valid; the loader returns them and the report uses them. The only signal that the run didn't finish is the `interrupted` flag on the header, which the report does not currently surface.
- **Stale-schema archives** — written under a previous schema and rendered unreadable by a later required-field addition to `ExecutionResult`. The loader reports each as one corrupt-line load issue (it short-circuits at the first decode failure). Recovery is in-place rewrite to add the missing fields; there is no in-tree migration tool.

## Duplicate-archive rejection

`archiveId` is the per-(model × invocation) identity that matches the filename stem; it must be unique across the loaded set. When the report finds two archives sharing one `manifest.archiveId` — almost always a `cp` / restore / migration mistake — both copies are rejected wholesale (none of their results contribute to the report) and the collision is logged at error level:

```
report: archive schema violation — duplicate archiveId <id> in N archives, all rejected: <path>, <path>, ...
```

Note that `runId` is **not** the uniqueness key: by design every per-model archive produced by one `./bench run` invocation shares a runId. A multi-model run legitimately has many archives sharing one runId with distinct `archiveId`s, and that's a healthy load. Cleanup is manual: keep the canonical copy, delete the rest by exact path, re-run `./bench report`.

Ref: `src/report/aggregate.ts` (`partitionByArchiveId`), `src/cli/commands/report.ts` (`logAuditBlock`).

## Re-scoring CLIs

| Command | Behavior |
|---|---|
| `./bench score --archive FILE` | Score one archive against its embedded corpus. |
| `./bench report` | Render report, scoring each archive against the current `prompts/` corpus and dropping cells whose prompt/scenario hash no longer matches. |

## Implementation pointers

| Concern | File |
|---|---|
| Header write / result append | `src/archive/writer.ts` |
| Trailer rewrite (the production path; sets `interrupted`, `finishedAt`, `stats`) | `src/orchestration/finalize-archive.ts` |
| Archive loader (whole-file read) | `src/archive/loader.ts` |
| Cross-run cache scan | `src/archive/cache.ts` |
