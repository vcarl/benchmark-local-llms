# Archive Format

> _Last verified: 2026-04-19 against commit `eae465c`._

## File layout

One `.jsonl` per `(model, runtime, quant)` per `./bench run` invocation, named `{archiveId}.jsonl`, written under `--archive-dir` (default `benchmark-archive/`). Multiple archives produced by the same invocation share a `runId` (the logical-run group id); see [Run state and resume](#run-state-and-resume).

- **Line 1**: `RunManifest` — header, rewritten exactly once at finalize.
- **Lines 2+**: `ExecutionResult` records — append-only.

Interior blank lines are tolerated by the loader; the trailing `\n` on every appended line produces an empty final split entry which is skipped.

## RunManifest

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` (literal) | Hard-coded version tag. Bump requires a migration. |
| `archiveId` | `string` | Per-archive identity; matches the `.jsonl` filename stem. |
| `runId` | `string` | Logical-run group id; same value across every archive produced by one `./bench run` invocation, and across resume invocations of the same run. |
| `startedAt` | `string` | ISO timestamp written when the header is first flushed. |
| `finishedAt` | `string \| null` | ISO timestamp; `null` until the trailer rewrite completes. |
| `interrupted` | `boolean` | Starts `true`; flipped to `false` only on natural completion. |
| `artifact` | `string` | Model artifact identifier (fast-filter key for the cache scan). |
| `model` | `string` | Display model name. |
| `runtime` | `"llamacpp" \| "mlx"` | Server runtime that produced the results. |
| `quant` | `string` | Quantization tag (e.g. `Q4_K_M`). |
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
| `peakMemoryGb` | `number` | Peak RSS of the server during the execution, in GB. |
| `wallTimeSec` | `number` | End-to-end wall time in seconds. |
| `output` | `string` | Raw model output (empty string on failure). |
| `error` | `string \| null` | `null` on success; tagged-error string on failure. |
| `promptHash` | `string` | Hash of the prompt text; scenario rows carry the scenario hash here too. |
| `scenarioHash` | `string \| null` | Non-null for scenario runs. |
| `scenarioName` | `string \| null` | Non-null for scenario runs. |
| `terminationReason` | `"completed" \| "wall_clock" \| "tokens" \| "tool_calls" \| "error" \| null` | Why the session ended; `null` for prompt runs. |
| `toolCallCount` | `number \| null` | Tool calls issued during the session; `null` for prompt runs. |
| `finalPlayerStats` | `Record<string, unknown> \| null` | Opaque game-side snapshot; `null` for prompt runs. |
| `events` | `ReadonlyArray<AgentEvent> \| null` | Normalized game event stream; `null` for prompt runs. |

`error` is the success discriminator: `null` means the row completed end-to-end; any non-null value is a tagged-error string emitted by the orchestrator. Cache validation rejects rows with `error !== null`; prompt rows additionally require non-empty `output`, scenario rows require non-null `terminationReason`.

`terminationReason` applies only to scenario rows and records why the session ended — the scenario's end condition fired (`completed`), a cutoff tripped (`wall_clock` / `tokens` / `tool_calls`), or an unrecoverable failure (`error`). Prompt rows leave it `null`.

`events` is `ReadonlyArray<AgentEvent>` where each `AgentEvent` is `{ event: AgentEventType, tick, ts, data }` — see `src/schema/execution.ts` and the `AgentEventType` literal in `src/schema/enums.ts`.

Ref: `src/schema/execution.ts`.

## Self-contained archives

Each manifest embeds the corpus that was used at execution time:

- Re-scoring an old archive does not require the original `prompts/` corpus to still exist on disk.
- A corpus change (renaming a prompt, editing a constraint) drops affected cells from the report rather than retroactively rescoring historical archives — see `docs/superpowers/specs/2026-04-27-archive-cache-semantics.md` for drop semantics.

See [`GUARANTEES.md`](./GUARANTEES.md) for the full self-contained-archives invariant.

## Run state and resume

`./bench run` persists the active logical-run id in `{archiveDir}/.run-state.json`:

```json
{ "runId": "r-2026-04-25-7f3a9c", "createdAt": "2026-04-25T15:04:32.118Z" }
```

The state file is created on a fresh start, read on subsequent invocations to resume the same logical run, and removed when every planned cell has a valid result tagged with that `runId`. `--fresh` deletes the state file before generating a new id. `--no-save` skips state I/O entirely; the run gets an ephemeral id thrown away on exit.

Cache lookup is scoped to the active `runId` — only results carrying that id satisfy a hit, so resume produces a complete dataset under one id rather than mixing in older archives.

## Re-scoring CLIs

| Command | Behavior |
|---|---|
| `./bench score --archive FILE` | Score one archive against its embedded corpus. |
| `./bench report` | Render report, scoring each archive against the current `prompts/` corpus and dropping cells whose prompt/scenario hash no longer matches. |

## Implementation pointers

| Concern | File |
|---|---|
| Header / append / trailer rewrite | `src/archive/writer.ts` |
| Archive loader (whole-file read) | `src/archive/loader.ts` |
| Cross-run cache scan | `src/archive/cache.ts` |
| Manifest finalize handler | `src/orchestration/finalize-archive.ts` |
