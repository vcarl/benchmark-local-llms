# Phase 4 — Cache + Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeated `./bench submit` runs cheap via a cross-run per-item cache keyed by `(configHash, challengeId, version, itemHash)`, and make interrupted runs resumable by `attemptId`.

**Architecture:** A scorer-inclusive `itemHash` (built on a deterministic scorer serialization) gives every challenge item a stable identity that invalidates on any output- or score-affecting change. `runChallenge` consults a rewritten cache reader (`findCachedItem`) over *completed* attempt archives before each model call, copying a cached `ItemResult` verbatim on a hit. Resume re-resolves config + challenge from CLI args, validates the resolved hashes against the partial archive's header, executes only the missing items, and re-finalizes over the union — distinct from but composable with the cross-run cache (which skips the partial, `interrupted: true` archive).

**Tech Stack:** TypeScript, Effect, @effect/platform, @effect/cli, vitest, Biome.

## Global Constraints

- `Runtime` enum is `Schema.Literal("llamacpp", "mlx")` — never "llama-server".
- `FileIOError` requires `{ path, operation, cause }` (cause stringified).
- Biome bans non-null assertions (`!`) and `throw` in non-test `src/` (`*.test.ts` is exempt from the throw ban).
- No new runtime dependencies.
- Root `npm test` also globs `webapp/src/**/*.test.ts`; the suite count is one combined number.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Modified:**
- `src/config/hashing.ts` — export the existing private `stableStringify` (no behavior change).
- `src/config/challenges.ts` — `scorerKey` uses `stableStringify`; `ResolvedItem` gains `itemHash`, computed in `resolveChallenge`.
- `src/config/challenges.test.ts` — re-pin golden `challengeHash` (red→green by observation); add key-order-independence golden test; assert `itemHash` shape.
- `src/schema/attempt.ts` — `ItemResult` gains required `itemHash: Schema.String`.
- `src/schema/attempt.test.ts` — add `itemHash` to the inline `ItemResult` fixture.
- `src/archive/attempt-writer.test.ts` — add `itemHash` to the inline `item` fixture.
- `src/archive/cache.ts` — ADD `findCachedItem(archiveDir, key)` over the identity model. The legacy `findCachedResult` (still wired into the live `run` path via `src/orchestration/cache.ts` → `phases.ts`) STAYS — adding alongside, not replacing.
- `src/orchestration/run-challenge.ts` — per-item execute-or-cache; stamp `itemHash` on misses; honor `noCache` + resume (skip-existing + re-aggregate over union); extract a shared per-item helper.
- `src/cli/commands/submit.ts` — add `--no-cache` and `--resume <attemptId>` flags; thread into `runChallenge`.
- `src/report/webapp-contract.test.ts`, `src/report/load-attempts.test.ts`, `src/report/index.test.ts`, `src/report/aggregate.test.ts` — add `itemHash` to inline `ItemResult` fixtures so the report suite stays green.

**Created:**
- `src/archive/__tests__/find-cached-item.test.ts` — unit tests for `findCachedItem` vs fixture attempt archives. (Co-located beside the existing `src/archive/__tests__/cache.test.ts`, which tests the legacy `findCachedResult` and is LEFT UNTOUCHED.)

---

### Task 1: Deterministic scorer serialization + re-pin golden hashes

Export `stableStringify`, switch `scorerKey` to use it, re-pin the golden `challengeHash` values red→green, and add a key-order-independence golden test. This task is FIRST because changing `scorerKey`'s internals shifts any `challengeHash` whose scorer was not already in sorted-key order — and Task 2's `itemHash` depends on the now-deterministic `scorerKey`.

**Files:**
- Modify: `src/config/hashing.ts:46` (widen visibility of `stableStringify`)
- Modify: `src/config/challenges.ts:25` (`scorerKey` body)
- Test: `src/config/challenges.test.ts:95` (golden re-pin) + new key-order test

**Interfaces:**
- Consumes: existing `stableStringify(value: unknown): string` (`src/config/hashing.ts:46`); existing `scorerKey(s: ScorerConfig): string` (`src/config/challenges.ts:25`).
- Produces: `export const stableStringify: (value: unknown) => string`; `scorerKey` now order-independent (signature unchanged).

- [ ] **Step 1: Export `stableStringify`**

In `src/config/hashing.ts`, change line 46 from:

```ts
const stableStringify = (value: unknown): string => {
```

to:

```ts
export const stableStringify = (value: unknown): string => {
```

(No other change — `computeScenarioHash` already calls it; widening visibility is safe.)

- [ ] **Step 2: Swap `scorerKey` to use `stableStringify`**

In `src/config/challenges.ts`, add `stableStringify` to the existing hashing import (line 8) and change `scorerKey` (line 25).

Change the import:

```ts
import { shortSha256 } from "./hashing.js";
```

to:

```ts
import { shortSha256, stableStringify } from "./hashing.js";
```

Change line 25:

```ts
const scorerKey = (s: ScorerConfig): string => JSON.stringify(s);
```

to:

```ts
const scorerKey = (s: ScorerConfig): string => stableStringify(s);
```

- [ ] **Step 3: Run the golden test to OBSERVE the new `challengeHash` (expected: FAIL)**

Run: `npm test -- src/config/challenges.test.ts`

Expected: FAIL on the golden test at `src/config/challenges.test.ts:95`. The failure message reports the actual produced value vs the old pin, e.g.:

```
AssertionError: expected '<NEW_12HEX>' to be '9c2d6d88c900'
- Expected: "9c2d6d88c900"
+ Received: "<NEW_12HEX>"
```

Copy the exact 12-hex value from the `Received:` line — that is the new pin. Do NOT hand-compute it.

> NOTE: the synthetic golden's two scorers are `{ type: "exact_match", expected: "4", extract: "(\\d+)" }` and `{ type: "constraint", constraints: [{ check: "valid_json", name: "j" }] }`. `stableStringify` sorts object keys, so the second scorer's serialization changes from insertion order (`{"type":...,"constraints":[{"check":...,"name":...}]}`) to sorted order (`{"constraints":[{"check":...,"name":...}],"type":...}`), which is exactly why the hash moves. The first scorer's keys are already alphabetical-ish but stable-stringify still reorders to `{"expected":...,"extract":...,"type":...}`, so the hash WILL shift. The real-corpus pins (the `it.each` block at `src/config/challenges.test.ts:110-127`) assert only `/^[0-9a-f]{12}$/`, so they do NOT need a literal re-pin — verify they still pass after Step 5.

- [ ] **Step 4: Pin the observed value**

In `src/config/challenges.test.ts:95`, replace the old pin with the value observed in Step 3:

```ts
  expect(exit.value.challengeHash).toBe("<NEW_12HEX>");
```

- [ ] **Step 5: Add the key-order-independence golden test**

Append to `src/config/challenges.test.ts`:

```ts
it("challengeHash is independent of scorer key insertion order (stableStringify)", async () => {
  // Same scorer, keys inserted in two different orders. Order must not matter.
  const orderA = {
    id: "g",
    version: 1,
    passThreshold: 0.8,
    items: [{ prompt: "a", scorer: { type: "exact_match", expected: "4", extract: "(\\d+)" } }],
  };
  const orderB = {
    id: "g",
    version: 1,
    passThreshold: 0.8,
    items: [{ prompt: "a", scorer: { extract: "(\\d+)", type: "exact_match", expected: "4" } }],
  };
  const corpus = [stub("a", "aaaaaaaaaaaa", { type: "exact_match", expected: "4", extract: "(\\d+)" })];
  const ha = await Effect.runPromise(resolveChallenge(orderA as never, corpus));
  const hb = await Effect.runPromise(resolveChallenge(orderB as never, corpus));
  expect(ha.challengeHash).toBe(hb.challengeHash);
});
```

- [ ] **Step 6: Run the full suite, verify green**

Run: `npm test -- src/config/challenges.test.ts`

Expected: PASS — the re-pinned golden, the new key-order test, and the real-corpus `it.each` cases all green.

- [ ] **Step 7: Commit**

```bash
git add src/config/hashing.ts src/config/challenges.ts src/config/challenges.test.ts
git commit -m "feat(config): deterministic scorerKey via stableStringify; re-pin challengeHash golden"
```

(commit body ends with the Co-Authored-By trailer.)

---

### Task 2: `itemHash` on `ResolvedItem` + required `ItemResult.itemHash`

Add the scorer-inclusive `itemHash` to `ResolvedItem` (computed in `resolveChallenge`) and a required `itemHash: Schema.String` to the `ItemResult` schema, then update every inline `ItemResult` fixture so the suite stays green. `itemHash = shortSha256(\`${promptHash}|${scorerKey(scorer)}\`)`, deterministic via Task 1.

**Files:**
- Modify: `src/config/challenges.ts:11` (`ResolvedItem`), `:44-50` (compute in `resolveChallenge`)
- Modify: `src/schema/attempt.ts:6` (`ItemResult` struct)
- Test: `src/config/challenges.test.ts` (assert `itemHash` shape), `src/schema/attempt.test.ts:15` (fixture), `src/archive/attempt-writer.test.ts:34` (fixture), `src/report/webapp-contract.test.ts`, `src/report/load-attempts.test.ts`, `src/report/index.test.ts`, `src/report/aggregate.test.ts` (fixtures)

**Interfaces:**
- Consumes: `scorerKey(s: ScorerConfig): string` and `shortSha256` (Task 1); `promptHash` on `PromptCorpusEntry`.
- Produces: `ResolvedItem` gains `readonly itemHash: string`; `ItemResult` schema gains required `itemHash: Schema.String` (so `ItemResult.Type` has `itemHash: string`).

- [ ] **Step 1: Write the failing schema test**

In `src/schema/attempt.test.ts`, the existing "decodes an ItemResult" test (line 14) constructs an `ItemResult` WITHOUT `itemHash`. Add the field to that fixture AND add an assertion that decoding fails when it is absent. Replace the body of the first `it(...)` (lines 14-33) with:

```ts
  it("decodes an ItemResult with required itemHash", () => {
    const v = {
      itemId: "json-output",
      promptName: "json-output",
      promptHash: "abc123abc123",
      itemHash: "ddeeff001122",
      executedAt: "2026-06-18T00:00:00.000Z",
      promptTokens: 10,
      generationTokens: 20,
      promptTps: 1,
      generationTps: 2,
      peakMemoryGb: 0,
      wallTimeSec: 1.5,
      output: "ok",
      reasoning: null,
      rawOutput: "ok",
      error: null,
      score: 1,
    };
    const decoded = Schema.decodeUnknownSync(ItemResult)(v);
    expect(decoded.score).toBe(1);
    expect(decoded.itemHash).toBe("ddeeff001122");
  });

  it("rejects an ItemResult missing itemHash", () => {
    const { itemHash: _omit, ...without } = {
      itemId: "x", promptName: "x", promptHash: "p", itemHash: "h",
      executedAt: "t", promptTokens: 0, generationTokens: 0, promptTps: 0,
      generationTps: 0, peakMemoryGb: 0, wallTimeSec: 0, output: "", reasoning: null,
      rawOutput: "", error: null, score: 0,
    };
    expect(() => Schema.decodeUnknownSync(ItemResult)(without)).toThrow();
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/schema/attempt.test.ts`

Expected: FAIL — `decoded.itemHash` is `undefined` (field not in schema) and the "rejects" test does not throw (schema currently accepts the extra-less object).

- [ ] **Step 3: Add the field to the `ItemResult` schema**

In `src/schema/attempt.ts`, add `itemHash` right after `promptHash` (line 9). Change:

```ts
  promptName: Schema.String,
  promptHash: Schema.String,
  executedAt: Schema.String,
```

to:

```ts
  promptName: Schema.String,
  promptHash: Schema.String,
  itemHash: Schema.String,
  executedAt: Schema.String,
```

- [ ] **Step 4: Run the schema test, verify it passes**

Run: `npm test -- src/schema/attempt.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Add `itemHash` to `ResolvedItem` and compute it in `resolveChallenge`**

In `src/config/challenges.ts`, add the field to `ResolvedItem` (line 11):

```ts
export interface ResolvedItem {
  readonly itemId: string;
  readonly promptHash: string;
  readonly itemHash: string;
  readonly scorer: ScorerConfig;
  readonly prompt: PromptCorpusEntry;
}
```

Then in the `resolveChallenge` per-item block (lines 44-50), compute `itemHash` and add it to the returned object:

```ts
        const scorer = item.scorer ?? prompt.scorer;
        const itemHash = shortSha256(`${prompt.promptHash}|${scorerKey(scorer)}`);
        return {
          itemId: prompt.name,
          promptHash: prompt.promptHash,
          itemHash,
          scorer,
          prompt,
        } satisfies ResolvedItem;
```

- [ ] **Step 6: Add an `itemHash`-shape assertion to the resolveChallenge test**

In `src/config/challenges.test.ts`, in the first `resolveChallenge` test (the `.then((r) => {...})` block at line 49), add:

```ts
      expect(r.challengeHash).toHaveLength(12);
      expect(r.items.at(0)?.itemHash).toMatch(/^[0-9a-f]{12}$/);
      expect(r.items.at(0)?.itemHash).not.toBe(r.items.at(1)?.itemHash);
```

- [ ] **Step 7: Fix the inline `ItemResult` fixtures across the suite**

These files construct an `ItemResult` inline and will fail to type-check / decode now that `itemHash` is required. Add `itemHash` to each:

`src/archive/attempt-writer.test.ts` — in the `const item = {...}` fixture (line 34), add after `promptHash`:

```ts
  itemHash: "0a1b2c3d4e5f",
```

`src/report/webapp-contract.test.ts` — in the `item` helper's default object, add `itemHash: "ih"` after `promptHash: "h"`.

`src/report/load-attempts.test.ts` — in the `ITEM` JSON object (line 33), add `itemHash: "ih"` after `promptHash: "h"`.

`src/report/index.test.ts` — in the `ITEM` JSON object, add `itemHash: "ih"` after `promptHash: "h"`.

`src/report/aggregate.test.ts` — in the `att(...)` helper's `items[0]` object, add `itemHash: "ih"` after `promptHash: "h"`.

> NOTE: `src/orchestration/__tests__/run-challenge-smoke.test.ts` decodes `ItemResult` FROM DISK (it does not construct one inline); it will only pass once Task 4 makes `runChallenge` stamp `itemHash`. Leave it for now — it is exercised in Task 4. If it goes red on this task's full run, that is expected and resolved by Task 4. To keep this task's commit green in isolation, run the targeted suites in Step 8 rather than the whole repo; the whole-repo gate lands in Task 4.

- [ ] **Step 8: Run the affected suites, verify green**

Run: `npm test -- src/schema/attempt.test.ts src/config/challenges.test.ts src/archive/attempt-writer.test.ts src/report/`

Expected: PASS. (`run-challenge.ts`'s inline `row` does not yet set `itemHash`, so `npm run typecheck` on `run-challenge.ts` is deferred to Task 4 — do not run the full repo gate here.)

- [ ] **Step 9: Commit**

```bash
git add src/config/challenges.ts src/config/challenges.test.ts src/schema/attempt.ts src/schema/attempt.test.ts src/archive/attempt-writer.test.ts src/report/webapp-contract.test.ts src/report/load-attempts.test.ts src/report/index.test.ts src/report/aggregate.test.ts
git commit -m "feat(config): scorer-inclusive itemHash on ResolvedItem + required ItemResult.itemHash"
```

---

### Task 3: Add the cross-run cache reader (`findCachedItem`)

Add `findCachedItem` to `src/archive/cache.ts`, keyed on the identity model and reading only *completed* attempt archives, tie-breaking by the matched item's `executedAt`. **IMPORTANT:** the legacy `findCachedResult` (keyed on `ExecutionResult`) is STILL WIRED into the live `run` command (`src/orchestration/cache.ts` → `phases.ts` → `run-loop.ts` → `src/cli/commands/run.ts`) and into `src/orchestration/completion.ts`. Deleting it would break the `run` path and ~13 passing tests — out of scope (Non-goal: the legacy `run` path is unchanged). So this task is ADDITIVE: append `findCachedItem` + its `CacheKey` to the same file, leaving `findCachedResult`, the legacy `CacheKey` (rename it to avoid a name clash — see Step 3), and `src/archive/__tests__/cache.test.ts` intact.

**Files:**
- Modify (additive): `src/archive/cache.ts`
- Create: `src/archive/__tests__/find-cached-item.test.ts`

**Interfaces:**
- Consumes: `AttemptManifest`, `ItemResult` (`src/schema/attempt.ts`); `FileIOError`, `JsonlCorruptLine` (`src/errors/index.js`); `FileSystem`, `Path` (`@effect/platform`); `Effect`, `Option`, `Schema`.
- Produces (the new `CacheKey` export takes over the name; the legacy interface is renamed `LegacyCacheKey` in Step 3 since it is referenced only within `cache.ts`):
  ```ts
  export interface CacheKey {
    readonly configHash: string;
    readonly challengeId: string;
    readonly challengeVersion: number;
    readonly itemHash: string;
  }
  export const findCachedItem: (
    archiveDir: string,
    key: CacheKey,
  ) => Effect.Effect<
    Option.Option<ItemResult>,
    FileIOError | JsonlCorruptLine,
    FileSystem.FileSystem | Path.Path
  >;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/archive/__tests__/find-cached-item.test.ts` (note: imports from `../cache.js`, one dir up — the legacy `__tests__/cache.test.ts` already uses this convention):

```ts
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { type CacheKey, findCachedItem } from "../cache.js";

const header = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    attemptId: "att-x",
    startedAt: "2026-01-01T00:00:00Z",
    finishedAt: "2026-01-01T00:01:00Z",
    interrupted: false,
    configId: "cfg",
    configHash: "ch",
    artifact: "qwen",
    runtime: "llamacpp",
    quant: "q4",
    temperature: 0,
    systemPrompt: "concise",
    maxTokens: 512,
    challengeId: "code",
    challengeVersion: 1,
    challengeHash: "xh",
    env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
    aggregate: { score: 1, passed: true },
    ...over,
  });

const item = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    itemId: "i1",
    promptName: "i1",
    promptHash: "ph",
    itemHash: "ih-target",
    executedAt: "2026-01-01T00:00:30Z",
    promptTokens: 10,
    generationTokens: 100,
    promptTps: 1,
    generationTps: 1,
    peakMemoryGb: 0,
    wallTimeSec: 2,
    output: "o",
    reasoning: null,
    rawOutput: "o",
    error: null,
    score: 1,
    ...over,
  });

const KEY: CacheKey = {
  configHash: "ch",
  challengeId: "code",
  challengeVersion: 1,
  itemHash: "ih-target",
};

const run = <A>(
  eff: Effect.Effect<A, unknown, FileSystem.FileSystem | import("@effect/platform").Path.Path>,
  files: Record<string, string>,
  dir: string,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(dir, { recursive: true });
      for (const [name, body] of Object.entries(files)) {
        yield* fs.writeFileString(`${dir}/${name}`, body);
      }
      return yield* eff;
    }).pipe(Effect.provide(NodeContext.layer)),
  );

describe("findCachedItem", () => {
  it("returns the matching item from a completed attempt", async () => {
    const dir = `/tmp/p4-cache-hit-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header()}\n${item()}\n` },
      dir,
    );
    expect(Option.isSome(res)).toBe(true);
    if (Option.isSome(res)) expect(res.value.itemHash).toBe("ih-target");
  });

  it("misses when configHash differs", async () => {
    const dir = `/tmp/p4-cache-cfg-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header({ configHash: "other" })}\n${item()}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("misses when itemHash differs", async () => {
    const dir = `/tmp/p4-cache-ih-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header()}\n${item({ itemHash: "other" })}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("misses when challengeVersion differs", async () => {
    const dir = `/tmp/p4-cache-ver-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header({ challengeVersion: 2 })}\n${item()}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("ignores incomplete attempts (interrupted or unfinalized)", async () => {
    const dir = `/tmp/p4-cache-incomplete-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      {
        "a.jsonl": `${header({ interrupted: true })}\n${item()}\n`,
        "b.jsonl": `${header({ finishedAt: null })}\n${item()}\n`,
      },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("tie-breaks on the matched item's executedAt (most recent wins)", async () => {
    const dir = `/tmp/p4-cache-tie-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      {
        "old.jsonl": `${header()}\n${item({ executedAt: "2026-01-01T00:00:00Z", output: "old" })}\n`,
        "new.jsonl": `${header()}\n${item({ executedAt: "2026-06-01T00:00:00Z", output: "new" })}\n`,
      },
      dir,
    );
    expect(Option.isSome(res)).toBe(true);
    if (Option.isSome(res)) expect(res.value.output).toBe("new");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/archive/__tests__/find-cached-item.test.ts`

Expected: FAIL — `findCachedItem` is not exported (the file currently exports only `findCachedResult` and the legacy `CacheKey`).

- [ ] **Step 3: Append `findCachedItem` to `src/archive/cache.ts` (additive — do NOT delete `findCachedResult`)**

First, rename the legacy `CacheKey` interface to `LegacyCacheKey` so the new export can own the `CacheKey` name. In `src/archive/cache.ts`, change line 29 `export interface CacheKey {` → `interface LegacyCacheKey {` (drop `export` — it is only used internally by `matchesKey` and `findCachedResult`), and update the two references at the old lines 37 and 55 (`key: CacheKey` → `key: LegacyCacheKey`).

Then extend the imports at the top of the file and APPEND the new reader. Add to the existing imports:

```ts
import { Effect, Option, Schema } from "effect";
import { AttemptManifest, type ItemResult, ItemResult as ItemResultSchema } from "../schema/attempt.js";
```

(The file already imports `Effect, Option` from `effect` and `FileSystem, Path`; add `Schema`. Keep the existing `loadManifest`/`ExecutionResult` imports — `findCachedResult` still needs them.)

Append this block to the END of the file (after `findCachedResult`):

```ts
/**
 * Cross-run item cache lookup. Scans completed attempt archives in
 * `archiveDir` for a previously executed-and-scored `ItemResult` whose
 * identity matches `key`, so `runChallenge` can copy it verbatim instead of
 * re-running the model.
 *
 * Key shape: `(configHash, challengeId, challengeVersion, itemHash)`. The
 * header pins config + challenge identity; `itemHash` (scorer-inclusive) pins
 * the per-item content + scoring rules, so an edited scorer invalidates the
 * cache even without a `challengeVersion` bump.
 *
 * Only *completed* attempts are eligible: `finishedAt !== null` AND
 * `interrupted === false` (mirrors `isCompleted` in the report path). This is
 * why the cache skips a partial archive being resumed — resume reads that
 * archive's body explicitly instead.
 *
 * Tie-break: if multiple archives hold a matching item, return the one with
 * the most recent matched-item `executedAt` (not file mtime — a re-run keeps
 * the old file, and the item's own timestamp is what the operator cares about).
 *
 * (Imports `Schema`, `AttemptManifest`, and `ItemResult`/`ItemResultSchema` are
 * added to the file's existing import block per Step 3 above — not repeated here.)
 */
export interface CacheKey {
  readonly configHash: string;
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly itemHash: string;
}

const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResultSchema);

/** Eligible only if the attempt is completed (mirrors report `isCompleted`). */
const isCompleted = (m: AttemptManifest): boolean =>
  m.finishedAt !== null && m.interrupted === false;

const headerMatches = (m: AttemptManifest, key: CacheKey): boolean =>
  m.configHash === key.configHash &&
  m.challengeId === key.challengeId &&
  m.challengeVersion === key.challengeVersion;

/**
 * Scan every `*.jsonl` under `archiveDir` (non-recursive) for a cached
 * `ItemResult` matching `key` in a completed attempt. Returns the most recent
 * match by the matched item's `executedAt`, or `None` if nothing matches.
 *
 * A directory-read failure surfaces as `FileIOError`. A header or body line
 * that fails to parse for a given file causes that file to be skipped (it is
 * never a cache hit); the file-read itself surfaces as `FileIOError`.
 */
export const findCachedItem = (
  archiveDir: string,
  key: CacheKey,
): Effect.Effect<
  Option.Option<ItemResult>,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;

    const entries = yield* fs.readDirectory(archiveDir).pipe(
      Effect.mapError(
        (cause) => new FileIOError({ path: archiveDir, operation: "readDirectory", cause: String(cause) }),
      ),
    );
    const archives = entries.filter((e) => e.endsWith(".jsonl")).sort();

    let best: ItemResult | null = null;
    for (const entry of archives) {
      const filePath = pathMod.join(archiveDir, entry);
      const source = yield* fs.readFileString(filePath).pipe(
        Effect.mapError(
          (cause) => new FileIOError({ path: filePath, operation: "readFileString", cause: String(cause) }),
        ),
      );
      const lines = source.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length === 0) continue;

      // Header: decode-or-skip (a malformed/legacy header is not a cache hit).
      const headerJson = yield* Effect.try({
        try: () => JSON.parse(lines[0] as string) as unknown,
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => null));
      if (headerJson === null) continue;
      const manifestOpt = yield* decodeManifest(headerJson).pipe(
        Effect.option,
      );
      if (Option.isNone(manifestOpt)) continue;
      const manifest = manifestOpt.value;
      if (!isCompleted(manifest)) continue;
      if (!headerMatches(manifest, key)) continue;

      for (let i = 1; i < lines.length; i++) {
        const itemJson = yield* Effect.try({
          try: () => JSON.parse(lines[i] as string) as unknown,
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));
        if (itemJson === null) continue;
        const itemOpt = yield* decodeItem(itemJson).pipe(Effect.option);
        if (Option.isNone(itemOpt)) continue;
        const item = itemOpt.value;
        if (item.itemHash !== key.itemHash) continue;
        if (best === null || item.executedAt > best.executedAt) best = item;
      }
    }

    return best === null ? Option.none() : Option.some(best);
  });
```

> NOTE for implementer: `decodeManifest`/`decodeItem` return a `ParseError` in the error channel; `.pipe(Effect.option)` converts decode failure to `Option.none()` so a malformed line skips that file/line rather than aborting the scan. `JsonlCorruptLine` stays in the declared error union for parity with the legacy reader's signature even though this implementation does not raise it (decode failures are swallowed to `None`); leaving it declared keeps the channel forward-compatible and matches the spec's stated signature. If Biome complains about the unused `JsonlCorruptLine` import, keep the `type`-only import as written — it is referenced in the return type.

- [ ] **Step 4: Run the new test + the legacy cache test, verify both green**

Run: `npm test -- src/archive/__tests__/find-cached-item.test.ts src/archive/__tests__/cache.test.ts`

Expected: PASS — the new `findCachedItem` suite (6 tests) AND the untouched legacy `findCachedResult` suite (the `LegacyCacheKey` rename is internal, so it stays green).

- [ ] **Step 5: Confirm the legacy `run` path still type-checks**

Run: `npm run typecheck`

Expected: clean. The `LegacyCacheKey` rename is internal to `cache.ts` (the type was never imported elsewhere — `src/orchestration/cache.ts` builds the key object inline), so `findCachedResult`, `lookupCache`, `phases.ts`, and `completion.ts` are unaffected.

```bash
grep -rn "findCachedResult\|LegacyCacheKey" src
```

Expected: `findCachedResult` still defined + used by `src/orchestration/cache.ts`; `LegacyCacheKey` referenced only within `src/archive/cache.ts`. Do NOT delete `findCachedResult` or `src/archive/__tests__/cache.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/archive/cache.ts src/archive/__tests__/find-cached-item.test.ts
git commit -m "feat(archive): add findCachedItem cross-run reader over completed attempt archives"
```

---

### Task 4: Wire the cache into `runChallenge` + `--no-cache`

Per item, before `runPrompt`, query `findCachedItem`. On HIT: copy the cached `ItemResult` verbatim, `appendItem`, push to `scored`, skip the model call. On MISS: execute as today, stamping `itemHash`. Add a `noCache` input flag (default cache ON) and a `--no-cache` CLI option. Extract the per-item "execute-or-cache → `ItemResult`" step into a shared helper (reused by resume in Task 5).

**Files:**
- Modify: `src/orchestration/run-challenge.ts` (`RunChallengeInput`, per-item loop, extract helper)
- Modify: `src/cli/commands/submit.ts` (add `--no-cache`, thread `noCache`)
- Test: `src/orchestration/__tests__/run-challenge-cache.test.ts` (CREATE; mirror the smoke test's fake-LLM setup)

**Interfaces:**
- Consumes: `findCachedItem(archiveDir, key)` + `CacheKey` (Task 3); `ResolvedItem.itemHash`, `ResolvedConfiguration.configHash` (Task 2); existing `appendItem`, `runPrompt`, `scoreByConfig`, `aggregate`.
- Produces:
  - `RunChallengeInput` gains `readonly archiveDir: string` (the dir to scan for cache hits — distinct from `archivePath`, the file being written) and `readonly noCache?: boolean` (default `false` → cache ON).
  - `executeOrCacheItem(input: RunChallengeInput, item: ResolvedItem): Effect.Effect<ItemResult, FileIOError | JsonlCorruptLine, FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion>` — the shared per-item helper. NOTE: `findCachedItem` widens `runChallenge`'s error channel to include `JsonlCorruptLine`.

- [ ] **Step 1: Write the failing test**

Create `src/orchestration/__tests__/run-challenge-cache.test.ts`:

```ts
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { runChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

const SCORE_1 = "4";

const config: ResolvedConfiguration = {
  id: "smoke-config",
  artifact: "fake-artifact",
  runtime: "mlx",
  temperature: 0,
  systemPrompt: "direct",
  maxTokens: 128,
  systemPromptText: "Be concise.",
  configHash: "cfg-hash",
};

const env = {
  hostname: "test", platform: "test", runtimeVersion: "test",
  nodeVersion: "test", benchmarkGitSha: "test",
};

const makeChallenge = (): ResolvedChallenge => {
  const prompt = samplePromptExact();
  const item: ResolvedItem = {
    itemId: prompt.name,
    promptHash: prompt.promptHash,
    itemHash: "ih-fixed",
    scorer: prompt.scorer,
    prompt,
  };
  return { id: "cache-ch", version: 1, passThreshold: 0.5, challengeHash: "cache-hash", items: [item] };
};

describe("runChallenge cache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const okStub = () =>
    makeChatCompletionMock(
      {},
      {
        kind: "ok",
        result: { output: SCORE_1, reasoning: null, promptTokens: 5, generationTokens: 5, promptTps: 0, generationTps: 0 },
      },
    );

  it("run 1 populates; run 2 with cache ON makes zero model calls and yields an identical aggregate", async () => {
    const challenge = makeChallenge();

    const m1 = okStub();
    const r1 = await Effect.runPromise(
      runChallenge({
        config, challenge, attemptId: "att-1", archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m1.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );
    expect(m1.log.calls.length).toBe(1); // executed

    const m2 = okStub();
    const r2 = await Effect.runPromise(
      runChallenge({
        config, challenge, attemptId: "att-2", archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m2.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );
    expect(m2.log.calls.length).toBe(0); // cache hit, no model call
    expect(r2.aggregate).toEqual(r1.aggregate);
  });

  it("--no-cache re-executes even with a populated archive", async () => {
    const challenge = makeChallenge();
    const m1 = okStub();
    await Effect.runPromise(
      runChallenge({
        config, challenge, attemptId: "att-1", archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m1.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );

    const m2 = okStub();
    await Effect.runPromise(
      runChallenge({
        config, challenge, attemptId: "att-2", archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`, env, deps: fakeDeps(), noCache: true,
      }).pipe(Effect.provide(m2.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );
    expect(m2.log.calls.length).toBe(1); // re-executed despite cache
  });

  it("scorer staleness: an edited scorer changes itemHash → cache MISS", async () => {
    const base = makeChallenge();
    const m1 = okStub();
    await Effect.runPromise(
      runChallenge({
        config, challenge: base, attemptId: "att-1", archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m1.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );

    // Same prompt, different itemHash (simulating an edited scorer's new hash).
    const edited: ResolvedChallenge = {
      ...base,
      items: [{ ...base.items[0]!, itemHash: "ih-edited" }],
    };
    const m2 = okStub();
    await Effect.runPromise(
      runChallenge({
        config, challenge: edited, attemptId: "att-2", archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m2.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );
    expect(m2.log.calls.length).toBe(1); // MISS → re-executed
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/orchestration/__tests__/run-challenge-cache.test.ts`

Expected: FAIL — `RunChallengeInput` has no `archiveDir`/`noCache` and `runChallenge` does not consult the cache (run 2 issues a model call). Likely a type error on the extra input fields first.

- [ ] **Step 3: Extend `RunChallengeInput` and stamp `itemHash` on the executed `row`**

In `src/orchestration/run-challenge.ts`, add the cache reader import:

```ts
import { findCachedItem } from "../archive/cache.js";
```

Add `JsonlCorruptLine` to the errors import (currently `import type { FileIOError } from "../errors/index.js";`):

```ts
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
```

Extend `RunChallengeInput` (the existing interface at line 48):

```ts
export interface RunChallengeInput {
  readonly config: ResolvedConfiguration;
  readonly challenge: ResolvedChallenge;
  readonly attemptId: string;
  /** Directory scanned for cross-run cache hits (the archive root). */
  readonly archiveDir: string;
  readonly archivePath: string;
  readonly env: RunEnv;
  /** When true, bypass the cross-run cache and always execute. Default false (cache ON). */
  readonly noCache?: boolean;
  /** Same deps bundle submit.ts builds; only `.llmServer` is used here. */
  readonly deps: RunModelDeps;
}
```

- [ ] **Step 4: Extract `executeOrCacheItem` and use it in the loop**

Add the shared helper above `runChallenge` (after `baseHeader`). It does NOT write to the archive or push to `scored` — the caller does both (so resume can reuse it identically). It returns the `ItemResult` (cached verbatim or freshly executed-and-stamped):

```ts
/**
 * Resolve one challenge item to an `ItemResult`: cross-run cache hit (copied
 * verbatim — original executedAt/tokens/wallTime preserved so efficiency still
 * reflects true measured cost) or a fresh model execution stamped with
 * `itemHash`. Does NOT append or aggregate — the caller owns archive writes.
 */
export const executeOrCacheItem = (
  input: RunChallengeInput,
  item: ResolvedItem,
): Effect.Effect<
  ItemResult,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion
> =>
  Effect.gen(function* () {
    if (input.noCache !== true) {
      const cached = yield* findCachedItem(input.archiveDir, {
        configHash: input.config.configHash,
        challengeId: input.challenge.id,
        challengeVersion: input.challenge.version,
        itemHash: item.itemHash,
      });
      if (Option.isSome(cached)) return cached.value;
    }

    const exec = yield* runPrompt({
      archiveId: input.attemptId,
      runId: input.attemptId,
      model: modelFromConfig(input.config),
      prompt: item.prompt,
      systemPrompt: input.config.systemPromptText,
      temperature: input.config.temperature,
      maxTokens: input.config.maxTokens,
    });

    const scoreResult = yield* scoreByConfig(exec.output, item.scorer, {
      promptName: item.itemId,
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed({ kind: "prompt" as const, score: 0, details: "scorer error" }),
      ),
    );

    return {
      itemId: item.itemId,
      promptName: item.itemId,
      promptHash: item.promptHash,
      itemHash: item.itemHash,
      executedAt: exec.executedAt,
      promptTokens: exec.promptTokens,
      generationTokens: exec.generationTokens,
      promptTps: exec.promptTps,
      generationTps: exec.generationTps,
      peakMemoryGb: exec.peakMemoryGb,
      wallTimeSec: exec.wallTimeSec,
      output: exec.output,
      reasoning: exec.reasoning,
      rawOutput: exec.rawOutput,
      error: exec.error,
      score: exec.error === null ? scoreResult.score : 0,
    } satisfies ItemResult;
  });
```

Add `Option` to the effect import (line 15 is `import { Clock, Effect } from "effect";`):

```ts
import { Clock, Effect, Option } from "effect";
```

Replace the per-item loop body in `runChallenge` (the block at lines 121-162, from `const scored: ItemResult[] = [];` through the closing of the `for` loop) with:

```ts
      const scored: ItemResult[] = [];
      for (const item of input.challenge.items) {
        const row = yield* executeOrCacheItem(input, item);
        yield* appendItem(input.archivePath, row);
        scored.push(row);
      }
```

Update `runChallenge`'s declared error channel to add `JsonlCorruptLine` (the return type at lines 104-109):

```ts
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion
> =>
```

Remove the now-unused `scoreByConfig`/`runPrompt` references from the loop (they moved into the helper) — they are still imported and used by `executeOrCacheItem`, so the imports stay.

- [ ] **Step 5: Run the cache test + the smoke test, verify green**

Run: `npm test -- src/orchestration/__tests__/run-challenge-cache.test.ts src/orchestration/__tests__/run-challenge-smoke.test.ts`

Expected: PASS. The smoke test now passes its `archiveDir` — UPDATE the smoke test's `runChallenge(...)` call to add `archiveDir: dir` alongside `archivePath` (line ~104). It was previously missing; add it.

> NOTE: the smoke test does not assert `itemHash` on disk, but the executed `row` now carries one (Task 2 made the schema require it; this task stamps it). The on-disk decode at smoke line 132 will succeed because `itemHash` is present.

- [ ] **Step 6: Add `--no-cache` to `submit` and thread `noCache` + `archiveDir`**

In `src/cli/commands/submit.ts`, add the option (after `verboseOpt`, line 58):

```ts
const noCacheOpt = Options.boolean("no-cache").pipe(
  Options.withDefault(false),
  Options.withDescription("Bypass the cross-run item cache; always execute every item"),
);
```

Add it to the command's options object (line 62-69) as `noCache: noCacheOpt`, destructure it in the handler params (line 70), and pass `archiveDir` + `noCache` into `runChallenge` (line 93-100):

```ts
      const manifest = yield* runChallenge({
        config: cfg,
        challenge: resolved,
        attemptId,
        archiveDir,
        archivePath,
        env,
        deps,
        noCache,
      });
```

- [ ] **Step 7: Run the full repo gate**

Run: `npm test && npm run typecheck && npm run lint`

Expected: all green (this is the first task whose changes touch the whole `src/` typecheck surface — Task 2's deferred typecheck resolves here because `runChallenge`'s `row` now sets `itemHash`).

- [ ] **Step 8: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge-cache.test.ts src/orchestration/__tests__/run-challenge-smoke.test.ts src/cli/commands/submit.ts
git commit -m "feat(orchestration): cross-run item cache in runChallenge + --no-cache flag"
```

---

### Task 5: Resume by `attemptId` + `--resume`

Add a resume path: locate `<archiveDir>/<attemptId>.jsonl`, load its header, validate `resolved.configHash === header.configHash && resolved.challengeHash === header.challengeHash` (fail loudly on mismatch), execute only the `itemId`s not already in the body, re-aggregate over the union of existing + new rows, and finalize. Wire `--resume <attemptId>` into `submit`. Resume composes with the cross-run cache: missing items go through `executeOrCacheItem` (which still honors `noCache`), and the cache reader skips the partial archive itself because it is `interrupted: true`.

**Files:**
- Modify: `src/orchestration/run-challenge.ts` (add `resumeChallenge`)
- Modify: `src/cli/commands/submit.ts` (add `--resume`, branch to `resumeChallenge`)
- Test: `src/orchestration/__tests__/run-challenge-resume.test.ts` (CREATE)

**Interfaces:**
- Consumes: `executeOrCacheItem` (Task 4); `appendItem`, `finalizeAttempt`, `aggregate`, `AttemptManifest`, `ItemResult` schemas; `readFileString` via `FileSystem`.
- Produces:
  ```ts
  export class ResumeMismatchError extends Data.TaggedError("ResumeMismatchError")<{
    readonly attemptId: string;
    readonly field: "configHash" | "challengeHash";
    readonly expected: string;
    readonly actual: string;
  }> {}

  export const resumeChallenge: (
    input: RunChallengeInput,
  ) => Effect.Effect<
    AttemptManifest,
    FileIOError | JsonlCorruptLine | ResumeMismatchError,
    FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion
  >;
  ```
  `resumeChallenge` reuses `RunChallengeInput`; `input.attemptId` + `input.archivePath` identify the partial archive, and `input.config`/`input.challenge` are the re-resolved values to validate against the header.

- [ ] **Step 1: Write the failing test**

Create `src/orchestration/__tests__/run-challenge-resume.test.ts`. It writes a partial (interrupted) 2-item archive with item 1 already done, then resumes and asserts only item 2 executed and the finalized aggregate covers both:

```ts
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { AttemptManifest } from "../../schema/attempt.js";
import { ResumeMismatchError, resumeChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  readArchiveLines,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

const config: ResolvedConfiguration = {
  id: "cfg", artifact: "fake", runtime: "mlx", temperature: 0,
  systemPrompt: "direct", maxTokens: 128, systemPromptText: "Be concise.", configHash: "cfg-hash",
};
const env = {
  hostname: "test", platform: "test", runtimeVersion: "test", nodeVersion: "test", benchmarkGitSha: "test",
};

const mkItem = (id: string, ih: string): ResolvedItem => {
  const prompt = samplePromptExact({ name: id, promptHash: `ph-${id}` });
  return { itemId: id, promptHash: prompt.promptHash, itemHash: ih, scorer: prompt.scorer, prompt };
};

const challenge: ResolvedChallenge = {
  id: "ch", version: 1, passThreshold: 0.5, challengeHash: "ch-hash",
  items: [mkItem("i1", "ih1"), mkItem("i2", "ih2")],
};

const partialHeader = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1, attemptId: "att-resume", startedAt: "2026-01-01T00:00:00Z",
    finishedAt: null, interrupted: true, configId: "cfg", configHash: "cfg-hash",
    artifact: "fake", runtime: "mlx", quant: undefined, temperature: 0, systemPrompt: "direct",
    maxTokens: 128, challengeId: "ch", challengeVersion: 1, challengeHash: "ch-hash",
    env, aggregate: { score: 0, passed: false }, ...over,
  });
const doneItem1 = JSON.stringify({
  itemId: "i1", promptName: "i1", promptHash: "ph-i1", itemHash: "ih1",
  executedAt: "2026-01-01T00:00:30Z", promptTokens: 5, generationTokens: 5, promptTps: 0,
  generationTps: 0, peakMemoryGb: 0, wallTimeSec: 1, output: "4", reasoning: null,
  rawOutput: "4", error: null, score: 1,
});

const okStub = () =>
  makeChatCompletionMock(
    {},
    { kind: "ok", result: { output: "4", reasoning: null, promptTokens: 5, generationTokens: 5, promptTps: 0, generationTps: 0 } },
  );

describe("resumeChallenge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("executes only the missing items and finalizes over the union", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(path, `${partialHeader()}\n${doneItem1}\n`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    const manifest = await Effect.runPromise(
      resumeChallenge({
        config, challenge, attemptId: "att-resume", archiveDir: dir, archivePath: path, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );

    expect(m.log.calls.length).toBe(1); // only i2 executed
    expect(manifest.interrupted).toBe(false);
    expect(manifest.aggregate.score).toBe(1); // both items score 1

    const lines = await readArchiveLines(path);
    expect(lines.length).toBe(3); // header + i1 + i2
    const decoded = Schema.decodeUnknownSync(AttemptManifest)(JSON.parse(lines[0] as string));
    expect(decoded.finishedAt).not.toBeNull();
  });

  it("fails loudly when the resolved challengeHash does not match the header", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(path, `${partialHeader({ challengeHash: "DIFFERENT" })}\n${doneItem1}\n`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    const exit = await Effect.runPromiseExit(
      resumeChallenge({
        config, challenge, attemptId: "att-resume", archiveDir: dir, archivePath: path, env, deps: fakeDeps(),
      }).pipe(Effect.provide(m.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
    );
    expect(exit._tag).toBe("Failure");
    expect(m.log.calls.length).toBe(0); // never executed; archive untouched
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/orchestration/__tests__/run-challenge-resume.test.ts`

Expected: FAIL — `resumeChallenge`/`ResumeMismatchError` are not exported.

- [ ] **Step 3: Implement `ResumeMismatchError` + `resumeChallenge`**

In `src/orchestration/run-challenge.ts`, add `Data` and `Schema` to the effect import (line 15):

```ts
import { Clock, Data, Effect, Option, Schema } from "effect";
```

Add the `AttemptManifest`/`ItemResult` schema *values* (currently imported `type`-only at line 21). Change:

```ts
import type { AttemptAggregate, AttemptManifest, ItemResult } from "../schema/attempt.js";
```

to:

```ts
import type { AttemptAggregate } from "../schema/attempt.js";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";
```

(The schema `Struct`s carry both the value and the `.Type`, so this single import covers both the runtime decoder and the type usages.)

Add the error class and `resumeChallenge` at the end of the file:

```ts
const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResult);

/** Raised when a resumed attempt's re-resolved config/challenge identity does not match its archive header. */
export class ResumeMismatchError extends Data.TaggedError("ResumeMismatchError")<{
  readonly attemptId: string;
  readonly field: "configHash" | "challengeHash";
  readonly expected: string;
  readonly actual: string;
}> {}

/**
 * Resume an interrupted attempt. Re-resolves config + challenge from `input`
 * (the caller did the YAML load), validates the resolved hashes against the
 * partial archive's header, executes only the items not already present in the
 * body, re-aggregates over the union, and finalizes.
 *
 * Distinct from the cross-run cache: the partial archive is `interrupted: true`,
 * so `findCachedItem` skips it; resume reads its body explicitly here. Missing
 * items still flow through `executeOrCacheItem`, so a completed sibling attempt
 * can still serve a cache hit (unless `noCache`).
 */
export const resumeChallenge = (
  input: RunChallengeInput,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine | ResumeMismatchError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs
        .readFileString(input.archivePath)
        .pipe(Effect.mapError((cause) => new FileIOError({ path: input.archivePath, operation: "resume-read", cause: String(cause) })));
      const lines = source.split("\n").filter((l) => l.trim().length > 0);

      const headerJson = yield* Effect.try({
        try: () => JSON.parse(lines[0] ?? "") as unknown,
        catch: (e) => new FileIOError({ path: input.archivePath, operation: "resume-parse-header", cause: String(e) }),
      });
      const header = yield* decodeManifest(headerJson).pipe(
        Effect.mapError((cause) => new FileIOError({ path: input.archivePath, operation: "resume-decode-header", cause: String(cause) })),
      );

      // Fail loudly on identity mismatch — do not append mismatched items.
      if (input.config.configHash !== header.configHash) {
        return yield* Effect.fail(
          new ResumeMismatchError({ attemptId: input.attemptId, field: "configHash", expected: header.configHash, actual: input.config.configHash }),
        );
      }
      if (input.challenge.challengeHash !== header.challengeHash) {
        return yield* Effect.fail(
          new ResumeMismatchError({ attemptId: input.attemptId, field: "challengeHash", expected: header.challengeHash, actual: input.challenge.challengeHash }),
        );
      }

      // Decode the already-present body rows.
      const existing: ItemResult[] = [];
      for (let i = 1; i < lines.length; i++) {
        const json = yield* Effect.try({
          try: () => JSON.parse(lines[i] as string) as unknown,
          catch: (e) => new FileIOError({ path: input.archivePath, operation: "resume-parse-item", cause: String(e) }),
        });
        existing.push(
          yield* decodeItem(json).pipe(
            Effect.mapError((cause) => new FileIOError({ path: input.archivePath, operation: "resume-decode-item", cause: String(cause) })),
          ),
        );
      }
      const doneIds = new Set(existing.map((r) => r.itemId));

      // Boot the server only if there is at least one missing item.
      const missing = input.challenge.items.filter((it) => !doneIds.has(it.itemId));
      if (missing.length > 0) {
        yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);
      }

      const newRows: ItemResult[] = [];
      for (const item of missing) {
        const row = yield* executeOrCacheItem(input, item);
        yield* appendItem(input.archivePath, row);
        newRows.push(row);
      }

      const union = [...existing, ...newRows];
      const agg = aggregate(union, input.challenge.passThreshold);
      const finishedMs = yield* Clock.currentTimeMillis;
      const finishedAt = new Date(finishedMs).toISOString();
      yield* finalizeAttempt(input.archivePath, finishedAt, agg);

      return { ...header, finishedAt, interrupted: false, aggregate: agg };
    }),
  );
```

> NOTE for implementer: `ResumeMismatchError` widens `resumeChallenge`'s error channel only (not `runChallenge`'s). `executeOrCacheItem` already contributes `FileIOError | JsonlCorruptLine`. The `finalizeAttempt` import is already present at the top of the file. `aggregate` is the existing exported pure helper.

- [ ] **Step 4: Run the resume test, verify green**

Run: `npm test -- src/orchestration/__tests__/run-challenge-resume.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Wire `--resume` into `submit`**

In `src/cli/commands/submit.ts`, add the option (after `noCacheOpt`):

```ts
const resumeOpt = Options.text("resume").pipe(
  Options.optional,
  Options.withDescription("Resume an interrupted attempt by its attemptId (re-uses --config/--challenge to re-resolve)"),
);
```

Add `resume: resumeOpt` to the options object and destructure `resume` in the handler. Then branch in the handler: when `resume` is present (an `Option`), locate the existing archive, validate, and call `resumeChallenge`; otherwise call `runChallenge` as today. Import `resumeChallenge` from `../../orchestration/run-challenge.js` and `Option` from `effect`. Replace the `attemptId`/`archivePath`/`runChallenge` block (lines 87-104) with:

```ts
      const env = defaultRunEnv();
      const deps = makeRunDeps({});

      const manifest = yield* Option.match(resume, {
        onNone: () =>
          Effect.gen(function* () {
            const attemptId = `att-${cfg.configHash}-${resolved.challengeHash}-${Date.now()}`;
            return yield* runChallenge({
              config: cfg, challenge: resolved, attemptId,
              archiveDir, archivePath: `${archiveDir}/${attemptId}.jsonl`, env, deps, noCache,
            });
          }),
        onSome: (attemptId) =>
          resumeChallenge({
            config: cfg, challenge: resolved, attemptId,
            archiveDir, archivePath: `${archiveDir}/${attemptId}.jsonl`, env, deps, noCache,
          }),
      });
```

Add the imports at the top of `submit.ts`:

```ts
import { Effect, Layer, Option } from "effect";
import { runChallenge, resumeChallenge } from "../../orchestration/run-challenge.js";
```

> NOTE for implementer: `ResumeMismatchError` is a typed failure; the `submit` handler is in `src/cli/` (where the spec permits CLI-level handling). Let it propagate to the CLI's top-level error printer — its `message`/tagged fields give the operator the config/challenge mismatch detail. No `try`/`throw` needed.

- [ ] **Step 6: Run the full repo gate**

Run: `npm test && npm run typecheck && npm run lint`

Expected: all green. The combined suite count includes `webapp/src/**/*.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge-resume.test.ts src/cli/commands/submit.ts
git commit -m "feat(orchestration): resume by attemptId + --resume flag (hash-validate, execute missing, re-finalize)"
```

---

## Self-Review

**Spec coverage (every Design section → task):**
- §1 Deterministic scorer serialization (export `stableStringify`, swap `scorerKey`, re-pin goldens red→green, key-order test) → Task 1. ✓
- §2 `itemHash` identity (`ResolvedItem` field, required `ItemResult.itemHash`, scorer-inclusive formula, fixture updates) → Task 2. ✓
- §3 Cross-run cache reader (`findCachedItem`, completed-only, configHash+challengeId+challengeVersion+itemHash match, executedAt tie-break, `operation: "readDirectory"` not `read-archive-dir`) → Task 3. ✓ — NOTE: the spec said "rewrite the legacy reader" but the legacy `findCachedResult` is still live in the `run` path; implemented as ADDITIVE (new reader uses `operation: "readDirectory"`; the legacy reader's `read-archive-dir` string is left in place since deleting it is out of scope). See gaps below.
- §4 Wire cache + `--no-cache` (verbatim HIT, stamp-on-MISS, default ON, extracted helper) → Task 4. ✓
- §5 Resume + `--resume` (re-resolve, hash-validate-or-fail-loud, execute missing, re-aggregate over union, finalize; composes with cache; partial archive skipped by reader) → Task 5. ✓
- Testing section: stableStringify golden + key-order (Task 1); cache reader hit/miss/version/incomplete (Task 3); runChallenge integration run1→run2 zero-calls + identical aggregate + `--no-cache` re-execute (Task 4); scorer-staleness MISS (Task 4); resume test (Task 5). ✓

**Gaps resolved inline:**
- The spec §3 says "Rewrite the legacy reader" and "Retire `read-archive-dir`", but verification (`grep -rn findCachedResult src`) shows the legacy `findCachedResult` is STILL WIRED into the live `run` command (`src/orchestration/cache.ts` → `phases.ts`/`completion.ts` → `run-loop.ts` → `src/cli/commands/run.ts`) with ~13 passing tests. Deleting it would break the legacy `run` path, which Phase 4's Non-goals leave unchanged. RESOLVED: Task 3 is ADDITIVE — `findCachedItem` is appended to `src/archive/cache.ts` alongside `findCachedResult`; the legacy `CacheKey` is renamed `LegacyCacheKey` (internal only) to free the `CacheKey` name; the new reader uses `operation: "readDirectory"` (the correct/non-stale string the spec wanted), while the legacy reader's `read-archive-dir` string is left in place because retiring it means touching the live `run` path. The legacy `src/archive/__tests__/cache.test.ts` stays; the new tests live in `src/archive/__tests__/find-cached-item.test.ts`.
- The spec's "extract the per-item helper" was left as "likely factoring (final call left to the implementation plan)". RESOLVED: `executeOrCacheItem` is defined in Task 4 (Step 4) and reused by `resumeChallenge` in Task 5, with the explicit contract that it returns the `ItemResult` and the caller owns `appendItem` + aggregation.
- The spec did not name a resume-mismatch error type. RESOLVED: introduced `ResumeMismatchError` (a `Data.TaggedError` matching the codebase's error idiom in `src/errors/io.ts`) so "fail loudly" is a typed failure, not a `throw`.
- `runChallenge` needs the archive *directory* (to scan) separately from the archive *file path* (to write). The original `RunChallengeInput` had only `archivePath`. RESOLVED: Task 4 adds `archiveDir`; Task 4 Step 5 updates the existing smoke test's call site to pass it.
- Task 2's whole-repo typecheck would go red (because `run-challenge.ts`'s inline `row` lacks `itemHash`) before Task 4 fixes it. RESOLVED: Task 2 runs only the affected suites and explicitly defers the full-repo gate to Task 4 Step 7, with a NOTE explaining why.

**Placeholder scan:** No `TODO`/"similar to"/"add error handling" placeholders. The golden re-pin (Task 1 Steps 3-4) is the one intentionally observe-then-pin value, planned red→green explicitly per the spec's "never hand-compute" rule. The `<NEW_12HEX>` token is a deliberate observe-and-substitute marker, not a placeholder implementation.

**Type consistency:**
- `CacheKey` shape `{ configHash; challengeId; challengeVersion; itemHash }` is identical in Task 3 (producer) and Task 4 (consumer, built inside `executeOrCacheItem`).
- `findCachedItem` return `Effect.Effect<Option.Option<ItemResult>, FileIOError | JsonlCorruptLine, FileSystem.FileSystem | Path.Path>` matches its call site, and its `JsonlCorruptLine` error widens `executeOrCacheItem` → `runChallenge`/`resumeChallenge` channels consistently (Tasks 4-5).
- `executeOrCacheItem(input, item): Effect<ItemResult, FileIOError | JsonlCorruptLine, ...>` signature in Task 4 matches both its `runChallenge` call site (Task 4) and its `resumeChallenge` call site (Task 5).
- `ResolvedItem.itemHash` (Task 2) is the field read by `executeOrCacheItem`'s key construction (Task 4) and `resumeChallenge`'s missing-item loop (Task 5).
- `RunChallengeInput` (extended in Task 4 with `archiveDir` + `noCache`) is the single input type used by `runChallenge`, `executeOrCacheItem`, and `resumeChallenge`.
