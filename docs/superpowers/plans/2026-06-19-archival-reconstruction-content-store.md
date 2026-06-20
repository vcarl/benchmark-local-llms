# Archival Reconstruction via Content-Addressed Sidecar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a v2 attempt archive fully self-sufficient — reconstruct an attempt entirely from its
`.jsonl` plus a shared content-addressed `content/` store, with no dependency on the corpus/config/
challenge YAML.

**Architecture:** Add a content store (`<archiveDir>/content/{prompts,scorers,system}/`) holding the
prompt text, scorer config, and system-prompt text as blobs keyed by reused identity hashes
(`promptHash`, `scorerHash`, `configHash`). Bump `schemaVersion` to 2 additively (v1 still reads).
Wire writes into `run-challenge`; add a reconstruction read helper; make `score` store-primary; add a
`bench export` bundler.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Effect (`effect`, `@effect/platform`,
`@effect/cli`), Effect `Schema`, vitest, Biome. Spec:
`docs/superpowers/specs/2026-06-19-archival-reconstruction-content-store-design.md`.

## Global Constraints

- Additive + golden-hash-safe: `configHash`/`challengeHash`/`itemHash`/`attemptId` MUST NOT change.
  Golden `challengeHash` `71c5f440ce49` and config-hash tests stay green **unchanged** (no re-pin).
- `schemaVersion` widens `Literal(1)` → `Literal(1, 2)`. New manifest fields `passThreshold` and item
  field `scorerHash` are `Schema.optional`; the v2 writer always sets them.
- Biome bans `!` (non-null assertion) and `throw` in non-test `src/` (`*.test.ts` exempt from the
  throw ban). Use `if (x === undefined)` guards, not `!`.
- `FileIOError` is constructed as `{ path, operation, cause }` (cause stringified).
- `Runtime` literals are `"llamacpp"` / `"mlx"`. No new runtime npm deps — `bench export`'s tarball
  uses the system `tar` via `CommandExecutor` (the existing subprocess pattern), not an npm tar lib.
- Blob bytes for a scorer = `stableStringify(scorer)` (the same bytes as its `scorerHash` preimage).
- Reuse `shortSha256` + `stableStringify` from `src/config/hashing.js`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run the full suite with `npm test`; typecheck with `npm run typecheck`; lint with `npm run lint`
  (confirm exact script names in `package.json` before first use).

## File Structure

- **Create** `src/archive/content-store.ts` — store paths, `scorerHash`, idempotent atomic
  `writeBlob` / `readBlob`. (Task 2)
- **Create** `src/archive/content-store.test.ts` — store I/O unit tests. (Task 2)
- **Create** `src/report/reconstruct.ts` — `loadAttemptReconstruction` (jsonl + store → rehydrated
  attempt; v1 → `NotReconstructible`). (Task 5)
- **Create** `src/report/reconstruct.test.ts` — reconstruction unit tests. (Task 5)
- **Create** `src/cli/commands/export.ts` — `bench export` bundler. (Task 7)
- **Create** `src/cli/commands/__tests__/export.test.ts` — export tests. (Task 7)
- **Create** `src/archive/reconstruction-acceptance.test.ts` — corpus-deleted end-to-end. (Task 8)
- **Modify** `src/schema/attempt.ts` — `schemaVersion` literal, `passThreshold`, `scorerHash`. (Task 1)
- **Modify** `src/schema/attempt.test.ts` — v1/v2 coexistence decode tests. (Task 1)
- **Modify** `src/orchestration/run-challenge.ts` — blob writes + `scorerHash` stamp + `schemaVersion`
  2 + `passThreshold` in `executeOrCacheItem`/`baseHeader`/`runChallenge` (Task 3), `resumeChallenge`
  (Task 4).
- **Modify** `src/orchestration/__tests__/run-challenge.test.ts`,
  `run-challenge-cache.test.ts`, `run-challenge-resume.test.ts` — assert store + v2 fields. (Tasks 3,4)
- **Modify** `src/cli/commands/score.ts` — store-primary default + `--corpus` flag. (Task 6)
- **Modify** `src/cli/commands/__tests__/score.test.ts` — store vs corpus tests. (Task 6)
- **Modify** `src/cli/main.ts` — register `exportCommand`. (Task 7)

---

### Task 1: Schema v2 (additive)

**Files:**
- Modify: `src/schema/attempt.ts`
- Test: `src/schema/attempt.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AttemptManifest.schemaVersion: 1 | 2`, `AttemptManifest.passThreshold?: number`,
  `ItemResult.scorerHash?: string`. The writer still emits `schemaVersion: 1` until Task 3 (valid
  under the widened literal), so the whole repo stays green after this task.

- [ ] **Step 1: Write the failing tests** — add to `src/schema/attempt.test.ts`:

```ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AttemptManifest, ItemResult } from "./attempt.js";

describe("attempt schema v2 (additive)", () => {
  const baseManifest = {
    schemaVersion: 1,
    attemptId: "att-x",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    interrupted: true,
    configId: "c",
    configHash: "cfg",
    artifact: "a",
    runtime: "mlx",
    temperature: 0,
    systemPrompt: "default",
    maxTokens: 64,
    challengeId: "ch",
    challengeVersion: 1,
    challengeHash: "chh",
    env: {
      hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g",
    },
    aggregate: { score: 0, passed: false },
  };

  it("decodes a v1 manifest with no passThreshold", () => {
    const m = Schema.decodeUnknownSync(AttemptManifest)(baseManifest);
    expect(m.schemaVersion).toBe(1);
    expect(m.passThreshold).toBeUndefined();
  });

  it("decodes a v2 manifest with schemaVersion 2 + passThreshold", () => {
    const m = Schema.decodeUnknownSync(AttemptManifest)({
      ...baseManifest, schemaVersion: 2, passThreshold: 0.8,
    });
    expect(m.schemaVersion).toBe(2);
    expect(m.passThreshold).toBe(0.8);
  });

  it("rejects schemaVersion 3", () => {
    expect(() => Schema.decodeUnknownSync(AttemptManifest)({ ...baseManifest, schemaVersion: 3 }))
      .toThrow();
  });

  const baseItem = {
    itemId: "i", promptName: "i", promptHash: "ph", itemHash: "ih",
    executedAt: "2026-01-01T00:00:00.000Z",
    promptTokens: 1, generationTokens: 1, promptTps: 1, generationTps: 1,
    peakMemoryGb: 0, wallTimeSec: 0, output: "o", reasoning: null, rawOutput: "o",
    error: null, score: 1,
  };

  it("decodes a v1 item with no scorerHash", () => {
    const r = Schema.decodeUnknownSync(ItemResult)(baseItem);
    expect(r.scorerHash).toBeUndefined();
  });

  it("decodes a v2 item carrying scorerHash", () => {
    const r = Schema.decodeUnknownSync(ItemResult)({ ...baseItem, scorerHash: "sh" });
    expect(r.scorerHash).toBe("sh");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/attempt.test.ts`
Expected: FAIL — `schemaVersion: 2` / `passThreshold` / `scorerHash` rejected by the current schema.

- [ ] **Step 3: Edit the schema** in `src/schema/attempt.ts`:
  - In `ItemResult`, immediately after the `itemHash` line, add:
    ```ts
      scorerHash: Schema.optional(Schema.String),
    ```
  - In `AttemptManifest`, change `schemaVersion: Schema.Literal(1),` to:
    ```ts
      schemaVersion: Schema.Literal(1, 2),
    ```
  - In `AttemptManifest`, after the `challengeHash` line, add:
    ```ts
      passThreshold: Schema.optional(Schema.Number),
    ```
  Update the JSDoc on `AttemptManifest` to note `passThreshold` and `schemaVersion 2` are the v2
  reconstruction additions (denormalized content, not hash inputs).

- [ ] **Step 4: Run tests to verify they pass + repo stays green**

Run: `npx vitest run src/schema/attempt.test.ts` → PASS
Run: `npm test` → all green (writer still emits `schemaVersion: 1`; optional fields don't break
existing fixtures).
Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/schema/attempt.ts src/schema/attempt.test.ts
git commit -m "feat(schema): v2 attempt fields (schemaVersion 1|2, passThreshold, scorerHash)

Additive, optional, non-hash. Writer still emits v1 until the write path lands.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Content store module

**Files:**
- Create: `src/archive/content-store.ts`
- Test: `src/archive/content-store.test.ts`

**Interfaces:**
- Consumes: `shortSha256`, `stableStringify` from `../config/hashing.js`; `ScorerConfig` from
  `../schema/scorer.js`; `FileIOError` from `../errors/index.js`.
- Produces:
  - `type BlobKind = "prompts" | "scorers" | "system"`
  - `contentDir(archiveDir: string): string`
  - `scorerHash(scorer: ScorerConfig): string`
  - `writeBlob(archiveDir: string, kind: BlobKind, key: string, content: string): Effect<void, FileIOError, FileSystem.FileSystem>`
  - `readBlob(archiveDir: string, kind: BlobKind, key: string): Effect<string, FileIOError, FileSystem.FileSystem>`

- [ ] **Step 1: Write the failing tests** — `src/archive/content-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScorerConfig } from "../schema/scorer.js";
import { contentDir, readBlob, scorerHash, writeBlob } from "./content-store.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

describe("content-store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cstore-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("scorerHash is deterministic and key-order independent", () => {
    const a = { type: "exact_match", expected: "4", extract: "(\\d+)" } as ScorerConfig;
    const b = { type: "exact_match", extract: "(\\d+)", expected: "4" } as ScorerConfig;
    expect(scorerHash(a)).toBe(scorerHash(b));
    expect(scorerHash(a)).toHaveLength(12);
  });

  it("writeBlob then readBlob round-trips", async () => {
    const exit = await run(
      Effect.gen(function* () {
        yield* writeBlob(dir, "prompts", "ph1", "hello prompt");
        return yield* readBlob(dir, "prompts", "ph1");
      }),
    );
    expect(exit).toStrictEqual(Exit.succeed("hello prompt"));
    expect(contentDir(dir)).toBe(join(dir, "content"));
  });

  it("writeBlob is idempotent (second write keeps identical bytes, no error)", async () => {
    const exit = await run(
      Effect.gen(function* () {
        yield* writeBlob(dir, "scorers", "sh1", "{\"type\":\"exact_match\"}");
        yield* writeBlob(dir, "scorers", "sh1", "{\"type\":\"exact_match\"}");
        return yield* readBlob(dir, "scorers", "sh1");
      }),
    );
    expect(exit).toStrictEqual(Exit.succeed("{\"type\":\"exact_match\"}"));
  });

  it("readBlob of a missing key fails with FileIOError", async () => {
    const exit = await run(readBlob(dir, "system", "nope"));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/archive/content-store.test.ts`
Expected: FAIL — `./content-store.js` does not exist.

- [ ] **Step 3: Implement** `src/archive/content-store.ts`:

```ts
/**
 * Content-addressed sidecar store for self-sufficient v2 archives. Holds the
 * prompt text, scorer config, and system-prompt text as blobs under
 * `<archiveDir>/content/{prompts,scorers,system}/`, keyed by reused identity
 * hashes (promptHash / scorerHash / configHash). Writes are atomic
 * (temp+rename) and idempotent (content-addressed → an existing blob is left
 * untouched). Error channel: FileIOError, matching the rest of src/archive/.
 */
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { shortSha256, stableStringify } from "../config/hashing.js";
import { FileIOError } from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";

export type BlobKind = "prompts" | "scorers" | "system";

const EXT: Record<BlobKind, string> = { prompts: "txt", scorers: "json", system: "txt" };

export const contentDir = (archiveDir: string): string => `${archiveDir}/content`;

/** Store key (and on-disk bytes preimage) for a scorer config. */
export const scorerHash = (scorer: ScorerConfig): string => shortSha256(stableStringify(scorer));

const kindDir = (archiveDir: string, kind: BlobKind): string => `${contentDir(archiveDir)}/${kind}`;

const blobPath = (archiveDir: string, kind: BlobKind, key: string): string =>
  `${kindDir(archiveDir, kind)}/${key}.${EXT[kind]}`;

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

/**
 * Atomically + idempotently write `content` to `content/<kind>/<key>.<ext>`.
 * If the blob already exists it is a no-op (content-addressed ⇒ identical bytes).
 */
export const writeBlob = (
  archiveDir: string,
  kind: BlobKind,
  key: string,
  content: string,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = blobPath(archiveDir, kind, key);
    const exists = yield* fs.exists(path).pipe(Effect.mapError(toFileIOError(path, "blob-exists")));
    if (exists) return;
    const dir = kindDir(archiveDir, kind);
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(dir, "blob-mkdir")));
    const tmp = `${path}.tmp`;
    yield* fs
      .writeFileString(tmp, content, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(tmp, "blob-write-temp")));
    yield* fs.rename(tmp, path).pipe(
      Effect.mapError(toFileIOError(path, "blob-rename")),
      Effect.tapError(() => fs.remove(tmp).pipe(Effect.ignore)),
    );
  });

export const readBlob = (
  archiveDir: string,
  kind: BlobKind,
  key: string,
): Effect.Effect<string, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = blobPath(archiveDir, kind, key);
    return yield* fs.readFileString(path).pipe(Effect.mapError(toFileIOError(path, "blob-read")));
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/archive/content-store.test.ts` → PASS
Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/archive/content-store.ts src/archive/content-store.test.ts
git commit -m "feat(archive): content-addressed sidecar store (writeBlob/readBlob/scorerHash)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Write path — runChallenge emits v2 + populates store

**Files:**
- Modify: `src/orchestration/run-challenge.ts`
- Test: `src/orchestration/__tests__/run-challenge.test.ts`, `.../run-challenge-cache.test.ts`

**Interfaces:**
- Consumes: `writeBlob`, `scorerHash` from `../archive/content-store.js`; `stableStringify` from
  `../config/hashing.js`.
- Produces: every new attempt is `schemaVersion: 2` with `passThreshold` set; every `ItemResult`
  carries `scorerHash`; the content store at `<archiveDir>/content/` holds the prompt, scorer, and
  system blobs. `executeOrCacheItem` stamps `scorerHash` on a cache hit whose cached row lacks it.

- [ ] **Step 1: Write the failing tests** — add to `run-challenge.test.ts` (adapt imports to the
  file's existing fixture setup; mirror how `run-challenge-cache.test.ts` builds `config`/`challenge`/
  `fakeDeps` and a temp `dir`). Add a v2-store assertion after a successful `runChallenge`:

```ts
import { readBlob, scorerHash } from "../../archive/content-store.js";

it("writes a v2 archive and populates the content store", async () => {
  // ... arrange config/challenge/env/deps + temp `dir` exactly as the existing
  // successful-run test in this file does, with archiveDir = dir ...
  const manifest = await runIt(); // existing helper that runs runChallenge and returns the manifest
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.passThreshold).toBe(challenge.passThreshold);

  const item = challenge.items[0];
  const prompt = await Effect.runPromise(
    Effect.provide(readBlob(dir, "prompts", item.promptHash), NodeContext.layer),
  );
  expect(prompt).toBe(item.prompt.promptText);
  const scorer = await Effect.runPromise(
    Effect.provide(readBlob(dir, "scorers", scorerHash(item.scorer)), NodeContext.layer),
  );
  expect(scorer.length).toBeGreaterThan(0);
  const system = await Effect.runPromise(
    Effect.provide(readBlob(dir, "system", config.configHash), NodeContext.layer),
  );
  expect(system).toBe(config.systemPromptText);
});
```

  In `run-challenge-cache.test.ts`, strengthen the existing cache-hit test to assert the hit row keeps
  a `scorerHash`, and add a v1→v2 stamp test:

```ts
it("stamps scorerHash on a hit from a v1 cached row", async () => {
  // Arrange: hand-write a COMPLETED v1 archive (schemaVersion 1, finishedAt set,
  // interrupted false, one item with itemHash matching the resolved item but NO
  // scorerHash) into `dir` using attempt-writer's writeAttemptHeader/appendItem/
  // finalizeAttempt (or a raw JSONL string write). Then run executeOrCacheItem for
  // that item and assert the returned row carries the resolved scorerHash and that
  // measured-cost fields equal the cached row's.
  const row = await runExecuteOrCacheItem(); // helper provided in the test
  expect(row.scorerHash).toBe(scorerHash(item.scorer));
  expect(row.wallTimeSec).toBe(CACHED_WALL); // verbatim measured cost
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/orchestration/__tests__/run-challenge.test.ts src/orchestration/__tests__/run-challenge-cache.test.ts`
Expected: FAIL — `schemaVersion` is 1, no store blobs, rows lack `scorerHash`.

- [ ] **Step 3: Edit `run-challenge.ts`**:
  - Add imports near the top with the other local imports:
    ```ts
    import { scorerHash, writeBlob } from "../archive/content-store.js";
    import { stableStringify } from "../config/hashing.js";
    ```
  - In `baseHeader`, change `schemaVersion: 1,` to `schemaVersion: 2,` and add a `passThreshold`
    field sourced from the challenge:
    ```ts
      schemaVersion: 2,
      // ... existing fields ...
      challengeHash: input.challenge.challengeHash,
      passThreshold: input.challenge.passThreshold,
    ```
  - In `executeOrCacheItem`, at the very start of the `Effect.gen` body (before the cache lookup),
    compute the scorer hash and write the per-item blobs, then stamp on a hit:
    ```ts
        const sh = scorerHash(item.scorer);
        yield* writeBlob(input.archiveDir, "prompts", item.promptHash, item.prompt.promptText);
        yield* writeBlob(input.archiveDir, "scorers", sh, stableStringify(item.scorer));

        if (input.noCache !== true) {
          const cached = yield* findCachedItem(input.archiveDir, {
            configHash: input.config.configHash,
            challengeId: input.challenge.id,
            challengeVersion: input.challenge.version,
            itemHash: item.itemHash,
          });
          if (Option.isSome(cached)) {
            const row = cached.value;
            return row.scorerHash === undefined ? { ...row, scorerHash: sh } : row;
          }
        }
    ```
  - In the fresh-execution `return { ... } satisfies ItemResult;` object, add `scorerHash: sh,`
    (place it right after `itemHash: item.itemHash,`).
  - In `runChallenge`, immediately after `writeAttemptHeader(...)` and before acquiring the server,
    write the system blob:
    ```ts
        yield* writeBlob(
          input.archiveDir,
          "system",
          input.config.configHash,
          input.config.systemPromptText,
        );
    ```
  Update the `executeOrCacheItem` JSDoc to mention the blob writes + the documented cache-hit
  `scorerHash` stamp (denormalized field only; measured-cost fields preserved verbatim).

- [ ] **Step 4: Run tests to verify they pass + fix sibling fixtures**

Run: `npx vitest run src/orchestration/__tests__/run-challenge.test.ts src/orchestration/__tests__/run-challenge-cache.test.ts` → PASS
Run: `npm test` — any test asserting `schemaVersion === 1` on a freshly produced attempt, or exact
ItemResult line equality, will now see `2` / a `scorerHash`. Update those assertions to v2. (Search:
`grep -rn "schemaVersion" src --include="*.test.ts"`.)
Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/
git commit -m "feat(run): runChallenge writes v2 archives + content store

Per-item prompt/scorer blobs + once-per-attempt system blob; items carry
scorerHash; cache hit stamps scorerHash if absent (measured cost verbatim).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Write path — resumeChallenge store completeness

**Files:**
- Modify: `src/orchestration/run-challenge.ts`
- Test: `src/orchestration/__tests__/run-challenge-resume.test.ts`

**Interfaces:**
- Consumes: `writeBlob`, `scorerHash` (already imported in Task 3).
- Produces: after a resume, the content store holds the system blob and prompt+scorer blobs for **all**
  resolved items (existing + newly executed); resume-produced rows carry `scorerHash` (via
  `executeOrCacheItem`).

- [ ] **Step 1: Write the failing test** — add to `run-challenge-resume.test.ts` (mirror the file's
  existing happy-path resume setup that writes a partial archive then resumes):

```ts
import { readBlob, scorerHash } from "../../archive/content-store.js";

it("resume populates the content store for all items", async () => {
  // ... arrange + run the existing happy-path resume so `dir` holds the finalized archive ...
  for (const item of challenge.items) {
    const p = await Effect.runPromise(
      Effect.provide(readBlob(dir, "prompts", item.promptHash), NodeContext.layer),
    );
    expect(p).toBe(item.prompt.promptText);
    const s = await Effect.runPromise(
      Effect.provide(readBlob(dir, "scorers", scorerHash(item.scorer)), NodeContext.layer),
    );
    expect(s.length).toBeGreaterThan(0);
  }
  const sys = await Effect.runPromise(
    Effect.provide(readBlob(dir, "system", config.configHash), NodeContext.layer),
  );
  expect(sys).toBe(config.systemPromptText);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-challenge-resume.test.ts`
Expected: FAIL — resume does not yet write the system blob / blobs for already-present items.

- [ ] **Step 3: Edit `resumeChallenge`** in `run-challenge.ts`. After the two `ResumeMismatchError`
  guards and before decoding the existing body rows, write the system blob and all-item blobs
  (idempotent; placed after the mismatch checks so a mismatched resume writes nothing):

```ts
      // Store completeness: write the system blob and every item's prompt/scorer
      // blob (idempotent) so the sidecar is complete without rewriting body rows.
      yield* writeBlob(
        input.archiveDir,
        "system",
        input.config.configHash,
        input.config.systemPromptText,
      );
      yield* Effect.forEach(input.challenge.items, (it) =>
        Effect.gen(function* () {
          yield* writeBlob(input.archiveDir, "prompts", it.promptHash, it.prompt.promptText);
          yield* writeBlob(
            input.archiveDir,
            "scorers",
            scorerHash(it.scorer),
            stableStringify(it.scorer),
          );
        }),
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestration/__tests__/run-challenge-resume.test.ts` → PASS
Run: `npm test && npm run typecheck && npm run lint` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge-resume.test.ts
git commit -m "feat(run): resumeChallenge writes complete content store (all items + system)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Reconstruction read helper

**Files:**
- Create: `src/report/reconstruct.ts`
- Test: `src/report/reconstruct.test.ts`

**Interfaces:**
- Consumes: `loadAttemptArchive` from `./load-attempts.js`; `readBlob` from
  `../archive/content-store.js`; `ScorerConfig` from `../schema/scorer.js`; `AttemptManifest`,
  `ItemResult` from `../schema/attempt.js`; `Path` from `@effect/platform`.
- Produces:
  - `class NotReconstructible extends Data.TaggedError("NotReconstructible")<{ path: string; reason: string }>`
  - `interface ReconstructedItem { item: ItemResult; promptText: string; scorer: ScorerConfig }`
  - `interface ReconstructedAttempt { manifest: AttemptManifest; systemPromptText: string; items: ReadonlyArray<ReconstructedItem> }`
  - `loadAttemptReconstruction(file: string): Effect<ReconstructedAttempt, NotReconstructible, FileSystem.FileSystem | Path.Path>`
    (archiveDir is derived as `path.dirname(file)`).

- [ ] **Step 1: Write the failing tests** — `src/report/reconstruct.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scorerHash, writeBlob } from "../archive/content-store.js";
import { loadAttemptReconstruction } from "./reconstruct.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

// Minimal v2 attempt jsonl (header + one item) written by hand into `dir`.
const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };
const writeV2Attempt = async (dir: string) => {
  const sh = scorerHash(SCORER as never);
  const header = {
    schemaVersion: 2, attemptId: "att-x", startedAt: "t", finishedAt: "t", interrupted: false,
    configId: "c", configHash: "cfg", artifact: "a", runtime: "mlx", temperature: 0,
    systemPrompt: "default", maxTokens: 64, challengeId: "ch", challengeVersion: 1,
    challengeHash: "chh", passThreshold: 0.8,
    env: { hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" },
    aggregate: { score: 1, passed: true },
  };
  const item = {
    itemId: "i", promptName: "i", promptHash: "ph", itemHash: "ih", scorerHash: sh,
    executedAt: "t", promptTokens: 1, generationTokens: 1, promptTps: 1, generationTps: 1,
    peakMemoryGb: 0, wallTimeSec: 0, output: "4", reasoning: null, rawOutput: "4", error: null, score: 1,
  };
  await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
        yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
        yield* writeBlob(dir, "system", "cfg", "Be concise.");
      }),
      NodeContext.layer,
    ),
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, "att-x.jsonl"), `${JSON.stringify(header)}\n${JSON.stringify(item)}\n`);
  return join(dir, "att-x.jsonl");
};

describe("loadAttemptReconstruction", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "recon-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("rehydrates prompt/system/scorer purely from the archive + store", async () => {
    const file = await writeV2Attempt(dir);
    const exit = await run(loadAttemptReconstruction(file));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.systemPromptText).toBe("Be concise.");
      expect(exit.value.items[0]?.promptText).toBe("What is 2+2?");
      expect(exit.value.items[0]?.scorer.type).toBe("exact_match");
      expect(exit.value.manifest.passThreshold).toBe(0.8);
    }
  });

  it("fails NotReconstructible on a v1 archive (no store)", async () => {
    const { writeFile } = await import("node:fs/promises");
    const header = { schemaVersion: 1, attemptId: "a", startedAt: "t", finishedAt: "t",
      interrupted: false, configId: "c", configHash: "cfg", artifact: "a", runtime: "mlx",
      temperature: 0, systemPrompt: "default", maxTokens: 64, challengeId: "ch",
      challengeVersion: 1, challengeHash: "chh",
      env: { hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" },
      aggregate: { score: 0, passed: false } };
    const f = join(dir, "v1.jsonl");
    await writeFile(f, `${JSON.stringify(header)}\n`);
    const exit = await run(loadAttemptReconstruction(f));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/report/reconstruct.test.ts`
Expected: FAIL — `./reconstruct.js` does not exist.

- [ ] **Step 3: Implement** `src/report/reconstruct.ts`:

```ts
/**
 * Reconstruct an attempt purely from its v2 archive + content store — no corpus,
 * config, or challenge YAML. The proof of the self-sufficiency property; consumed
 * by `score` (store-primary), `bench export`, and the acceptance test.
 */
import { type FileSystem, Path } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { readBlob } from "../archive/content-store.js";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { ScorerConfig } from "../schema/scorer.js";
import { loadAttemptArchive } from "./load-attempts.js";

export class NotReconstructible extends Data.TaggedError("NotReconstructible")<{
  readonly path: string;
  readonly reason: string;
}> {}

export interface ReconstructedItem {
  readonly item: ItemResult;
  readonly promptText: string;
  readonly scorer: ScorerConfig;
}
export interface ReconstructedAttempt {
  readonly manifest: AttemptManifest;
  readonly systemPromptText: string;
  readonly items: ReadonlyArray<ReconstructedItem>;
}

const decodeScorer = Schema.decodeUnknown(ScorerConfig);

export const loadAttemptReconstruction = (
  file: string,
): Effect.Effect<ReconstructedAttempt, NotReconstructible, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const pathSvc = yield* Path.Path;
    const archiveDir = pathSvc.dirname(file);

    const { manifest, items } = yield* loadAttemptArchive(file).pipe(
      Effect.mapError((i) => new NotReconstructible({ path: file, reason: i.reason })),
    );
    if (manifest.schemaVersion !== 2) {
      return yield* Effect.fail(
        new NotReconstructible({ path: file, reason: "v1 archive has no content store" }),
      );
    }

    const systemPromptText = yield* readBlob(archiveDir, "system", manifest.configHash).pipe(
      Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
    );

    const reconstructed = yield* Effect.forEach(items, (item) =>
      Effect.gen(function* () {
        if (item.scorerHash === undefined) {
          return yield* Effect.fail(
            new NotReconstructible({ path: file, reason: `item ${item.itemId} missing scorerHash` }),
          );
        }
        const promptText = yield* readBlob(archiveDir, "prompts", item.promptHash).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        const scorerJson = yield* readBlob(archiveDir, "scorers", item.scorerHash).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        const parsed = yield* Effect.try({
          try: () => JSON.parse(scorerJson) as unknown,
          catch: (e) => new NotReconstructible({ path: file, reason: `scorer JSON: ${String(e)}` }),
        });
        const scorer = yield* decodeScorer(parsed).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        return { item, promptText, scorer } satisfies ReconstructedItem;
      }),
    );

    return { manifest, systemPromptText, items: reconstructed };
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/report/reconstruct.test.ts` → PASS
Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/report/reconstruct.ts src/report/reconstruct.test.ts
git commit -m "feat(report): loadAttemptReconstruction (rehydrate attempt from archive + store)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `score` store-primary + `--corpus`

**Files:**
- Modify: `src/cli/commands/score.ts`
- Test: `src/cli/commands/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `loadAttemptReconstruction` from `../../report/reconstruct.js`; existing `rescoreItems`,
  `aggregate`, `rewriteAttempt`, `loadAttemptArchive`, `scoreByConfig`.
- Produces: a `--corpus` boolean option (default `false`). Behavior: v2 + default → re-score from the
  store using `manifest.passThreshold`, no corpus loaded; v2 + `--corpus` OR any v1 → the existing
  corpus-resolve path unchanged. Adds `rescoreItemsFromStore`.

- [ ] **Step 1: Write the failing tests** — add to `score.test.ts` (mirror the file's existing setup
  that writes an attempt archive + corpus into temp dirs and runs the command/handlers):

```ts
// (1) v2 default re-scores from the store WITHOUT any corpus present.
it("v2 default re-scores from the store with no corpus dir", async () => {
  // Arrange: produce a v2 attempt (run runChallenge into `dir`, or write one by hand
  // with its content store as in reconstruct.test.ts). Do NOT create a prompts/challenges dir.
  // Act: invoke the store-primary handler (corpus=false).
  // Assert: aggregate recomputed; passed reflects manifest.passThreshold; exit 0; archive rewritten.
});

// (2) --corpus applies an EDITED corpus scorer (store ignored).
it("--corpus applies the edited corpus scorer", async () => {
  // Arrange: v2 attempt whose stored scorer would score the output 1; an EDITED corpus
  // scorer that scores the same output 0.
  // Act: run with corpus=true.
  // Assert: the item's new score is 0 (corpus scorer won, not the stored one).
});
```

  Keep the existing v1/corpus and dry-run tests intact (they exercise the `--corpus`/v1 path, which is
  unchanged). If `rescoreItemsFromStore` is exported, add a direct unit test for it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/commands/__tests__/score.test.ts`
Expected: FAIL — no `--corpus` option; default still reads the corpus.

- [ ] **Step 3: Edit `score.ts`**:
  - Add imports:
    ```ts
    import { Path } from "@effect/platform";
    import { loadAttemptReconstruction } from "../../report/reconstruct.js";
    ```
  - Add the option (near the other `Options`):
    ```ts
    const corpusOpt = Options.boolean("corpus").pipe(
      Options.withDefault(false),
      Options.withDescription(
        "Apply the CURRENT corpus scorers (edit-iterate loop) instead of the archive's stored scorers",
      ),
    );
    ```
  - Add `rescoreItemsFromStore` (sibling to `rescoreItems`) — re-score each archived item against the
    reconstructed (stored) scorer; no drift handling (the stored scorer is authoritative):
    ```ts
    export const rescoreItemsFromStore = (
      items: ReadonlyArray<ItemResult>,
      reconItems: ReadonlyArray<{ item: ItemResult; scorer: ScorerConfig }>,
    ): Effect.Effect<RescoreResult, never, CommandExecutor.CommandExecutor> =>
      Effect.gen(function* () {
        const byId = new Map(reconItems.map((r) => [r.item.itemId, r.scorer]));
        const updated: ItemResult[] = [];
        const notes: string[] = [];
        let rescored = 0;
        for (const archived of items) {
          const scorer = byId.get(archived.itemId);
          if (scorer === undefined) {
            updated.push(archived);
            continue;
          }
          if (archived.error !== null) {
            rescored += 1;
            updated.push({ ...archived, score: 0 });
            continue;
          }
          const r = yield* scoreByConfig(archived.output, scorer, {
            promptName: archived.promptName,
          }).pipe(
            Effect.catchAll(() =>
              Effect.succeed({ kind: "prompt" as const, score: 0, details: "scorer error" }),
            ),
          );
          rescored += 1;
          if (r.score !== archived.score) {
            notes.push(`  ${archived.promptName}: ${archived.score} → ${r.score} (${r.details})`);
          }
          updated.push({ ...archived, score: r.score });
        }
        return { updated, rescored, drift: 0, notes, warnings: [] };
      });
    ```
    (Import `ScorerConfig` type from `../../schema/scorer.js`.)
  - Add `corpus: corpusOpt` to the command's options object and `corpus` to the handler's destructured
    params.
  - In the handler, after `loadAttemptArchive` yields `{ manifest, items }`, branch:
    ```ts
      const useStore = corpus === false && manifest.schemaVersion === 2;
      if (useStore) {
        const recon = yield* loadAttemptReconstruction(archive).pipe(
          Effect.mapError((e) => new Error(`${archive}: ${e.reason}`)),
        );
        const passThreshold = manifest.passThreshold ?? 1;
        const { updated, rescored, drift, notes, warnings } = yield* rescoreItemsFromStore(
          items,
          recon.items,
        );
        const agg = aggregate(updated, passThreshold);
        const newManifest: AttemptManifest = { ...manifest, aggregate: agg };
        if (dryRun) {
          for (const note of notes) yield* printLine(note);
        } else {
          yield* rewriteAttempt(archive, newManifest, updated);
          for (const warning of warnings) yield* printLine(warning);
        }
        yield* printLine(
          formatSummary({
            configId: manifest.configId, challengeId: manifest.challengeId,
            version: manifest.challengeVersion, aggregate: agg, rescored,
            total: items.length, drift, fallback: 0, dryRun,
          }),
        );
        return;
      }
      // ... existing corpus-resolve path unchanged below ...
    ```
  - The handler env now needs `Path.Path` (for `loadAttemptReconstruction`). `loadAttemptArchive` and
    `rewriteAttempt` already require `FileSystem`; add `Path` via the existing layer provision (the
    command already runs under `NodeContext`/equivalent — confirm `Path.Path` is satisfied, mirroring
    `report.ts`). Update the JSDoc header to describe store-primary default + `--corpus`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/commands/__tests__/score.test.ts` → PASS
Run: `npm test && npm run typecheck && npm run lint` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/score.ts src/cli/commands/__tests__/score.test.ts
git commit -m "feat(score): store-primary re-score by default; --corpus for the edit-iterate loop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `bench export` bundler

**Files:**
- Create: `src/cli/commands/export.ts`
- Modify: `src/cli/main.ts`
- Test: `src/cli/commands/__tests__/export.test.ts`

**Interfaces:**
- Consumes: `loadAttemptArchive` from `../../report/load-attempts.js`; `readBlob`, `writeBlob`,
  `scorerHash` from `../../archive/content-store.js`; `Command`/`Args`/`Options` from `@effect/cli`;
  `CommandExecutor`, `FileSystem`, `Path` from `@effect/platform`.
- Produces: `exportCommand` (registered in `main.ts`). Bundles `<archiveDir>/<attemptId>.jsonl` + its
  referenced blobs into `<out>` (default `<attemptId>.tar.gz`; `--dir` → directory bundle).

- [ ] **Step 1: Write the failing tests** — `src/cli/commands/__tests__/export.test.ts`. Drive the
  bundling logic via an exported helper `exportBundle(archiveFile, outDir)` (pure of CLI parsing) so
  the test is deterministic and dependency-free (test the `--dir` path; the tarball is a thin shell):

```ts
// Arrange: write a v2 attempt + content store into `src` (reuse the reconstruct.test.ts helper shape).
// Act: exportBundle(srcJsonl, bundleDir).
// Assert:
//   - bundleDir contains the jsonl and content/{prompts,scorers,system} with EXACTLY the referenced keys
//   - loadAttemptReconstruction(bundleJsonl) succeeds with no access to `src`
//   - a v1 archive → exportBundle fails with a clear error
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/commands/__tests__/export.test.ts`
Expected: FAIL — `./export.js` does not exist.

- [ ] **Step 3: Implement** `src/cli/commands/export.ts`:
  - `exportBundle(archiveFile, outDir)`: load the attempt (v1 → fail with
    `"<file>: v1 archive has no content store; export requires a v2 archive"`); derive
    `archiveDir = path.dirname(archiveFile)`; for each item read+write `prompts/<promptHash>.txt` and
    `scorers/<scorerHash>.json`, plus once `system/<configHash>.txt`, copying from `archiveDir` into
    `outDir` via `readBlob`/`writeBlob`; copy the jsonl to `outDir/<basename>`. Returns the list of
    written paths.
  - `exportCommand = Command.make("export", { attempt, archiveDir, out, dir }, handler)`:
    `attempt` is `Args.text({ name: "attempt" })` (an attemptId or path); resolve the jsonl path
    (`attempt` ends with `.jsonl` → use as-is, else `<archiveDir>/<attempt>.jsonl`); compute the
    bundle dir; call `exportBundle`; if `--dir` is false, shell `tar -czf <out>.tar.gz -C <parent>
    <bundleBasename>` via `CommandExecutor` then remove the staging dir; print a one-line summary.
  - Use the same `printLine`, option, and `makeLoggerLayer` patterns as `score.ts`. No `throw`/`!`.
  - Suggested signature: `export const exportBundle = (archiveFile: string, outDir: string):
    Effect.Effect<ReadonlyArray<string>, Error, FileSystem.FileSystem | Path.Path>`.

- [ ] **Step 4: Register + run**
  - In `src/cli/main.ts`: `import { exportCommand } from "./commands/export.js";` and add
    `exportCommand,` to the `Command.withSubcommands([...])` array.
  - Run: `npx vitest run src/cli/commands/__tests__/export.test.ts` → PASS
  - Run: `npm test && npm run typecheck && npm run lint` → green/clean.
  - Manual smoke (optional): `./bench export <an attemptId> --archive-dir benchmark-archive --dir`
    and confirm a self-contained bundle that `loadAttemptReconstruction` can read.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/export.ts src/cli/commands/__tests__/export.test.ts src/cli/main.ts
git commit -m "feat(cli): bench export — bundle an attempt jsonl + its content blobs

Default .tar.gz via system tar (no new dep); --dir for a plain directory bundle.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Headline acceptance — corpus-deleted reconstruction

**Files:**
- Create: `src/archive/reconstruction-acceptance.test.ts`

**Interfaces:**
- Consumes: `runChallenge` (Task 3), `loadAttemptReconstruction` (Task 5), the score store handler /
  `rescoreItemsFromStore` (Task 6), `exportBundle` (Task 7). No production code changes — this task is
  the end-to-end proof.

- [ ] **Step 1: Write the test** — `src/archive/reconstruction-acceptance.test.ts`:

```ts
// 1. Run a real (faked-model) v2 attempt into a temp archiveDir (reuse run-challenge fixtures:
//    fakeDeps, makeChatCompletionMock, samplePromptExact, a small ResolvedChallenge/Configuration).
// 2. Capture the finalized aggregate.
// 3. With NO corpus/prompts/challenges dir anywhere, assert:
//    (a) loadAttemptReconstruction(archiveFile) returns full promptText + systemPromptText + scorer;
//    (b) rescoreItemsFromStore + aggregate(updated, manifest.passThreshold) reproduces the SAME
//        aggregate.score AND aggregate.passed;
//    (c) exportBundle(archiveFile, bundleDir) yields a bundle whose jsonl re-loads via
//        loadAttemptReconstruction with no access to the original archiveDir.
```

  Each of (a)/(b)/(c) is a separate `it(...)` sharing a `beforeAll` that produces the attempt.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/archive/reconstruction-acceptance.test.ts`
Expected: PASS (all production code already exists from Tasks 1–7). If (b) fails on `passed`, verify
Task 3 wrote `passThreshold` and Task 6 reads `manifest.passThreshold`.

- [ ] **Step 3: Full gate**

Run: `npm test && npm run typecheck && npm run lint` → 100% green/clean. Confirm golden hash tests
(`challengeHash` `71c5f440ce49`, config-hash) passed **without** re-pinning.

- [ ] **Step 4: Commit**

```bash
git add src/archive/reconstruction-acceptance.test.ts
git commit -m "test(archive): corpus-deleted reconstruction acceptance (reconstruct + score + export)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Three gaps (prompt/system/scorer text) → Tasks 2–5 (store + write + reconstruct). ✓
- Fourth gap (`passThreshold`) → Task 1 (schema) + Task 3 (writer) + Task 6 (consumer). ✓
- Reuse-identity-hash addressing (`promptHash`/`scorerHash`/`configHash`, subdirs) → Task 2. ✓
- v2 + coexistence (`Literal(1,2)`, optional fields, v1 reads) → Task 1; v1 paths preserved in Tasks 6,7. ✓
- Shared store + write path (run + resume, cache-hit stamp) → Tasks 3, 4. ✓
- Store-primary `score` + `--corpus`; v1 → corpus → Task 6. ✓
- `bench export` (default tar.gz via system tar, `--dir`, v1 error) → Task 7. ✓
- Hash stability / golden tests unchanged → Global Constraints + Tasks 1, 8 gates. ✓
- Headline corpus-deleted acceptance (incl. `passed`) → Task 8. ✓
- Out of scope (WebappRecord enrichment, webapp rebuild, model params/family, migrate cmd, `show`,
  pure content-addressing) → not present in any task. ✓

**Placeholder scan:** Tasks with full code: 1,2,3 (edits + asserts),4,5,6 (full handler + helper),8
test outline. Tasks 6/7/8 test bodies are described as comment-outlines because they must mirror each
file's existing fixture wiring (temp dirs, `fakeDeps`, command invocation) that the implementer reads
in-file; the assertions and the production code are fully specified. This is intentional, not a TBD.

**Type consistency:** `scorerHash(scorer)` (Task 2) used identically in Tasks 3,4,7. `writeBlob`/
`readBlob` signatures (`archiveDir, kind, key[, content]`) consistent across 2,3,4,5,7.
`loadAttemptReconstruction(file)` returns `ReconstructedAttempt { manifest, systemPromptText, items:
{item, promptText, scorer}[] }` — consumed with that exact shape in Tasks 6 (`recon.items`), 8.
`RescoreResult` shape reused by `rescoreItemsFromStore` (Task 6) matches `rescoreItems`.
`AttemptManifest.passThreshold` (Task 1) written in Task 3, read in Tasks 6, 8.
