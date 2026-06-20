# Phase 4 — Cache + resume

> Status: design approved 2026-06-19. Builds on the Challenge × Configuration reframe
> (`docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`, §"Archive + cache")
> and Phases 2–3. Branch: `challenge-config-reframe` (Phase 0–3 stack on the same branch).

## Problem

Under the new Configuration/Challenge/Result identity model, every `./bench submit` is a fresh
attempt: it re-runs every challenge item through the model from scratch, even when an identical
`(config, challenge-item)` has already been executed and scored in a prior run. There is no
cross-run reuse, so repeated benchmarking is expensive. There is also no resume: if a run is
interrupted mid-challenge, the partial archive (header written, some items appended,
`interrupted: true`) is dead weight — the only recovery is to re-run the whole challenge.

The legacy `findCachedResult` reader in `src/archive/cache.ts` keys on
`(artifact, runId, promptName, promptHash, temperature)` over old `ExecutionResult` archives. It
predates the identity model and is **not** wired into `runChallenge` — but it **is** still wired into
the live `run` command (via `src/orchestration/cache.ts`, with `runCommand` registered in
`src/cli/main.ts`, covered by its own tests in `src/archive/__tests__/cache.test.ts`). The `run` path
is out of scope for Phase 4 (see Non-goals), so the legacy reader stays intact. Phase 4 **adds** a new
identity-model reader alongside it.

Phase 4 delivers two pieces, built in order:

1. A **cross-run item cache** so a previously executed-and-scored item is reused instead of
   re-running the model.
2. **Resume by `attemptId`** so an interrupted run continues from where it stopped.

## Goals

- Make repeated benchmark runs cheap via a cross-run item cache keyed by the foundational spec's
  cache key: **`(configHash, challengeId, version, itemHash)`**.
- Make interrupted runs resumable by `attemptId`, executing only the items that are still missing.
- Guarantee the cache invalidates on any change that alters an item's output or its score —
  including a scorer edit that did not bump the challenge `version`.
- Keep the two mechanisms (cross-run cache, resume) distinct but composable.

## Non-goals

- **Migration of legacy `ExecutionResult` archives.** Clean break, consistent with the foundational
  spec. The cross-run cache reads only new `AttemptManifest`/`ItemResult` archives.
- **Concurrent / cross-machine execution.** Unchanged from today.
- **Caching at any grain other than the per-item `ItemResult`.** No attempt-level or
  challenge-level cache.
- **Webapp-contract changes.** `ItemResult` is backend-only; the webapp consumes the per-attempt
  aggregated `WebappRecord` (Phase 3). Adding `itemHash` to `ItemResult` has no webapp impact.

## Ground truth (verified code facts the spec builds on)

These are stated so the build does not have to re-derive them.

- **`promptHash`** = `shortSha256(\`${promptText}|${systemText}\`)` (`src/config/prompt-corpus.ts:16-17`).
  **`shortSha256`** = first 12 hex chars of SHA-256 (`src/config/hashing.ts:9-10`).
- **`challengeHash`** = `shortSha256(items.map(i => \`${i.promptHash}:${scorerKey(i.scorer)}\`).join("|"))`
  where **currently** `scorerKey = (s) => JSON.stringify(s)` (`src/config/challenges.ts:53-54`, `:25`).
- **`configHash`** covers
  `[artifact, runtime, quant ?? "", String(temperature), String(maxTokens), systemPromptText].join("|")`
  → `shortSha256` (`src/config/configurations.ts:18-37`).
- **`ResolvedItem`** (`src/config/challenges.ts:11-16`) = `{ itemId, promptHash, scorer: ScorerConfig, prompt: PromptCorpusEntry }`.
  `scorer` is a discriminated union: `exact_match | constraint | code_exec | game`
  (has `scorerParams: Record<string, unknown>`) `| custom`. It is pure data, directly serializable.
- **`ItemResult`** body-line schema (`src/schema/attempt.ts:6-22`) currently has: `itemId`,
  `promptName`, `promptHash`, `executedAt`, `promptTokens`, `generationTokens`, `promptTps`,
  `generationTps`, `peakMemoryGb`, `wallTimeSec`, `output`, `reasoning` (`string | null`),
  `rawOutput`, `error` (`string | null`), `score`. **No `itemHash` field today.** `ItemResult` is
  backend-only (not in the webapp contract).
- **`AttemptManifest`** header (`src/schema/attempt.ts:37-59`): `schemaVersion` (literal `1`),
  `attemptId`, `startedAt`, `finishedAt` (`string | null`), `interrupted` (boolean), `configId`,
  `configHash`, `artifact`, `runtime`, `quant?`, `temperature`, `systemPrompt`, `maxTokens`,
  `challengeId`, `challengeVersion` (number), `challengeHash`, `env`, `aggregate`.
- **`isCompleted`** predicate (to mirror): `finishedAt !== null && interrupted === false`
  (`src/report/aggregate.ts`).
- **Archive writer** (`src/archive/attempt-writer.ts`): `writeAttemptHeader` (writes header line 1,
  `interrupted=true`) → `appendItem` (appends one `ItemResult` line) →
  `finalizeAttempt(path, finishedAt, aggregate)` (rewrites header line 1, body untouched; takes the
  aggregate as a param and recomputes nothing itself).
- **`runChallenge`** (`src/orchestration/run-challenge.ts`): per item runs `runPrompt` then
  `scoreByConfig`, builds an `ItemResult` `row`, `appendItem`s it, pushes to `scored`; after the loop
  `aggregate(scored, passThreshold)` (pure: `score = perfect/total`, `passed = score >= threshold`)
  then `finalizeAttempt`. `attemptId` is already threaded; archive path is
  `${archiveDir}/${attemptId}.jsonl`. `submit` builds `attemptId` as
  `att-${configHash}-${challengeHash}-${Date.now()}`.

## Design

### Decisions (resolved during brainstorming)

1. **Cache key per the foundational spec** — `(configHash, challengeId, version, itemHash)`. No
   deviation.
2. **`itemHash` is scorer-inclusive and persisted** — folding the scorer into `itemHash` closes the
   silent-stale-score hole when a scorer is edited without a `version` bump (see §2). Persisted onto
   `ItemResult` because the archive does not store the scorer, so it must be written to be matchable
   later.
3. **`itemHash` is a required field** — always computable; follows the codebase's fold-hash
   precedent. Clean break: a pre-existing archive lacking `itemHash` simply won't decode or
   cache-match, which is acceptable (webapp `data.js` is a stub; no real archives exist yet).
4. **Deterministic scorer serialization first** — `JSON.stringify` does not guarantee object key
   order, so it is unsuitable as the hash transform; it is replaced before `itemHash` is introduced
   (see §1).
5. **Cross-run cache and resume are distinct mechanisms that compose** — the cross-run cache reader
   only reads **completed** archives, so it skips the partial archive being resumed; resume reads the
   partial body explicitly. Resume = "skip this attempt's already-done items, then execute-or-cache
   the rest."

### Section 1 — Deterministic scorer serialization (build FIRST)

`JSON.stringify` does not guarantee object key order across implementations, so it is unsuitable as
the spec's hash transform. Both `challengeHash` and the new `itemHash` (§2) fold the scorer through
`scorerKey`; if `scorerKey` is order-dependent, equivalent scorers can hash differently. Replace it.

- **EXPORT the existing private `stableStringify` from `src/config/hashing.ts`** (currently used
  only by `computeScenarioHash`, `src/config/hashing.ts:46-54`). It already recursively sorts object
  keys, preserves array order, and serializes primitives via `JSON.stringify` — exactly the
  canonicalizer needed, and already battle-tested on the `scorerParams` case via `computeScenarioHash`.
  **No new helper, no new dependency** — just widen its visibility from `const stableStringify` to
  `export const stableStringify`.
- Replace `scorerKey`'s body in `src/config/challenges.ts` to use `stableStringify(s)` instead of
  `JSON.stringify(s)`. Both `challengeHash` and the new `itemHash` consume `scorerKey`, so scorer
  hashing becomes order-independent everywhere.
- Vulnerable surface: `GameScorerConfig.scorerParams` (keys come from YAML parse order) and
  `ConstraintConfig.constraints[]` objects. Flat string-field scorers are unaffected in practice but
  now provably stable.

**RIPPLE (why this task is first):** changing `scorerKey`'s internals changes any `challengeHash`
whose scorer was not already in sorted-key order. The two pinned golden hashes — the Task 2 synthetic
golden (`9c2d6d88c900`) and the Task 10 real-corpus 12-hex `challengeHash` — likely shift. This task
**re-pins them red→green**: observe the new value from a failing test, then pin it. Never
hand-compute. Add a **new** golden test (covering `stableStringify` via `scorerKey`) asserting
key-order independence: two scorer objects with different insertion order hash identically.

### Section 2 — `itemHash` (identity)

`itemHash = shortSha256(\`${promptHash}|${scorerKey(scorer)}\`)` — now deterministic via §1. This
mirrors how `challengeHash` folds the scorer, at per-item granularity.

- Add `itemHash` to `ResolvedItem` in `src/config/challenges.ts`, computed in `resolveChallenge`.
- Add a **required** `itemHash: Schema.String` field to `ItemResult` in `src/schema/attempt.ts`.
  Rationale for required (not optional): always computable; follows the codebase's fold-hash
  precedent. Backward-compat is a clean break — a pre-existing archive lacking `itemHash` simply
  won't decode or cache-match, which is acceptable. `ItemResult` is backend-only, so there is **no
  webapp-contract impact**. Existing test fixtures that build `ItemResult` inline get the field
  added.

**Why scorer-inclusive + persisted (the core invariant):** the cache caches a whole `ItemResult`,
which holds both the model output **and** its score. The output is pinned by `configHash` +
`promptHash`; the **score** additionally depends on the scorer rules, which `promptHash` does not
cover. The cache key is scoped by `(challengeId, version)`, but `version` is set manually in YAML, so
a scorer edit without a version bump would otherwise serve a stale score silently. Folding the scorer
into `itemHash` closes that. The archive does not store the scorer, so `itemHash` must be written
onto the `ItemResult` to be matchable later.

### Section 3 — Cross-run cache reader (add to `src/archive/cache.ts`)

**Add** a new identity-model reader **alongside** the existing `findCachedResult` — this is additive,
not a rewrite or a deletion. The legacy `findCachedResult` reader and the live `run` path that
consumes it stay intact and untouched (out of scope for Phase 4; see Problem + Non-goals). The only
adjustment to existing code in this file is an internal-only rename: the legacy internal `CacheKey`
interface becomes `LegacyCacheKey`, freeing the `CacheKey` name for the new reader. No external API
breaks.

- New reader, e.g. `findCachedItem(archiveDir, key)` where
  `key = { configHash, challengeId, challengeVersion, itemHash }`. Returns
  `Option.Option<ItemResult>`.
- Scan `benchmark-archive/*.jsonl` (non-recursive). For each file:
  - Decode the `AttemptManifest` header.
  - Eligible only if the attempt is **completed**: `finishedAt !== null && interrupted === false`
    (mirror `isCompleted`).
  - The header must match `configHash` **AND** `challengeId` **AND** `challengeVersion`.
  - Then scan the body `ItemResult` lines for `itemHash === key.itemHash`.
- If multiple archives contain a matching item, return the **most recent by the matched item's
  `executedAt`** (mirrors the legacy tie-break).
- Error channel mirrors the existing report reader: `FileIOError` with the correct `operation`
  strings. The new reader uses **`operation: "readDirectory"`**. The legacy `"read-archive-dir"`
  string is **left in place** — it belongs to the still-live legacy `findCachedResult` reader and is
  out of scope for Phase 4.

### Section 4 — Wire cache into `runChallenge` + `--no-cache`

Per item, **before** `runPrompt`, query `findCachedItem`:

- **HIT:** copy the cached `ItemResult` **verbatim** — keep its original `executedAt` / tokens /
  `wallTimeSec`, so the efficiency metric still reflects the config's true measured cost — then
  `appendItem` it, push it to `scored`, and **skip** the model call.
- **MISS:** execute as today, stamping `itemHash` onto the row.

`submit` gets a `--no-cache` flag that bypasses the cross-run lookup. Thread it into `runChallenge`
as an input flag; **default cache ON**.

### Section 5 — Resume by `attemptId` + `--resume`

`submit --resume <attemptId>` is used **alongside** the normal `--config` / `--challenge` /
`--prompts-dir` / `--configs-file` args. The archive header stores **ids**, not YAML paths or
prompt/scorer content, so resume MUST re-resolve config + challenge from the provided args to recover
prompts and scorers.

- Locate `<archive-dir>/<attemptId>.jsonl`, load its header, and **validate**
  `resolved.configHash === header.configHash && resolved.challengeHash === header.challengeHash`. On
  mismatch, **fail loudly** — do not corrupt the archive by appending mismatched items.
- Read which `itemId`s already have body lines. Execute **only the missing items**, appending to the
  **same file**. Recompute the aggregate over the **union** of existing + newly executed rows, then
  `finalizeAttempt`.
- **Composition:** resume = "skip this attempt's already-done items, then execute-or-cache the rest."
  `--no-cache` still honors resume's skip-existing. The cross-run cache reader skips the partial
  archive itself (it is `interrupted: true`), so resume must read the partial body explicitly — they
  are distinct mechanisms that compose.
- **Likely factoring** (final call left to the implementation plan, but noted): extract the per-item
  "execute-or-cache → `ItemResult`" step into a helper shared by the fresh-run and resume paths.

### Component / file responsibilities

- `src/config/hashing.ts` — export the existing private `stableStringify`.
- `src/config/challenges.ts` — `scorerKey` uses `stableStringify`; `ResolvedItem` gains `itemHash`,
  computed in `resolveChallenge`.
- `src/schema/attempt.ts` — `ItemResult` gains required `itemHash: Schema.String`.
- `src/archive/cache.ts` — **add** `findCachedItem(archiveDir, key)` over the new identity model
  alongside the existing `findCachedResult`; rename the legacy internal `CacheKey` to `LegacyCacheKey`
  (internal only). Legacy reader and its `"read-archive-dir"` string left intact.
- `src/orchestration/run-challenge.ts` — per-item execute-or-cache; honor `--no-cache` and resume
  (skip-existing + re-aggregate over union); likely extract the shared per-item helper.
- `src/cli/` (`submit`) — add `--no-cache` and `--resume <attemptId>` flags; thread into
  `runChallenge`.

## Testing

State the cache **staleness key** as the highest-value target.

- **`stableStringify` golden + key-order independence** (in §1, via `scorerKey`): two scorer objects
  with different insertion order produce the identical hash.
- **Cache reader unit tests** vs fixture attempt archives — mirror the loader test style in
  `src/report/load-attempts.test.ts`:
  - hit;
  - misses on differing `configHash` / `itemHash` / `challengeVersion`;
  - ignore incomplete attempts (`interrupted === true` OR `finishedAt === null`).
- **`runChallenge` integration with a fake LLM:** run 1 populates the archive; run 2 with cache ON
  issues **zero** model calls and produces an **identical** aggregate; `--no-cache` re-executes.
- **Scorer-staleness test (highest value):** same prompt, edited scorer → different `itemHash` →
  cache **MISS**.
- **Resume test:** write a partial (interrupted) archive, resume, assert only the missing items
  executed and the finalized aggregate is correct.
- Full suite green; lint + typecheck clean. (Root `npm test` also globs
  `webapp/src/**/*.test.ts` — the combined count is one number.)

## Build order

1. Export `stableStringify` + `scorerKey` swap + re-pin golden hashes (+ key-order-independence golden test).
2. `itemHash` on `ResolvedItem` + `ItemResult` schema field (+ fixtures).
3. Add `findCachedItem` reader alongside the legacy one (+ unit tests).
4. Wire cache into `runChallenge` + `--no-cache` (+ integration + staleness tests).
5. Resume + `--resume` (+ resume test).

## Risks

- **Cache staleness is the central risk.** The key must invalidate on any change that alters output
  or score: config fields via `configHash`; challenge content/version via `(challengeId, version)`;
  item content + scorer via `itemHash`. Getting `itemHash` wrong silently serves stale results —
  hence the scorer-inclusive `itemHash` and the dedicated staleness test.
- **Re-pinning golden hashes must be done red→green** — observe the actually-produced new value from
  a failing test; never hand-compute.

## Constraints / gotchas

- `Runtime` is `Schema.Literal("llamacpp", "mlx")` — never `"llama-server"`.
- `FileIOError` requires `{ path, operation, cause }`.
- Biome bans non-null assertions (`!`) and `throw` in non-test `src/` (`*.test.ts` is exempt from the
  throw ban).
- Root `npm test` also globs `webapp/src/**/*.test.ts` — the combined count is one number.
