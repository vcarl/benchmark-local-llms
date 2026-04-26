# Transparent run-id with scoped cache and resume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transparent run-id concept that ties together the per-model archives produced by one `./bench run` invocation, scopes the cross-run cache to that id so resume produces a complete dataset, and auto-clears state on full completion.

**Architecture:** The existing per-archive identifier `runId` is renamed `archiveId`; a new `runId` is added at the manifest and result layers as the logical-run group id. `findCachedResult` filters by `runId` (manifest fast-filter + per-result match) so cache hits only carry within one logical run. State lives in `{archiveDir}/.run-state.json` (`{ runId, createdAt }`); the run command reads it on start (or generates a new id), writes it, then deletes it iff the planned cell matrix is fully populated with valid results tagged with that id. `--fresh` resets the state file. The loader translates legacy archives (no `archiveId`) by synthesizing `archiveId = runId; runId = "legacy-{archiveId}"`.

**Tech Stack:** TypeScript, Effect (Schema, FileSystem, Path, Clock), vitest, @effect/cli, @effect/platform-node.

---

## Spec reference

Design lives at `docs/superpowers/specs/2026-04-25-run-id-resume-design.md`. Read it first.

## Pre-flight

- [ ] **Step P1: Verify clean tree on the worktree branch**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: clean tree on `worktree-run-id`. The spec commit (`b201720`) should be the latest.

- [ ] **Step P2: Verify baseline tests pass**

```bash
npm test
```

Expected: all tests pass. If anything is failing now, fix that first or stop and ask — this plan assumes a green baseline.

---

## Task 1: Schema — rename `runId` → `archiveId`, add new `runId`

**Goal:** Update `RunManifest` and `ExecutionResult` so the existing per-archive id is `archiveId` and a new group-level `runId` exists. After this task, the project compiles and all consumers reference the new field names; the new `runId` is set to a sentinel string for now (no group semantics yet).

**Files:**
- Modify: `src/schema/run-manifest.ts`
- Modify: `src/schema/execution.ts`
- Modify: `src/archive/__tests__/fixtures.ts`
- Modify: `src/orchestration/run-id.ts`
- Modify: `src/orchestration/run-loop.ts`
- Modify: `src/orchestration/phases.ts`
- Modify: `src/migrate/reconstruct-manifest.ts` (only renames; full migrate update is Task 9)
- Modify: any other call sites the type-checker flags

- [ ] **Step 1.1: Update `RunManifest` schema**

Edit `src/schema/run-manifest.ts`. In the `RunManifest` Struct, change `runId: Schema.String` to **two** fields:

```typescript
  archiveId: Schema.String,
  runId: Schema.String,
```

Order them right after `schemaVersion`. Keep `schemaVersion: Schema.Literal(1)` — no version bump.

Update the doc comment on the struct to reflect the split:

```typescript
/**
 * Top-level archival envelope (§2.4). One manifest per benchmark execution
 * session. Serialized as a single JSON line (the header) at the top of the
 * `{archiveId}.jsonl` archive file, with ExecutionResults on subsequent lines
 * and a trailer rewriting `stats`/`finishedAt` at the end (§6.1).
 *
 * `archiveId` is the per-(model × invocation) identity that matches the
 * filename stem. `runId` is the logical-run group id — same value across
 * every archive produced by one `./bench run` invocation, and across resume
 * invocations of the same logical run.
 *
 * `schemaVersion` stays at literal `1`; legacy archives (which carry only
 * the old `runId`) are translated by the loader rather than being version-
 * bumped on disk.
 */
```

- [ ] **Step 1.2: Update `ExecutionResult` schema**

Edit `src/schema/execution.ts`. In the `ExecutionResult` Struct, change `runId: Schema.String` to:

```typescript
  archiveId: Schema.String,
  runId: Schema.String,
```

Keep them in the same first-line position. Update the doc comment to explain that `archiveId` is the back-reference to the owning archive and `runId` is denormalized from the manifest for cache-scan use.

- [ ] **Step 1.3: Run typecheck — let it tell you what to fix**

```bash
npm run typecheck
```

Expected: many errors at sites that read or write `runId`. List them; you'll fix them in the following steps.

- [ ] **Step 1.4: Update test fixtures**

Edit `src/archive/__tests__/fixtures.ts`. In `openManifest`, replace:

```typescript
  runId: "2026-04-14_qwen3-32b_4bit_deadbe",
```

with:

```typescript
  archiveId: "2026-04-14_qwen3-32b_4bit_deadbe",
  runId: "r-2026-04-14-deadbe",
```

In `sampleResult`, replace the `runId: "2026-04-14_qwen3-32b_4bit_deadbe",` line with:

```typescript
  archiveId: "2026-04-14_qwen3-32b_4bit_deadbe",
  runId: "r-2026-04-14-deadbe",
```

- [ ] **Step 1.5: Update `makeRunId` to return both ids**

Edit `src/orchestration/run-id.ts`. Rename the existing function to `makeArchiveId` and add a new `makeRunId` for the group id.

Replace the existing `makeRunId` block with:

```typescript
/**
 * Build an archiveId for one model + clock tick. Stable across repeated
 * calls with the same inputs; tests can pin the clock via `TestClock`.
 *
 * Shape: `{YYYY-MM-DD}_{modelSlug}_{quant}_{shortId}` — the per-archive id
 * that matches the `.jsonl` filename stem.
 */
export const makeArchiveId = (
  model: ModelConfig,
): Effect.Effect<{
  readonly archiveId: string;
  readonly startedAt: string;
  readonly startedAtMs: number;
}> =>
  Effect.gen(function* () {
    const millis = yield* Clock.currentTimeMillis;
    const iso = new Date(millis).toISOString();
    const slug = modelSlug(model);
    const quant = quantPart(model);
    const parts = [datePart(iso), slug, quant, shortIdFromMillis(millis)].filter(
      (p) => p.length > 0,
    );
    return {
      archiveId: parts.join("_"),
      startedAt: iso,
      startedAtMs: millis,
    };
  });
```

Then update `archiveFileName`:

```typescript
/**
 * Archive file name from an archiveId. Pure helper.
 */
export const archiveFileName = (archiveId: string): string => `${archiveId}.jsonl`;
```

Don't add `makeRunId` (group-id generator) here — that lives in the state module (Task 5). For now, callers will pass an explicit `runId` through.

- [ ] **Step 1.6: Update the `run-id.ts` test**

Edit `src/orchestration/__tests__/run-id.test.ts` — every reference to `runId` on the makeRunId return type becomes `archiveId`. Run only this test:

```bash
npx vitest run src/orchestration/__tests__/run-id.test.ts
```

Expected: PASS.

- [ ] **Step 1.7: Update `makeOpenManifest`**

Edit `src/orchestration/run-loop.ts`, `makeOpenManifest`. Change the params and body:

```typescript
export const makeOpenManifest = (params: {
  readonly archiveId: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly model: ModelConfig;
  readonly env: RunEnv;
  readonly temperatures: ReadonlyArray<number>;
  readonly promptCorpus: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
}): RunManifest => ({
  schemaVersion: 1,
  archiveId: params.archiveId,
  runId: params.runId,
  startedAt: params.startedAt,
  finishedAt: null,
  ...
});
```

(Leave the rest of the body unchanged.)

- [ ] **Step 1.8: Add `runId` to `RunLoopConfig` and thread it through `runLoop`**

In `src/orchestration/run-loop.ts`:

Add `readonly runId: string;` to `RunLoopConfig` (alphabetical order doesn't matter here — group with the other identity-bearing fields, near the top).

In the per-model loop, replace:

```typescript
      const { runId, startedAt } = yield* makeRunId(model);
      const manifest = makeOpenManifest({
        runId,
        startedAt,
        model,
        ...
```

with:

```typescript
      const { archiveId, startedAt } = yield* makeArchiveId(model);
      const manifest = makeOpenManifest({
        archiveId,
        runId: config.runId,
        startedAt,
        model,
        ...
```

And replace the file path:

```typescript
      const archivePath = pathMod.join(config.archiveDir, archiveFileName(archiveId));
```

In the `Effect.annotateLogs({ ..., runId })` block at the end of the per-model body, replace `runId,` with `archiveId, runId: config.runId,` so log scopes carry both ids.

The import line needs `makeRunId` swapped for `makeArchiveId`:

```typescript
import { archiveFileName, makeArchiveId } from "./run-id.js";
```

- [ ] **Step 1.9: Update `phases.ts` cache-hit carrying**

Edit `src/orchestration/phases.ts`. There are two spots that build `carried` from a cache hit:

```typescript
        if (Option.isSome(cached)) {
          const carried: ExecutionResult = {
            ...cached.value,
            runId: input.manifest.runId,
          };
```

Change both to also carry the new archive id (the cache value's `archiveId` is the *old* archive's id; we want the new archive's id):

```typescript
        if (Option.isSome(cached)) {
          const carried: ExecutionResult = {
            ...cached.value,
            archiveId: input.manifest.archiveId,
            runId: input.manifest.runId,
          };
```

The log line that prints `carried.runId` should change to `carried.archiveId` (the original log was reporting which archive the cache hit came from, which is the archive id):

```typescript
            `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — cache hit (archiveId=${carried.archiveId}, executedAt=${carried.executedAt})`,
```

Same for the scenario phase log line.

Also: `runPrompt` and `runScenario` (in `src/orchestration/phases.ts`) currently take a `runId` parameter that gets stamped on the produced `ExecutionResult`. They actually need both ids now. Find the call sites:

```typescript
        const result = yield* runPrompt({
          runId: input.manifest.runId,
          model,
          ...
```

Change to:

```typescript
        const result = yield* runPrompt({
          archiveId: input.manifest.archiveId,
          runId: input.manifest.runId,
          model,
          ...
```

Same for the `runScenario` call. You'll also need to update `runPrompt` and `runScenario` signatures + their result-building code so they set both fields on the produced `ExecutionResult`. Search for `runId:` inside `src/orchestration/run-prompt.ts` and `src/orchestration/run-scenario.ts` (or wherever those helpers live) and add a sibling `archiveId:` everywhere a result is constructed.

- [ ] **Step 1.10: Find any other compile errors**

```bash
npm run typecheck
```

Expected: errors point to remaining sites that read `runId` expecting the old per-archive meaning. Common spots:
- `src/cli/config/build.ts` — `RunLoopConfig` is built here. Add `runId` to the assembled config; for now, accept it via params (full wiring is Task 8).
- `src/cli/commands/run.ts` — `formatRunRecord` may read `manifest.runId`; if so, update appropriately.
- `src/migrate/reconstruct-manifest.ts` — sets the manifest's `runId`. Rename to `archiveId`; also set `runId: "legacy-{archiveId}"` on the manifest and on each reconstructed result. Full update of the migrate path is in Task 9, but the fields must compile now.

Fix each to satisfy the type-checker. Use `runId: "r-pending"` as a temporary literal in `buildRunLoopConfig` if needed; Task 8 replaces it.

- [ ] **Step 1.11: Run all tests**

```bash
npm test
```

Expected: PASS. If a test fails because it asserts on `runId` meaning archive id, update the assertion to use `archiveId`.

- [ ] **Step 1.12: Commit**

```bash
git add -A
git commit -m "refactor(schema): rename per-archive runId to archiveId, add group-level runId

Splits the existing runId field into archiveId (per-archive identity,
matching the .jsonl filename stem) and a new runId (the logical-run
group id, same across all archives produced by one bench run
invocation). All consumers updated; cache scoping and state-file
lifecycle land in subsequent commits."
```

---

## Task 2: Loader — translate legacy archives

**Goal:** Old archives written before this change have `runId` (per-archive) but no `archiveId`. The loader must accept those by synthesizing `archiveId = runId; runId = "legacy-{archiveId}"`. Schema version stays at `1`; the only signal of legacy shape is the absence of `archiveId`.

**Files:**
- Modify: `src/archive/loader.ts`
- Test: `src/archive/__tests__/loader-legacy.test.ts` (new)

- [ ] **Step 2.1: Write failing test for legacy translation**

Create `src/archive/__tests__/loader-legacy.test.ts`:

```typescript
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadManifest } from "../loader.js";
import { makeTempDir, removeDir } from "./test-utils.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

describe("loader: legacy archive translation", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("synthesizes archiveId and legacy runId for archives without archiveId", async () => {
    // A legacy manifest line: pre-rename, only `runId` (per-archive sense).
    const legacyManifest = {
      schemaVersion: 1,
      runId: "2025-12-01_qwen_q4_aa11bb",
      startedAt: "2025-12-01T00:00:00.000Z",
      finishedAt: "2025-12-01T01:00:00.000Z",
      interrupted: false,
      artifact: "qwen/qwen-7b",
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      env: {
        hostname: "host",
        platform: "darwin-arm64",
        runtimeVersion: "x",
        nodeVersion: "v22",
        benchmarkGitSha: "abc",
      },
      temperatures: [0.7],
      promptCorpus: {},
      scenarioCorpus: {},
      stats: {
        totalPrompts: 1,
        totalExecutions: 1,
        completed: 1,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 1,
      },
    };
    const legacyResult = {
      runId: "2025-12-01_qwen_q4_aa11bb",
      executedAt: "2025-12-01T00:30:00.000Z",
      promptName: "p",
      temperature: 0.7,
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 1,
      wallTimeSec: 1,
      output: "x",
      error: null,
      promptHash: "h",
      scenarioHash: null,
      scenarioName: null,
      terminationReason: null,
      toolCallCount: null,
      finalPlayerStats: null,
      events: null,
    };
    const file = path.join(dir, "legacy.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify(legacyManifest)}\n${JSON.stringify(legacyResult)}\n`,
    );

    const loaded = await Effect.runPromise(
      loadManifest(file).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(loaded.manifest.archiveId).toBe("2025-12-01_qwen_q4_aa11bb");
    expect(loaded.manifest.runId).toBe("legacy-2025-12-01_qwen_q4_aa11bb");
    expect(loaded.results).toHaveLength(1);
    expect(loaded.results[0]?.archiveId).toBe("2025-12-01_qwen_q4_aa11bb");
    expect(loaded.results[0]?.runId).toBe("legacy-2025-12-01_qwen_q4_aa11bb");
  });

  it("passes through new-shape archives unchanged", async () => {
    const file = path.join(dir, "new.jsonl");
    const manifest = {
      schemaVersion: 1,
      archiveId: "2026-04-25_qwen_q4_bb22cc",
      runId: "r-2026-04-25-bb22cc",
      startedAt: "2026-04-25T00:00:00.000Z",
      finishedAt: null,
      interrupted: false,
      artifact: "qwen/qwen-7b",
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      env: {
        hostname: "host",
        platform: "darwin-arm64",
        runtimeVersion: "x",
        nodeVersion: "v22",
        benchmarkGitSha: "abc",
      },
      temperatures: [0.7],
      promptCorpus: {},
      scenarioCorpus: {},
      stats: {
        totalPrompts: 0,
        totalExecutions: 0,
        completed: 0,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 0,
      },
    };
    await fs.writeFile(file, `${JSON.stringify(manifest)}\n`);

    const loaded = await Effect.runPromise(
      loadManifest(file).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(loaded.manifest.archiveId).toBe("2026-04-25_qwen_q4_bb22cc");
    expect(loaded.manifest.runId).toBe("r-2026-04-25-bb22cc");
  });
});
```

- [ ] **Step 2.2: Run the test to confirm it fails**

```bash
npx vitest run src/archive/__tests__/loader-legacy.test.ts
```

Expected: the legacy test FAILS with a Schema decode error (no `archiveId`); the new-shape test passes.

- [ ] **Step 2.3: Implement the translator in the loader**

Edit `src/archive/loader.ts`. Above `parseJsonLine`, add:

```typescript
/**
 * Legacy archive shape compatibility. Archives written before the runId →
 * archiveId rename carry `runId` in the per-archive sense and have no
 * `archiveId`. We synthesize on read: `archiveId = oldRunId`,
 * `runId = "legacy-{oldRunId}"`. Legacy archives therefore can never satisfy
 * a cache lookup for a real (non-legacy) runId, which is the intended
 * semantic — old data exists but doesn't auto-cache into new logical runs.
 *
 * Detection: presence of the `archiveId` key. New writes always include it;
 * legacy writes never did.
 */
const translateLegacyShape = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.archiveId === "string") return obj;
  if (typeof obj.runId === "string") {
    const legacyId = obj.runId;
    return {
      ...obj,
      archiveId: legacyId,
      runId: `legacy-${legacyId}`,
    };
  }
  return obj;
};
```

In `loadManifest`, between the parse and decode of the header line:

```typescript
    const headerJson = yield* parseJsonLine(path, headerLineNumber, headerLine);
    const headerTranslated = translateLegacyShape(headerJson);
    const manifest = yield* decodeManifest(headerTranslated).pipe(
      Effect.mapError(corruptFromDecodeError(path, headerLineNumber, headerLine)),
    );
```

And inside the result-line loop:

```typescript
      const parsed = yield* parseJsonLine(path, lineNumber, raw);
      const translated = translateLegacyShape(parsed);
      const result = yield* decodeResult(translated).pipe(
        Effect.mapError(corruptFromDecodeError(path, lineNumber, raw)),
      );
```

- [ ] **Step 2.4: Run the test to confirm pass**

```bash
npx vitest run src/archive/__tests__/loader-legacy.test.ts
```

Expected: PASS.

- [ ] **Step 2.5: Run all tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2.6: Commit**

```bash
git add -A
git commit -m "feat(archive/loader): translate legacy archives without archiveId

Archives written before the runId → archiveId rename carry only the old
per-archive runId. Synthesize archiveId from it and stamp a
legacy-<id> runId so they are readable by reports but never satisfy a
cache lookup for a real logical run."
```

---

## Task 3: Cache scoping — add `runId` to `CacheKey` and filter

**Goal:** `findCachedResult` only returns results whose manifest and result both carry the requested `runId`. Manifest fast-filter skips whole archives that don't belong to the active run.

**Files:**
- Modify: `src/archive/cache.ts`
- Modify: `src/orchestration/cache.ts`
- Modify: `src/orchestration/phases.ts`
- Modify: `src/archive/__tests__/cache.test.ts`
- Modify: `src/orchestration/__tests__/cache.test.ts`

- [ ] **Step 3.1: Write failing test — runId-scoped cache lookup**

Append to `src/archive/__tests__/cache.test.ts`, inside the `describe("findCachedResult", …)` block:

```typescript
  it("only returns a hit when the manifest's runId matches the cache key", async () => {
    const r = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      runId: "r-run-A",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-run-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-run-B", // different run
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isNone(exit)).toBe(true);
  });

  it("returns the hit when manifest runId matches", async () => {
    const r = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      runId: "r-run-A",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-run-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-run-A",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isSome(exit)).toBe(true);
  });
```

You'll also need to update **every existing call** to `findCachedResult` in this file to include a `runId` field on the key (use `runId: "r-2026-04-14-deadbe"` to match the fixture).

- [ ] **Step 3.2: Run test to confirm it fails to compile**

```bash
npx vitest run src/archive/__tests__/cache.test.ts
```

Expected: TypeScript error — `runId` missing on `CacheKey`. (The test file's existing assertions also fail because the production code does not filter on runId yet.)

- [ ] **Step 3.3: Add `runId` to `CacheKey` and filter on it**

Edit `src/archive/cache.ts`. Update the interface:

```typescript
export interface CacheKey {
  readonly artifact: string;
  readonly runId: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
}
```

Update `matchesKey`:

```typescript
const matchesKey = (r: ExecutionResult, key: CacheKey): boolean =>
  r.runId === key.runId &&
  r.promptName === key.promptName &&
  r.promptHash === key.promptHash &&
  r.temperature === key.temperature;
```

In `findCachedResult`, add the manifest fast-filter beside the existing artifact filter:

```typescript
    for (const entry of archives) {
      const filePath = pathMod.join(archiveDir, entry);
      const loaded = yield* loadManifest(filePath);
      if (loaded.manifest.artifact !== key.artifact) continue;
      if (loaded.manifest.runId !== key.runId) continue;
      for (const r of loaded.results) {
        if (!matchesKey(r, key)) continue;
        ...
```

Update the debug log to include the runId:

```typescript
    yield* Effect.logDebug(
      `scanning ${archiveDir} (${archives.length} files) for key=(${key.artifact},${key.runId},${key.promptName},${key.promptHash},${key.temperature})`,
    ).pipe(Effect.annotateLogs("scope", "cache"));
```

And the "picked" log — change `runId=${best?.runId}` to `archiveId=${best?.archiveId}` (we picked which archive supplied the hit; that is the archive id, not the run id):

```typescript
    yield* Effect.logDebug(
      candidateCount === 0
        ? "0 candidates"
        : `${candidateCount} candidates, picked archiveId=${best?.archiveId ?? "?"} (most recent)`,
    ).pipe(Effect.annotateLogs("scope", "cache"));
```

- [ ] **Step 3.4: Add `runId` to `CacheLookupInput` and thread through**

Edit `src/orchestration/cache.ts`. Update the interface:

```typescript
export interface CacheLookupInput {
  readonly archiveDir: string;
  readonly artifact: string;
  readonly runId: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
  readonly fresh: boolean;
}
```

Update the `findCachedResult` call inside `lookupCache`:

```typescript
  return findCachedResult(input.archiveDir, {
    artifact: input.artifact,
    runId: input.runId,
    promptName: input.promptName,
    promptHash: input.promptHash,
    temperature: input.temperature,
  }).pipe(Effect.map((option) => Option.filter(option, isValidCachedResult)));
```

- [ ] **Step 3.5: Pass `runId` from phases**

Edit `src/orchestration/phases.ts`. Both `lookupCache` calls (prompt phase and scenario phase) need to pass `runId`:

```typescript
        const cached = yield* lookupCache({
          archiveDir: input.archiveDir,
          artifact: input.manifest.artifact,
          runId: input.manifest.runId,
          promptName: prompt.name,
          promptHash: prompt.promptHash,
          temperature,
          fresh: input.fresh,
        });
```

(Same pattern in the scenario phase, with `scenario.scenarioHash` and `scenario.name`.)

- [ ] **Step 3.6: Update the orchestration cache test**

Edit `src/orchestration/__tests__/cache.test.ts`. Every `lookupCache` call in this file gets a new field:

```typescript
        runId: "r-test",
```

Add a new test asserting runId scoping:

```typescript
  it("returns None when artifact and prompt match but runId differs", async () => {
    // ... seed an archive with manifest runId="r-A" containing a matching result ...
    // ... call lookupCache with runId="r-B" ...
    // ... assert Option.isNone(...) ...
  });
```

(Match the existing pattern in this file for fixture creation.)

- [ ] **Step 3.7: Run all tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3.8: Commit**

```bash
git add -A
git commit -m "feat(cache): scope cross-run lookup to the active runId

CacheKey gains a runId field. findCachedResult skips archives whose
manifest runId does not match (fast-filter) and per-result requires the
runId match too. Phases pass the active manifest's runId into every
lookupCache call. Cache hits no longer cross logical-run boundaries."
```

---

## Task 4: State module — `.run-state.json` lifecycle and id generation

**Goal:** A standalone module that knows how to read, write, and delete `{archiveDir}/.run-state.json`, and how to generate a new run-id of the form `r-{YYYY-MM-DD}-{6-hex}`.

**Files:**
- Create: `src/state/run-state.ts`
- Create: `src/state/__tests__/run-state.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `src/state/__tests__/run-state.test.ts`:

```typescript
import { NodeContext } from "@effect/platform-node";
import { Effect, Option, TestClock, TestContext } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import {
  STATE_FILE_NAME,
  clearRunState,
  generateRunId,
  loadRunState,
  saveRunState,
} from "../run-state.js";

const provideAll = <A, E>(eff: Effect.Effect<A, E, never>): Effect.Effect<A, E, never> =>
  eff.pipe(Effect.provide(NodeContext.layer));

describe("run-state", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("loadRunState returns None when no state file exists", async () => {
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("saveRunState writes JSON; loadRunState reads it back", async () => {
    await Effect.runPromise(
      provideAll(
        saveRunState(dir, { runId: "r-2026-04-25-abcdef", createdAt: "2026-04-25T12:00:00.000Z" }),
      ),
    );
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.runId).toBe("r-2026-04-25-abcdef");
      expect(result.value.createdAt).toBe("2026-04-25T12:00:00.000Z");
    }
  });

  it("clearRunState removes the file", async () => {
    await Effect.runPromise(
      provideAll(
        saveRunState(dir, { runId: "r-x", createdAt: "2026-04-25T12:00:00.000Z" }),
      ),
    );
    await Effect.runPromise(provideAll(clearRunState(dir)));
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("clearRunState is a no-op when no state file exists", async () => {
    await Effect.runPromise(provideAll(clearRunState(dir)));
  });

  it("loadRunState returns None when the state file is corrupt JSON", async () => {
    await fs.writeFile(path.join(dir, STATE_FILE_NAME), "not json{");
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("loadRunState returns None when the state file is shape-invalid", async () => {
    await fs.writeFile(path.join(dir, STATE_FILE_NAME), JSON.stringify({ foo: "bar" }));
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("generateRunId produces r-YYYY-MM-DD-NNNNNN format", async () => {
    const id = await Effect.runPromise(generateRunId());
    expect(id).toMatch(/^r-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
  });

  it("generateRunId date prefix matches the clock", async () => {
    const program = Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-15T03:14:00.000Z"));
      return yield* generateRunId();
    });
    const id = await Effect.runPromise(program.pipe(Effect.provide(TestContext.TestContext)));
    expect(id.startsWith("r-2026-08-15-")).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
npx vitest run src/state/__tests__/run-state.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 4.3: Implement the module**

Create `src/state/run-state.ts`:

```typescript
/**
 * Run-state file management. Persists the active logical-run id in
 * `{archiveDir}/.run-state.json` so that `./bench run` invocations after the
 * first one resume the same logical run rather than starting over.
 *
 * Shape: `{ runId: string, createdAt: string }`. Anything else, parse errors,
 * or read errors are treated as "no state" — we don't fail the run; the
 * caller starts fresh.
 *
 * Cleared by the run command iff the planned cell matrix is fully populated
 * with valid results tagged with the active runId. `--fresh` deletes the
 * file before generating a new id.
 */
import { FileSystem, Path } from "@effect/platform";
import { Clock, Effect, Option, Schema } from "effect";
import { randomBytes } from "node:crypto";

export const STATE_FILE_NAME = ".run-state.json";

const RunState = Schema.Struct({
  runId: Schema.String,
  createdAt: Schema.String,
});
export type RunState = typeof RunState.Type;

const decodeState = Schema.decodeUnknown(RunState);

const stateFilePath = (archiveDir: string) =>
  Effect.gen(function* () {
    const pathMod = yield* Path.Path;
    return pathMod.join(archiveDir, STATE_FILE_NAME);
  });

/**
 * Read the state file. Returns `None` when:
 *   - the file doesn't exist
 *   - the file is unreadable (FS error)
 *   - the contents aren't valid JSON
 *   - the JSON doesn't match the expected shape
 *
 * In all error cases we log a warning and return `None`. The run continues
 * with a fresh id; resume is just unavailable.
 */
export const loadRunState = (
  archiveDir: string,
): Effect.Effect<Option.Option<RunState>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return Option.none<RunState>();

    const contents = yield* fs.readFileString(file).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to read ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    if (Option.isNone(contents)) return Option.none<RunState>();

    const parsed = yield* Effect.try({
      try: () => JSON.parse(contents.value) as unknown,
      catch: (e) => e,
    }).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: corrupt JSON in ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    if (Option.isNone(parsed)) return Option.none<RunState>();

    const decoded = yield* decodeState(parsed.value).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: shape-invalid ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    return decoded;
  });

/**
 * Write the state file (overwriting any existing content). Failures log a
 * warning and complete successfully — the run proceeds without resume
 * available, but should not be aborted just because the disk is grumpy.
 */
export const saveRunState = (
  archiveDir: string,
  state: RunState,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    yield* fs.writeFileString(file, `${JSON.stringify(state)}\n`).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to write ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Delete the state file. No-op if it doesn't exist.
 */
export const clearRunState = (
  archiveDir: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return;
    yield* fs.remove(file).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to delete ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Generate a fresh run-id of shape `r-{YYYY-MM-DD}-{6-hex}`. Date is from
 * the Effect Clock (so tests can pin time); the hex suffix is 24 random
 * bits via `crypto.randomBytes`, which is unaffected by clock control —
 * tests pinning time should not also assume the suffix is deterministic.
 */
export const generateRunId = (): Effect.Effect<string> =>
  Effect.gen(function* () {
    const millis = yield* Clock.currentTimeMillis;
    const date = new Date(millis).toISOString().slice(0, 10);
    const suffix = randomBytes(3).toString("hex");
    return `r-${date}-${suffix}`;
  });
```

- [ ] **Step 4.4: Run the test to confirm pass**

```bash
npx vitest run src/state/__tests__/run-state.test.ts
```

Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add -A
git commit -m "feat(state): add run-state file module

New src/state/run-state.ts: read/write/delete .run-state.json in the
archive dir, plus generateRunId() producing r-YYYY-MM-DD-{6hex}. Errors
on every operation are logged and swallowed — a flaky disk degrades to
no-resume rather than aborting the run."
```

---

## Task 5: Completion module — planned cells and verdict

**Goal:** A standalone function that, given the planned (model × prompt × temperature) + scenario matrix and an active run-id, scans the archive dir and returns whether every cell has a valid result tagged with that id.

**Files:**
- Create: `src/orchestration/completion.ts`
- Create: `src/orchestration/__tests__/completion.test.ts`

- [ ] **Step 5.1: Write failing test**

Create `src/orchestration/__tests__/completion.test.ts`:

```typescript
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { openManifest, sampleResult, samplePrompt } from "../../archive/__tests__/fixtures.js";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import { checkCompletion } from "../completion.js";

describe("checkCompletion", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("returns complete=true when every planned cell has a valid result tagged with runId", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const r = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(true);
    expect(verdict.totalCells).toBe(1);
    expect(verdict.validCells).toBe(1);
  });

  it("returns complete=false when a planned cell has no result", async () => {
    const runId = "r-2026-04-25-bbbbbb";
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.totalCells).toBe(1);
    expect(verdict.validCells).toBe(0);
  });

  it("does not count results from other runIds as valid", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const r = sampleResult({
      runId: "r-other",
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-other", archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.validCells).toBe(0);
  });

  it("does not count error or empty-output results as valid", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const errored = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      error: "boom",
      output: "",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, errored);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
npx vitest run src/orchestration/__tests__/completion.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 5.3: Implement the module**

Create `src/orchestration/completion.ts`:

```typescript
/**
 * Completion verdict for the active logical run. Enumerates the planned cell
 * matrix supplied by the caller (built from the live filtered config), scans
 * the archive directory for results tagged with the active runId, and reports
 * whether every planned cell has a matching valid result.
 *
 * "Valid" mirrors the cache predicate: error === null; non-empty output for
 * prompts; non-null terminationReason for scenarios.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { loadManifest } from "../archive/loader.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import { isValidCachedResult } from "./cache.js";

export interface PlannedCell {
  readonly artifact: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
  readonly kind: "prompt" | "scenario";
}

export interface CompletionVerdict {
  readonly complete: boolean;
  readonly totalCells: number;
  readonly validCells: number;
}

export interface CheckCompletionInput {
  readonly archiveDir: string;
  readonly runId: string;
  readonly plannedCells: ReadonlyArray<PlannedCell>;
}

const cellKey = (c: PlannedCell): string =>
  `${c.artifact}|${c.promptName}|${c.promptHash}|${c.temperature}`;

export const checkCompletion = (
  input: CheckCompletionInput,
): Effect.Effect<
  CompletionVerdict,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;

    const planned = new Map<string, PlannedCell>();
    for (const c of input.plannedCells) planned.set(cellKey(c), c);
    const satisfied = new Set<string>();

    const entries = yield* fs.readDirectory(input.archiveDir).pipe(
      Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
    );
    const archives = entries.filter((e) => e.endsWith(".jsonl"));

    for (const entry of archives) {
      const filePath = pathMod.join(input.archiveDir, entry);
      const loaded = yield* loadManifest(filePath);
      if (loaded.manifest.runId !== input.runId) continue;
      for (const r of loaded.results) {
        if (r.runId !== input.runId) continue;
        if (!isValidCachedResult(r)) continue;
        const key = `${loaded.manifest.artifact}|${r.promptName}|${r.promptHash}|${r.temperature}`;
        if (planned.has(key)) satisfied.add(key);
      }
    }

    const validCells = satisfied.size;
    const totalCells = planned.size;
    return {
      complete: totalCells > 0 && validCells === totalCells,
      totalCells,
      validCells,
    };
  });
```

- [ ] **Step 5.4: Run test to confirm pass**

```bash
npx vitest run src/orchestration/__tests__/completion.test.ts
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add -A
git commit -m "feat(orchestration): add checkCompletion verdict for active runId

Standalone helper that enumerates planned cells and scans archives for
valid results tagged with the active runId. Returns complete/total/valid
counts. Uses the same isValidCachedResult predicate as the cache lookup."
```

---

## Task 6: Wire `runId` through `RunFlags` and `buildRunLoopConfig`

**Goal:** Replace the temporary `"r-pending"` literal placed in Task 1 with a real value supplied by the CLI handler.

**Files:**
- Modify: `src/cli/config/build.ts`

- [ ] **Step 6.1: Add `runId` to `RunFlags`**

Edit `src/cli/config/build.ts`. Add to `RunFlags`:

```typescript
  readonly runId: string;
```

And in `buildRunLoopConfig`, add to the assembled config:

```typescript
  const config: RunLoopConfig = {
    models: params.models,
    promptCorpus: params.promptCorpus,
    scenarioCorpus: scenarios,
    systemPrompts: params.systemPrompts,
    temperatures: params.flags.temperatures,
    archiveDir: params.flags.archiveDir,
    fresh: params.flags.fresh,
    runId: params.flags.runId,
    maxTokens: params.flags.maxTokens,
    ...
```

- [ ] **Step 6.2: Run typecheck**

```bash
npm run typecheck
```

Expected: any test that constructs `RunFlags` directly may need a `runId` literal. Fix each by adding `runId: "r-test"` (or similar). The CLI handler is updated in Task 7.

- [ ] **Step 6.3: Run all tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add -A
git commit -m "feat(cli/config): plumb runId through RunFlags and RunLoopConfig

The CLI handler computes the active runId from .run-state.json (next
commit); this just makes the config layer accept it."
```

---

## Task 7: CLI run command — state lifecycle, planned cells, completion check

**Goal:** The `run` subcommand reads `.run-state.json` (or generates a new id under `--fresh`), passes the id into the run loop, then runs the completion check and clears state on success. `--no-save` skips state entirely.

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 7.1: Add imports**

Add to the top of `src/cli/commands/run.ts`:

```typescript
import { clearRunState, generateRunId, loadRunState, saveRunState } from "../../state/run-state.js";
import { checkCompletion, type PlannedCell } from "../../orchestration/completion.js";
```

- [ ] **Step 7.2: Helper to resolve the active runId**

Above the `runCommand` definition, add:

```typescript
/**
 * Resolve the active runId for this invocation:
 *   --fresh        → delete state, generate new id, write state
 *   --no-save      → ephemeral id; skip state I/O
 *   state present  → reuse cached id (resume)
 *   state absent   → generate new id, write state
 *
 * Returns the id and a flag indicating whether this is a resume.
 */
const resolveRunId = (
  archiveDir: string,
  fresh: boolean,
  noSave: boolean,
) =>
  Effect.gen(function* () {
    if (noSave) {
      const id = yield* generateRunId();
      return { runId: id, resumed: false, ephemeral: true };
    }
    if (fresh) {
      yield* clearRunState(archiveDir);
      const id = yield* generateRunId();
      const createdAt = new Date(yield* Clock.currentTimeMillis).toISOString();
      yield* saveRunState(archiveDir, { runId: id, createdAt });
      return { runId: id, resumed: false, ephemeral: false };
    }
    const existing = yield* loadRunState(archiveDir);
    if (Option.isSome(existing)) {
      return { runId: existing.value.runId, resumed: true, ephemeral: false };
    }
    const id = yield* generateRunId();
    const createdAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    yield* saveRunState(archiveDir, { runId: id, createdAt });
    return { runId: id, resumed: false, ephemeral: false };
  });
```

Add `Clock` to the existing `effect` import:

```typescript
import { Clock, Effect, Layer, Option } from "effect";
```

- [ ] **Step 7.3: Helper to enumerate planned cells**

Below `resolveRunId`, add:

```typescript
const enumeratePlannedCells = (config: import("../../orchestration/run-loop.js").RunLoopConfig): ReadonlyArray<PlannedCell> => {
  const out: PlannedCell[] = [];
  for (const m of config.models) {
    if (config.modelNameFilter !== undefined) {
      const needle = config.modelNameFilter.toLowerCase();
      const haystack = (m.name ?? "").toLowerCase();
      if (!haystack.includes(needle) && !m.artifact.toLowerCase().includes(needle)) continue;
    }
    if (config.quantFilter !== undefined) {
      if (m.quant === undefined || !m.quant.toLowerCase().includes(config.quantFilter.toLowerCase()))
        continue;
    }
    if (config.paramsFilter !== undefined) {
      if (m.params === undefined || !m.params.toLowerCase().includes(config.paramsFilter.toLowerCase()))
        continue;
    }
    if (config.scenariosOnly !== true) {
      for (const p of config.promptCorpus) {
        for (const t of config.temperatures) {
          out.push({
            artifact: m.artifact,
            promptName: p.name,
            promptHash: p.promptHash,
            temperature: t,
            kind: "prompt",
          });
        }
      }
    }
    const t0 = config.temperatures[0];
    if (t0 !== undefined) {
      for (const s of config.scenarioCorpus) {
        out.push({
          artifact: m.artifact,
          promptName: s.name,
          promptHash: s.scenarioHash,
          temperature: t0,
          kind: "scenario",
        });
      }
    }
  }
  return out;
};
```

(Note: the model-filter logic here mirrors `runLoop`'s `matchesName` / `matchesField`. If you want to deduplicate, export those helpers from `run-loop.ts` and import them here. Either approach is fine.)

- [ ] **Step 7.4: Wire state lifecycle into the handler**

In the `runCommand` body, after `normalized.ok` is checked and `flags` is in scope, replace the section that builds config with:

```typescript
    const archiveDir = flags.archiveDir;
    const { runId, resumed, ephemeral } = yield* resolveRunId(
      archiveDir,
      flags.fresh,
      flags.noSave,
    );

    yield* Effect.logInfo(
      resumed
        ? `run ${runId}: resuming`
        : ephemeral
          ? `run ${runId}: ephemeral (--no-save)`
          : `run ${runId}: starting fresh`,
    ).pipe(Effect.annotateLogs("scope", "run"));

    // Load corpora -------------------------------------------------------
    const systemPrompts = yield* loadSystemPrompts(systemPromptsPath(parsed.promptsDir));
    const models = yield* loadModels(parsed.modelsFile);
    const promptCorpus = flags.scenariosOnly
      ? []
      : yield* loadPromptCorpus(parsed.promptsDir).pipe(
          Effect.provide(registryLayer(parsed.promptsDir)),
        );
    const scenarioCorpus = yield* loadScenarioCorpus(scenariosSubdir(parsed.promptsDir)).pipe(
      Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<never>)),
    );

    const config = buildRunLoopConfig({
      flags: { ...flags, runId },
      models,
      promptCorpus,
      scenarioCorpus,
      systemPrompts,
    });
```

- [ ] **Step 7.5: Add the completion check after `runLoop`**

After the `for (const m of outcome.perModel)` summary print loop, add:

```typescript
    if (!ephemeral) {
      const planned = enumeratePlannedCells(config);
      const verdict = yield* checkCompletion({
        archiveDir,
        runId,
        plannedCells: planned,
      });
      if (verdict.complete) {
        yield* clearRunState(archiveDir);
        yield* Effect.logInfo(
          `run ${runId} complete: ${verdict.validCells}/${verdict.totalCells} cells`,
        ).pipe(Effect.annotateLogs("scope", "run"));
      } else {
        yield* Effect.logInfo(
          `run ${runId} partial: ${verdict.validCells}/${verdict.totalCells} cells; rerun ./bench run to continue`,
        ).pipe(Effect.annotateLogs("scope", "run"));
      }
    }
```

- [ ] **Step 7.6: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 7.7: Smoke-check the CLI compiles**

```bash
./bench run --help
```

Expected: usage prints without error. (Don't actually start a run.)

- [ ] **Step 7.8: Commit**

```bash
git add -A
git commit -m "feat(cli/run): transparent run-id with state file and completion check

bench run reads .run-state.json on start (or generates a fresh id under
--fresh), threads the id through the run loop, then runs the completion
check on the planned cell matrix. State file is cleared on full success
and preserved on partial completion so the next invocation resumes."
```

---

## Task 8: Migrate command — produce new shape with synthesized legacy run-id

**Goal:** The Python-prototype migration tool (`bench migrate`) should now produce manifests + results in the new shape — with `archiveId` (from the existing per-archive id) and `runId = "legacy-{archiveId}"`.

**Files:**
- Modify: `src/migrate/reconstruct-manifest.ts`

- [ ] **Step 8.1: Update the reconstruction function**

Read `src/migrate/reconstruct-manifest.ts`. Locate where the manifest is constructed (an object literal building a `RunManifest`). Update it so:
- The existing `runId: <stem>` becomes `archiveId: <stem>`
- A new `runId: \`legacy-${stem}\`` is added

For every `ExecutionResult` constructed in this file, do the same:
- `runId: <stem>` → `archiveId: <stem>`
- Add `runId: \`legacy-${stem}\``

Search for `runId:` in the file (`grep -n 'runId:' src/migrate/reconstruct-manifest.ts`) to find every spot that needs the rename + addition. Task 1 already made these compile via the rename — this task makes them carry the right *value* (legacy-prefixed runId) rather than reusing the archive id.

- [ ] **Step 8.2: Update reconstruct-manifest test**

The test file `src/migrate/reconstruct-manifest.test.ts` very likely asserts on `runId` of the produced manifest. Update those assertions:

- Where the test asserts on the per-archive id, expect `archiveId` to equal the previously expected runId value.
- Add an assertion that `runId === \`legacy-${archiveId}\``.

- [ ] **Step 8.3: Run migrate tests**

```bash
npx vitest run src/migrate
```

Expected: PASS.

- [ ] **Step 8.4: Commit**

```bash
git add -A
git commit -m "feat(migrate): emit new schema shape with legacy- runId

Migrated archives carry archiveId (from the synthesized stem) plus
runId=\"legacy-{archiveId}\" so they are readable by reports but never
satisfy a cache lookup for a real logical run."
```

---

## Task 9: Webapp data shape — surface `run_id`

**Goal:** The webapp's `data.js` records gain a `run_id` field. `BenchmarkResult` and `WebappRecord` interfaces both surface it; `toWebappRecord` populates it from `result.runId`; `normalizeRecord` defaults it for legacy `data.js` files.

**Files:**
- Modify: `webapp/src/lib/data.ts`
- Modify: `src/report/webapp-contract.ts`

- [ ] **Step 9.1: Add `run_id` to `WebappRecord`**

Edit `src/report/webapp-contract.ts`. Add to the interface, in alphabetical-ish order near `executed_at`:

```typescript
  readonly run_id: string;
  readonly executed_at: string;
```

In `toWebappRecord`, add:

```typescript
    run_id: result.runId,
    executed_at: result.executedAt,
```

- [ ] **Step 9.2: Add `run_id` to `BenchmarkResult`**

Edit `webapp/src/lib/data.ts`. Add to the interface, near `executed_at`:

```typescript
  run_id: string;
  executed_at: string;
```

In `normalizeRecord`, add:

```typescript
  run_id: raw.run_id ?? "",
  executed_at: raw.executed_at ?? "",
```

- [ ] **Step 9.3: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: PASS. Webapp tests should also still pass (the field is additive; existing tests don't reference it).

- [ ] **Step 9.4: Commit**

```bash
git add -A
git commit -m "feat(report+webapp): surface run_id in data.js records

WebappRecord and BenchmarkResult both gain run_id. Legacy data.js files
default it to an empty string in normalizeRecord."
```

---

## Task 10: Docs and `.gitignore`

**Files:**
- Modify: `docs/ARCHIVE-FORMAT.md`
- Modify: `docs/GUARANTEES.md`
- Modify: `.gitignore`

- [ ] **Step 10.1: Update `docs/ARCHIVE-FORMAT.md`**

In the `RunManifest` field table, replace the `runId` row with two rows:

```markdown
| `archiveId` | `string` | Per-archive identity; matches the filename stem. (Renamed from earlier `runId`.) |
| `runId` | `string` | Logical-run group id; same value across every archive produced by one `./bench run` invocation, and across resume invocations of the same run. |
```

In the `ExecutionResult` field table, replace the `runId` row with:

```markdown
| `archiveId` | `string` | Back-reference to the owning archive. |
| `runId` | `string` | Denormalized from the manifest; cache scoping key. |
```

Add a new section under "Self-contained archives":

````markdown
## Run state and resume

`./bench run` persists the active logical-run id in
`{archiveDir}/.run-state.json`:

```json
{ "runId": "r-2026-04-25-7f3a9c", "createdAt": "2026-04-25T15:04:32.118Z" }
```

The state file is created on a fresh start, read on subsequent
invocations to resume the same logical run, and removed when every
planned cell has a valid result tagged with that `runId`. `--fresh`
deletes the state file before generating a new id. `--no-save` skips
state I/O entirely; the run gets an ephemeral id thrown away on exit.

Cache lookup is scoped to the active `runId` — only results carrying
that id satisfy a hit, so resume produces a complete dataset under one
id rather than mixing in older archives.

Legacy archives written before the `runId` → `archiveId` rename are
translated by the loader: `archiveId` is synthesized from the old
`runId`, and the new `runId` is set to `legacy-{archiveId}`. They are
readable by reports but cannot satisfy a cache lookup for any
non-legacy run.
````

- [ ] **Step 10.2: Update `docs/GUARANTEES.md`**

Add a brief note under the existing guarantees (find the right section):

```markdown
## Resume guarantees

- Within one logical run (one `runId`), the cross-run cache only returns
  results carrying that `runId`. A `--fresh` re-run is therefore not
  contaminated by older archives even if they match
  `(artifact, promptName, promptHash, temperature)`.
- Interrupted runs are resumable: re-invoking `./bench run` reads
  `.run-state.json`, reuses the same `runId`, and only re-executes
  cells that don't yet have a valid result tagged with that id.
- Completion is computed against the live filtered config every
  invocation; narrowing scope (e.g. dropping a prompt) lets a previously
  partial run complete naturally.
```

- [ ] **Step 10.3: Update `.gitignore`**

The archive directories are already gitignored, so `.run-state.json` inside them is already ignored. Add a defensive top-level entry for any future archive dir at the root:

```
.run-state.json
```

(Add it after the existing `webapp/src/data/data.js` line, in the same group.)

- [ ] **Step 10.4: Commit**

```bash
git add -A
git commit -m "docs+gitignore: document run-id semantics and state file"
```

---

## Task 11: End-to-end resume integration test

**Goal:** A test that simulates an interrupted run: write a partial archive with results tagged runId X, drop a `.run-state.json` pointing at X, then verify `checkCompletion` reports partial; add the missing result; verify `checkCompletion` reports complete.

This is integration-level: it exercises the state module + completion module + loader together, but does not invoke the live LLM stack. We're testing the resume *bookkeeping*, not the run loop.

**Files:**
- Create: `src/state/__tests__/resume-integration.test.ts`

- [ ] **Step 11.1: Write the test**

Create `src/state/__tests__/resume-integration.test.ts`:

```typescript
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { openManifest, sampleResult } from "../../archive/__tests__/fixtures.js";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import { checkCompletion, type PlannedCell } from "../../orchestration/completion.js";
import { clearRunState, loadRunState, saveRunState } from "../run-state.js";

const provideAll = <A, E>(eff: Effect.Effect<A, E, never>) =>
  eff.pipe(Effect.provide(NodeContext.layer));

describe("resume integration", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("partial run: state preserved, missing cell flagged", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const planned: PlannedCell[] = [
      {
        artifact: "art-A",
        promptName: "p1",
        promptHash: "h1",
        temperature: 0.7,
        kind: "prompt",
      },
      {
        artifact: "art-A",
        promptName: "p2",
        promptHash: "h2",
        temperature: 0.7,
        kind: "prompt",
      },
    ];
    const r1 = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });

    await Effect.runPromise(
      provideAll(
        Effect.gen(function* () {
          yield* writeManifestHeader(
            `${dir}/a.jsonl`,
            openManifest({ artifact: "art-A", runId, archiveId: "archive-A" }),
          );
          yield* appendResult(`${dir}/a.jsonl`, r1);
          yield* saveRunState(dir, { runId, createdAt: "2026-04-25T12:00:00.000Z" });
        }),
      ),
    );

    const verdict = await Effect.runPromise(
      provideAll(checkCompletion({ archiveDir: dir, runId, plannedCells: planned })),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.totalCells).toBe(2);
    expect(verdict.validCells).toBe(1);

    // Simulating "next invocation reads the state": loadRunState returns the same id.
    const loaded = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(loaded._tag).toBe("Some");
    if (loaded._tag === "Some") expect(loaded.value.runId).toBe(runId);
  });

  it("completion: state cleared", async () => {
    const runId = "r-2026-04-25-bbbbbb";
    const planned: PlannedCell[] = [
      {
        artifact: "art-A",
        promptName: "p1",
        promptHash: "h1",
        temperature: 0.7,
        kind: "prompt",
      },
    ];
    const r1 = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });

    await Effect.runPromise(
      provideAll(
        Effect.gen(function* () {
          yield* writeManifestHeader(
            `${dir}/a.jsonl`,
            openManifest({ artifact: "art-A", runId, archiveId: "archive-A" }),
          );
          yield* appendResult(`${dir}/a.jsonl`, r1);
          yield* saveRunState(dir, { runId, createdAt: "2026-04-25T12:00:00.000Z" });
        }),
      ),
    );

    const verdict = await Effect.runPromise(
      provideAll(checkCompletion({ archiveDir: dir, runId, plannedCells: planned })),
    );
    expect(verdict.complete).toBe(true);

    // CLI handler would call clearRunState — simulate that:
    await Effect.runPromise(provideAll(clearRunState(dir)));
    const loaded = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(loaded._tag).toBe("None");
  });
});
```

- [ ] **Step 11.2: Run**

```bash
npx vitest run src/state/__tests__/resume-integration.test.ts
```

Expected: PASS.

- [ ] **Step 11.3: Run all tests one final time**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 11.4: Commit**

```bash
git add -A
git commit -m "test(state): integration test for partial / complete run resume"
```

---

## Final checks

- [ ] `git log --oneline` should show ~10 commits authored on this branch covering schema, loader, cache, state, completion, CLI wiring, migrate, webapp/report, docs, integration test.
- [ ] `git status` clean.
- [ ] `./bench run --help` prints (already verified at Step 7.7).
- [ ] No flag changes user-facing — `--fresh` retained, no new flags. Confirm by reading the help output.

## Followups (out of scope, do not do)

- `./bench status` subcommand to print state without running.
- Garbage collection of `legacy-{archiveId}` data.
- User-named run aliases (e.g. `--label=foo`).
