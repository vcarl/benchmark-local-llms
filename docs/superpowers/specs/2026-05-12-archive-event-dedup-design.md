# Archive event dedup — design

> _Drafted: 2026-05-12. Two-commit migration. Webapp is intentionally allowed to break between this work and a follow-up UI revision._

## Problem

Spacemolt scenario archives capture per-turn `llm_call` events whose `data.context.messages` carries the full request message history (since commit `ef37b89`). Each turn grows that array by ~2 messages (assistant reply + tool result), so turn N stores an O(N²) total of duplicated message bodies across the event stream. Sampling 245 archives showed 434 MB of `context.messages` bytes out of 447 MB total event bytes — ~97% duplication.

The fix dedups these payloads at the archive layer.

## Non-goals

- Reducing event-stream verbosity in any way other than dedup.
- Deduping a `tools` schema. The admiral runner does not log a tools array in any sampled archive — keeping the design narrow to what actually exists in the data.
- Webapp changes — the sidecar contract changes and the UI is allowed to be temporarily broken; a follow-up will revise the UI.
- Schema versioning — `RunManifest.schemaVersion` stays at `1` (project is pre-v1).

## Data model

### `ExecutionResult` additions

One new field (scenario rows only; prompt rows store `null`):

| Field | Type | Description |
|---|---|---|
| `blobPool` | `Record<string, unknown> \| null` | Hash → original message body. Per-scenario-row scope. Null for prompt rows. |

### `turn_end.data.context` shape change

The admiral runner emits `turn_end.data.context` as `{ messageCount, estimatedTokens, systemPromptTokens, messages }`. Only `messages` is volume-heavy; the three scalar fields stay inlined as today.

When a mapped `llm_call` had a `messages` array inside `data.context`:

- `data.context.messages` is removed.
- `data.context.messagesRef: string[]` is added — ordered pool hashes, one per message.

If the `llm_call` had no `messages` field (e.g. a token-counts-only ping), no `messagesRef` key is added. Don't store empty arrays.

All other detail fields (`usage`, `response`, `model`, sampler params, …) stay inlined per turn as today. The `totalTokensIn`/`totalTokensOut` overlay still wins over duplicate keys.

### Hash function

Full SHA-256, lowercase hex (no truncation), computed over canonical JSON of the value (stable key ordering, no whitespace). Scenario-scoped pool, but full hashes eliminate any collision risk.

### Sidecar shape

`src/report/write-events.ts` currently emits `AgentEvent[]`. New shape:

```json
{ "blobPool": { "<hash>": {...}, ... }, "events": [...] }
```

The sidecar carries the same `blobPool` as its source `ExecutionResult` row, plus the same events list. No further transform.

## Commit 1 — migration script + docs

### Script: `scripts/migrate-scenario-events.ts`

- Run via `tsx` (project convention; see other entries under `scripts/`).
- Walks `--archive-dir` (default `benchmark-archive/`); filters to `.jsonl` files whose any non-header line carries `scenarioHash !== null`. Prompt-only archives are skipped entirely.
- For each qualifying archive: parse header + body, run the dedup transform on each scenario row, then rewrite the archive: write to a sibling `*.jsonl.tmp` then atomic rename. Never partial-write the canonical file.
- **Idempotency**: detect already-migrated rows by presence of `blobPool` with at least one entry, OR presence of `messagesRef` keys in any `turn_end.data.context`. Skip such rows. A mixed archive (some rows migrated, some not) gets only the unmigrated rows processed. An empty `blobPool: {}` from a prior wrong-path run does NOT count as migrated — those rows are reprocessed.
- Inlines its own old + new shape type definitions; does NOT import from `src/schema/execution.ts` so commit 2 can change the schema without breaking the (already-deleted) script.
- Reports per-archive: `<path>: N scenario rows, M bytes saved (X.X% reduction)`. Summary at the end. Output to stderr; data only to stdout if `--print-modified-paths` is passed (for piping).
- Tests: `scripts/__tests__/migrate-scenario-events.test.ts`. Fixtures use the real production shape (`data.context.messages`). Assertions: post-migration shape matches expected; running the script twice is a no-op; prompt-only archives are untouched.

### Docs: `docs/ARCHIVE-FORMAT.md`

- Add `blobPool` row to the `ExecutionResult` table.
- Add a "Blob pool" subsection: scope (per-scenario-row), hash function (full SHA-256 hex over canonical JSON), what gets pooled (individual chat messages from `turn_end.data.context.messages`).
- Add a note that `turn_end.data.context` may carry `messagesRef: string[]` replacing `messages`.
- Update the `_Last verified_` date.
- No `schemaVersion` change.

## Commit 2 — production swap, script removed

### `src/schema/execution.ts`

Add `blobPool: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown }))` to `ExecutionResult`. `AgentEvent.data` is already `Record<string, unknown>`, so `messagesRef` inside `data.context` needs no schema-level changes.

### `src/game/admiral/events.ts` — mapper

- Extend `MapperState` with `blobPool: Map<string, unknown>` (Map for ordered iteration in tests; converted to Record on emit).
- Add helper `internBlob(state, value): { hash, state }` — canonical-JSON → SHA-256 hex; returns existing hash on cache hit, else extends the map.
- `llm_call` branch:
  1. Pull `detail.context` out of the detail body.
  2. If it has a `messages` array: intern each entry → `messagesRef: string[]` placed inside a rewritten context object that drops `messages`. Keep the scalar context fields (`messageCount`, `estimatedTokens`, `systemPromptTokens`) intact.
  3. If `context` is absent or has no `messages`, no rewriting — pass through.
  4. Build `data` from `detailWithRewrittenContext` + `totalTokensIn` + `totalTokensOut`.
- Extend `EntryMapper` with `pool: Effect.Effect<ReadonlyMap<string, unknown>>` so callers can pull the finalized pool when the stream completes.

### `src/archive/writer.ts`

Minor: serialize the new `blobPool` field on each `ExecutionResult` row. The writer already round-trips arbitrary record shape; no special handling needed beyond making sure the field is in the encoded output.

### `src/report/write-events.ts`

Change emission from `AgentEvent[]` to `{ blobPool, events }`. The webapp sidecar consumer is now broken until follow-up UI work — that's accepted per scope.

### Scoring / report read paths

Spot-check `src/scoring/*` and `src/report/*` for any code that reads `event.data.context.messages`. Current scorer reads `events`, `finalPlayerStats`, `terminationReason` — no message access — so should be a no-op grep. If anything turns up, refactor it to resolve the ref through `blobPool`.

### Cleanup

Delete `scripts/migrate-scenario-events.ts` and `scripts/__tests__/migrate-scenario-events.test.ts` in the same commit.

## Testing

### Commit 1
- Migration round-trip: real-shape fixture (`data.context.messages`) → script → expected new-shape output.
- Idempotency: run script twice, second pass is a no-op (byte-identical output).
- Prompt-only archive: untouched.
- Mixed archive (one migrated row, one not): only the unmigrated row gets touched.

### Commit 2
- `src/game/admiral/events.test.ts`: cases proving messages are deduped across turns (same content → same hash, pool size grows only when content changes), and that `messagesRef` lives inside `data.context`.
- `src/schema/execution.test.ts`: `blobPool` round-trips through `roundTrip(ExecutionResult, v)`.
- Existing tests stay green.

## Intermediate-state caveat

Between commits, production code still writes the old shape but the user has run the script. If a new `./bench run` happens in that window, it produces an old-shape archive that the user must re-run the script against (or pull commit 2 immediately and re-run from scratch). This is acceptable for a single-developer local project but worth flagging.
