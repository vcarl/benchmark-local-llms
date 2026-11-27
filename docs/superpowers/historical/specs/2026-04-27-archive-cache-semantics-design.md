# Archive, cache, and report semantics — "1 run = 1 score"

## Problem

The benchmark pipeline currently produces a model ranking whose pass-rate denominator is unreliable. The same logical execution attempt can appear multiple times in the webapp dataset, and stale data from prior corpus versions silently mingles with current data.

Three concrete mechanisms drive this:

1. **Cache carry-forward.** `src/orchestration/phases.ts:108-121` writes a copy of the cached `ExecutionResult` into the new archive on every cache hit, so resumed runs leave the same logical attempt scattered across N archive files. After several resumes, a single (model, prompt, temperature) attempt has N copies on disk.
2. **No dedup at report build.** `aggregateAll` (`src/report/aggregate.ts:149-174`) concatenates results across every loaded archive without keying or deduplication. The webapp dataset surfaces every duplicate.
3. **No corpus-currency check.** Results for prompts that have since been edited (different `promptHash`) or removed are still emitted, scored against whatever the manifest happens to embed. The leaderboard reflects an accumulation of past corpus versions, not a coherent current state.

Net effect: pass rates aggregate over a denominator that includes duplicates, ghost cells, and stale versions of edited prompts. The number is not trustworthy.

## Goals

- One score per (model, prompt content, temperature) cell in the report — no duplicates.
- Every score in the report is interpretable against the current prompt corpus (current scorer, current prompt content).
- Operator visibility into what archive data was dropped and why.
- Move per-model temperature from a CLI flag into model configuration so we can capture trainer-recommended sampling behavior.

## Non-goals

- Backward compatibility with on-disk schema versions other than what the loader translates inline. This is a pre-release project; we change schemas freely.
- Archive-on-disk integrity. Disk may hold stale, drifted, or contradictory data. The report build is what produces clean output.
- A general-purpose "hide this model from the leaderboard" feature. If you want to hide archived data, move the archive file to `legacy/`. (Out of scope; revisit if we discover we need it.)
- Untangling the broader cache/session/scoring token model. The current `runId` is conceptually entangled with session state, scoring identity, and cache scoping. Noted for a future cleanup pass.

## Design

### Score uniqueness key

A **cell** is the tuple:

```
(artifact, runtime, quant, promptName, promptHash, temperature)
```

Each cell maps to exactly one score in the report. When multiple `ExecutionResult` records exist for the same cell (across archives, across `--fresh` re-runs, across legacy carry-forward duplicates), the report picks one:

1. **Latest `executedAt` wins.**
2. **Tie-break:** archive file `mtime`, descending. Identical mtime falls back to deterministic path sort order. (Identical `executedAt` only occurs on legacy carry-forward duplicates whose underlying scores are identical, so the choice is observationally equivalent.)

### Run-id semantics (clarification, not change)

`runId` remains a session/resume token, generated as `r-{YYYY-MM-DD}-{6-hex}` and persisted in `{archiveDir}/.run-state.json`. It is **not** part of any score key, **not** an input hash, **not** a leaderboard dimension. It exists to scope the cache during a logical run so resume produces a complete dataset.

This was the existing design; the spec just makes it explicit so the cache/scoring entanglement is documented before we untangle it later.

### Cache hit produces no write

`src/orchestration/phases.ts` is changed so that on cache hit, the run loop:

- Skips re-execution.
- Writes **nothing** to the new archive file.
- Increments `skippedCached` in `RunStats`.
- Optionally logs a hit summary (existing log line preserved).

Concretely, the `appendIfSaving(carried, …)` call on the cache-hit branch is removed. The new archive contains only newly-executed cells.

Consequence: each cell appears at most once across all archives produced by a single logical run (cache prevents within-run duplicates). Cells can still exist in multiple archives across different `runId`s — handled by report-build dedup.

### Temperature is per-model

`ModelConfig` gains a required `temperature: number` field, required only when `active: true`. The `--temperature` / `--temperatures` CLI flag is removed. The orchestration layer reads each model's temperature from its config and produces one cell per `(model × prompt)` rather than `(model × prompt × temperature-list)`.

`RunManifest.temperatures: number[]` becomes `temperature: number`. **No schema-version bump** — we just change the shape. The loader does a one-line translation when reading old-shape data:

```typescript
if (Array.isArray(obj.temperatures)) {
  obj.temperature = obj.temperatures[0];
  delete obj.temperatures;
}
```

This is enough for existing on-disk archives to remain readable. There is no formal "v1 → v2" compat layer; this translation is a pragmatic hack to read the data already on disk and nothing more.

### Report inclusion rule

`bench report` filters at load time and emits records only for cells that meet this rule:

- **Drop** if `result.promptName` is absent from the current corpus (`prompts/` for prompts, `scenarios/` for scenarios). Tagged in the drop-reason summary as `prompt absent`.
- **Drop** if `currentCorpus[result.promptName].promptHash !== result.promptHash`. Tagged as `prompt drifted`.
- **Keep** all other records, regardless of whether the model identity matches anything in `models.yaml`. `models.yaml` is forward-looking — it controls what `bench run` will execute, not what `bench report` will display. Past valid runs of removed models, retuned temperatures, or non-current quant/runtime combinations stay visible in the report as their own cells.

After filtering, group surviving records by cell key and pick the winner per the tie-break rule above. Emit one `WebappRecord` per cell.

### Drop the `scoringMode` flag

`as-run` and `current` modes collapse into a single mode, equivalent to today's `current` plus the new prompt-drift filter. The `scoringMode` field is removed from `aggregate.ts`, `runReport`, and the CLI.

If an operator wants to reproduce a historical report, they check out the matching git commit and run the report against the same archive directory. The current corpus comes from disk; reproducibility is git-based, not flag-based.

### Drop-reason summary

`bench report` prints a summary after the build:

```
Loaded 42 archives, 1,847 results
Dropped: 12 (prompt absent), 89 (prompt drifted)
After dedup: 1,746 cells in current corpus
```

This is non-negotiable for "reliable data" — silent data loss is the worst failure mode. The summary is the operator's audit trail for understanding what happened to a config edit.

### Webapp `PASS_THRESHOLD`

`webapp/src/lib/constants.ts`: `PASS_THRESHOLD` becomes `0.7`. A score of 0.5 is now a fail. No other webapp logic changes; the browser does no dedup and no corpus filtering, those happen at report build.

## Data flow

### Run-time write path

```
models.yaml                           prompts/ + scenarios/
  └─ ModelConfig {                       └─ corpus[name] = { promptHash, ... }
       artifact, runtime,
       quant, temperature }

  ↓ enumerate planned cells

PlannedCell { artifact, promptName, promptHash, temperature }
  one per (model × prompt) — temperature comes from model, not CLI

  ↓ for each cell, cache lookup
  ↓   key = (artifact, runId, promptName, promptHash, temperature)
  ↓
  ├─ HIT  → skip. Write nothing. Increment skippedCached.
  └─ MISS → execute. Write ONE ExecutionResult to the new archive.
```

Invariants enforced at write time:
- A given cell appears at most once per archive file.
- A given cell appears at most once across all archives sharing a `runId`.

### Build path (`bench report`)

```
benchmark-archive/*.jsonl
       │
       ▼
loadAllArchives → [{path, mtime, manifest, results}, ...]
       │
       ▼
for each result, look up currentCorpus[result.promptName]
       │
       ├─ entry absent                            → drop (prompt absent)
       ├─ entry.promptHash !== result.promptHash  → drop (prompt drifted)
       │
       ▼
score(result, currentEntry) → Score { score, details }
       │
       ▼
group by cellKey = (artifact, runtime, quant, promptName, promptHash, temperature)
       │
       ▼
within each group, pick winner:
   1. max executedAt
   2. tie-break: archive mtime, descending
   3. final tie-break: archive path, sorted ascending
       │
       ▼
emit one WebappRecord per cell
       │
       ▼
write data.js → globalThis.__BENCHMARK_DATA = [...]
```

Invariants enforced at build time:
- Every record in `data.js` matches a current-corpus entry exactly (same `promptName` + same `promptHash`).
- No two records share a cell key.
- Each record's score was computed by the current scorer against the current prompt content.

### Webapp browser path

The browser receives an already-deduped, already-current-corpus dataset. It applies user filters, groups by capability tag, and counts records with `score >= 0.7` against records in the group. No dedup, no corpus filtering on the client.

## Components affected

**Schema** (`src/schema/`)
- `ModelConfig`: add `temperature: number` (required when `active: true`).
- `RunManifest`: `temperatures: number[]` → `temperature: number`. Loader translates old shape on read.
- `ExecutionResult.temperature`: unchanged. Already correct.

**CLI** (`src/cli/commands/run.ts`, `run-options.ts`)
- Remove `--temperature` / `--temperatures` flags. Temperature is per-model from config.
- `--fresh` and `--no-save` retain current meaning.

**Run loop** (`src/orchestration/phases.ts`, `run-model.ts`)
- Cache hit path: stop calling `appendIfSaving`. Update logging if needed; keep `tallySkipped` increment.
- Per-model temperature is read from `ModelConfig`, replacing the `temperatures: number[]` axis in cell enumeration.

**Cache** (`src/archive/cache.ts`)
- Cache key unchanged: `(artifact, runId, promptName, promptHash, temperature)`. Still scopes by `runId` for resume semantics.

**Report** (`src/report/`)
- `aggregate.ts`: drop `scoringMode` parameter and the `as-run` branch in `pickEntry`. Always score against the current corpus.
- `aggregate.ts`: add prompt-side current-corpus filter (drop on `prompt absent` / `prompt drifted`) before scoring.
- `aggregate.ts`: add cell-level dedup with the tie-break rule above. Group → pick winner → emit.
- `load-archives.ts`: thread archive `mtime` through to the aggregator (needed for tie-break).
- `index.ts`: emit a drop-reason summary in `ReportSummary` and have the CLI print it.

**Webapp** (`webapp/src/`)
- `lib/constants.ts`: `PASS_THRESHOLD = 0.7`.
- `lib/pipeline.ts`: no semantic change. `tempRange` filter retained for filtering historical variants.

**Migration** (one-off)
- `scripts/inventory.ts` (or similar): walks `benchmark-archive/*.jsonl`, prints per-model summary of recorded temperatures and prompt-drift counts. Operator uses output to populate `temperature:` in `models.yaml`.

## Migration

This is pre-release; the plan is mechanical, not ceremonial.

1. Implement the new schema shape and the loader translation. Existing archives remain readable.
2. Run `scripts/inventory.ts` against `benchmark-archive/`. Emits `model → temperatures used → result counts`.
3. Edit `models.yaml`: add `temperature:` to each `active: true` entry, picking the value that retains the most existing data (or trainer-recommended where you have one).
4. Run `bench report`. Read the drop-reason summary. If a large fraction drops as `prompt drifted`, that's expected for prompts that were edited — re-run those cells with `bench run`.
5. Optionally, `mv` invalidated archives to `benchmark-archive/legacy/` to clean disk. The report ignores anything outside `archiveDir`.

## Testing

Six contract tests anchor the design:

1. **Cell-level dedup.** Two archives, same cell, different `executedAt` → one record with the later score. (`src/report/aggregate.test.ts`)
2. **Tie-break on identical `executedAt`.** Two archives, same cell, identical `executedAt`, different mtime → mtime-descending wins.
3. **Drop on prompt absent.** Result with unknown `promptName` is dropped and reflected in the summary as `prompt absent`.
4. **Drop on prompt drift.** Result with matching `promptName` but mismatched `promptHash` is dropped and reflected as `prompt drifted`.
5. **Past runs survive without `models.yaml` reference.** A result whose `(artifact, runtime, quant, temperature)` matches no current model still appears in the report. Both "model removed" and "model temperature changed" cases.
6. **Cache hit produces no write.** Run-loop test: cache hit → new archive contains the manifest header and zero result lines, `skippedCached` increments correctly.

Schema tests:

7. `ModelConfig.temperature` round-trip. Errors when missing on `active: true`; accepted as missing on `active: false`.
8. Loader translates legacy `temperatures: [0.0]` shape into `temperature: 0.0` on read. One canonical fixture.

Tests to update or delete:

- Drop `scoringMode: as-run` tests in `src/report/aggregate.test.ts`.
- Update fixtures in `src/report/__fixtures__/archive-fixtures.ts` to single-temp manifests.
- Remove `--temperature` flag tests in `src/cli/commands/__tests__/run.test.ts`; add tests asserting temperature comes from model config.
- Update cache fixture shape in `src/archive/__tests__/cache.test.ts`. Cache-key structure is unchanged.
- Bump expected pass-rate values in `webapp/src/lib/pipeline.test.ts` to reflect `score >= 0.7`.

Webapp constant test asserts `PASS_THRESHOLD = 0.7`.

A single fixture set (≈5 small `.jsonl` files plus a `prompts/` and `models.yaml` snapshot) covers tests 1–5.

## Edge cases

- **Empty current corpus** — every result drops as `prompt absent`. Report emits zero records. Webapp renders empty leaderboard.
- **Empty `models.yaml`** — does not filter the report. Past archived results still appear. (Was: would empty the leaderboard. Corrected to keep past data.)
- **`--fresh` re-run produces a different score** — both records survive load, dedup picks the new one (later `executedAt`). Old archive untouched. To revert, operator manually removes the new archive.
- **Prompt edited then reverted** — `promptHash` returns to its original value. Old data with that hash matches current corpus again and reappears.
- **Model removed from `models.yaml`, then added back with same `(artifact, runtime, quant, temperature)`** — past archive data reappears in the report. Identity is the cell tuple, not the YAML row.
- **Same `executedAt` on duplicate cells** — legacy carry-forward duplicates carry identical scores; the tie-break is observationally equivalent regardless of which archive's record wins.

## Invariants

After all rules apply:

1. **One score per cell.** No double-counting in pass-rate ratios.
2. **Every score reflects the current prompt corpus.** Stale prompts and drifted content cannot pollute the leaderboard.
3. **Operator sees what was dropped and why.** Drop-reason summary is the audit trail.
4. **Re-running the report is deterministic** for a fixed archive directory and fixed corpus. Same inputs produce the same `data.js`.
5. **Dedup and corpus filtering happen at the report build, not at run time and not in the browser.** The write path appends; the browser renders.

What is **not** promised:

- Archive disk integrity. Disk may hold stale, drifted, or contradictory data.
- Backward-compatible reads of pre-migration `data.js` files. `data.js` is regenerated on every report build.
- Stable temperature configuration after a `models.yaml` edit. Past data at old temps stays in the report; the model just runs at the new temp going forward.
