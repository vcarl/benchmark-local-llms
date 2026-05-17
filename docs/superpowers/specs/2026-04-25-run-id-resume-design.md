# Transparent run-id with scoped cache and resume

## Problem

`./bench run` produces one `.jsonl` archive per (model × runtime × quant) and uses a content-addressed cross-run cache keyed by `(artifact, promptName, promptHash, temperature)`. `--fresh` short-circuits the cache so every cell re-executes.

Two gaps follow:

1. There is no record tying together the per-model archives produced by a single invocation. After the fact, you cannot tell "which inputs produced which results" beyond inspecting filenames and timestamps.
2. If a `--fresh` run is interrupted, the next invocation has no way to know it is continuing the same logical batch. Cache lookup will happily return results from older archives, so a "fresh re-run" cannot be reliably resumed into a complete dataset.

## Goals

- Tag every result with a stable identifier for the logical run that produced it.
- When an invocation is interrupted, allow the next `./bench run` to resume the same logical run and fill in only what is missing.
- Make the resume behavior **transparent**: the user does not pass flags or memorize ids in the common case. They run `./bench run` until everything is done.
- Preserve the existing self-contained-archive guarantee: archives remain re-scorable on their own.

## Non-goals

- Cross-machine resume. The state file is local to one `--archive-dir`.
- Multi-process / concurrent invocations. Existing concurrency story is unchanged.
- A user-named "experiment" label. The run-id is opaque; if labels are wanted later, that is a separate concern.

## Design

### Run-id semantics

A "run" is one logical batch — the work of a single `./bench run` invocation, which may span multiple invocations if interrupted and resumed. It is identified by a new `runId: string` that is:

- Auto-generated at the start of a fresh run.
- Cached in `{archiveDir}/.run-state.json` so subsequent invocations resume the same id.
- Cleared from the state file when the planned cell matrix is fully populated with valid results tagged with that id.
- Reset by `--fresh` (state file deleted, new id generated).

Cache lookup is **scoped to the active run-id**: only results carrying that id count as cached. Resume therefore produces a complete dataset under one id rather than a mix of results from older archives.

### Schema changes

We'll continue treating this as v1, with no major version bump. This is an early revision before the initial release of the work.

The existing per-archive identifier is renamed `archiveId` (was `runId`). The new field `runId` is added at both the manifest and result layers.

**`RunManifest`:**
- `archiveId: string` — renamed from `runId`. Still matches the `.jsonl` filename stem; per-(model × invocation).
- `runId: string` — **new**. Same value across all archives produced by one invocation, and across resume invocations of the same logical run.

**`ExecutionResult`:**
- `archiveId: string` — renamed from `runId`. Back-reference to the owning archive.
- `runId: string` — **new**. Denormalized from the manifest so the cache scan does not need to re-read the manifest per result line.

**Loader (`src/archive/loader.ts`):** translate on read. Legacy archives synthesize `runId = "legacy-{archiveId}"`. Legacy archives are therefore readable by reports but cannot satisfy a cache lookup for any non-legacy run-id.

`bench report` and `bench score` consume archives through the loader, so once the loader translates on read they need no further changes to operate on a mixed archive directory. The webapp's `data.js` must surface `runId`.

**Writer (`src/archive/writer.ts`):** The trailer rewrite (`finalize-archive.ts`) preserves both `archiveId` and `runId` from the original header.

**Migration (`src/cli/commands/migrate.ts`):** adds a conversion step step. For every line of every archive: rename `runId` → `archiveId`, add `runId: "legacy-{archiveId}"`.

### State file: `{archiveDir}/.run-state.json`

```json
{ "runId": "r-2026-04-25-7f3a9c", "createdAt": "2026-04-25T15:04:32.118Z" }
```

Two fields. The planned-cell set is **not** stored — it is recomputed from current config every invocation, so editing `models.yaml` or `prompts/` between resumes does the right thing automatically.

`createdAt` is a debug/observability aid only; it is not load-bearing.

### Run-id lifecycle in `./bench run`

1. If `--fresh`: delete state file (if present), generate new id, write state.
2. Else if state file exists and is parseable: use cached id (resume path).
3. Else: generate new id, write state.
4. Pass `runId` into `buildRunLoopConfig` so it lands on every manifest header and result line.
5. After all per-model loops finish: completion check (next section).

**Id format:** `r-{YYYY-MM-DD}-{6-char-hex}`. Date prefix for human skimming and chronological sort; 6 hex characters of cryptographic random for uniqueness within the only scope that matters (one archive dir).

**`--no-save`:** the state file is neither read nor written. The run gets an ephemeral run-id that is thrown away when the process exits. Resume is unavailable in `--no-save` mode by definition.

### Cache scoping

`CacheKey` gains a `runId: string` field. `findCachedResult` (`src/archive/cache.ts:50`) adds two filters:

- Fast-filter at the manifest layer: skip whole archives where `manifest.runId !== key.runId`.
- Per-result filter: in addition to the existing match on `(promptName, promptHash, temperature)`, require `r.runId === key.runId`.

`--fresh` retains its current short-circuit (return `Option.none()` immediately). The state-file reset means the new id is empty anyway, but the short-circuit avoids the directory scan.

### Completion detection

Performed in the `run` command handler after `runLoop` returns:

1. Enumerate planned cells from the live config: for each model in the filtered set, every (prompt × temperature) cell and every scenario.
2. Scan the archive dir for results tagged with the active run-id, applying the same validity predicate the cache uses (`error === null`; `output` non-empty for prompts; `terminationReason` non-null for scenarios).
3. If every planned cell has a matching valid result: delete the state file. Log `run {id} complete: {N}/{N} cells`.
4. Otherwise: leave state file in place. Log `run {id} partial: {M}/{N} cells; rerun ./bench run to continue`.

Step 2 reuses the cache scan — same "find a valid result tagged with this run-id" query, applied to the planned matrix.

### Logging

Single stderr line at start, single stderr line at end:

- Start: `run {id}: starting fresh` or `run {id}: resuming ({M} prior results found)`.
- End: completion verdict from §completion-detection.

### Error handling

- Corrupt or unreadable state file: log a warning, treat as if no state existed, generate a new id. Do not fail the run.
- Failure to write state file: log warning, continue. Resume will not be available, but the run itself proceeds.
- Failure to delete state file on completion: log warning. The next invocation will see "resume" with all cells already cached, will be a no-op, and will retry the deletion.

### Files affected

| File | Change |
|---|---|
| `src/schema/run-manifest.ts` | rename `runId` → `archiveId`, add `runId`, bump `schemaVersion` to 2 |
| `src/schema/execution.ts` | rename `runId` → `archiveId`, add `runId` |
| `src/archive/loader.ts` | read translation, synthesize `legacy-{archiveId}` |
| `src/archive/writer.ts` | thread `runId` from config to manifest and results |
| `src/archive/cache.ts` | add `runId` to `CacheKey`; filter at manifest and result layers |
| `src/orchestration/cache.ts` | thread `runId` through `lookupCache` |
| `src/orchestration/run-loop.ts` | carry `runId` from config to per-archive writes |
| `src/orchestration/finalize-archive.ts` | preserve `runId` in trailer rewrite |
| `src/orchestration/phases.ts` | pass `runId` into cache lookup calls |
| `src/state/run-state.ts` (new) | read / write / delete `.run-state.json`; id generation |
| `src/orchestration/completion.ts` (new) | planned-cell enumeration; completeness verdict |
| `src/cli/commands/run.ts` | state lifecycle at start; completion check at end |
| `src/cli/commands/migrate.ts` | archive migration |
| `src/config/build.ts` | accept `runId` in `RunFlags` / `buildRunLoopConfig` |
| `docs/ARCHIVE-FORMAT.md` | document new fields, state file, completion semantics |
| `docs/GUARANTEES.md` | note resume guarantees |
| `.gitignore` | ignore `*/.run-state.json` |

### Testing

- **Schema round-trip.** v1 fixture loads with synthesized `runId: "legacy-..."`. fixture round-trips untouched. Bad version number fails clearly.
- **Cache scoping.** Result tagged run-id A is invisible to a lookup keyed run-id B; visible to A. Manifest fast-filter skips non-matching archives.
- **State file lifecycle.** First invocation creates state; second invocation reads it; completion deletes it; `--fresh` deletes-and-regenerates; corrupt JSON yields a fresh id with a warning.
- **Completion detection.** Planned-cell set is computed correctly under each filter combination (`--model-name`, `--quant`, `--params`, `--scenarios`, `--scenarios-only`, `--temperatures`). Partial and complete verdicts are both exercised.
- **Migration.** `bench migrate` rewrites old fixtures to use new fields with the expected field names and synthetic run-id.
- **End-to-end resume.** Interrupt a run mid-execution; reinvoke; verify only missing cells re-execute and the state file is removed when the second invocation finishes.

## Out of scope (for later if needed)

- A `./bench status` subcommand that prints the cached run-id and partial-progress count without running anything.
- A user-named alias for run-ids (`--label=foo` or similar).
- Garbage-collecting old `legacy-{archiveId}` run-ids after migration.
