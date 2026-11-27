# Archival Reconstruction via Content-Addressed Sidecar — Design

> **Goal:** make an attempt archive a complete, self-sufficient record. You must be able to
> reconstruct an attempt *entirely* from its produced archive — what was asked, what the model
> produced, how it was scored, under what configuration — even if `prompts/`, `configs.yaml`,
> `system-prompts.yaml`, `challenges/`, and `models.yaml` have all changed or vanished since.

Branch `challenge-config-reframe`, base `4c44ca6`. Supersedes the brainstorm in
`docs/superpowers/plans/2026-06-19-archival-reconstruction-kickoff.md` (which laid out the gaps and
the A/B/C design space). This spec records the decisions and the implementation contract.

## 1. The three reconstruction gaps

Everything needed to reconstruct an attempt is already **resolved at runtime** but not persisted:

| To reconstruct… | Resolved at runtime in… | Persisted today? |
| --- | --- | --- |
| The exact **user prompt sent** | `ResolvedItem.prompt.promptText` | ❌ only `promptHash` |
| The **system prompt actually sent** | `ResolvedConfiguration.systemPromptText` (run-challenge.ts:139) | ❌ only the key (`systemPrompt: "default"`) |
| The per-item **scorer** applied | `ResolvedItem.scorer` (`ScorerConfig`) | ❌ not stored at all |

Everything else (output / rawOutput / reasoning / error / score, tokens / tps / peak memory / wall
time, config + challenge identity, `env` provenance) is already in the archive or trivially derivable.

**Fourth gap — `passThreshold` (re-scoring only):** the challenge `passThreshold` is not in the
manifest (it lives in the challenge YAML). For pure *display* reconstruction it isn't needed —
`aggregate.passed` is already stored. But store-primary `score` (§4.4) *recomputes* `aggregate`, so it
needs the threshold to recompute `passed` without the corpus. We therefore persist it (§3).

**Subtlety (load-bearing):** the system prompt *actually sent* is the **configuration's**
`systemPromptText`, **not** the prompt corpus entry's `system.text` — even though `promptHash` is
computed over `promptText + prompt.system.text`. Phase 2 made prompts self-contained, so most
corpus-entry `system` fields are now empty; the config's system prompt is the real one. So the value
we persist for "resolved system-prompt text" is `config.systemPromptText`.

## 2. Chosen approach: content-addressed sidecar (shared store + `export`)

A companion **content store** holds the prompt/scorer/system text as content-addressed blobs; the
attempt `.jsonl` carries hash references that resolve into the store.

- **One shared store** at the archive root (`<archiveDir>/content/`), shared across all attempts for
  dedup. "The archive" as a self-sufficient unit is therefore the **directory** (`*.jsonl` + `content/`).
- **`bench export <attempt>`** recovers single-attempt portability on demand: it bundles one jsonl
  plus exactly its referenced blobs into a portable artifact.

Rejected alternatives (recorded for posterity): per-item denormalization (A) and embedded snapshot
(B) — both make a single file self-sufficient but duplicate blob content across the 80 items of an
attempt and across attempts; the sidecar dedups. Per-attempt content dirs were rejected because they
forfeit cross-attempt dedup (the whole point of the sidecar).

### 2.1 Store layout and addressing — **reuse identity hashes**

Blobs are keyed by **existing identity hashes** wherever one exists, to minimize new schema fields.
Layout under `<archiveDir>/content/`:

```
content/
  prompts/<promptHash>.txt     # user prompt text  = ResolvedItem.prompt.promptText
  scorers/<scorerHash>.json    # scorer config     = the item's ScorerConfig
  system/<configHash>.txt      # system prompt text = config.systemPromptText
```

| Blob | Key | Source of key | New jsonl field? |
| --- | --- | --- | --- |
| prompt text | `promptHash` | already on `ItemResult` | no |
| scorer config | `scorerHash` = `shortSha256(stableStringify(scorer))` | new | **yes** — `ItemResult.scorerHash` |
| system prompt | `configHash` | already on `AttemptManifest` | no |

Subdirs namespace the three hash domains so a `promptHash` and a `configHash` of equal length never
collide as filenames, and the store stays human-browsable.

**Accepted dedup imperfections** (the cost of reusing identity hashes instead of pure content hashes):
- `promptHash` folds in `prompt.system.text`, so two prompts with identical `promptText` but
  different corpus `system` would store the same text under two keys. Rare; negligible.
- `system/<configHash>.txt`: two configs differing only in (e.g.) temperature have different
  `configHash` but identical `systemPromptText` → the system text is stored once per config. Minor.
- Scorer blobs ARE purely content-addressed (`scorerHash` is a hash of the scorer bytes) → true dedup.

Blob keys are **not self-verifying** under this scheme (the key is an identity hash, not a hash of the
blob's own bytes) — re-hashing a blob to detect corruption is not part of this design. Accepted.

## 3. Schema: v2, additive, coexistence

Existing v1 archives stay v1 and remain readable; new runs write v2. **No migration command** — the
6 existing finalized Qwen archives remain corpus-dependent (status quo for them). Readers accept both.

Changes in `src/schema/attempt.ts` (additive only — golden-hash-safe, see §6):

```ts
// AttemptManifest
schemaVersion: Schema.Literal(1, 2),     // widened from Literal(1)
passThreshold: Schema.optional(Schema.Number),   // present iff schemaVersion === 2

// ItemResult — present iff schemaVersion === 2
scorerHash: Schema.optional(Schema.String),
```

The system prompt text reuses the existing `configHash` (no new ref field). The structural deltas are
the manifest's `passThreshold`, `ItemResult.scorerHash`, and the on-disk `content/` store. Both new
manifest/item fields are `optional` purely to admit v1 archives on read; the v2 writer never omits
them.

**Writer invariant:** new attempts always write `schemaVersion: 2`, `passThreshold` on the manifest, a
`scorerHash` on every item, and a complete content store (every referenced blob present).

**Reader rule:** store-dependent operations (store-primary `score`, `export`, reconstruction) branch
on `schemaVersion === 2`. v1 archives have no store and fall back to corpus-based behavior.

## 4. Components

### 4.1 `src/archive/content-store.ts` (new)

Self-contained store I/O. Depends only on `FileSystem` + `config/hashing.ts`.

- `contentDir(archiveDir): string` → `join(archiveDir, "content")`.
- `scorerHash(scorer: ScorerConfig): string` → `shortSha256(stableStringify(scorer))`.
- `writeBlob(archiveDir, kind, key, content)` — atomic + **idempotent**: writes
  `content/<kind>/<key>.<ext>` via temp+rename (mirroring `rewriteAttempt`), creating dirs
  recursively; if the target already exists, it is a no-op (content-addressed → identical bytes).
  `kind ∈ {"prompts","scorers","system"}` fixes the subdir and extension (`.txt`/`.json`/`.txt`).
- `readBlob(archiveDir, kind, key)` → blob string; `FileIOError{path,operation,cause}` on missing.
- Scorer blob bytes = `stableStringify(scorer)` — i.e. the **same bytes** as the `scorerHash`
  preimage, so the file content is the hash input (no second serializer) and a read round-trips
  through `Schema.decodeUnknown(ScorerConfig)`.

Error channel: `FileIOError` only, matching the rest of `src/archive/`.

### 4.2 Write path — `src/orchestration/run-challenge.ts` (edit)

Blobs are written from the **`ResolvedItem` / `ResolvedConfiguration`** we already hold, independent
of cache outcome, so the store is always complete:

- **`runChallenge` / `resumeChallenge`** (once, near header write): write the system blob
  `system/<configHash>.txt = config.systemPromptText`. Header is written with `schemaVersion: 2` and
  `passThreshold: challenge.passThreshold`.
- For **every resolved item** (in `executeOrCacheItem`, and for `resume` also the already-present
  ones — see below): write `prompts/<promptHash>.txt = item.prompt.promptText` and
  `scorers/<scorerHash>.json = item.scorer`. All writes idempotent.
- The emitted `ItemResult` carries `scorerHash` (computed from `item.scorer`).

**Cache-hit interaction (clean):** because the store is shared, a cross-run cache hit referencing
blobs written by a prior v2 attempt needs no new write — the refs are already valid. We still write
the blobs from the in-hand `ResolvedItem` (idempotent) so completeness holds even when the hit comes
from a **v1**-era cached row. On a hit whose cached row lacks `scorerHash` (v1 source), we **stamp**
`scorerHash` onto the returned row. This is the one narrow, documented exception to the Phase-4
"hit = verbatim" invariant: it sets only the denormalized `scorerHash`, never a measured-cost field
(`executedAt`/tokens/tps/memory/wallTime preserved). For v2→v2 hits the stamp is a no-op (same
`itemHash` ⇒ same scorer ⇒ same `scorerHash`).

**Resume store completeness:** `resumeChallenge` writes the system blob and the prompt+scorer blobs
for **all** resolved items (existing + missing) at the top (idempotent, cheap), so the store is
complete without rewriting the existing body rows. Existing v2 body rows already carry `scorerHash`;
new rows get it via `executeOrCacheItem`. (Pre-v2 partial archives don't occur in practice — all
partials are produced by current writer code, which is v2.)

### 4.3 Reconstruction read helper — `src/report/reconstruct.ts` (new)

The single read-side primitive that proves the property; consumed by `score`, `export`, and tests.

- `loadAttemptReconstruction(archiveDir, file)` → `{ manifest, items, systemPromptText, perItem: Map<itemId, { promptText, scorer }> }`, resolved **purely from the jsonl + store** (no corpus,
  config, or system-prompts YAML).
- v1 archive (no `scorerHash`/no store) → typed failure indicating store-reconstruction is
  unavailable, so callers can fall back to corpus.

### 4.4 `score` — store-primary — `src/cli/commands/score.ts` (edit)

- **Default (v2):** re-score each item using its **stored** scorer (read `scorers/<scorerHash>.json`),
  needing no corpus, and recompute the aggregate using the manifest's stored `passThreshold`. This is
  a faithful recompute/verify — it reproduces the stored score unless the scoring *engine* (dispatch
  code) changed. No prompt-hash drift is possible (the stored scorer is by definition the one used).
- **`--corpus` flag (v2):** the current behavior — resolve the current corpus, apply edited scorers,
  with the existing `promptHash`-drift guard. This is the edit-a-scorer iteration loop, now opt-in.
- **v1 archive:** no store → corpus is the only source; behaves exactly as today (including the
  challenge-unresolvable → no-op fallback). Equivalent to forcing `--corpus`.
- `rescoreItems(items, challenge)` (corpus path) is kept as-is for `--corpus`/v1. A sibling
  `rescoreItemsFromStore(items, perItemScorers)` drives the default path. Both feed the existing
  `aggregate` → `rewriteAttempt` in-place flow; identity fields are never rewritten.

### 4.5 `bench export` — `src/cli/commands/export.ts` (new), registered in `src/cli/main.ts`

- `bench export <attemptId | path> [--archive-dir DIR] [--out PATH] [--dir]` — `--out` defaults to
  `<attemptId>.tar.gz` (or `<attemptId>/` under `--dir`) in the current directory.
- Resolves the jsonl (attemptId → `<archiveDir>/<attemptId>.jsonl`; or a direct path). v1 archive →
  clear error ("v1 archive has no content store; export requires a v2 archive").
- Collects the referenced blob keys — per item `promptHash` + `scorerHash`, plus the manifest
  `configHash` — and copies the jsonl + exactly those blobs into a mirrored `content/` layout.
- **Output:** default a `.tar.gz` produced by shelling to the system `tar` via `CommandExecutor`
  (mirrors the existing python3 subprocess pattern in code-exec/custom scorers — **no new npm dep**).
  `--dir` emits a plain directory bundle instead (dependency-free; re-loadable directly because the
  loaders read a directory's `content/` store). Both forms re-import cleanly.

## 5. Out of scope (explicit)

- **Migration command** — coexistence-only; the 6 existing v1 archives stay corpus-dependent.
- **Model `params`/`family` in the archive** — the submit path doesn't read `models.yaml`, so size
  isn't available to persist; `family` is derivable from the artifact string (webapp already does this
  via `modelFamily`/`modelSizeB`). Deferred to the webapp-parity session.
- **`WebappRecord` enrichment + webapp scatter/leaderboard/filters/drilldown rebuild** — downstream
  session per the kickoff §5. The data now exists in-archive to support it later; this spec does not
  touch `webapp-contract.ts` or the webapp.
- **A `bench show`/viewer CLI** — the `loadAttemptReconstruction` library fn + the corpus-deleted
  test (below) demonstrate the property; a viewer is a thin future add.
- **Pure content-addressing / blob self-verification** — superseded by the reuse-identity-hashes
  decision (§2.1).

## 6. Hash stability (non-negotiable)

All added data is denormalized **content**, never a hash input. `passThreshold`, `scorerHash`, and the
content store are all outside the hash preimages. `configHash`, `challengeHash`, `itemHash`, and
`attemptId` are unchanged for existing and new archives. The golden hash tests must
stay green unchanged — in particular `challengeHash` golden `71c5f440ce49` and the configuration hash
tests. `scorerHash` is a **new, separate** hash used only as a store key; it is *not* folded into
`itemHash` (which already folds `promptHash | stableStringify(scorer)`), so it carries no new identity
meaning and cannot perturb existing hashes.

## 7. Testing / acceptance

- **Golden hashes unchanged** — `challengeHash`/`configHash` golden + drift tests pass without re-pin.
- **Round-trip write** — a faked attempt run populates `content/{prompts,scorers,system}/` at the
  expected keys; every item line carries `scorerHash`; header is `schemaVersion: 2`.
- **Headline property — corpus-deleted reconstruction:** produce a v2 attempt, then with the corpus
  directory absent/empty assert (a) `loadAttemptReconstruction` returns full prompt + system + scorer
  text; (b) default `score` re-scores and reproduces the aggregate **including `passed`** (proving
  `passThreshold` round-trips); (c) `export` bundles jsonl + blobs and the bundle re-loads. This is the
  proof of "reconstruct entirely from the archive."
- **Coexistence** — a v1 archive still loads in `report`; `report` mixes v1 + v2; `score` on v1 uses
  the corpus path.
- **`score` store-primary vs `--corpus`** — default uses the stored scorer (no corpus read); an edited
  corpus scorer is applied only under `--corpus`.
- **content-store** — idempotent write (second write no-ops, bytes identical); atomic temp+rename.
- **cache-hit completeness** — a v1-era cached item served into a v2 run yields blobs written +
  `scorerHash` stamped, with measured-cost fields preserved verbatim.
- **export** — the bundled blob set is exactly the referenced keys (no extras); re-import works; v1 →
  error.

## 8. Conventions carried forward

Additive, golden-hash-safe, red→green TDD via `subagent-driven-development`. Biome bans `!` and
`throw` in non-test `src/` (`*.test.ts` exempt from the throw ban). `FileIOError` needs
`{path, operation, cause}`. `Runtime` literals `"llamacpp"`/`"mlx"`. **No new runtime deps** (system
`tar` via `CommandExecutor`, not an npm tar lib). Adversarial review before commit; on any
adversarial-review failure, STOP and escalate via AskUserQuestion (standing directive). Commit
messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
