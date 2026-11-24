# Phase 3 — Report/webapp re-axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-axis the report + webapp from model-grouped runs onto **configuration rows × challenge columns** with two configuration-level scores (pass rate + efficiency), reading the new `AttemptManifest`/`ItemResult` attempt archives.

**Architecture:** Clean break. The report ingestion is rewritten to decode attempt archives (header `AttemptManifest` + body `ItemResult` lines), emitting one per-attempt `WebappRecord`. The webapp pipeline groups records by `config_hash` (rows) under `artifact` (groups), builds a best-attempt config×challenge matrix, and computes pass rate + efficiency per config. The scenario half and the per-config detail/scatter views are removed.

**Tech Stack:** Effect-TS + `@effect/platform` (backend `src/report/`), TypeScript + React + TanStack Router + Vitest (`webapp/`).

## Global Constraints

- Branch `challenge-config-reframe` (stacking on Phase 0–2; do NOT merge to main).
- No `throw` in non-test `src/` — use `Effect.fail` / tagged errors. `*.test.ts` is exempt.
- Webapp record fields are **snake_case** (matching the existing webapp data convention, e.g. `generation_tokens`, `wall_time_sec`); the source `AttemptManifest`/`ItemResult` are camelCase — the contract maps camel→snake.
- Only **completed** attempts are reported: `finishedAt !== null` AND `interrupted === false`. Incomplete/interrupted attempts are dropped at ingestion.
- **Cell = best attempt** (highest `score`); **row Pass % = pooled** passed/completed attempts. This divergence is intentional.
- Efficiency `overallTokens × timeSpent === 0` → render `—` (never `NaN`/`∞`). `overallTokens` counts `generation_tokens` only.
- Two test surfaces: root (`npm test` from repo root) and webapp (`cd webapp && npm test`). Both must stay green, plus `npm run lint` + `npm run typecheck` at the root and `webapp/`.
- Scenario support, per-config/per-item detail, scatter re-axis, legacy-archive migration are all **out of scope** (spec Non-goals).

**Source shapes (already exist — read `src/schema/attempt.ts`):**
- `AttemptManifest`: `{ schemaVersion, attemptId, startedAt, finishedAt: string|null, interrupted, configId, configHash, artifact, runtime, quant?, temperature, systemPrompt, maxTokens, challengeId, challengeVersion, challengeHash, env, aggregate: { score, passed } }`.
- `ItemResult`: `{ itemId, promptName, promptHash, executedAt, promptTokens, generationTokens, promptTps, generationTps, peakMemoryGb, wallTimeSec, output, reasoning, rawOutput, error, score }`.

---

## File Structure

**Backend (`src/report/`):**
- `webapp-contract.ts` — REPLACE: single per-attempt `WebappRecord` (snake_case) + `toWebappRecord(manifest, items)`. Scenario arm, `WebappScoreBreakdown`, `stripEventsForWire` removed.
- `load-attempts.ts` — CREATE: decode attempt `.jsonl` files → `{ manifest, items }[]` + issues.
- `aggregate.ts` — REPLACE body: completed-attempt filter + map to `WebappRecord[]`, dedup by `attemptId`. No corpus matching.
- `index.ts` — REWIRE: loader → aggregate → `writeDataJs`; drop `writeEventFiles`, corpus params, scenario plumbing.
- `load-archives.ts`, `write-events.ts` — REMOVE from the report path (delete files; the legacy `src/archive/loader.ts` decoders stay for the legacy `run` path but the report no longer imports them).
- CLI report command wiring (`src/cli/commands/report.ts` or equivalent) + `main.ts` — drop corpus args.

**Webapp (`webapp/src/`):**
- `lib/data.ts` — REPLACE mirror types + `normalizeRecord` for the new snake_case shape; remove scenario mirror.
- `lib/pipeline.ts` — REPLACE `groupRunsByModel`/`aggregateForRunList`/`aggregateForScatter`/`buildChallengeIndex` with config-axis aggregation: `aggregateMatrix(records)` → `{ columns, groups }`, `computeConfigScores`.
- `lib/constants.ts` — keep `isPass`/`scoreBand`; add `EFFICIENCY_SCALE` + `formatEfficiency`.
- `components/RunGroupTable.tsx`, `components/RunRowItem.tsx` — render artifact groups → config rows → challenge cells + Pass %/Efficiency columns.
- `routes/__root.tsx` — swap aggregator calls; row click = expand/collapse only.
- `routes/run.$model.$variant*.tsx` (+ scenarios) — DELETE. `lib/run-summary.ts`, `components/RunHeader.tsx`, `lib/expanded-state.ts` (if model-keyed) — remove/retarget.

---

## Phasing

- **3a (Tasks 1–5):** contract + ingestion + data.js mirror. Backend freezes the new record shape.
- **3b (Tasks 6–7):** pipeline config-axis aggregation + two scores.
- **3c (Tasks 8–9):** UI render re-axis + dead-route removal.

---

### Task 1: New `WebappRecord` contract + `toWebappRecord`

**Files:**
- Replace: `src/report/webapp-contract.ts`
- Test: `src/report/webapp-contract.test.ts`

**Interfaces:**
- Consumes: `AttemptManifest`, `ItemResult` from `src/schema/attempt.ts`.
- Produces: `WebappRecord` (interface), `toWebappRecord(manifest: AttemptManifest, items: ReadonlyArray<ItemResult>): WebappRecord`.

- [ ] **Step 1: Write the failing test**

Replace `src/report/webapp-contract.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { toWebappRecord } from "./webapp-contract.js";

const item = (over: Partial<ItemResult>): ItemResult => ({
  itemId: "i1", promptName: "p1", promptHash: "h", executedAt: "2026-01-01T00:00:00Z",
  promptTokens: 10, generationTokens: 100, promptTps: 1, generationTps: 1,
  peakMemoryGb: 0, wallTimeSec: 2, output: "o", reasoning: null, rawOutput: "o",
  error: null, score: 1, ...over,
});

const manifest = (over: Partial<AttemptManifest>): AttemptManifest => ({
  schemaVersion: 1, attemptId: "att-1", startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:01:00Z", interrupted: false,
  configId: "cfg", configHash: "ch", artifact: "qwen", runtime: "llama-server",
  quant: "q4", temperature: 0, systemPrompt: "concise", maxTokens: 512,
  challengeId: "code", challengeVersion: 1, challengeHash: "xh",
  env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
  aggregate: { score: 0.5, passed: false }, ...over,
});

describe("toWebappRecord", () => {
  it("maps a completed attempt + items to a per-attempt record with summed efficiency inputs", () => {
    const rec = toWebappRecord(manifest({}), [
      item({ generationTokens: 100, wallTimeSec: 2, score: 1 }),
      item({ itemId: "i2", generationTokens: 200, wallTimeSec: 4, score: 0 }),
    ]);
    expect(rec).toMatchObject({
      config_hash: "ch", artifact: "qwen", runtime: "llama-server", quant: "q4",
      temperature: 0, system_prompt: "concise", max_tokens: 512,
      challenge_id: "code", challenge_version: 1, attempt_id: "att-1",
      finished_at: "2026-01-01T00:01:00Z", score: 0.5, passed: false,
      generation_tokens: 300, wall_time_sec: 6, item_count: 2, passed_items: 1,
    });
  });

  it("maps an absent quant to null", () => {
    const rec = toWebappRecord(manifest({ quant: undefined }), [item({})]);
    expect(rec.quant).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/report/webapp-contract.test.ts`
Expected: FAIL (current `toWebappRecord` has a different signature / the scenario-based file).

- [ ] **Step 3: Replace `src/report/webapp-contract.ts` entirely**

```ts
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";

/** Round to 2 decimal places (mirrors Python round(x, 2) for finite positives). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * One reported, **completed** `(config × challenge)` attempt, flattened for the
 * webapp. Grain is per-attempt (not per-item): the matrix + two scores need only
 * attempt-level data; per-item detail is deferred. Field names are snake_case to
 * match the existing webapp data convention. Efficiency inputs
 * (`generation_tokens`, `wall_time_sec`) are summed over the attempt's items.
 */
export interface WebappRecord {
  readonly config_id: string;
  readonly config_hash: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  readonly system_prompt: string;
  readonly max_tokens: number;
  readonly challenge_id: string;
  readonly challenge_version: number;
  readonly attempt_id: string;
  readonly finished_at: string;
  readonly score: number;
  readonly passed: boolean;
  readonly generation_tokens: number;
  readonly wall_time_sec: number;
  readonly item_count: number;
  readonly passed_items: number;
}

/**
 * Flatten a finalized attempt into a {@link WebappRecord}. Precondition (enforced
 * by the caller, {@link aggregate}): `manifest.finishedAt` is non-null and
 * `interrupted` is false. `generation_tokens` / `wall_time_sec` sum the item lines.
 */
export const toWebappRecord = (
  manifest: AttemptManifest,
  items: ReadonlyArray<ItemResult>,
): WebappRecord => ({
  config_id: manifest.configId,
  config_hash: manifest.configHash,
  artifact: manifest.artifact,
  runtime: manifest.runtime,
  quant: manifest.quant ?? null,
  temperature: manifest.temperature,
  system_prompt: manifest.systemPrompt,
  max_tokens: manifest.maxTokens,
  challenge_id: manifest.challengeId,
  challenge_version: manifest.challengeVersion,
  attempt_id: manifest.attemptId,
  finished_at: manifest.finishedAt ?? "",
  score: round2(manifest.aggregate.score),
  passed: manifest.aggregate.passed,
  generation_tokens: items.reduce((s, i) => s + i.generationTokens, 0),
  wall_time_sec: round2(items.reduce((s, i) => s + i.wallTimeSec, 0)),
  item_count: items.length,
  passed_items: items.filter((i) => i.score === 1).length,
});
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/report/webapp-contract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/report/webapp-contract.ts src/report/webapp-contract.test.ts
git commit -m "feat(report): per-attempt WebappRecord contract (drop scenario arm)"
```

---

### Task 2: Attempt-archive loader

**Files:**
- Create: `src/report/load-attempts.ts`
- Test: `src/report/load-attempts.test.ts`

**Interfaces:**
- Consumes: `AttemptManifest`, `ItemResult` schemas; `@effect/platform` `FileSystem`, `Path`.
- Produces: `loadAttemptArchives(dir: string): Effect.Effect<{ attempts: ReadonlyArray<LoadedAttempt>; issues: ReadonlyArray<AttemptLoadIssue> }, FileIOError, FileSystem.FileSystem | Path.Path>` where `LoadedAttempt = { manifest: AttemptManifest; items: ReadonlyArray<ItemResult> }` and `AttemptLoadIssue = { path: string; reason: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/report/load-attempts.test.ts`:

```ts
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loadAttemptArchives } from "./load-attempts.js";

const HEADER = JSON.stringify({
  schemaVersion: 1, attemptId: "att-1", startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:01:00Z", interrupted: false,
  configId: "cfg", configHash: "ch", artifact: "qwen", runtime: "llama-server",
  quant: "q4", temperature: 0, systemPrompt: "concise", maxTokens: 512,
  challengeId: "code", challengeVersion: 1, challengeHash: "xh",
  env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
  aggregate: { score: 1, passed: true },
});
const ITEM = JSON.stringify({
  itemId: "i1", promptName: "p1", promptHash: "h", executedAt: "2026-01-01T00:00:30Z",
  promptTokens: 10, generationTokens: 100, promptTps: 1, generationTps: 1,
  peakMemoryGb: 0, wallTimeSec: 2, output: "o", reasoning: null, rawOutput: "o",
  error: null, score: 1,
});

const run = <A>(eff: Effect.Effect<A, unknown, FileSystem.FileSystem | import("@effect/platform").Path.Path>, dir: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(`${dir}/att-1.jsonl`, `${HEADER}\n${ITEM}\n`);
      yield* fs.writeFileString(`${dir}/broken.jsonl`, `{ not valid manifest }\n`);
      return yield* eff;
    }).pipe(Effect.provide(NodeContext.layer)),
  );

describe("loadAttemptArchives", () => {
  it("decodes a manifest header + item lines, and reports malformed files as issues", async () => {
    const dir = `/tmp/p3-load-${process.pid}`;
    const res = await run(loadAttemptArchives(dir), dir);
    expect(res.attempts).toHaveLength(1);
    expect(res.attempts[0]!.manifest.attemptId).toBe("att-1");
    expect(res.attempts[0]!.items).toHaveLength(1);
    expect(res.attempts[0]!.items[0]!.generationTokens).toBe(100);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]!.path).toContain("broken.jsonl");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/report/load-attempts.test.ts`
Expected: FAIL ("loadAttemptArchives is not a function").

- [ ] **Step 3: Implement `src/report/load-attempts.ts`**

```ts
import { FileSystem, Path } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError } from "../errors/index.js";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";

export interface LoadedAttempt {
  readonly manifest: AttemptManifest;
  readonly items: ReadonlyArray<ItemResult>;
}
export interface AttemptLoadIssue {
  readonly path: string;
  readonly reason: string;
}

const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResult);

/** Parse one attempt `.jsonl`: line 1 = manifest, lines 2.. = item results. */
const parseAttempt = (path: string, source: string) =>
  Effect.gen(function* () {
    const lines = source.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return yield* Effect.fail(`empty file`);
    const headerJson = yield* Effect.try({
      try: () => JSON.parse(lines[0]!) as unknown,
      catch: () => `line 1 is not JSON`,
    });
    const manifest = yield* decodeManifest(headerJson).pipe(
      Effect.mapError(() => `line 1 is not an AttemptManifest`),
    );
    const items: ItemResult[] = [];
    for (let i = 1; i < lines.length; i++) {
      const json = yield* Effect.try({
        try: () => JSON.parse(lines[i]!) as unknown,
        catch: () => `line ${i + 1} is not JSON`,
      });
      items.push(yield* decodeItem(json).pipe(Effect.mapError(() => `line ${i + 1} is not an ItemResult`)));
    }
    return { manifest, items } satisfies LoadedAttempt;
  }).pipe(Effect.mapError((reason) => ({ path, reason: String(reason) }) satisfies AttemptLoadIssue));

/**
 * Load every `*.jsonl` attempt archive under `dir`. Files that fail to parse are
 * collected as `issues` rather than aborting the run; the directory-read failure
 * itself surfaces as {@link FileIOError}.
 */
export const loadAttemptArchives = (
  dir: string,
): Effect.Effect<
  { attempts: ReadonlyArray<LoadedAttempt>; issues: ReadonlyArray<AttemptLoadIssue> },
  FileIOError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(Effect.mapError((cause) => new FileIOError({ path: dir, cause })));
    const jsonl = entries.filter((e) => e.endsWith(".jsonl")).sort();

    const attempts: LoadedAttempt[] = [];
    const issues: AttemptLoadIssue[] = [];
    for (const name of jsonl) {
      const full = pathSvc.join(dir, name);
      const source = yield* fs
        .readFileString(full)
        .pipe(Effect.mapError((cause) => new FileIOError({ path: full, cause })));
      const parsed = yield* Effect.either(parseAttempt(full, source));
      if (parsed._tag === "Right") attempts.push(parsed.right);
      else issues.push(parsed.left);
    }
    return { attempts, issues };
  });
```

> NOTE for implementer: confirm `FileIOError`'s constructor shape against `src/errors/index.ts` (Phase 0–1 uses `new FileIOError({ path, cause })`). If the field names differ, match them. Confirm `Runtime` enum accepts `"llama-server"` in the test fixture; if not, use a valid runtime value from `src/schema/enums.ts`.

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/report/load-attempts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/load-attempts.ts src/report/load-attempts.test.ts
git commit -m "feat(report): attempt-archive loader (AttemptManifest + ItemResult)"
```

---

### Task 3: Aggregate completed attempts → records

**Files:**
- Replace: `src/report/aggregate.ts`
- Test: `src/report/aggregate.test.ts`

**Interfaces:**
- Consumes: `LoadedAttempt` from `load-attempts.ts`; `toWebappRecord`.
- Produces: `aggregateAttempts(attempts: ReadonlyArray<LoadedAttempt>): { records: ReadonlyArray<WebappRecord>; dropped: { incomplete: number; duplicate: number } }`.

- [ ] **Step 1: Write the failing test**

Replace `src/report/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LoadedAttempt } from "./load-attempts.js";
import { aggregateAttempts } from "./aggregate.js";

const att = (over: Partial<LoadedAttempt["manifest"]>, gen = 100, wall = 2): LoadedAttempt => ({
  manifest: {
    schemaVersion: 1, attemptId: "att-1", startedAt: "t", finishedAt: "t2", interrupted: false,
    configId: "cfg", configHash: "ch", artifact: "qwen", runtime: "llama-server", quant: "q4",
    temperature: 0, systemPrompt: "concise", maxTokens: 512, challengeId: "code",
    challengeVersion: 1, challengeHash: "xh",
    env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
    aggregate: { score: 1, passed: true }, ...over,
  },
  items: [{
    itemId: "i1", promptName: "p", promptHash: "h", executedAt: "t", promptTokens: 1,
    generationTokens: gen, promptTps: 1, generationTps: 1, peakMemoryGb: 0, wallTimeSec: wall,
    output: "o", reasoning: null, rawOutput: "o", error: null, score: 1,
  }],
});

describe("aggregateAttempts", () => {
  it("keeps completed attempts and emits one record each", () => {
    const out = aggregateAttempts([att({ attemptId: "a" }), att({ attemptId: "b" })]);
    expect(out.records).toHaveLength(2);
    expect(out.records[0]!.generation_tokens).toBe(100);
  });

  it("drops interrupted and unfinalized attempts", () => {
    const out = aggregateAttempts([
      att({ attemptId: "a" }),
      att({ attemptId: "b", interrupted: true }),
      att({ attemptId: "c", finishedAt: null }),
    ]);
    expect(out.records).toHaveLength(1);
    expect(out.dropped.incomplete).toBe(2);
  });

  it("dedups by attemptId, counting extras as dropped", () => {
    const out = aggregateAttempts([att({ attemptId: "dup" }), att({ attemptId: "dup" })]);
    expect(out.records).toHaveLength(1);
    expect(out.dropped.duplicate).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/report/aggregate.test.ts`
Expected: FAIL (`aggregateAttempts` not exported; old `aggregateAll` present).

- [ ] **Step 3: Replace `src/report/aggregate.ts`**

```ts
import type { LoadedAttempt } from "./load-attempts.js";
import { type WebappRecord, toWebappRecord } from "./webapp-contract.js";

export interface AggregateResult {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
}

const isCompleted = (a: LoadedAttempt): boolean =>
  a.manifest.finishedAt !== null && a.manifest.interrupted === false;

/**
 * Map loaded attempts to webapp records: keep only completed attempts, dedup by
 * `attemptId` (first wins), and flatten each to one {@link WebappRecord}.
 */
export const aggregateAttempts = (attempts: ReadonlyArray<LoadedAttempt>): AggregateResult => {
  let incomplete = 0;
  let duplicate = 0;
  const seen = new Set<string>();
  const records: WebappRecord[] = [];
  for (const a of attempts) {
    if (!isCompleted(a)) {
      incomplete++;
      continue;
    }
    if (seen.has(a.manifest.attemptId)) {
      duplicate++;
      continue;
    }
    seen.add(a.manifest.attemptId);
    records.push(toWebappRecord(a.manifest, a.items));
  }
  return { records, dropped: { incomplete, duplicate } };
};
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/report/aggregate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/report/aggregate.ts src/report/aggregate.test.ts
git commit -m "feat(report): aggregate completed attempts into records"
```

---

### Task 4: Rewire `index.ts` + CLI; remove legacy report path

**Files:**
- Modify: `src/report/index.ts`
- Delete: `src/report/load-archives.ts`, `src/report/load-archives.test.ts`, `src/report/write-events.ts`, `src/report/write-events.test.ts`
- Modify: the report CLI command + `src/main.ts` (drop corpus args)
- Test: `src/report/index.test.ts`

**Interfaces:**
- Consumes: `loadAttemptArchives`, `aggregateAttempts`, `writeDataJs`.
- Produces: `runReport(options: { archiveDir: string; outputPath?: string; dryRun?: boolean }): Effect.Effect<ReportSummary, FileIOError, FileSystem.FileSystem | Path.Path>` where `ReportSummary = { archiveDir; outputPath; attemptsLoaded; recordCount; loadIssues; dropped; dryRun; records }`. Note: `CommandExecutor` is no longer required (no scoring subprocess in the report path); `currentPromptCorpus`/`currentScenarioCorpus` params are removed.

- [ ] **Step 1: Write the failing test**

Replace `src/report/index.test.ts` with an end-to-end report over a fixture dir:

```ts
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runReport } from "./index.js";

const HEADER = JSON.stringify({
  schemaVersion: 1, attemptId: "att-1", startedAt: "t", finishedAt: "t2", interrupted: false,
  configId: "cfg", configHash: "ch", artifact: "qwen", runtime: "llama-server", quant: "q4",
  temperature: 0, systemPrompt: "concise", maxTokens: 512, challengeId: "code",
  challengeVersion: 1, challengeHash: "xh",
  env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
  aggregate: { score: 1, passed: true },
});
const ITEM = JSON.stringify({
  itemId: "i1", promptName: "p", promptHash: "h", executedAt: "t", promptTokens: 1,
  generationTokens: 100, promptTps: 1, generationTps: 1, peakMemoryGb: 0, wallTimeSec: 2,
  output: "o", reasoning: null, rawOutput: "o", error: null, score: 1,
});

describe("runReport", () => {
  it("loads attempts, writes data.js, returns a summary", async () => {
    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = `/tmp/p3-report-${process.pid}`;
        const out = `${dir}/out/data.js`;
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(`${dir}/att-1.jsonl`, `${HEADER}\n${ITEM}\n`);
        const s = yield* runReport({ archiveDir: dir, outputPath: out });
        const written = yield* fs.readFileString(out);
        expect(written).toContain("__BENCHMARK_DATA");
        expect(written).toContain("\"config_hash\":\"ch\"");
        return s;
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.recordCount).toBe(1);
    expect(summary.attemptsLoaded).toBe(1);
    expect(summary.loadIssues).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/report/index.test.ts`
Expected: FAIL (old `runReport` requires corpus params + `CommandExecutor`).

- [ ] **Step 3: Rewrite `runReport` in `src/report/index.ts`**

Replace the imports of `aggregateAll`/`loadAllArchives`/`stripEventsForWire`/`writeEventFiles` and the body. New `runReport`:

```ts
import path from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { FileIOError } from "../errors/index.js";
import { aggregateAttempts } from "./aggregate.js";
import { type AttemptLoadIssue, loadAttemptArchives } from "./load-attempts.js";
import type { WebappRecord } from "./webapp-contract.js";
import { writeDataJs } from "./write-data-js.js";

export interface ReportOptions {
  readonly archiveDir: string;
  readonly outputPath?: string;
  readonly dryRun?: boolean;
}

export interface ReportSummary {
  readonly archiveDir: string;
  readonly outputPath: string;
  readonly attemptsLoaded: number;
  readonly recordCount: number;
  readonly loadIssues: ReadonlyArray<AttemptLoadIssue>;
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
  readonly dryRun: boolean;
  readonly records: ReadonlyArray<WebappRecord>;
}

const defaultOutputPath = (archiveDir: string): string => {
  const repoRoot = path.resolve(archiveDir, "..");
  return path.join(repoRoot, "webapp", "src", "data", "data.js");
};

export const runReport = (
  options: ReportOptions,
): Effect.Effect<ReportSummary, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const archiveDir = options.archiveDir;
    const outputPath = options.outputPath ?? defaultOutputPath(archiveDir);
    const dryRun = options.dryRun ?? false;

    const loaded = yield* loadAttemptArchives(archiveDir);
    const { records, dropped } = aggregateAttempts(loaded.attempts);

    if (!dryRun) {
      yield* writeDataJs(outputPath, records);
    }

    return {
      archiveDir,
      outputPath,
      attemptsLoaded: loaded.attempts.length,
      recordCount: records.length,
      loadIssues: loaded.issues,
      dropped,
      dryRun,
      records,
    };
  });
```

Then update `src/report/write-data-js.ts`'s `writeDataJs` signature to accept `ReadonlyArray<WebappRecord>` of the new shape (the `JSON.stringify` body is unchanged — verify it does not reference scenario fields). Delete `load-archives.ts(.test)` and `write-events.ts(.test)`. Update the report CLI command (find it under `src/cli/`) and `src/main.ts` to stop passing `currentPromptCorpus`/`currentScenarioCorpus`, and update the operator-facing summary print to the new `ReportSummary` fields (`attemptsLoaded`, `dropped.incomplete`, `dropped.duplicate`).

> NOTE for implementer: grep for every importer of `aggregateAll`, `loadAllArchives`, `stripEventsForWire`, `writeEventFiles`, `toWebappRecord`, `ReportSummary` fields (`recordCount`, `archivesLoaded`, `duplicateArchiveIds`) and fix each. `npm run typecheck` is the backstop — it must be clean before commit.

- [ ] **Step 4: Run it, verify it passes + typecheck**

Run: `npx vitest run src/report/index.test.ts && npm run typecheck`
Expected: PASS + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add -A src/report src/main.ts src/cli
git commit -m "feat(report): clean-break ingestion of attempt archives; drop legacy read path"
```

---

### Task 5: Webapp data mirror (`webapp/src/lib/data.ts`)

**Files:**
- Modify: `webapp/src/lib/data.ts`
- Test: `webapp/src/lib/data.test.ts`

**Interfaces:**
- Produces: `BenchmarkResult` (type matching the new `WebappRecord` snake_case shape) + `normalizeRecord(raw: unknown): BenchmarkResult` + `loadBenchmarkData(): BenchmarkResult[]` (reads `globalThis.__BENCHMARK_DATA`).

- [ ] **Step 1: Read the current file** (`webapp/src/lib/data.ts`) to match its existing `normalizeRecord` style and the `__BENCHMARK_DATA` read.

- [ ] **Step 2: Write the failing test**

Replace `webapp/src/lib/data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeRecord } from "./data";

const raw = {
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llama-server",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "att-1",
  finished_at: "t", score: 0.5, passed: false, generation_tokens: 300,
  wall_time_sec: 6, item_count: 2, passed_items: 1,
};

describe("normalizeRecord", () => {
  it("passes the per-attempt config×challenge fields through", () => {
    const r = normalizeRecord(raw);
    expect(r.config_hash).toBe("ch");
    expect(r.challenge_id).toBe("code");
    expect(r.generation_tokens).toBe(300);
    expect(r.passed).toBe(false);
  });

  it("coerces a missing quant to null", () => {
    const r = normalizeRecord({ ...raw, quant: undefined });
    expect(r.quant).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd webapp && npx vitest run src/lib/data.test.ts`
Expected: FAIL.

- [ ] **Step 4: Replace the type + `normalizeRecord` in `webapp/src/lib/data.ts`**

```ts
export interface BenchmarkResult {
  readonly config_id: string;
  readonly config_hash: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  readonly system_prompt: string;
  readonly max_tokens: number;
  readonly challenge_id: string;
  readonly challenge_version: number;
  readonly attempt_id: string;
  readonly finished_at: string;
  readonly score: number;
  readonly passed: boolean;
  readonly generation_tokens: number;
  readonly wall_time_sec: number;
  readonly item_count: number;
  readonly passed_items: number;
}

export const normalizeRecord = (raw: unknown): BenchmarkResult => {
  const r = raw as Record<string, unknown>;
  return {
    config_id: String(r.config_id ?? ""),
    config_hash: String(r.config_hash ?? ""),
    artifact: String(r.artifact ?? ""),
    runtime: String(r.runtime ?? ""),
    quant: r.quant == null ? null : String(r.quant),
    temperature: Number(r.temperature ?? 0),
    system_prompt: String(r.system_prompt ?? ""),
    max_tokens: Number(r.max_tokens ?? 0),
    challenge_id: String(r.challenge_id ?? ""),
    challenge_version: Number(r.challenge_version ?? 0),
    attempt_id: String(r.attempt_id ?? ""),
    finished_at: String(r.finished_at ?? ""),
    score: Number(r.score ?? 0),
    passed: Boolean(r.passed),
    generation_tokens: Number(r.generation_tokens ?? 0),
    wall_time_sec: Number(r.wall_time_sec ?? 0),
    item_count: Number(r.item_count ?? 0),
    passed_items: Number(r.passed_items ?? 0),
  };
};
```

Remove the scenario mirror types and any `is_scenario`/`kind` discrimination. Keep `loadBenchmarkData` reading `globalThis.__BENCHMARK_DATA` but mapping through the new `normalizeRecord`.

> NOTE: `webapp/src/data/data.js` may currently hold old-shape records. Regenerate it by running the report over an attempt archive dir, or hand-write a minimal `globalThis.__BENCHMARK_DATA = []` so the app boots. Do NOT commit a stale large data.js.

- [ ] **Step 5: Run it, verify it passes; commit**

Run: `cd webapp && npx vitest run src/lib/data.test.ts`
Expected: PASS.

```bash
git add webapp/src/lib/data.ts webapp/src/lib/data.test.ts
git commit -m "feat(webapp): data mirror for per-attempt config×challenge records"
```

---

### Task 6: Config-axis aggregation + matrix (`pipeline.ts`)

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `BenchmarkResult` (new shape).
- Produces:
  - `bestAttempt(records: BenchmarkResult[]): BenchmarkResult | null` (highest `score`).
  - `aggregateMatrix(records: BenchmarkResult[]): { columns: string[]; groups: ArtifactGroup[] }`.
  - Types: `Cell = { score: number; passed: boolean }`, `ConfigRow = { config_hash; artifact; runtime; quant; temperature; system_prompt; cells: Record<string, Cell>; passRate: number; efficiency: number | null; attemptsCompleted: number }`, `ArtifactGroup = { artifact: string; rows: ConfigRow[] }`.
- (Task 7 supplies `computeConfigScores`; this task may import it or, to keep the test self-contained, implement `passRate`/`efficiency` via the Task 7 function. Order: do Task 7 first if the implementer prefers — they are sibling pure functions. This plan defines Task 7's function signature in its Interfaces block so Task 6 can call it.)

- [ ] **Step 1: Read** `webapp/src/lib/pipeline.ts` to see the current exports (`groupRunsByModel` @335, `aggregateForRunList` @273, `aggregateForScatter`, `buildChallengeIndex` @31, `applyVariantFilters` @75) and which are imported by `__root.tsx`/components.

- [ ] **Step 2: Write the failing test** (append to / replace model-grouping suite in `webapp/src/lib/pipeline.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { aggregateMatrix, bestAttempt } from "./pipeline";
import type { BenchmarkResult } from "./data";

const rec = (o: Partial<BenchmarkResult>): BenchmarkResult => ({
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llama-server",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "a", finished_at: "t",
  score: 1, passed: true, generation_tokens: 100, wall_time_sec: 2,
  item_count: 1, passed_items: 1, ...o,
});

describe("bestAttempt", () => {
  it("returns the highest-score attempt", () => {
    const best = bestAttempt([rec({ score: 0.4 }), rec({ score: 0.9 }), rec({ score: 0.7 })]);
    expect(best!.score).toBe(0.9);
  });
});

describe("aggregateMatrix", () => {
  it("groups configs under artifact, columns = sorted challenges, cell = best attempt", () => {
    const { columns, groups } = aggregateMatrix([
      rec({ config_hash: "c1", challenge_id: "code", attempt_id: "1", score: 0.4, passed: false }),
      rec({ config_hash: "c1", challenge_id: "code", attempt_id: "2", score: 0.9, passed: true }),
      rec({ config_hash: "c1", challenge_id: "math", attempt_id: "3", score: 1, passed: true }),
      rec({ config_hash: "c2", artifact: "llama", challenge_id: "code", attempt_id: "4", score: 0.5, passed: false }),
    ]);
    expect(columns).toEqual(["code", "math"]);
    expect(groups.map((g) => g.artifact)).toEqual(["llama", "qwen"]);
    const qwen = groups.find((g) => g.artifact === "qwen")!;
    expect(qwen.rows[0]!.cells.code).toEqual({ score: 0.9, passed: true }); // best of 0.4/0.9
    expect(qwen.rows[0]!.cells.math).toEqual({ score: 1, passed: true });
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd webapp && npx vitest run src/lib/pipeline.test.ts -t aggregateMatrix`
Expected: FAIL.

- [ ] **Step 4: Implement in `pipeline.ts`** (add these; remove `groupRunsByModel`, `aggregateForRunList`, `aggregateForScatter`, `buildChallengeIndex`, `applyVariantFilters`'s model key once their consumers are migrated in Task 8):

```ts
import { computeConfigScores } from "./pipeline"; // same file — see Task 7
import type { BenchmarkResult } from "./data";

export interface Cell { score: number; passed: boolean; }
export interface ConfigRow {
  config_hash: string; artifact: string; runtime: string; quant: string | null;
  temperature: number; system_prompt: string;
  cells: Record<string, Cell>;
  passRate: number; efficiency: number | null; attemptsCompleted: number;
}
export interface ArtifactGroup { artifact: string; rows: ConfigRow[]; }

export const bestAttempt = (records: BenchmarkResult[]): BenchmarkResult | null =>
  records.reduce<BenchmarkResult | null>(
    (best, r) => (best === null || r.score > best.score ? r : best),
    null,
  );

export const aggregateMatrix = (
  records: BenchmarkResult[],
): { columns: string[]; groups: ArtifactGroup[] } => {
  const columns = [...new Set(records.map((r) => r.challenge_id))].sort();

  const byConfig = new Map<string, BenchmarkResult[]>();
  for (const r of records) {
    const list = byConfig.get(r.config_hash) ?? [];
    list.push(r);
    byConfig.set(r.config_hash, list);
  }

  const rows: ConfigRow[] = [];
  for (const [config_hash, attempts] of byConfig) {
    const head = attempts[0]!;
    const cells: Record<string, Cell> = {};
    for (const col of columns) {
      const best = bestAttempt(attempts.filter((a) => a.challenge_id === col));
      if (best !== null) cells[col] = { score: best.score, passed: best.passed };
    }
    const scores = computeConfigScores(attempts);
    rows.push({
      config_hash, artifact: head.artifact, runtime: head.runtime, quant: head.quant,
      temperature: head.temperature, system_prompt: head.system_prompt,
      cells, passRate: scores.passRate, efficiency: scores.efficiency,
      attemptsCompleted: attempts.length,
    });
  }

  const byArtifact = new Map<string, ConfigRow[]>();
  for (const row of rows) {
    const list = byArtifact.get(row.artifact) ?? [];
    list.push(row);
    byArtifact.set(row.artifact, list);
  }
  const groups = [...byArtifact.entries()]
    .map(([artifact, gRows]) => ({ artifact, rows: gRows }))
    .sort((a, b) => a.artifact.localeCompare(b.artifact));

  return { columns, groups };
};
```

- [ ] **Step 5: Run it, verify it passes; commit**

Run: `cd webapp && npx vitest run src/lib/pipeline.test.ts -t aggregateMatrix`
Expected: PASS (after Task 7's `computeConfigScores` exists — implement Task 7 in the same commit if needed).

```bash
git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
git commit -m "feat(webapp): config×challenge matrix aggregation (artifact groups, best-attempt cells)"
```

---

### Task 7: Two configuration-level scores

**Files:**
- Modify: `webapp/src/lib/pipeline.ts` (add `computeConfigScores`), `webapp/src/lib/constants.ts` (add `EFFICIENCY_SCALE`, `formatEfficiency`)
- Test: `webapp/src/lib/pipeline.test.ts` (scores suite), `webapp/src/lib/constants.test.ts`

**Interfaces:**
- Produces: `computeConfigScores(attempts: BenchmarkResult[]): { passRate: number; efficiency: number | null }`. `passRate` = passed/completed (0–1). `efficiency = (passRate × uniqueChallenges × attempts.length) / (Σ generation_tokens × Σ wall_time_sec) × EFFICIENCY_SCALE`, or `null` when the denominator is 0.
- Produces: `EFFICIENCY_SCALE = 1_000_000`; `formatEfficiency(e: number | null): string` → `"—"` for null, else `e.toFixed(2)`.

- [ ] **Step 1: Write the failing test** (`pipeline.test.ts`, scores suite):

```ts
import { computeConfigScores } from "./pipeline";

const r = (o: Partial<BenchmarkResult>): BenchmarkResult => rec(o); // reuse rec() helper

describe("computeConfigScores", () => {
  it("computes pass rate and efficiency with hand-checked values", () => {
    // 2 completed attempts: code passed (gen 100, wall 2), math failed (gen 200, wall 4).
    // passRate = 1/2 = 0.5; unique = 2; attempts = 2;
    // overallTokens = 300; timeSpent = 6; denom = 1800;
    // efficiency = (0.5 * 2 * 2) / 1800 * 1e6 = 1111.111...
    const s = computeConfigScores([
      r({ challenge_id: "code", passed: true, generation_tokens: 100, wall_time_sec: 2 }),
      r({ challenge_id: "math", passed: false, generation_tokens: 200, wall_time_sec: 4 }),
    ]);
    expect(s.passRate).toBeCloseTo(0.5, 10);
    expect(s.efficiency).toBeCloseTo(1111.1111, 3);
  });

  it("returns efficiency null when tokens or time are zero", () => {
    const s = computeConfigScores([r({ generation_tokens: 0, wall_time_sec: 5 })]);
    expect(s.efficiency).toBeNull();
    expect(s.passRate).toBe(1);
  });
});
```

And in `constants.test.ts`:

```ts
import { formatEfficiency } from "./constants";
it("formats efficiency, dash for null", () => {
  expect(formatEfficiency(null)).toBe("—");
  expect(formatEfficiency(1111.1111)).toBe("1111.11");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd webapp && npx vitest run src/lib/pipeline.test.ts -t computeConfigScores src/lib/constants.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `constants.ts`:

```ts
export const EFFICIENCY_SCALE = 1_000_000;
export const formatEfficiency = (e: number | null): string => (e === null ? "—" : e.toFixed(2));
```

In `pipeline.ts`:

```ts
import { EFFICIENCY_SCALE } from "./constants";

export const computeConfigScores = (
  attempts: BenchmarkResult[],
): { passRate: number; efficiency: number | null } => {
  const completed = attempts.length;
  if (completed === 0) return { passRate: 0, efficiency: null };
  const passed = attempts.filter((a) => a.passed).length;
  const passRate = passed / completed;
  const uniqueChallenges = new Set(
    attempts.map((a) => `${a.challenge_id}@${a.challenge_version}`),
  ).size;
  const overallTokens = attempts.reduce((s, a) => s + a.generation_tokens, 0);
  const timeSpent = attempts.reduce((s, a) => s + a.wall_time_sec, 0);
  const denom = overallTokens * timeSpent;
  if (denom === 0) return { passRate, efficiency: null };
  const efficiency = ((passRate * uniqueChallenges * completed) / denom) * EFFICIENCY_SCALE;
  return { passRate, efficiency };
};
```

- [ ] **Step 4: Run it, verify it passes; commit**

Run: `cd webapp && npx vitest run src/lib/pipeline.test.ts src/lib/constants.test.ts`
Expected: PASS.

```bash
git add webapp/src/lib/pipeline.ts webapp/src/lib/constants.ts webapp/src/lib/pipeline.test.ts webapp/src/lib/constants.test.ts
git commit -m "feat(webapp): per-config pass rate + efficiency score"
```

---

### Task 8: UI render — matrix table

**Files:**
- Modify: `webapp/src/routes/__root.tsx`, `webapp/src/components/RunGroupTable.tsx`, `webapp/src/components/RunRowItem.tsx`
- Test: `webapp/src/lib/run-summary.test.ts` (remove model-variant suite), component tests if present

**Interfaces:**
- Consumes: `aggregateMatrix(records)` → `{ columns, groups }`; `scoreBand`, `formatEfficiency`.

- [ ] **Step 1: Read** `__root.tsx` (lines ~70–100), `RunGroupTable.tsx` (lines ~24–120), `RunRowItem.tsx` (lines ~60–90) to see current props + render.

- [ ] **Step 2: Rewire `__root.tsx`** — replace the `aggregateForRunList(filtered)` + `groupRunsByModel(...)` calls (≈ lines 73–76) with:

```tsx
const { columns, groups } = aggregateMatrix(filtered);
// ...
<RunGroupTable columns={columns} groups={groups} expanded={expanded} onToggle={...} />
```

Remove the `handleRunClick` navigation to `/run/$model/$variant`; the row's only interaction is group expand/collapse (already handled by `RunGroupTable`).

- [ ] **Step 3: Rewrite `RunGroupTable.tsx`** to take `{ columns: string[]; groups: ArtifactGroup[]; expanded; onToggle }`. Header row: an identity column, then one `<th>` per challenge in `columns`, then `Pass %` and `Efficiency`. Each group renders an artifact header row (expand/collapse keyed on `artifact`, replacing `baseModel`) and, when expanded, its `ConfigRow`s via `RunRowItem`. Replace the `"{groups.length} models · ..."` label with `"{groups.length} artifacts · {totalConfigs} configs"`.

- [ ] **Step 4: Rewrite `RunRowItem.tsx`** to take a `ConfigRow` + `columns`. Identity cell: `{quant} · t{temperature} · {system_prompt}`. For each challenge column, render the cell: if `row.cells[col]` exists, show `score.toFixed(2)` (or ✓/✗ by `passed`) color-banded via `scoreBand(cell.score)`; else render an empty/`—` cell. Then `Pass %` = `(row.passRate * 100).toFixed(0) + "%"` banded via `scoreBand(row.passRate)`, and `Efficiency` = `formatEfficiency(row.efficiency)`.

- [ ] **Step 5: Re-fixture/remove tests**

Delete the `groupRunsByModel` suite (`pipeline.test.ts` lines ~276–354) and the `aggregateForScatter`/`aggregateForRunList` suites if those functions are removed. Remove `variantsForModel` suite in `run-summary.test.ts` if that function is deleted.

Run: `cd webapp && npm test && npm run typecheck`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add webapp/src
git commit -m "feat(webapp): render config×challenge matrix with two score columns"
```

---

### Task 9: Remove dead scenario + detail routes

**Files:**
- Delete: `webapp/src/routes/run.$model.$variant.tsx`, `run.$model.$variant.index.tsx`, `run.$model.$variant.scenarios.tsx`, `run.$model.$variant.scenarios.index.tsx`, `run.$model.$variant.scenarios.$name.tsx`
- Modify/Delete: `webapp/src/lib/run-summary.ts`, `webapp/src/components/RunHeader.tsx`, `webapp/src/lib/strip-thinking.ts` (only if scenario-only), `webapp/src/routeTree.gen.ts` (regenerated)
- Modify: any remaining importer of the deleted symbols

**Interfaces:** none produced; this is removal + regen.

- [ ] **Step 1: Delete the route files** listed above.

- [ ] **Step 2: Regenerate the route tree**

Run: `cd webapp && npm run build` (or the TanStack Router generate step the repo uses) so `routeTree.gen.ts` no longer references the deleted routes. If the repo generates on dev, run the dev/generate command instead.

- [ ] **Step 3: Remove orphaned code**

Grep `webapp/src` for `variantsForModel`, `recordsForVariant`, `VariantKey`, `RunHeader`, `groupRunsByModel`, `aggregateForScatter`, scenario fields (`is_scenario`, `scenario_name`, `events`, `blob_pool`). Delete now-unused functions/components and their tests. Keep anything still referenced by the matrix path.

- [ ] **Step 4: Verify**

Run: `cd webapp && npm test && npm run typecheck && npm run build`
Expected: all green; build succeeds with no dangling imports.

- [ ] **Step 5: Commit**

```bash
git add -A webapp
git commit -m "chore(webapp): remove scenario + per-config detail routes (deferred)"
```

---

## Self-Review

**Spec coverage:**
- Clean-break ingestion → Tasks 2–4. ✓
- Single prompt-record contract (no scenario) → Tasks 1, 5, 9. ✓
- Config rows grouped under artifact → Task 6 (`aggregateMatrix`), Task 8 (render). ✓
- Cell = best attempt; row = pooled pass rate → Tasks 6 (`bestAttempt`), 7 (`computeConfigScores`). ✓
- Efficiency score + zero guard + scaling → Task 7. ✓
- Matrix-only, detail deferred, scatter dropped, scenario routes removed → Tasks 8–9. ✓
- Both test surfaces + lint/typecheck → every task runs the relevant suite; Tasks 4/8/9 add typecheck/build gates. ✓

**Placeholder scan:** Backend tasks carry complete code. UI tasks (8–9) give exact prop shapes + edit targets with anchors and instruct the implementer to read the real component first (these are mechanical re-keyings against existing JSX where full reproduction would be guesswork without the current markup) — acceptable per the same rationale as Phase 2's prompt-rewrite tasks.

**Type consistency:** `WebappRecord` (snake_case) is identical across Task 1 (producer) and Task 5 (`BenchmarkResult` mirror). `computeConfigScores` signature in Task 7 matches its call site in Task 6. `aggregateMatrix` return `{ columns, groups }` matches the `__root.tsx`/`RunGroupTable` props in Task 8. `efficiency: number | null` is consistent across Tasks 6–8 and `formatEfficiency`.

**Note for the executor:** Tasks 6 and 7 are sibling pure functions in the same file; if the implementer takes Task 6 first, `computeConfigScores` won't exist yet — implement Task 7's two functions in the same working session (the plan orders 6 then 7 for narrative, but they land together or 7-before-6).
