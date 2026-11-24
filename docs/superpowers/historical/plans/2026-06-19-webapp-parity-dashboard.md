# Webapp Parity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the model-comparison dashboard (aggregate leaderboard + cost-vs-quality scatter + filters + per-item drilldown) rewired to the current per-attempt `(config × challenge)` data model, enriched with the v2-archive fields the original needs.

**Architecture:** The backend report pipeline (`src/report/`) enriches the `WebappRecord` contract with three attempt-grain fields and emits one lazy `webapp/public/details/<attempt_id>.json` per completed v2 attempt; `data.js` stays the eager record array. The webapp (`webapp/src/`) consumes the field-for-field-identical `BenchmarkResult`, aggregates records by `config_hash` (pooled-over-items pass-rate) into a family-grouped leaderboard and a per-config scatter, narrows via TanStack Router search-param filters, and expands rows in-place (URL state) into per-challenge breakdowns and lazily-fetched per-item detail.

**Tech Stack:** TypeScript, Effect-TS (`@effect/platform` FileSystem/Path), Vitest, React 19, TanStack Router/Start, hand-rolled SVG/CSS (no charting lib).

## Global Constraints

- No new runtime deps — scatter/bars are hand-rolled SVG/CSS.
- Field-for-field identity between backend `WebappRecord` (`src/report/webapp-contract.ts`) and webapp `BenchmarkResult` (`webapp/src/lib/data.ts`) is a standing invariant.
- Biome bans `!` (non-null assertion) and `throw` in non-test `src/`. `scripts/lint-strict.sh` bans `try/catch` even in `*.test.ts` — use Effect channels / vitest lifecycle hooks (`beforeEach`/`afterEach`) for cleanup, never `try/catch`.
- `FileIOError` is constructed with `{ path, operation, cause }`.
- `Runtime` literals are `"llamacpp"` / `"mlx"`.
- Webapp is excluded from Biome and has NO `.test.tsx`; root `npm test` globs `webapp/src/**/*.test.ts` into one combined number (currently 594).
- Don't perturb hashing — golden `challengeHash 71c5f440ce49` must not move.
- Backend tests: `npx vitest run <path>`. Full suite: `npm test`. Webapp typecheck: `cd webapp && npx tsc --noEmit`. Webapp build: `cd webapp && npm run build`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Backend (`src/report/`)**
- `webapp-contract.ts` — MODIFY: add `peak_memory_gb` / `generation_tps` / `prompt_tps` to `WebappRecord` + `toWebappRecord`.
- `webapp-contract.test.ts` — MODIFY: assert max/mean of the three new fields on a multi-item fixture.
- `data.ts` (webapp) — MODIFY: mirror the three fields into `BenchmarkResult` + `normalizeRecord`.
- `load-attempts.ts` — MODIFY: thread `sourcePath` onto `LoadedAttempt`.
- `aggregate.ts` — MODIFY: carry `sourcePath` onto each record-producing attempt so the detail writer can reconstruct.
- `write-details.ts` — CREATE: per-completed-attempt detail-file writer over `loadAttemptReconstruction`.
- `write-details.test.ts` — CREATE: v2 shape + v1-skip.
- `index.ts` — MODIFY: call `writeDetails` after `writeDataJs`; `ReportSummary` gains `detailsWritten` / `detailsSkipped`.
- `index.test.ts` — MODIFY: assert a detail file materializes.
- `src/cli/commands/report.ts` — MODIFY: surface `detailsWritten`/`detailsSkipped` in the audit block.

**Webapp pipeline / lib (`webapp/src/lib/`)**
- `pipeline.ts` — MODIFY: pooled `computeConfigScores`; replace `aggregateMatrix` with `aggregateRuns` (`RunRow`/`RunGroup`/`RunSortKey`); add `computeScatterPoints` (`ScatterPoint`); add per-challenge breakdown helper.
- `pipeline.test.ts` — MODIFY/REPLACE matrix tests with pooled-pass-rate, aggregate, scatter, breakdown tests.
- `colors.ts` — CREATE (recover `1bc370e`): `familyColor`.
- `format.ts` — CREATE (recover `1bc370e`): `formatWallTime`.
- `hover-store.ts` — CREATE (recover `1bc370e`): hovered-model external store.
- `filter-state.ts` — CREATE (recover+rewire): `SearchState`, `csv`, `parseFilters`.
- `filter-state.test.ts` — CREATE: parse round-trip.

**Webapp components (`webapp/src/components/`)**
- `RunGroupTable.tsx` — REPLACE (recover+rewire `1bc370e`): family-grouped leaderboard.
- `RunRowItem.tsx` — REPLACE (recover+rewire `1bc370e`): one config row.
- `RunTable.module.css` — REPLACE (recover `1bc370e`).
- `Scatter.tsx` — CREATE (recover+simplify `1bc370e`): per-config SVG scatter.
- `Scatter.module.css` — CREATE (recover `1bc370e`).
- `ScatterLegend.tsx` — CREATE (recover+simplify `1bc370e`): family legend.
- `ScatterLegend.module.css` — CREATE (recover `1bc370e`).
- `FilterPanel.tsx` — CREATE (recover+rewire `1bc370e`): categorical filter chips.
- `FilterPanel.module.css` — CREATE (recover `1bc370e`).
- `DrilldownPanel.tsx` — CREATE: per-challenge breakdown + per-item detail.
- `DrilldownPanel.module.css` — CREATE.
- `ShiftFrame.tsx` / `ShiftFrame.module.css` — UNCHANGED (kept).

**Webapp routes / hooks (`webapp/src/`)**
- `routes/__root.tsx` — MODIFY: applyFilters → both views recompute; render scatter + filters + leaderboard + drilldown; URL search-param state.
- `lib/use-attempt-detail.ts` — CREATE: `useAttemptDetail(attemptId)` fetch hook against `/details/<id>.json`.

**Data (operator step)**
- `webapp/src/data/data.js` — REGENERATED by `./bench report`.
- `webapp/public/details/<attempt_id>.json` — MATERIALIZED by `./bench report`.

---

### Task 1: Backend — enrich `WebappRecord` with peak_memory_gb / generation_tps / prompt_tps

**Files:**
- Modify: `src/report/webapp-contract.ts`
- Test: `src/report/webapp-contract.test.ts`

**Interfaces:**
- Consumes: `AttemptManifest`, `ItemResult` from `../schema/attempt.js`; existing `round2`.
- Produces: `WebappRecord` gains `readonly peak_memory_gb: number; readonly generation_tps: number; readonly prompt_tps: number;`. `toWebappRecord(manifest, items): WebappRecord` unchanged signature, three more fields populated.

- [ ] **Step 1: Write the failing test**
  Append to `src/report/webapp-contract.test.ts` inside `describe("toWebappRecord", ...)`:
  ```ts
  it("aggregates peak_memory_gb (max), generation_tps (mean), prompt_tps (mean)", () => {
    const rec = toWebappRecord(manifest({}), [
      item({ peakMemoryGb: 1.2, generationTps: 10, promptTps: 4 }),
      item({ itemId: "i2", peakMemoryGb: 3.4, generationTps: 20, promptTps: 6 }),
    ]);
    expect(rec.peak_memory_gb).toBe(3.4); // max
    expect(rec.generation_tps).toBe(15); // mean (10+20)/2, 2dp
    expect(rec.prompt_tps).toBe(5); // mean (4+6)/2, 2dp
  });

  it("zeroes the new fields when there are no items", () => {
    const rec = toWebappRecord(manifest({}), []);
    expect(rec.peak_memory_gb).toBe(0);
    expect(rec.generation_tps).toBe(0);
    expect(rec.prompt_tps).toBe(0);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/report/webapp-contract.test.ts`  Expected: FAIL with "rec.peak_memory_gb is undefined" (property not yet on the record).
- [ ] **Step 3: Write minimal implementation**
  In `src/report/webapp-contract.ts`, add the three fields to the interface (after `passed_items`):
  ```ts
    readonly item_count: number;
    readonly passed_items: number;
    readonly peak_memory_gb: number;
    readonly generation_tps: number;
    readonly prompt_tps: number;
  ```
  And in `toWebappRecord`, after the `passed_items` line:
  ```ts
    item_count: items.length,
    passed_items: items.filter((i) => i.score === 1).length,
    peak_memory_gb: items.reduce((m, i) => (i.peakMemoryGb > m ? i.peakMemoryGb : m), 0),
    generation_tps:
      items.length === 0 ? 0 : round2(items.reduce((s, i) => s + i.generationTps, 0) / items.length),
    prompt_tps:
      items.length === 0 ? 0 : round2(items.reduce((s, i) => s + i.promptTps, 0) / items.length),
  });
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run src/report/webapp-contract.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/report/webapp-contract.ts src/report/webapp-contract.test.ts
  git commit -m "feat(contract): enrich WebappRecord with peak_memory_gb / generation_tps / prompt_tps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2: Webapp — mirror the three new fields into `BenchmarkResult` + `normalizeRecord`

**Files:**
- Modify: `webapp/src/lib/data.ts`
- Test: `webapp/src/lib/data.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BenchmarkResult` gains `readonly peak_memory_gb: number; readonly generation_tps: number; readonly prompt_tps: number;`. `normalizeRecord(raw): BenchmarkResult` populates them via `Number(... ?? 0)`. (Field-for-field identity with Task 1.)

- [ ] **Step 1: Write the failing test**
  Append to `webapp/src/lib/data.test.ts`:
  ```ts
  describe("normalizeRecord new fields", () => {
    it("coerces peak_memory_gb / generation_tps / prompt_tps with 0 fallback", () => {
      const a = normalizeRecord({ peak_memory_gb: 3.4, generation_tps: 15, prompt_tps: 5 });
      expect(a.peak_memory_gb).toBe(3.4);
      expect(a.generation_tps).toBe(15);
      expect(a.prompt_tps).toBe(5);
      const b = normalizeRecord({});
      expect(b.peak_memory_gb).toBe(0);
      expect(b.generation_tps).toBe(0);
      expect(b.prompt_tps).toBe(0);
    });
  });
  ```
  (Ensure `normalizeRecord` and `describe`/`it`/`expect` are imported at the top of the file — `import { describe, expect, it } from "vitest";` and `import { normalizeRecord } from "./data";` if not already present.)
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/data.test.ts`  Expected: FAIL with "expected undefined to be 3.4" (field not normalized yet).
- [ ] **Step 3: Write minimal implementation**
  In `webapp/src/lib/data.ts`, add to the `BenchmarkResult` interface (after `passed_items`):
  ```ts
    readonly item_count: number;
    readonly passed_items: number;
    readonly peak_memory_gb: number;
    readonly generation_tps: number;
    readonly prompt_tps: number;
  ```
  And in `normalizeRecord`, after the `passed_items` line:
  ```ts
      item_count: Number(r.item_count ?? 0),
      passed_items: Number(r.passed_items ?? 0),
      peak_memory_gb: Number(r.peak_memory_gb ?? 0),
      generation_tps: Number(r.generation_tps ?? 0),
      prompt_tps: Number(r.prompt_tps ?? 0),
    };
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/data.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/data.ts webapp/src/lib/data.test.ts
  git commit -m "feat(webapp-data): mirror peak_memory_gb / generation_tps / prompt_tps into BenchmarkResult

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3: Backend — thread `sourcePath` through load + aggregate

**Files:**
- Modify: `src/report/load-attempts.ts`
- Modify: `src/report/aggregate.ts`
- Test: `src/report/aggregate.test.ts`, `src/report/load-attempts.test.ts`

**Interfaces:**
- Consumes: existing `LoadedAttempt { manifest, items }`, `toWebappRecord`.
- Produces:
  - `LoadedAttempt` gains `readonly sourcePath: string;` (absolute/joined path to the `.jsonl`).
  - `aggregateAttempts` returns the existing `AggregateResult` plus, on the result, a parallel list `readonly detailSources: ReadonlyArray<{ attemptId: string; sourcePath: string }>` — one per record kept, in record order, so the detail writer (Task 4) knows which file to reconstruct.

- [ ] **Step 1: Write the failing test**
  Append to `src/report/aggregate.test.ts`:
  ```ts
  describe("aggregateAttempts detailSources", () => {
    it("emits one {attemptId, sourcePath} per kept record, in record order", () => {
      const a = att({ attemptId: "a" });
      const b = att({ attemptId: "b" });
      const out = aggregateAttempts([
        { ...a, sourcePath: "/x/a.jsonl" },
        { ...b, sourcePath: "/x/b.jsonl" },
      ]);
      expect(out.detailSources).toEqual([
        { attemptId: "a", sourcePath: "/x/a.jsonl" },
        { attemptId: "b", sourcePath: "/x/b.jsonl" },
      ]);
    });
  });
  ```
  (The existing `att(...)` helper returns a `LoadedAttempt` without `sourcePath`; spread `sourcePath` in as above.)
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/report/aggregate.test.ts`  Expected: FAIL with "out.detailSources is undefined".
- [ ] **Step 3: Write minimal implementation**
  In `src/report/load-attempts.ts`, add `sourcePath` to the interface:
  ```ts
  export interface LoadedAttempt {
    readonly sourcePath: string;
    readonly manifest: AttemptManifest;
    readonly items: ReadonlyArray<ItemResult>;
  }
  ```
  In `parseAttempt`, change the returned value to carry the path (the function already receives `path`):
  ```ts
      return { sourcePath: path, manifest, items } satisfies LoadedAttempt;
  ```
  (`loadAttemptArchive` and `loadAttemptArchives` both call `parseAttempt(file/full, source)`, so the path flows through unchanged.)

  In `src/report/aggregate.ts`, add the parallel list to `AggregateResult` and populate it:
  ```ts
  export interface AggregateResult {
    readonly records: ReadonlyArray<WebappRecord>;
    readonly dropped: { readonly incomplete: number; readonly duplicate: number };
    readonly detailSources: ReadonlyArray<{ attemptId: string; sourcePath: string }>;
  }

  const isCompleted = (a: LoadedAttempt): boolean =>
    a.manifest.finishedAt !== null && a.manifest.interrupted === false;

  export const aggregateAttempts = (attempts: ReadonlyArray<LoadedAttempt>): AggregateResult => {
    let incomplete = 0;
    let duplicate = 0;
    const seen = new Set<string>();
    const records: WebappRecord[] = [];
    const detailSources: { attemptId: string; sourcePath: string }[] = [];
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
      detailSources.push({ attemptId: a.manifest.attemptId, sourcePath: a.sourcePath });
    }
    return { records, dropped: { incomplete, duplicate }, detailSources };
  };
  ```
  Also update the existing `att(...)` helper in `src/report/aggregate.test.ts` to include `sourcePath: "/x/att.jsonl"` so pre-existing tests still type-check, and likewise add `sourcePath: file` wherever `load-attempts.test.ts` constructs an expected `LoadedAttempt` (it asserts the loaded shape — add the field to its expectation).
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run src/report/aggregate.test.ts src/report/load-attempts.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/report/load-attempts.ts src/report/aggregate.ts src/report/aggregate.test.ts src/report/load-attempts.test.ts
  git commit -m "feat(report): thread attempt sourcePath through load + aggregate for detail emission

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4: Backend — `write-details.ts` per-attempt detail writer

**Files:**
- Create: `src/report/write-details.ts`
- Test: `src/report/write-details.test.ts`

**Interfaces:**
- Consumes: `loadAttemptReconstruction(file): Effect<ReconstructedAttempt, NotReconstructible, FileSystem | Path>` from `./reconstruct.js`; `aggregateAttempts(...).detailSources` (Task 3); `WebappRecord` (for the in-memory `ItemResult` join via the loaded attempt).
- Produces:
  ```ts
  export interface DetailWriteResult { readonly written: number; readonly skipped: number; }
  export const writeDetails = (
    detailsDir: string,
    sources: ReadonlyArray<{ attemptId: string; sourcePath: string }>,
  ): Effect.Effect<DetailWriteResult, FileIOError, FileSystem.FileSystem | Path.Path>
  ```
  Behavior: for each source, attempt `loadAttemptReconstruction(sourcePath)`. On success, write `<detailsDir>/<attemptId>.json` with the §3.2 shape and increment `written`. On `NotReconstructible` (v1, missing store, missing scorerHash), increment `skipped` and continue (graceful skip). `FileIOError` (directory mkdir / file write) propagates.

- [ ] **Step 1: Write the failing test**
  Create `src/report/write-details.test.ts`:
  ```ts
  import { mkdtemp, rm, readFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { NodeContext } from "@effect/platform-node";
  import { Effect } from "effect";
  import { afterEach, beforeEach, describe, expect, it } from "vitest";
  import { scorerHash, writeBlob } from "../archive/content-store.js";
  import { writeDetails } from "./write-details.js";

  const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };

  const v2Header = {
    schemaVersion: 2,
    attemptId: "att-x",
    startedAt: "t",
    finishedAt: "t",
    interrupted: false,
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
    passThreshold: 0.8,
    env: { hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" },
    aggregate: { score: 1, passed: true },
  };

  const v1Header = { ...v2Header, schemaVersion: 1, attemptId: "att-v1" };

  describe("writeDetails", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "details-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("writes one detail file per v2 attempt with the joined per-item shape", async () => {
      const sh = scorerHash(SCORER as never);
      const item = {
        itemId: "i", promptName: "i", promptHash: "ph", itemHash: "ih", scorerHash: sh,
        executedAt: "t", promptTokens: 1, generationTokens: 1, promptTps: 1, generationTps: 1,
        peakMemoryGb: 0, wallTimeSec: 0, output: "4", reasoning: null, rawOutput: "4",
        error: null, score: 1,
      };
      const file = join(dir, "att-x.jsonl");
      const out = join(dir, "out");
      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
            yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
            yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
            yield* writeBlob(dir, "system", "cfg", "Be concise.");
            yield* Effect.promise(() =>
              writeFile(file, `${JSON.stringify(v2Header)}\n${JSON.stringify(item)}\n`),
            );
            return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }]);
          }),
          NodeContext.layer,
        ),
      );
      expect(result).toEqual({ written: 1, skipped: 0 });
      const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
      expect(detail.attempt_id).toBe("att-x");
      expect(detail.config_hash).toBe("cfg");
      expect(detail.challenge_id).toBe("ch");
      expect(detail.system_prompt_text).toBe("Be concise.");
      expect(detail.items[0].prompt_text).toBe("What is 2+2?");
      expect(detail.items[0].output).toBe("4");
      expect(detail.items[0].score).toBe(1);
      expect(detail.items[0].scorer.type).toBe("exact_match");
    });

    it("skips a v1 attempt gracefully (no file, counted as skipped)", async () => {
      const file = join(dir, "att-v1.jsonl");
      const out = join(dir, "out");
      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
            yield* Effect.promise(() => writeFile(file, `${JSON.stringify(v1Header)}\n`));
            return yield* writeDetails(out, [{ attemptId: "att-v1", sourcePath: file }]);
          }),
          NodeContext.layer,
        ),
      );
      expect(result).toEqual({ written: 0, skipped: 1 });
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/report/write-details.test.ts`  Expected: FAIL with "Cannot find module './write-details.js'".
- [ ] **Step 3: Write minimal implementation**
  Create `src/report/write-details.ts`:
  ```ts
  /**
   * Emit one lazy per-item detail file per completed, reconstructible (v2)
   * attempt: `<detailsDir>/<attempt_id>.json`. Built by joining
   * `loadAttemptReconstruction` (system prompt + per-item prompt text + scorer)
   * with the in-memory `ItemResult` fields (output, reasoning, score, error).
   * v1 / non-reconstructible attempts are skipped gracefully — the record still
   * appears in `data.js`, only its drilldown is unavailable.
   */
  import { FileSystem, Path } from "@effect/platform";
  import { Effect } from "effect";
  import { FileIOError } from "../errors/index.js";
  import { loadAttemptReconstruction } from "./reconstruct.js";

  export interface DetailWriteResult {
    readonly written: number;
    readonly skipped: number;
  }

  const toFileIOError =
    (path: string, operation: string) =>
    (cause: unknown): FileIOError =>
      new FileIOError({ path, operation, cause: String(cause) });

  export const writeDetails = (
    detailsDir: string,
    sources: ReadonlyArray<{ attemptId: string; sourcePath: string }>,
  ): Effect.Effect<DetailWriteResult, FileIOError, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathSvc = yield* Path.Path;
      yield* fs
        .makeDirectory(detailsDir, { recursive: true })
        .pipe(Effect.mapError(toFileIOError(detailsDir, "mkdir-details-dir")));

      let written = 0;
      let skipped = 0;
      for (const { attemptId, sourcePath } of sources) {
        const recon = yield* Effect.either(loadAttemptReconstruction(sourcePath));
        if (recon._tag === "Left") {
          skipped++;
          continue;
        }
        const { manifest, systemPromptText, items } = recon.right;
        const payload = {
          attempt_id: manifest.attemptId,
          config_id: manifest.configId,
          config_hash: manifest.configHash,
          artifact: manifest.artifact,
          challenge_id: manifest.challengeId,
          challenge_version: manifest.challengeVersion,
          system_prompt_text: systemPromptText,
          items: items.map(({ item, promptText, scorer }) => ({
            item_id: item.itemId,
            prompt_name: item.promptName,
            prompt_text: promptText,
            output: item.output,
            reasoning: item.reasoning,
            score: item.score,
            error: item.error,
            scorer,
          })),
        };
        const outPath = pathSvc.join(detailsDir, `${attemptId}.json`);
        yield* fs
          .writeFileString(outPath, JSON.stringify(payload), { flag: "w" })
          .pipe(Effect.mapError(toFileIOError(outPath, "write-detail")));
        written++;
      }
      return { written, skipped };
    });
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run src/report/write-details.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/report/write-details.ts src/report/write-details.test.ts
  git commit -m "feat(report): write-details.ts — lazy per-attempt detail files (v1 skipped gracefully)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 5: Backend — wire `writeDetails` into `runReport` + `ReportSummary`

**Files:**
- Modify: `src/report/index.ts`
- Modify: `src/cli/commands/report.ts`
- Test: `src/report/index.test.ts`

**Interfaces:**
- Consumes: `writeDetails(detailsDir, sources): Effect<DetailWriteResult, FileIOError, FileSystem | Path>` (Task 4); `aggregateAttempts(...).detailSources` (Task 3).
- Produces: `ReportSummary` gains `readonly detailsWritten: number; readonly detailsSkipped: number;`. `runReport` writes `data.js` then details into `<dirname(outputPath)>/../../public/details` — i.e. `webapp/public/details` relative to `webapp/src/data/data.js`. New helper `defaultDetailsDir(outputPath)`.

- [ ] **Step 1: Write the failing test**
  Append to `src/report/index.test.ts` (the existing test writes a v1 attempt; add a v2 case that materializes a detail file). Add a second `it` inside `describe("runReport", ...)`:
  ```ts
  it("writes a detail file for a v2 attempt and reports detailsWritten", async () => {
    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const base = `/tmp/p4-report-${process.pid}`;
        const dir = `${base}/archive`;
        const out = `${base}/webapp/src/data/data.js`;
        yield* fs.makeDirectory(dir, { recursive: true });
        const sh = "deadbeef";
        const header = {
          schemaVersion: 2, attemptId: "att-v2", startedAt: "t", finishedAt: "t2",
          interrupted: false, configId: "cfg", configHash: "ch", artifact: "qwen",
          runtime: "llamacpp", quant: "q4", temperature: 0, systemPrompt: "concise",
          maxTokens: 512, challengeId: "code", challengeVersion: 1, challengeHash: "xh",
          passThreshold: 0.8,
          env: { hostname: "h", platform: "p", runtimeVersion: "1", nodeVersion: "1", benchmarkGitSha: "s" },
          aggregate: { score: 1, passed: true },
        };
        const item = {
          itemId: "i1", promptName: "p", promptHash: "ph", itemHash: "ih", scorerHash: sh,
          executedAt: "t", promptTokens: 1, generationTokens: 100, promptTps: 1, generationTps: 1,
          peakMemoryGb: 0, wallTimeSec: 2, output: "o", reasoning: null, rawOutput: "o",
          error: null, score: 1,
        };
        yield* fs.makeDirectory(`${dir}/content/prompts`, { recursive: true });
        yield* fs.makeDirectory(`${dir}/content/scorers`, { recursive: true });
        yield* fs.makeDirectory(`${dir}/content/system`, { recursive: true });
        yield* fs.writeFileString(`${dir}/content/prompts/ph.txt`, "PROMPT");
        yield* fs.writeFileString(`${dir}/content/scorers/${sh}.json`, JSON.stringify({ type: "exact_match", expected: "4", extract: "(\\d+)" }));
        yield* fs.writeFileString(`${dir}/content/system/ch.txt`, "SYS");
        yield* fs.writeFileString(`${dir}/att-v2.jsonl`, `${JSON.stringify(header)}\n${JSON.stringify(item)}\n`);
        const s = yield* runReport({ archiveDir: dir, outputPath: out });
        const detail = yield* fs.readFileString(`${base}/webapp/public/details/att-v2.json`);
        expect(detail).toContain('"attempt_id":"att-v2"');
        expect(detail).toContain('"prompt_text":"PROMPT"');
        return s;
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.detailsWritten).toBe(1);
    expect(summary.detailsSkipped).toBe(0);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/report/index.test.ts`  Expected: FAIL with "summary.detailsWritten is undefined" / detail file not found.
- [ ] **Step 3: Write minimal implementation**
  In `src/report/index.ts`:
  - import: `import { type DetailWriteResult, writeDetails } from "./write-details.js";`
  - add to `ReportSummary` (after `dryRun`):
    ```ts
      readonly detailsWritten: number;
      readonly detailsSkipped: number;
    ```
  - add the details-dir helper next to `defaultOutputPath`:
    ```ts
    const defaultDetailsDir = (outputPath: string): string => {
      // outputPath is .../webapp/src/data/data.js → details live at .../webapp/public/details
      const webappRoot = path.resolve(path.dirname(outputPath), "..", "..");
      return path.join(webappRoot, "public", "details");
    };
    ```
  - in `runReport`, destructure `detailSources` and run the writer:
    ```ts
        const { records, dropped, detailSources } = aggregateAttempts(loaded.attempts);

        let details: DetailWriteResult = { written: 0, skipped: 0 };
        if (!dryRun) {
          yield* writeDataJs(outputPath, records);
          details = yield* writeDetails(defaultDetailsDir(outputPath), detailSources);
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
          detailsWritten: details.written,
          detailsSkipped: details.skipped,
        };
    ```
  In `src/cli/commands/report.ts`, extend `logAuditBlock` after the "wrote N cells" line:
  ```ts
    yield* Effect.logInfo(
      `report: details ${summary.detailsWritten} written, ${summary.detailsSkipped} skipped (v1/no-store)`,
    );
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run src/report/index.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add src/report/index.ts src/cli/commands/report.ts src/report/index.test.ts
  git commit -m "feat(report): emit public/details/ after data.js; ReportSummary gains detailsWritten/detailsSkipped

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 6: Data prerequisite (OPERATOR / manual — non-TDD)

> This task is a manual operator step, not a code change. It regenerates the build/validation dataset so Tasks 7–15 build against real enriched data. There is no test/commit here; the produced `data.js` + `public/details/` are gitignored build artifacts (confirm with `git status` — they should not be staged unless the repo tracks them).

**Files:** (produced, not edited) `webapp/src/data/data.js`, `webapp/public/details/*.json`

- [ ] **Step 1: Fan a small v2 submit set across the challenge set**
  Use the `/qa` Tier-B small model — `smoke-config` in `configs.yaml` (`Qwen/Qwen2.5-0.5B-Instruct-GGUF`, `llamacpp`, `Q4_K_M`). Run a fan of ~3 temperatures so several leaderboard rows / scatter dots populate. For each temperature `T ∈ {0.0, 0.4, 0.8}` and each challenge YAML in `challenges/` (`code, constraint, effect-ts, factual, logic, math` — skip `smoke.yaml`), submit:
  ```bash
  # Repeat per temperature. The 0.5B model is cheap; distinct temps defeat the
  # cross-run cache (outputs differ), so each (config,challenge,temp) actually runs.
  for ch in code constraint effect-ts factual logic math; do
    ./bench submit --config smoke-config --challenge "challenges/$ch.yaml" --temperature 0.0
  done
  # then re-run the loop with --temperature 0.4 and --temperature 0.8
  ```
  (If `./bench submit` does not accept a `--temperature` override, instead add two temperature variants of `smoke-config` to `configs.yaml` — `smoke-config-t04`, `smoke-config-t08` — and submit each config id across the six challenges. Confirm the flag with `./bench submit --help` before fanning.)
- [ ] **Step 2: Regenerate the report**
  ```bash
  ./bench report --archive-dir ./benchmark-archive --output ./webapp/src/data
  ```
- [ ] **Step 3: Verify**
  - The CLI audit block reports `details N written, 0 skipped` with `N` = number of completed v2 attempts.
  - Spot-check an attempt archive: `head -1 benchmark-archive/<one>.jsonl` shows `"schemaVersion":2` and the item lines carry `"scorerHash"`.
  - Detail files materialized: `ls webapp/public/details/*.json` is non-empty; open one and confirm the §3.2 shape (`attempt_id`, `system_prompt_text`, `items[].prompt_text` / `output` / `scorer`).
  - `webapp/src/data/data.js` contains the three new fields: `grep -o '"peak_memory_gb"' webapp/src/data/data.js | head` is non-empty.
- [ ] **Step 4: (no commit — build artifacts)**

---

### Task 7: Webapp pipeline — pooled-over-items `computeConfigScores`

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `BenchmarkResult` (now with `item_count` / `passed_items`); `EFFICIENCY_SCALE` from `./constants`.
- Produces: `computeConfigScores(attempts: BenchmarkResult[]): { passRate: number; efficiency: number | null }` — same signature, pooled passRate.

- [ ] **Step 1: Write the failing test**
  In `webapp/src/lib/pipeline.test.ts`, replace the `describe("computeConfigScores", ...)` block with:
  ```ts
  describe("computeConfigScores (pooled over items)", () => {
    it("passRate = Σ passed_items / Σ item_count across attempts", () => {
      // attempt A: 3 of 4 items passed; attempt B: 1 of 4 items passed
      // pooled passRate = (3+1)/(4+4) = 0.5
      const s = computeConfigScores([
        rec({ item_count: 4, passed_items: 3, generation_tokens: 100, wall_time_sec: 2, challenge_id: "code" }),
        rec({ item_count: 4, passed_items: 1, generation_tokens: 200, wall_time_sec: 4, challenge_id: "math" }),
      ]);
      // unique=2, completed=2, overallTokens=300, timeSpent=6, denom=1800
      // efficiency = (0.5 * 2 * 2) / 1800 * 1e6 = 1111.1111
      expect(s.passRate).toBeCloseTo(0.5, 10);
      expect(s.efficiency).toBeCloseTo(1111.1111, 3);
    });

    it("passRate falls back to 0 when Σ item_count == 0", () => {
      const s = computeConfigScores([rec({ item_count: 0, passed_items: 0 })]);
      expect(s.passRate).toBe(0);
    });

    it("efficiency is null on zero token/time denom", () => {
      const s = computeConfigScores([rec({ item_count: 1, passed_items: 1, generation_tokens: 0, wall_time_sec: 5 })]);
      expect(s.efficiency).toBeNull();
      expect(s.passRate).toBe(1);
    });

    it("passRate 0 / efficiency null for empty attempts", () => {
      const s = computeConfigScores([]);
      expect(s.passRate).toBe(0);
      expect(s.efficiency).toBeNull();
    });
  });
  ```
  Update the shared `rec(...)` helper at the top of the file to include the new fields so it type-checks:
  ```ts
  const rec = (o: Partial<BenchmarkResult>): BenchmarkResult => ({
    config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llamacpp",
    quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
    challenge_id: "code", challenge_version: 1, attempt_id: "a", finished_at: "t",
    score: 1, passed: true, generation_tokens: 100, wall_time_sec: 2,
    item_count: 1, passed_items: 1, peak_memory_gb: 0, generation_tps: 0, prompt_tps: 0,
    ...o,
  });
  ```
  Remove the old `aggregateMatrix` and `bestAttempt` import lines and their `describe` blocks (they are deleted in Task 8).
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: FAIL (old `computeConfigScores` divides by attempt count, not item count; the 0.5 case still passes but the "pooled" 3/4 vs 1/4 case differs from per-attempt — and `aggregateMatrix`/`bestAttempt` imports now break compilation).
- [ ] **Step 3: Write minimal implementation**
  In `webapp/src/lib/pipeline.ts`, replace `computeConfigScores` body:
  ```ts
  export const computeConfigScores = (
    attempts: BenchmarkResult[],
  ): { passRate: number; efficiency: number | null } => {
    const completed = attempts.length;
    if (completed === 0) return { passRate: 0, efficiency: null };
    const totalItems = attempts.reduce((s, a) => s + a.item_count, 0);
    const passedItems = attempts.reduce((s, a) => s + a.passed_items, 0);
    const passRate = totalItems === 0 ? 0 : passedItems / totalItems;
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
  (Leave `bestAttempt`, `aggregateMatrix`, `Cell`, `ConfigRow`, `ArtifactGroup` in place for now — Task 8 deletes them. Keeping them means this task's only behavioral change is the pooled passRate.)
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
  git commit -m "feat(webapp-pipeline): pooled-over-items passRate in computeConfigScores

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 8: Webapp pipeline — replace `aggregateMatrix` with `aggregateRuns` (RunRow / RunGroup / RunSortKey)

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `computeConfigScores` (Task 7); `modelFamily` from `./data`.
- Produces:
  ```ts
  export type RunSortKey = "score" | "efficiency" | "memory";

  export interface RunRow {
    config_hash: string;
    artifact: string;
    family: string;
    runtime: string;
    quant: string | null;
    temperature: number;
    passRate: number;        // 0..1
    efficiency: number | null;
    tokens: number;          // Σ generation_tokens
    genTps: number;          // mean generation_tps across attempts
    mem: number;             // max peak_memory_gb
    wallTime: number;        // Σ wall_time_sec
    uniqueChallenges: number; // distinct (challenge_id,version)
    itemCount: number;        // Σ item_count
    attemptsCompleted: number;
  }

  export interface RunGroup {
    artifact: string;
    family: string;
    rows: RunRow[];          // sorted; rows[0] is the lead
  }

  export const aggregateRuns = (
    records: BenchmarkResult[],
    primary: RunSortKey,
    secondary: RunSortKey,
  ): RunGroup[];
  ```
  Group records by `config_hash` → one `RunRow`; group rows by `artifact` → one `RunGroup` sorted by `secondary`; groups sorted by their lead row under `primary` (score desc, others asc).

- [ ] **Step 1: Write the failing test**
  Add to `webapp/src/lib/pipeline.test.ts` (and import `aggregateRuns`, `type RunRow`, `type RunGroup`):
  ```ts
  describe("aggregateRuns", () => {
    it("one row per config_hash, grouped by artifact, with stats-block aggregates", () => {
      const groups = aggregateRuns(
        [
          rec({ config_hash: "c1", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 4, generation_tokens: 100, wall_time_sec: 2, generation_tps: 10, peak_memory_gb: 1.5 }),
          rec({ config_hash: "c1", challenge_id: "math", challenge_version: 1, item_count: 4, passed_items: 2, generation_tokens: 200, wall_time_sec: 4, generation_tps: 30, peak_memory_gb: 3.0 }),
          rec({ config_hash: "c2", artifact: "llama", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 1, generation_tokens: 50, wall_time_sec: 1, generation_tps: 5, peak_memory_gb: 8.0 }),
        ],
        "score",
        "score",
      );
      expect(groups.map((g) => g.artifact)).toEqual(["qwen", "llama"]); // qwen 0.75 > llama 0.25
      const qwen = groups.find((g) => g.artifact === "qwen");
      const row = qwen?.rows[0];
      expect(row?.passRate).toBeCloseTo(0.75, 10); // (4+2)/(4+4)
      expect(row?.tokens).toBe(300);
      expect(row?.wallTime).toBe(6);
      expect(row?.mem).toBe(3.0); // max
      expect(row?.genTps).toBe(20); // mean (10+30)/2
      expect(row?.uniqueChallenges).toBe(2);
      expect(row?.itemCount).toBe(8);
      expect(row?.attemptsCompleted).toBe(2);
      expect(row?.family).toBe("Qwen");
    });

    it("returns [] for empty input", () => {
      expect(aggregateRuns([], "score", "score")).toEqual([]);
    });
  });
  ```
  Delete the old `describe("aggregateMatrix", ...)` and `describe("bestAttempt", ...)` blocks and their imports.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: FAIL with "aggregateRuns is not exported".
- [ ] **Step 3: Write minimal implementation**
  In `webapp/src/lib/pipeline.ts`: delete `Cell`, `ConfigRow`, `ArtifactGroup`, `bestAttempt`, `aggregateMatrix`. Add `import { modelFamily } from "./data";` (alongside the existing `BenchmarkResult` import). Add:
  ```ts
  export type RunSortKey = "score" | "efficiency" | "memory";

  export interface RunRow {
    config_hash: string;
    artifact: string;
    family: string;
    runtime: string;
    quant: string | null;
    temperature: number;
    passRate: number;
    efficiency: number | null;
    tokens: number;
    genTps: number;
    mem: number;
    wallTime: number;
    uniqueChallenges: number;
    itemCount: number;
    attemptsCompleted: number;
  }

  export interface RunGroup {
    artifact: string;
    family: string;
    rows: RunRow[];
  }

  const meanOrZero = (values: number[]): number => {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  };

  const rowForConfig = (attempts: BenchmarkResult[]): RunRow | null => {
    const head = attempts[0];
    if (head === undefined) return null;
    const { passRate, efficiency } = computeConfigScores(attempts);
    return {
      config_hash: head.config_hash,
      artifact: head.artifact,
      family: modelFamily(head.artifact),
      runtime: head.runtime,
      quant: head.quant,
      temperature: head.temperature,
      passRate,
      efficiency,
      tokens: attempts.reduce((s, a) => s + a.generation_tokens, 0),
      genTps: meanOrZero(attempts.map((a) => a.generation_tps)),
      mem: attempts.reduce((m, a) => (a.peak_memory_gb > m ? a.peak_memory_gb : m), 0),
      wallTime: attempts.reduce((s, a) => s + a.wall_time_sec, 0),
      uniqueChallenges: new Set(attempts.map((a) => `${a.challenge_id}@${a.challenge_version}`)).size,
      itemCount: attempts.reduce((s, a) => s + a.item_count, 0),
      attemptsCompleted: attempts.length,
    };
  };

  const sortValue = (r: RunRow, key: RunSortKey): number =>
    key === "score" ? r.passRate : key === "efficiency" ? (r.efficiency ?? 0) : r.mem;

  // score desc; efficiency/memory asc.
  const compareRuns = (key: RunSortKey) => (a: RunRow, b: RunRow): number => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    return key === "score" ? vb - va : va - vb;
  };

  export const aggregateRuns = (
    records: BenchmarkResult[],
    primary: RunSortKey,
    secondary: RunSortKey,
  ): RunGroup[] => {
    const byConfig = new Map<string, BenchmarkResult[]>();
    for (const r of records) {
      const list = byConfig.get(r.config_hash) ?? [];
      list.push(r);
      byConfig.set(r.config_hash, list);
    }
    const rows: RunRow[] = [];
    for (const attempts of byConfig.values()) {
      const row = rowForConfig(attempts);
      if (row !== null) rows.push(row);
    }

    const byArtifact = new Map<string, RunRow[]>();
    for (const row of rows) {
      const list = byArtifact.get(row.artifact) ?? [];
      list.push(row);
      byArtifact.set(row.artifact, list);
    }

    const cmpSecondary = compareRuns(secondary);
    const cmpPrimary = compareRuns(primary);
    const tieBreak = (a: RunRow, b: RunRow): number =>
      a.runtime.localeCompare(b.runtime) ||
      (a.quant ?? "").localeCompare(b.quant ?? "") ||
      a.temperature - b.temperature;

    const groups: RunGroup[] = [];
    for (const [artifact, gRows] of byArtifact) {
      const sorted = gRows.slice().sort((a, b) => cmpSecondary(a, b) || tieBreak(a, b));
      const lead = sorted[0];
      if (lead === undefined) continue;
      groups.push({ artifact, family: lead.family, rows: sorted });
    }
    groups.sort((a, b) => {
      const la = a.rows[0];
      const lb = b.rows[0];
      if (la === undefined || lb === undefined) return 0;
      return cmpPrimary(la, lb) || a.artifact.localeCompare(b.artifact);
    });
    return groups;
  };
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
  git commit -m "feat(webapp-pipeline): replace aggregateMatrix with per-config aggregateRuns (RunRow/RunGroup)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 9: Webapp — recover `colors.ts` + `format.ts` + `hover-store.ts`

**Files:**
- Create: `webapp/src/lib/colors.ts`
- Create: `webapp/src/lib/format.ts`
- Create: `webapp/src/lib/hover-store.ts`
- Test: `webapp/src/lib/colors.test.ts`

**Interfaces:**
- Produces:
  - `familyColor(family: string | null): string` (`colors.ts`)
  - `formatWallTime(s: number): string` (`format.ts`)
  - `setHoveredModel(model: string): void`, `clearHoveredModel(): void`, `useHoveredModel(): string | null` (`hover-store.ts`)

- [ ] **Step 1: Write the failing test**
  Create `webapp/src/lib/colors.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { familyColor } from "./colors";

  describe("familyColor", () => {
    it("maps a known family to its swatch", () => {
      expect(familyColor("Qwen")).toBe("#6fa8dc");
    });
    it("falls back to Other for unknown / null", () => {
      expect(familyColor("Nope")).toBe("#9aa0a6");
      expect(familyColor(null)).toBe("#9aa0a6");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/colors.test.ts`  Expected: FAIL with "Cannot find module './colors'".
- [ ] **Step 3: Write minimal implementation**
  Create `webapp/src/lib/colors.ts` (recovered verbatim from `1bc370e`):
  ```ts
  const FAMILY_COLORS: Record<string, string> = {
    Llama: "#e06666",
    Qwen: "#6fa8dc",
    Mistral: "#93c47d",
    Gemma: "#b996de",
    DeepSeek: "#f6b26b",
    Phi: "#76d7c4",
    GPT: "#ffd966",
    GLM: "#c27ba0",
    Other: "#9aa0a6",
  };

  export const familyColor = (family: string | null): string => {
    if (family === null) return FAMILY_COLORS.Other;
    return FAMILY_COLORS[family] ?? FAMILY_COLORS.Other;
  };
  ```
  Create `webapp/src/lib/format.ts` (recovered verbatim from `1bc370e`):
  ```ts
  // Wall-time (seconds) → compact human string: "45s", "3m 12s", "2h 5m".
  export const formatWallTime = (s: number): string => {
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const sec = Math.round(s - m * 60);
      return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.round((s - h * 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };
  ```
  Create `webapp/src/lib/hover-store.ts` (recovered verbatim from `1bc370e`):
  ```ts
  import { useSyncExternalStore } from "react";

  type Listener = () => void;

  let hovered: string | null = null;
  const listeners = new Set<Listener>();

  export const getHoveredModel = (): string | null => hovered;

  export const setHoveredModel = (model: string): void => {
    if (hovered === model) return;
    hovered = model;
    for (const l of listeners) l();
  };

  export const clearHoveredModel = (): void => {
    if (hovered === null) return;
    hovered = null;
    for (const l of listeners) l();
  };

  export const subscribeHover = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  export const useHoveredModel = (): string | null =>
    useSyncExternalStore(subscribeHover, getHoveredModel, getHoveredModel);
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/colors.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/colors.ts webapp/src/lib/format.ts webapp/src/lib/hover-store.ts webapp/src/lib/colors.test.ts
  git commit -m "feat(webapp): recover colors.ts / format.ts / hover-store.ts from 1bc370e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 10: Webapp — recover + rewire leaderboard (`RunGroupTable` / `RunRowItem` / CSS); delete the matrix

**Files:**
- Modify (replace): `webapp/src/components/RunGroupTable.tsx`
- Modify (replace): `webapp/src/components/RunRowItem.tsx`
- Modify (replace): `webapp/src/components/RunTable.module.css`
- Modify: `webapp/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `aggregateRuns`, `RunGroup`, `RunRow`, `RunSortKey` (Task 8); `scoreBand`, `formatEfficiency` from `../lib/constants`; `familyColor` (`../lib/colors`); `formatWallTime` (`../lib/format`); `modelSizeB` from `../lib/data`; hover store.
- Produces: `RunGroupTable` (props below) and `RunRowItem` rewired to `RunRow`. No vitest (`.tsx`); verified by typecheck + build.

This is a `.tsx` task — its "test" is typecheck + build (webapp is Biome-excluded, no `.test.tsx`).

- [ ] **Step 1: Write the failing test**
  No vitest. The failing condition is the build: after rewiring `__root.tsx` to `aggregateRuns` but before the components compile against `RunRow`, `npm run build` fails. Capture the baseline first.
  Run: `cd webapp && npx tsc --noEmit`  Expected: FAIL once `__root.tsx` references the new API (Step 3 makes them consistent).
- [ ] **Step 2: Verify the red state**
  Run: `cd webapp && npx tsc --noEmit`  Expected: FAIL with type errors referencing `aggregateMatrix` / `ArtifactGroup` no longer existing (removed in Task 8) — confirming the old components/route are stale.
- [ ] **Step 3: Write minimal implementation**
  Replace `webapp/src/components/RunRowItem.tsx` entirely (rewired from `1bc370e` to `RunRow`; `passRate` is 0..1 here, multiply by 100 for display; `quant` may be null → `"—"`):
  ```tsx
  import styles from "./RunTable.module.css";
  import type { RunRow } from "../lib/pipeline";
  import { scoreBand, formatEfficiency } from "../lib/constants";
  import { formatWallTime } from "../lib/format";
  import { setHoveredModel, clearHoveredModel } from "../lib/hover-store";
  import { familyColor } from "../lib/colors";

  interface Props {
    row: RunRow;
    rank?: number; // group rank (1..N) — only on lead row
    compact: boolean;
    groupSize: number; // # configs in this group; show toggle when > 1 and lead
    expanded: boolean;
    onToggle?: () => void; // present on lead row when groupSize > 1
    onClick: () => void;
    maxTokens: number; // max tokens across all rendered rows, for token-bar scale
  }

  const abbrevRuntime = (runtime: string): string =>
    runtime === "llamacpp" ? "lcpp" : runtime;

  const variantTag = (r: RunRow): string =>
    `${abbrevRuntime(r.runtime)} · ${r.quant ?? "—"} · t${r.temperature}`;

  export function RunRowItem({ row, rank, compact, groupSize, expanded, onToggle, onClick, maxTokens }: Props) {
    const rowColor = familyColor(row.family);
    const scorePct = Math.max(0, Math.min(100, row.passRate * 100));
    const tokenPct = Math.max(0, Math.min(100, (row.tokens / Math.max(1, maxTokens)) * 100));
    const tokensTitle = `${Math.round(row.tokens).toLocaleString()} gen tokens (total)`;

    const handleMouseEnter = () => setHoveredModel(row.artifact);
    const handleMouseLeave = () => clearHoveredModel();

    const handleToggleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle?.();
    };

    const showToggle = !compact && groupSize > 1 && onToggle !== undefined;

    return (
      <div className={styles.runRowWrap}>
      <button
        type="button"
        className={`${styles.resultRow} ${styles.runRow}${compact ? ` ${styles.resultRowCompact}` : ""}`}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={styles.resultRowBreakdown}>
          <div className={styles.runBar}>
            <span className={styles.resultVariantTrack} title={tokensTitle}>
              <span
                className={styles.resultVariantFill}
                style={{ width: `${scorePct}%`, background: rowColor }}
              />
              <span
                className={styles.resultVariantTokens}
                style={{ width: `${tokenPct}%`, background: rowColor, boxShadow: `0 0 6px ${rowColor}` }}
              />
            </span>
          </div>
        </div>

        <div className={styles.resultRowAlways}>
          <div className={styles.resultRank}>
            {compact ? "" : (rank ?? "")}
          </div>
          <div className={styles.resultModel}>
            {compact ? (
              <div className={`${styles.resultModelName} ${styles.runRowVariant}`}>{variantTag(row)}</div>
            ) : (
              <>
                <div className={styles.resultModelName}>{row.artifact}</div>
                <div className={styles.resultModelFamily}>{variantTag(row)}</div>
              </>
            )}
            <div className={styles.resultCoverage}>
              {row.uniqueChallenges} challenges · {row.itemCount} items
            </div>
          </div>
          <div className={styles.resultScoreCell}>
            <div className={styles.resultScore} data-band={scoreBand(row.passRate)}>
              {scorePct.toFixed(0)}%
            </div>
            {!compact && <div className={styles.resultEfficiency}>{formatEfficiency(row.efficiency)}</div>}
          </div>
          <div className={styles.resultStats}>
            <div className={styles.resultStatCol}>
              <span className={styles.resultStatVal} title={`${Math.round(row.tokens).toLocaleString()} generation tokens (total)`}>
                {Math.round(row.tokens).toLocaleString()}
              </span>
              <span className={styles.resultStatUnit}>tok</span>
              <span className={styles.resultStatVal} title={`${row.genTps.toFixed(1)} generation tokens/sec (mean)`}>
                {row.genTps > 0 ? row.genTps.toFixed(0) : "—"}
              </span>
              <span className={styles.resultStatUnit}>tok/s</span>
            </div>
            <div className={styles.resultStatCol}>
              <span className={styles.resultStatVal} title={`${row.mem.toFixed(2)} GB peak memory`}>
                {row.mem.toFixed(1)}
              </span>
              <span className={styles.resultStatUnit}>GB</span>
              <span className={styles.resultStatVal} title={`${Math.round(row.wallTime).toLocaleString()}s total wall time`}>
                {row.wallTime > 0 ? formatWallTime(row.wallTime) : "—"}
              </span>
              <span className={styles.resultStatUnit}>wall</span>
            </div>
          </div>
        </div>

      </button>
      {showToggle && (
        <button
          type="button"
          className={styles.resultGroupToggle}
          aria-label={expanded ? "Collapse runs" : "Expand runs"}
          onClick={handleToggleClick}
        >
          <span className={styles.resultGroupToggleCaret}>{expanded ? "▾" : "▸"}</span>
          {groupSize - 1} more
        </button>
      )}
      </div>
    );
  }
  ```
  Replace `webapp/src/components/RunGroupTable.tsx` entirely (rewired from `1bc370e` to `RunGroup`/`RunRow`; sort controls drive `__root` state; `onRowClick` opens the drilldown):
  ```tsx
  import { useMemo, useState } from "react";
  import styles from "./RunTable.module.css";
  import type { RunGroup, RunRow, RunSortKey } from "../lib/pipeline";
  import { RunRowItem } from "./RunRowItem";

  interface Props {
    groups: RunGroup[];
    primary: RunSortKey;
    secondary: RunSortKey;
    onPrimaryChange: (k: RunSortKey) => void;
    onSecondaryChange: (k: RunSortKey) => void;
    onRowClick: (row: RunRow) => void;
  }

  const SORT_OPTIONS: { value: RunSortKey; label: string }[] = [
    { value: "score", label: "score" },
    { value: "efficiency", label: "efficiency" },
    { value: "memory", label: "memory" },
  ];

  export function RunGroupTable({
    groups, primary, secondary, onPrimaryChange, onSecondaryChange, onRowClick,
  }: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [allExpanded, setAllExpanded] = useState(false);

    const isExpanded = (artifact: string): boolean =>
      allExpanded ? true : expanded.has(artifact);

    const toggleGroup = (artifact: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(artifact)) next.delete(artifact);
        else next.add(artifact);
        return next;
      });
    };

    const toggleAll = () => {
      if (allExpanded) {
        setAllExpanded(false);
        setExpanded(new Set());
      } else {
        setAllExpanded(true);
      }
    };

    const totalRuns = useMemo(
      () => groups.reduce((s, g) => s + g.rows.length, 0),
      [groups],
    );

    const maxTokens = useMemo(() => {
      let m = 0;
      for (const g of groups) for (const r of g.rows) if (r.tokens > m) m = r.tokens;
      return m;
    }, [groups]);

    if (groups.length === 0) {
      return <div className={styles.resultEmpty}>No results match the current filters.</div>;
    }

    return (
      <div className={styles.resultTable}>
        <div className={styles.resultControls}>
          <span className={styles.resultCount}>
            {groups.length} models · {totalRuns} configs
          </span>
          <div className={styles.resultSort}>
            <label className={styles.resultSortGroup}>
              <span className={styles.resultSortLabel}>models by:</span>
              <select
                value={primary}
                onChange={(e) => onPrimaryChange(e.target.value as RunSortKey)}
                className={styles.resultSortSelect}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.resultSortGroup}>
              <span className={styles.resultSortLabel}>runs by:</span>
              <select
                value={secondary}
                onChange={(e) => onSecondaryChange(e.target.value as RunSortKey)}
                className={styles.resultSortSelect}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.resultSortBtn} onClick={toggleAll}>
              {allExpanded ? "collapse all" : "expand all"}
            </button>
          </div>
        </div>
        <div className={styles.resultHeader}>
          <div className={styles.resultRowBreakdown}>
            <div>Score / tokens</div>
          </div>
          <div className={styles.resultRowAlways}>
            <div className={styles.resultRank}>#</div>
            <div>Model / variant</div>
            <div className={styles.resultScoreHeader}>Score</div>
            <div className={styles.resultStatsHeader}>tok · t/s · mem · wall</div>
          </div>
        </div>
        {groups.map((g, gi) => {
          const open = isExpanded(g.artifact);
          const [lead, ...rest] = g.rows;
          if (lead === undefined) return null;
          return (
            <div key={g.artifact} className={styles.resultGroup}>
              <RunRowItem
                row={lead}
                rank={gi + 1}
                compact={false}
                groupSize={g.rows.length}
                expanded={open}
                onToggle={g.rows.length > 1 ? () => toggleGroup(g.artifact) : undefined}
                onClick={() => onRowClick(lead)}
                maxTokens={maxTokens}
              />
              {open && rest.map((r) => (
                <RunRowItem
                  key={r.config_hash}
                  row={r}
                  compact
                  groupSize={g.rows.length}
                  expanded={open}
                  onClick={() => onRowClick(r)}
                  maxTokens={maxTokens}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }
  ```
  Replace `webapp/src/components/RunTable.module.css` with the `1bc370e` version verbatim, then append the coverage line style:
  ```css
  /* (full RunTable.module.css recovered from 1bc370e — the .runRowWrap / subgrid
     layout, .resultRow/.resultRowCompact, .resultVariantTrack/Fill/Tokens,
     .resultStats/.resultStatCol/.resultStatVal/.resultStatUnit, .resultGroup,
     .runRowVariant, .runBar, .resultGroupToggle, two-axis .resultSort*,
     .resultTable/.resultControls/.resultHeader/.resultEmpty — paste 1bc370e
     content unchanged) */

  /* New: coverage line under the model/variant identity. */
  .resultCoverage {
    font-size: var(--fz-10);
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
    margin-top: var(--space-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ```
  Rewire `webapp/src/routes/__root.tsx` minimally to make the build green (full filter/scatter/drilldown wiring lands in Tasks 11–15; for now feed unfiltered `DATA`, fixed sort, and a no-op row click):
  ```tsx
  import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
  import { useMemo, useState } from "react";
  import { DATA } from "../lib/data";
  import { RunGroupTable } from "../components/RunGroupTable";
  import { ShiftFrame } from "../components/ShiftFrame";
  import { aggregateRuns, type RunRow, type RunSortKey } from "../lib/pipeline";
  import styles from "./index.module.css";

  export const Route = createRootRoute({ component: RootComponent });

  function RootComponent() {
    const location = useLocation();
    const navigate = useNavigate();
    const shifted = location.pathname.startsWith("/run/");

    const [primary, setPrimary] = useState<RunSortKey>("score");
    const [secondary, setSecondary] = useState<RunSortKey>("score");

    const groups = useMemo(() => aggregateRuns(DATA, primary, secondary), [primary, secondary]);
    const closeDetails = () => navigate({ to: "/", search: (s) => s as never });
    const onRowClick = (_row: RunRow) => {};

    const ranking = (
      <RunGroupTable
        groups={groups}
        primary={primary}
        secondary={secondary}
        onPrimaryChange={setPrimary}
        onSecondaryChange={setSecondary}
        onRowClick={onRowClick}
      />
    );

    return (
      <div className={styles.app}>
        <header className={styles.appHeader}>
          <h1>Benchmark Analysis</h1>
          <div className={styles.appSubtitle}>
            {DATA.length} attempts · {groups.length} models
          </div>
        </header>
        <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={null} ranking={ranking} details={<Outlet />} />
      </div>
    );
  }
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `cd webapp && npx tsc --noEmit && npm run build`  Expected: PASS (typecheck clean, build succeeds). Eyeball: `npm run dev`, confirm the leaderboard renders family-grouped rows with score bar, score band color, the 2×2 stats block, the coverage line, two sort selects, and expand/collapse-all.
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/components/RunGroupTable.tsx webapp/src/components/RunRowItem.tsx webapp/src/components/RunTable.module.css webapp/src/routes/__root.tsx
  git commit -m "feat(webapp): restore aggregate leaderboard (RunGroupTable/RunRowItem/CSS), delete matrix

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 11: Webapp pipeline — `computeScatterPoints`

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `BenchmarkResult`; `computeConfigScores` (Task 7); `modelFamily`, `modelSizeB` from `./data`.
- Produces:
  ```ts
  export interface ScatterPoint {
    config_hash: string; artifact: string; family: string;
    runtime: string; quant: string | null; temperature: number;
    x: number;              // Σ generation_tokens (cost, log axis)
    y: number;              // passRate 0..1 (quality)
    efficiency: number | null;
    sizeB: number | null;   // modelSizeB(artifact)
    peak_memory_gb: number; // max over the config's attempts
    generation_tps: number; // mean over the config's attempts
  }
  export const computeScatterPoints = (records: BenchmarkResult[]): ScatterPoint[];
  ```
  One point per `config_hash`.

- [ ] **Step 1: Write the failing test**
  Add to `webapp/src/lib/pipeline.test.ts` (import `computeScatterPoints`, `type ScatterPoint`):
  ```ts
  describe("computeScatterPoints", () => {
    it("one point per config_hash with cost-x / quality-y / size / mem / tps", () => {
      const pts = computeScatterPoints([
        rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "code", item_count: 4, passed_items: 4, generation_tokens: 100, wall_time_sec: 2, generation_tps: 10, peak_memory_gb: 1.5 }),
        rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "math", item_count: 4, passed_items: 2, generation_tokens: 200, wall_time_sec: 4, generation_tps: 30, peak_memory_gb: 3.0 }),
      ]);
      expect(pts).toHaveLength(1);
      const p = pts[0]!;
      expect(p.config_hash).toBe("c1");
      expect(p.family).toBe("Qwen");
      expect(p.x).toBe(300); // Σ generation_tokens
      expect(p.y).toBeCloseTo(0.75, 10); // (4+2)/(4+4)
      expect(p.sizeB).toBe(7);
      expect(p.peak_memory_gb).toBe(3.0); // max
      expect(p.generation_tps).toBe(20); // mean
    });

    it("returns [] for empty input", () => {
      expect(computeScatterPoints([])).toEqual([]);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: FAIL with "computeScatterPoints is not exported".
- [ ] **Step 3: Write minimal implementation**
  In `webapp/src/lib/pipeline.ts`, add `modelSizeB` to the `./data` import and append:
  ```ts
  export interface ScatterPoint {
    config_hash: string;
    artifact: string;
    family: string;
    runtime: string;
    quant: string | null;
    temperature: number;
    x: number;
    y: number;
    efficiency: number | null;
    sizeB: number | null;
    peak_memory_gb: number;
    generation_tps: number;
  }

  export const computeScatterPoints = (records: BenchmarkResult[]): ScatterPoint[] => {
    const byConfig = new Map<string, BenchmarkResult[]>();
    for (const r of records) {
      const list = byConfig.get(r.config_hash) ?? [];
      list.push(r);
      byConfig.set(r.config_hash, list);
    }
    const points: ScatterPoint[] = [];
    for (const attempts of byConfig.values()) {
      const head = attempts[0];
      if (head === undefined) continue;
      const { passRate, efficiency } = computeConfigScores(attempts);
      points.push({
        config_hash: head.config_hash,
        artifact: head.artifact,
        family: modelFamily(head.artifact),
        runtime: head.runtime,
        quant: head.quant,
        temperature: head.temperature,
        x: attempts.reduce((s, a) => s + a.generation_tokens, 0),
        y: passRate,
        efficiency,
        sizeB: modelSizeB(head.artifact),
        peak_memory_gb: attempts.reduce((m, a) => (a.peak_memory_gb > m ? a.peak_memory_gb : m), 0),
        generation_tps: meanOrZero(attempts.map((a) => a.generation_tps)),
      });
    }
    return points;
  };
  ```
  (`meanOrZero` already exists from Task 8.)
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
  git commit -m "feat(webapp-pipeline): computeScatterPoints — one cost/quality point per config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 12: Webapp — recover + rewire scatter (`Scatter` / `ScatterLegend` / CSS)

**Files:**
- Create: `webapp/src/components/Scatter.tsx`
- Create: `webapp/src/components/Scatter.module.css`
- Create: `webapp/src/components/ScatterLegend.tsx`
- Create: `webapp/src/components/ScatterLegend.module.css`
- Modify: `webapp/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `computeScatterPoints`, `ScatterPoint` (Task 11); `familyColor` (`../lib/colors`); `formatEfficiency` (`../lib/constants`); hover store.
- Produces: `Scatter({ points }: { points: ScatterPoint[] })`; `ScatterLegend({ families }: { families: Array<{ name: string; color: string }> })`. `.tsx` task — verified by typecheck + build.

This is a `.tsx` task — test = typecheck + build. The spec defers opacity/star-point/trajectory encodings; this is a simplified circle scatter (size = `modelSizeB`, color = family, tooltip = efficiency/mem/tps/identity).

- [ ] **Step 1: Establish the red state**
  Run: `cd webapp && npx tsc --noEmit`  Expected: PASS currently (scatter not yet referenced). The red state appears once `__root.tsx` imports `Scatter` (Step 3, before files exist) — write the route change last within Step 3.
- [ ] **Step 2: Confirm baseline build is green before changes**
  Run: `cd webapp && npm run build`  Expected: PASS (Task 10 left it green).
- [ ] **Step 3: Write minimal implementation**
  Create `webapp/src/components/ScatterLegend.module.css` (verbatim from `1bc370e`):
  ```css
  /* Scatter legend */
  .scatterLegend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-10);
    margin-top: var(--space-6);
    font-size: var(--fz-12);
    color: var(--text-muted);
    align-items: center;
  }
  .scatterLegendRow { display: flex; align-items: center; gap: var(--space-5); flex-wrap: wrap; }
  .scatterLegendGroup { color: var(--text-faint); }
  .scatterLegendFamily { display: flex; align-items: center; gap: var(--space-3); color: var(--text-primary); }
  .scatterLegendSwatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border-default); }
  .scatterLegendStar { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-muted); }
  ```
  Create `webapp/src/components/ScatterLegend.tsx` (simplified to the family swatch row only — the deferred tps/wall/mem legend rows are dropped per spec §5):
  ```tsx
  import styles from "./ScatterLegend.module.css";

  interface Props {
    families: Array<{ name: string; color: string }>;
  }

  export function ScatterLegend({ families }: Props) {
    return (
      <div className={styles.scatterLegend}>
        <div className={styles.scatterLegendRow}>
          <span className={styles.scatterLegendGroup}>family:</span>
          {families.map((f) => (
            <span key={f.name} className={styles.scatterLegendFamily}>
              <span className={styles.scatterLegendSwatch} style={{ background: f.color }} />
              {f.name}
            </span>
          ))}
        </div>
      </div>
    );
  }
  ```
  Create `webapp/src/components/Scatter.module.css` (verbatim from `1bc370e`):
  ```css
  /* Scatter chart */
  .scatterWrap {
    position: relative;
    background: var(--gray-950);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-8);
    padding: var(--space-8);
    margin: var(--space-8);
  }
  .scatterSvg { display: block; width: 100%; height: auto; }
  .scatterAxis { stroke: var(--border-strong); stroke-width: 1; }
  .scatterGrid { stroke: var(--gray-820); stroke-width: 1; }
  .scatterTick { fill: var(--text-muted); font-size: var(--fz-11); }
  .scatterAxisTitle { fill: var(--text-secondary); font-size: var(--fz-12); font-weight: 500; }
  .scatterDot { stroke: var(--surface); stroke-width: 1.2; cursor: pointer; transition: fill-opacity 0.1s, stroke-width 0.1s; }
  .scatterDot:hover { stroke: var(--gray-50); stroke-width: 2.2; }
  .scatterTip {
    position: absolute;
    background: var(--surface-3);
    border: 1px solid var(--border-default);
    border-radius: var(--r-6);
    padding: var(--space-4) var(--space-5);
    font-size: var(--fz-12);
    color: var(--text-primary);
    pointer-events: none;
    line-height: 1.5;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: var(--z-overlay);
  }
  .scatterTipTitle { font-weight: 600; margin-bottom: var(--space-2); }
  .scatterTipMeta { color: var(--text-secondary); font-size: var(--fz-11); margin-bottom: var(--space-2); }
  .scatterEmpty { text-align: center; padding: 40px var(--space-10); color: var(--text-faint); }
  ```
  Create `webapp/src/components/Scatter.tsx` (recovered axes/scales from `1bc370e`, simplified dots = circles sized by `sizeB`, y = passRate 0..1 scaled to 0..100%):
  ```tsx
  import { useMemo, useState, useRef } from "react";
  import styles from "./Scatter.module.css";
  import type { ScatterPoint } from "../lib/pipeline";
  import {
    setHoveredModel,
    clearHoveredModel,
    useHoveredModel,
  } from "../lib/hover-store";
  import { familyColor } from "../lib/colors";
  import { formatEfficiency } from "../lib/constants";
  import { ScatterLegend } from "./ScatterLegend";

  interface Props {
    points: ScatterPoint[];
  }

  const W = 860;
  const H = 460;
  const M = { top: 20, right: 24, bottom: 50, left: 60 };
  const IW = W - M.left - M.right;
  const IH = H - M.top - M.bottom;

  // y is a passRate in 0..1; render as 0..100%.
  const yScale = (v: number): number => M.top + (1 - v) * IH;
  const SIZE_FALLBACK_B = 3;
  const rScale = (sizeB: number | null): number => 6 + Math.sqrt(Math.max(sizeB ?? SIZE_FALLBACK_B, 0)) * 2.4;

  interface XDomain { min: number; max: number; ticks: number[]; }

  const FALLBACK_DOMAIN: XDomain = { min: 100, max: 100000, ticks: [100, 1000, 10000, 100000] };

  const computeXDomain = (points: ScatterPoint[]): XDomain => {
    const values = points.map((d) => d.x).filter((t) => t > 0);
    if (values.length === 0) return FALLBACK_DOMAIN;
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const minExp = Math.floor(Math.log10(rawMin));
    const maxExp = Math.ceil(Math.log10(rawMax));
    const effectiveMaxExp = maxExp === minExp ? minExp + 1 : maxExp;
    const min = 10 ** minExp;
    const max = 10 ** effectiveMaxExp;
    const ticks: number[] = [];
    for (let e = minExp; e <= effectiveMaxExp; e += 1) {
      const p = 10 ** e;
      ticks.push(p);
      if (e < effectiveMaxExp) ticks.push(3 * p);
    }
    return { min, max, ticks };
  };

  const xScaleFor = (domain: XDomain) => (v: number): number => {
    const clamped = Math.max(Math.min(v, domain.max), domain.min);
    return M.left + ((Math.log10(clamped) - Math.log10(domain.min)) / (Math.log10(domain.max) - Math.log10(domain.min))) * IW;
  };

  const formatTick = (v: number): string => {
    if (v >= 1_000_000) return `${v / 1_000_000}M`;
    if (v >= 1_000) return `${v / 1_000}k`;
    return String(v);
  };

  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];

  export function Scatter({ points }: Props) {
    const xDomain = useMemo(() => computeXDomain(points), [points]);
    const xScale = useMemo(() => xScaleFor(xDomain), [xDomain]);
    const hovered = useHoveredModel();
    const [tip, setTip] = useState<{ dot: ScatterPoint; x: number; y: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const families = useMemo(() => {
      const seen = new Set<string>();
      const out: Array<{ name: string; color: string }> = [];
      for (const d of points) {
        if (!seen.has(d.family)) {
          seen.add(d.family);
          out.push({ name: d.family, color: familyColor(d.family) });
        }
      }
      return out;
    }, [points]);

    if (points.length === 0) {
      return (
        <div className={styles.scatterWrap} ref={wrapRef}>
          <div className={styles.scatterEmpty}>No data matches the current filters.</div>
        </div>
      );
    }

    return (
      <div className={styles.scatterWrap} ref={wrapRef}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={styles.scatterSvg}>
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line className={styles.scatterGrid} x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
              <text className={styles.scatterTick} x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{(v * 100).toFixed(0)}%</text>
            </g>
          ))}
          {xDomain.ticks.map((v) => (
            <g key={`x${v}`}>
              <line className={styles.scatterGrid} x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + IH} />
              <text className={styles.scatterTick} x={xScale(v)} y={M.top + IH + 18} textAnchor="middle">{formatTick(v)}</text>
            </g>
          ))}
          <line className={styles.scatterAxis} x1={M.left} x2={M.left} y1={M.top} y2={M.top + IH} />
          <line className={styles.scatterAxis} x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} />
          <text className={styles.scatterAxisTitle} x={M.left + IW / 2} y={H - 10} textAnchor="middle">
            Total gen tokens (log)
          </text>
          <text
            className={styles.scatterAxisTitle}
            x={16}
            y={M.top + IH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${M.top + IH / 2})`}
          >
            Pass rate
          </text>

          {points.map((d) => {
            const dim = hovered !== null && hovered !== d.artifact;
            return (
              <circle
                key={d.config_hash}
                className={styles.scatterDot}
                cx={xScale(d.x)}
                cy={yScale(d.y)}
                r={rScale(d.sizeB)}
                fill={familyColor(d.family)}
                fillOpacity={dim ? 0.3 : 0.85}
                onMouseEnter={(ev) => {
                  setHoveredModel(d.artifact);
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip({ dot: d, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                }}
                onMouseMove={(ev) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (rect) setTip((prev) => prev ? { ...prev, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
                }}
                onMouseLeave={() => {
                  clearHoveredModel();
                  setTip(null);
                }}
              />
            );
          })}
        </svg>

        {tip && (
          <div className={styles.scatterTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>
            <div className={styles.scatterTipTitle}>{tip.dot.artifact}</div>
            <div className={styles.scatterTipMeta}>
              {tip.dot.quant ?? "—"} · {tip.dot.runtime} · t{tip.dot.temperature} · {tip.dot.generation_tps.toFixed(0)} tok/s
            </div>
            <div>
              Pass: <strong>{(tip.dot.y * 100).toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.x).toLocaleString()}</strong> · Mem: <strong>{tip.dot.peak_memory_gb.toFixed(1)} GB</strong> · Eff: <strong>{formatEfficiency(tip.dot.efficiency)}</strong>
            </div>
          </div>
        )}

        <ScatterLegend families={families} />
      </div>
    );
  }
  ```
  Rewire `webapp/src/routes/__root.tsx` to compute `points` and pass `<Scatter points={points} />` into `ShiftFrame`'s `scatter` slot:
  ```tsx
  import { aggregateRuns, computeScatterPoints, type RunRow, type RunSortKey } from "../lib/pipeline";
  import { Scatter } from "../components/Scatter";
  // ...inside RootComponent:
  const points = useMemo(() => computeScatterPoints(DATA), []);
  // ...replace scatter={null} with:
  <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={<Scatter points={points} />} ranking={ranking} details={<Outlet />} />
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `cd webapp && npx tsc --noEmit && npm run build`  Expected: PASS. Eyeball (`npm run dev`): scatter renders one family-colored dot per config, log x-axis labeled "Total gen tokens (log)", y-axis 0–100% "Pass rate", tooltip shows identity + pass% + tokens + mem + efficiency, family legend below.
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/components/Scatter.tsx webapp/src/components/Scatter.module.css webapp/src/components/ScatterLegend.tsx webapp/src/components/ScatterLegend.module.css webapp/src/routes/__root.tsx
  git commit -m "feat(webapp): restore cost-vs-quality scatter (per-config, family-colored)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 13: Webapp — recover + rewire filters (`filter-state` / `applyFilters` / `FilterPanel`); root recompute

**Files:**
- Create: `webapp/src/lib/filter-state.ts`
- Create: `webapp/src/lib/filter-state.test.ts`
- Modify: `webapp/src/lib/pipeline.ts` (add `applyFilters`)
- Modify: `webapp/src/lib/pipeline.test.ts`
- Create: `webapp/src/components/FilterPanel.tsx`
- Create: `webapp/src/components/FilterPanel.module.css`
- Modify: `webapp/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `BenchmarkResult`, `modelFamily` (`./data`); `csv`, `SearchState`, `parseFilters`, `Filters` (`./filter-state`).
- Produces:
  ```ts
  // filter-state.ts
  export type SearchState = {
    family?: string; runtime?: string; quant?: string; temperature?: string; challenge?: string;
    config?: string; attempt?: string; sortPrimary?: string; sortSecondary?: string;
  };
  export const csv = (s: string | undefined): string[];
  export interface Filters {
    family?: string[]; runtime?: string[]; quant?: string[];
    temperature?: string[]; challenge?: string[]; // challenge keys = `${challenge_id}@${challenge_version}`
  }
  export const parseFilters = (search: SearchState): Filters;

  // pipeline.ts
  export const applyFilters = (records: BenchmarkResult[], f: Filters): BenchmarkResult[];
  ```

- [ ] **Step 1: Write the failing test**
  Create `webapp/src/lib/filter-state.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { csv, parseFilters } from "./filter-state";

  describe("filter-state", () => {
    it("csv splits a comma list, empty/undefined → []", () => {
      expect(csv("a,b")).toEqual(["a", "b"]);
      expect(csv("")).toEqual([]);
      expect(csv(undefined)).toEqual([]);
    });
    it("parseFilters maps each dimension to a string[]", () => {
      const f = parseFilters({ family: "Qwen,Llama", runtime: "mlx", quant: "—", temperature: "0,0.4", challenge: "code@1,math@2" });
      expect(f.family).toEqual(["Qwen", "Llama"]);
      expect(f.runtime).toEqual(["mlx"]);
      expect(f.quant).toEqual(["—"]);
      expect(f.temperature).toEqual(["0", "0.4"]);
      expect(f.challenge).toEqual(["code@1", "math@2"]);
    });
  });
  ```
  Add to `webapp/src/lib/pipeline.test.ts` (import `applyFilters`):
  ```ts
  describe("applyFilters", () => {
    const data = [
      rec({ config_hash: "c1", artifact: "Qwen2.5-7B", runtime: "mlx", quant: "4bit", temperature: 0, challenge_id: "code", challenge_version: 1 }),
      rec({ config_hash: "c2", artifact: "Llama-3-8B", runtime: "llamacpp", quant: null, temperature: 0.4, challenge_id: "math", challenge_version: 2 }),
    ];
    it("narrows by family", () => {
      expect(applyFilters(data, { family: ["Qwen"] }).map((r) => r.config_hash)).toEqual(["c1"]);
    });
    it("narrows by quant with null → —", () => {
      expect(applyFilters(data, { quant: ["—"] }).map((r) => r.config_hash)).toEqual(["c2"]);
    });
    it("narrows by temperature (string match) and challenge (id@version)", () => {
      expect(applyFilters(data, { temperature: ["0.4"] }).map((r) => r.config_hash)).toEqual(["c2"]);
      expect(applyFilters(data, { challenge: ["code@1"] }).map((r) => r.config_hash)).toEqual(["c1"]);
    });
    it("empty filters pass everything", () => {
      expect(applyFilters(data, {})).toHaveLength(2);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/filter-state.test.ts webapp/src/lib/pipeline.test.ts`  Expected: FAIL with "Cannot find module './filter-state'" / "applyFilters is not exported".
- [ ] **Step 3: Write minimal implementation**
  Create `webapp/src/lib/filter-state.ts`:
  ```ts
  // Router search state for the root route. Categorical filter chips serialize
  // as comma-separated lists; drilldown expansion as single ids.
  export type SearchState = {
    family?: string;
    runtime?: string;
    quant?: string;
    temperature?: string;
    challenge?: string;       // `${challenge_id}@${challenge_version}` keys
    config?: string;          // expanded leaderboard row (config_hash)
    attempt?: string;         // expanded challenge line (attempt_id)
    sortPrimary?: string;
    sortSecondary?: string;
  };

  export const csv = (s: string | undefined): string[] =>
    s === undefined || s === "" ? [] : s.split(",");

  export interface Filters {
    family?: string[];
    runtime?: string[];
    quant?: string[];
    temperature?: string[];
    challenge?: string[];
  }

  export const parseFilters = (search: SearchState): Filters => ({
    family: csv(search.family),
    runtime: csv(search.runtime),
    quant: csv(search.quant),
    temperature: csv(search.temperature),
    challenge: csv(search.challenge),
  });
  ```
  In `webapp/src/lib/pipeline.ts`, add `import type { Filters } from "./filter-state";` and append:
  ```ts
  const passesDim = (selected: string[] | undefined, v: string): boolean =>
    selected === undefined || selected.length === 0 || selected.includes(v);

  export const applyFilters = (records: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
    records.filter((r) => {
      if (!passesDim(f.family, modelFamily(r.artifact))) return false;
      if (!passesDim(f.runtime, r.runtime)) return false;
      if (!passesDim(f.quant, r.quant ?? "—")) return false;
      if (!passesDim(f.temperature, String(r.temperature))) return false;
      if (!passesDim(f.challenge, `${r.challenge_id}@${r.challenge_version}`)) return false;
      return true;
    });
  ```
  Create `webapp/src/components/FilterPanel.module.css` (recover the chip portion of `1bc370e` — the slider styles are dropped since the range sliders are deferred):
  ```css
  /* Filter panel: categorical chips below the scatter in the left lane. */
  .panel {
    padding: var(--space-6) var(--space-8);
    border-top: 1px solid var(--border-subtle);
    background: var(--gray-950);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  .chipRow { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; }
  .chip { position: relative; }
  .chip > button {
    background: var(--surface-4);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    padding: var(--space-2) var(--space-5);
    border-radius: var(--r-4);
    cursor: pointer;
    font-size: var(--fz-12);
  }
  .chipPopover {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--surface-3);
    border: 1px solid var(--border-default);
    padding: var(--space-4);
    border-radius: var(--r-4);
    z-index: var(--z-overlay);
    min-width: 180px;
    max-height: 280px;
    overflow-y: auto;
    margin-top: var(--space-2);
  }
  .chipPopover label {
    display: block;
    font-size: var(--fz-12);
    padding: var(--space-1) 0;
    color: var(--text-primary);
    cursor: pointer;
  }
  .chipPopover input { margin-right: var(--space-3); }
  ```
  Create `webapp/src/components/FilterPanel.tsx` (recovered chip mechanics from `1bc370e`, rewired to the five per-attempt dimensions; sliders removed):
  ```tsx
  import { useNavigate, useSearch } from "@tanstack/react-router";
  import { useState, useCallback } from "react";
  import styles from "./FilterPanel.module.css";
  import { csv, type SearchState } from "../lib/filter-state";

  interface Props {
    allValues: {
      families: string[];
      runtimes: string[];
      quants: string[];       // null already mapped to "—"
      temperatures: string[]; // String(temperature)
      challenges: string[];   // `${challenge_id}@${challenge_version}`
    };
  }

  export function FilterPanel({ allValues }: Props) {
    const search = useSearch({ strict: false }) as SearchState;
    const navigate = useNavigate();

    const setSearch = useCallback((patch: Partial<SearchState>) => {
      navigate({ search: (prev) => ({ ...prev, ...patch }) as never });
    }, [navigate]);

    const updateMulti = (key: keyof SearchState) => (values: string[]) =>
      setSearch({ [key]: values.length === 0 ? undefined : values.join(",") } as Partial<SearchState>);

    return (
      <div className={styles.panel}>
        <div className={styles.chipRow}>
          <Chip label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
          <Chip label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
          <Chip label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
          <Chip label="Temperature" all={allValues.temperatures} selected={csv(search.temperature)} onChange={updateMulti("temperature")} />
          <Chip label="Challenge" all={allValues.challenges} selected={csv(search.challenge)} onChange={updateMulti("challenge")} />
        </div>
      </div>
    );
  }

  function Chip({ label, all, selected, onChange }: {
    label: string; all: string[]; selected: string[]; onChange: (v: string[]) => void;
  }) {
    const [open, setOpen] = useState(false);
    const toggle = (v: string) =>
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    return (
      <div className={styles.chip}>
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {label}{selected.length > 0 ? ` · ${selected.length}` : ""}
        </button>
        {open && (
          <div className={styles.chipPopover} onMouseLeave={() => setOpen(false)}>
            {all.map((v) => (
              <label key={v}>
                <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
                {v}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```
  Rewire `webapp/src/routes/__root.tsx`:
  - Register a typed search schema on the root route so `useSearch`/`navigate` accept `SearchState`:
    ```tsx
    import type { SearchState } from "../lib/filter-state";
    import { parseFilters } from "../lib/filter-state";
    import { applyFilters } from "../lib/pipeline";
    import { FilterPanel } from "../components/FilterPanel";
    import { useSearch } from "@tanstack/react-router";
    import { uniqueSorted, modelFamily } from "../lib/data";

    export const Route = createRootRoute({
      component: RootComponent,
      validateSearch: (s: Record<string, unknown>): SearchState => ({
        family: typeof s.family === "string" ? s.family : undefined,
        runtime: typeof s.runtime === "string" ? s.runtime : undefined,
        quant: typeof s.quant === "string" ? s.quant : undefined,
        temperature: typeof s.temperature === "string" ? s.temperature : undefined,
        challenge: typeof s.challenge === "string" ? s.challenge : undefined,
        config: typeof s.config === "string" ? s.config : undefined,
        attempt: typeof s.attempt === "string" ? s.attempt : undefined,
        sortPrimary: typeof s.sortPrimary === "string" ? s.sortPrimary : undefined,
        sortSecondary: typeof s.sortSecondary === "string" ? s.sortSecondary : undefined,
      }),
    });
    ```
  - In `RootComponent`, read search, filter, recompute both views, and build `allValues`:
    ```tsx
    const search = useSearch({ strict: false }) as SearchState;
    const filters = useMemo(() => parseFilters(search), [search]);
    const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

    const groups = useMemo(() => aggregateRuns(filtered, primary, secondary), [filtered, primary, secondary]);
    const points = useMemo(() => computeScatterPoints(filtered), [filtered]);

    const allValues = useMemo(() => ({
      families: [...new Set(DATA.map((r) => modelFamily(r.artifact)))].sort(),
      runtimes: uniqueSorted(DATA, "runtime").map(String),
      quants: [...new Set(DATA.map((r) => r.quant ?? "—"))].sort(),
      temperatures: [...new Set(DATA.map((r) => String(r.temperature)))].sort(),
      challenges: [...new Set(DATA.map((r) => `${r.challenge_id}@${r.challenge_version}`))].sort(),
    }), []);
    ```
  - Compose the left lane as scatter + filters:
    ```tsx
    const leftLane = (
      <>
        <Scatter points={points} />
        <FilterPanel allValues={allValues} />
      </>
    );
    // ...
    <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={leftLane} ranking={ranking} details={<Outlet />} />
    ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/filter-state.test.ts webapp/src/lib/pipeline.test.ts && cd webapp && npx tsc --noEmit && npm run build`  Expected: PASS (unit tests green; typecheck + build green). Eyeball (`npm run dev`): toggling a family/runtime/quant/temperature/challenge chip narrows BOTH the scatter and the leaderboard and updates the URL search params; reloading the URL restores the selection.
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/filter-state.ts webapp/src/lib/filter-state.test.ts webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts webapp/src/components/FilterPanel.tsx webapp/src/components/FilterPanel.module.css webapp/src/routes/__root.tsx
  git commit -m "feat(webapp): restore filters (per-attempt dims, search-param state, recompute both views)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 14: Webapp — `useAttemptDetail` fetch hook + pipeline per-challenge breakdown

**Files:**
- Create: `webapp/src/lib/use-attempt-detail.ts`
- Modify: `webapp/src/lib/pipeline.ts` (add `challengeBreakdown`)
- Modify: `webapp/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `BenchmarkResult`; `computeConfigScores`.
- Produces:
  ```ts
  // pipeline.ts
  export interface ChallengeBreakdownRow {
    challengeKey: string;     // `${challenge_id}@${challenge_version}`
    challengeId: string;
    challengeVersion: number;
    attemptId: string;
    passRate: number;         // 0..1, pooled over this attempt's items
    itemCount: number;
    passedItems: number;
  }
  export const challengeBreakdown = (records: BenchmarkResult[], configHash: string): ChallengeBreakdownRow[];

  // use-attempt-detail.ts
  export interface AttemptDetailItem {
    item_id: string; prompt_name: string; prompt_text: string;
    output: string; reasoning: string | null; score: number;
    error: string | null; scorer: unknown;
  }
  export interface AttemptDetail {
    attempt_id: string; config_id: string; config_hash: string;
    artifact: string; challenge_id: string; challenge_version: number;
    system_prompt_text: string; items: AttemptDetailItem[];
  }
  export type DetailState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "loaded"; detail: AttemptDetail }
    | { status: "not-found" }
    | { status: "error"; message: string };
  export const useAttemptDetail = (attemptId: string | undefined): DetailState;
  ```

- [ ] **Step 1: Write the failing test**
  Add to `webapp/src/lib/pipeline.test.ts` (import `challengeBreakdown`):
  ```ts
  describe("challengeBreakdown", () => {
    it("one row per (challenge,version) the config ran, pooled passRate per attempt", () => {
      const rows = challengeBreakdown(
        [
          rec({ config_hash: "c1", attempt_id: "a1", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 3 }),
          rec({ config_hash: "c1", attempt_id: "a2", challenge_id: "math", challenge_version: 2, item_count: 2, passed_items: 0 }),
          rec({ config_hash: "c2", attempt_id: "a3", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 4 }),
        ],
        "c1",
      );
      expect(rows.map((r) => r.challengeKey)).toEqual(["code@1", "math@2"]);
      expect(rows[0]!.passRate).toBeCloseTo(0.75, 10);
      expect(rows[0]!.attemptId).toBe("a1");
      expect(rows[1]!.passRate).toBe(0);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts`  Expected: FAIL with "challengeBreakdown is not exported".
- [ ] **Step 3: Write minimal implementation**
  In `webapp/src/lib/pipeline.ts`, append:
  ```ts
  export interface ChallengeBreakdownRow {
    challengeKey: string;
    challengeId: string;
    challengeVersion: number;
    attemptId: string;
    passRate: number;
    itemCount: number;
    passedItems: number;
  }

  export const challengeBreakdown = (
    records: BenchmarkResult[],
    configHash: string,
  ): ChallengeBreakdownRow[] => {
    const rows: ChallengeBreakdownRow[] = [];
    for (const r of records) {
      if (r.config_hash !== configHash) continue;
      rows.push({
        challengeKey: `${r.challenge_id}@${r.challenge_version}`,
        challengeId: r.challenge_id,
        challengeVersion: r.challenge_version,
        attemptId: r.attempt_id,
        passRate: r.item_count === 0 ? 0 : r.passed_items / r.item_count,
        itemCount: r.item_count,
        passedItems: r.passed_items,
      });
    }
    rows.sort((a, b) => a.challengeKey.localeCompare(b.challengeKey));
    return rows;
  };
  ```
  Create `webapp/src/lib/use-attempt-detail.ts`:
  ```ts
  import { useEffect, useState } from "react";

  export interface AttemptDetailItem {
    item_id: string;
    prompt_name: string;
    prompt_text: string;
    output: string;
    reasoning: string | null;
    score: number;
    error: string | null;
    scorer: unknown;
  }

  export interface AttemptDetail {
    attempt_id: string;
    config_id: string;
    config_hash: string;
    artifact: string;
    challenge_id: string;
    challenge_version: number;
    system_prompt_text: string;
    items: AttemptDetailItem[];
  }

  export type DetailState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "loaded"; detail: AttemptDetail }
    | { status: "not-found" }
    | { status: "error"; message: string };

  // In-memory cache so re-expanding an attempt doesn't re-fetch.
  const cache = new Map<string, AttemptDetail>();

  export const useAttemptDetail = (attemptId: string | undefined): DetailState => {
    const [state, setState] = useState<DetailState>({ status: "idle" });

    useEffect(() => {
      if (attemptId === undefined) {
        setState({ status: "idle" });
        return;
      }
      const cached = cache.get(attemptId);
      if (cached !== undefined) {
        setState({ status: "loaded", detail: cached });
        return;
      }
      let cancelled = false;
      setState({ status: "loading" });
      fetch(`/details/${attemptId}.json`)
        .then((res) => {
          if (res.status === 404) return { kind: "not-found" as const };
          if (!res.ok) return { kind: "error" as const, message: `HTTP ${res.status}` };
          return res.json().then((detail: AttemptDetail) => ({ kind: "loaded" as const, detail }));
        })
        .then((r) => {
          if (cancelled) return;
          if (r.kind === "loaded") {
            cache.set(attemptId, r.detail);
            setState({ status: "loaded", detail: r.detail });
          } else if (r.kind === "not-found") {
            setState({ status: "not-found" });
          } else {
            setState({ status: "error", message: r.message });
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setState({ status: "error", message: String(e) });
        });
      return () => {
        cancelled = true;
      };
    }, [attemptId]);

    return state;
  };
  ```
- [ ] **Step 4: Run to verify it passes**
  Run: `npx vitest run webapp/src/lib/pipeline.test.ts && cd webapp && npx tsc --noEmit`  Expected: PASS (breakdown unit test green; hook typechecks).
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/lib/use-attempt-detail.ts webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
  git commit -m "feat(webapp): challengeBreakdown pipeline + useAttemptDetail fetch hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 15: Webapp — `DrilldownPanel` + URL-state expansion (`?config=` / `?attempt=`)

**Files:**
- Create: `webapp/src/components/DrilldownPanel.tsx`
- Create: `webapp/src/components/DrilldownPanel.module.css`
- Modify: `webapp/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `challengeBreakdown`, `ChallengeBreakdownRow` (Task 14); `useAttemptDetail`, `AttemptDetail`, `DetailState` (Task 14); `scoreBand` (`../lib/constants`); `RunRow` (for the row-click → `?config=`); `SearchState`.
- Produces: `DrilldownPanel({ records, configHash, attemptId, onSelectAttempt }: { records: BenchmarkResult[]; configHash: string; attemptId: string | undefined; onSelectAttempt: (id: string | undefined) => void })`. `.tsx` task — verified by typecheck + build.

- [ ] **Step 1: Establish the red state**
  Run: `cd webapp && npm run build`  Expected: PASS (Task 14 left it green; this confirms baseline before adding the route reference).
- [ ] **Step 2: Verify red after route reference**
  Wire `DrilldownPanel` into `__root.tsx` (Step 3) before the component file exists; then:
  Run: `cd webapp && npx tsc --noEmit`  Expected: FAIL with "Cannot find module '../components/DrilldownPanel'".
- [ ] **Step 3: Write minimal implementation**
  Create `webapp/src/components/DrilldownPanel.module.css`:
  ```css
  .panel {
    padding: var(--space-6) var(--space-8);
    color: var(--text-primary);
    font-size: var(--fz-12);
  }
  .empty { color: var(--text-faint); padding: var(--space-8); text-align: center; }
  .challengeRow {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--text-primary);
    font: inherit;
  }
  .challengeRow:hover { background: var(--surface-hover); }
  .challengeKey { font-family: ui-monospace, SFMono-Regular, monospace; }
  .challengeScore { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--band, var(--text-primary)); font-weight: 600; }
  .challengeCoverage { color: var(--text-muted); font-size: var(--fz-11); }
  .item { border-top: 1px solid var(--border-subtle); padding: var(--space-4) 0; }
  .itemLabel { color: var(--text-faint); font-size: var(--fz-10); text-transform: uppercase; letter-spacing: 0.05em; margin-top: var(--space-3); }
  .itemText { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, monospace; font-size: var(--fz-11); color: var(--text-secondary); margin: var(--space-2) 0; }
  .itemScore { font-variant-numeric: tabular-nums; color: var(--band, var(--text-primary)); font-weight: 600; }
  .loading, .error { color: var(--text-muted); padding: var(--space-6); }
  ```
  Create `webapp/src/components/DrilldownPanel.tsx`:
  ```tsx
  import styles from "./DrilldownPanel.module.css";
  import type { BenchmarkResult } from "../lib/data";
  import { challengeBreakdown } from "../lib/pipeline";
  import { useAttemptDetail } from "../lib/use-attempt-detail";
  import { scoreBand } from "../lib/constants";

  interface Props {
    records: BenchmarkResult[];
    configHash: string;
    attemptId: string | undefined;
    onSelectAttempt: (id: string | undefined) => void;
  }

  export function DrilldownPanel({ records, configHash, attemptId, onSelectAttempt }: Props) {
    const rows = challengeBreakdown(records, configHash);
    const detail = useAttemptDetail(attemptId);

    if (rows.length === 0) {
      return <div className={styles.empty}>No challenges for this config.</div>;
    }

    return (
      <div className={styles.panel}>
        {rows.map((row) => {
          const open = row.attemptId === attemptId;
          return (
            <div key={row.challengeKey}>
              <button
                type="button"
                className={styles.challengeRow}
                onClick={() => onSelectAttempt(open ? undefined : row.attemptId)}
              >
                <span className={styles.challengeKey}>{row.challengeKey}</span>
                <span className={styles.challengeCoverage}>{row.passedItems}/{row.itemCount} items</span>
                <span className={styles.challengeScore} style={{ ["--band" as string]: undefined }} data-band={scoreBand(row.passRate)}>
                  {(row.passRate * 100).toFixed(0)}%
                </span>
              </button>
              {open && (
                <div className={styles.item}>
                  {detail.status === "loading" && <div className={styles.loading}>Loading…</div>}
                  {detail.status === "not-found" && (
                    <div className={styles.loading}>No detail available (v1 attempt — re-run as v2 to enable drilldown).</div>
                  )}
                  {detail.status === "error" && <div className={styles.error}>Failed to load: {detail.message}</div>}
                  {detail.status === "loaded" && (
                    <>
                      <div className={styles.itemLabel}>System prompt</div>
                      <div className={styles.itemText}>{detail.detail.system_prompt_text}</div>
                      {detail.detail.items.map((it) => (
                        <div key={it.item_id} className={styles.item}>
                          <div className={styles.itemLabel}>
                            {it.prompt_name} · <span className={styles.itemScore} data-band={scoreBand(it.score)}>score {it.score}</span>
                          </div>
                          <div className={styles.itemLabel}>Prompt</div>
                          <div className={styles.itemText}>{it.prompt_text}</div>
                          <div className={styles.itemLabel}>Output</div>
                          <div className={styles.itemText}>{it.output}</div>
                          {it.reasoning !== null && (
                            <>
                              <div className={styles.itemLabel}>Reasoning</div>
                              <div className={styles.itemText}>{it.reasoning}</div>
                            </>
                          )}
                          {it.error !== null && (
                            <>
                              <div className={styles.itemLabel}>Error</div>
                              <div className={styles.itemText}>{it.error}</div>
                            </>
                          )}
                          <div className={styles.itemLabel}>Scorer</div>
                          <div className={styles.itemText}>{JSON.stringify(it.scorer, null, 2)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  ```
  Rewire `webapp/src/routes/__root.tsx`:
  - On leaderboard row click, set `?config=`:
    ```tsx
    const onRowClick = (row: RunRow) =>
      navigate({ search: (prev) => ({ ...(prev as SearchState), config: row.config_hash, attempt: undefined }) as never });
    const onSelectAttempt = (id: string | undefined) =>
      navigate({ search: (prev) => ({ ...(prev as SearchState), attempt: id }) as never });
    ```
  - Render `DrilldownPanel` in the details lane when `search.config` is set, and drive `shifted` off it:
    ```tsx
    const shifted = search.config !== undefined;
    const closeDetails = () =>
      navigate({ search: (prev) => ({ ...(prev as SearchState), config: undefined, attempt: undefined }) as never });
    const details =
      search.config !== undefined ? (
        <DrilldownPanel
          records={filtered}
          configHash={search.config}
          attemptId={search.attempt}
          onSelectAttempt={onSelectAttempt}
        />
      ) : (
        <Outlet />
      );
    // ...
    <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={leftLane} ranking={ranking} details={details} />
    ```
    (Remove the now-unused `useLocation` import and the old `location.pathname.startsWith("/run/")` line.)
- [ ] **Step 4: Run to verify it passes**
  Run: `cd webapp && npx tsc --noEmit && npm run build`  Expected: PASS. Eyeball (`npm run dev`): clicking a leaderboard row sets `?config=<hash>`, opens the details lane (ShiftFrame shifts) showing one line per `(challenge,version)` with pass% + band + item coverage; clicking a challenge line sets `?attempt=<id>`, fetches `/details/<id>.json`, and renders system prompt + per-item prompt/output/reasoning/score(band)/scorer/error; a v1 attempt shows the "no detail available" state; reloading the URL with `?config=&attempt=` restores the expanded view; Esc / "← Overview" clears both params.
- [ ] **Step 5: Commit**
  ```bash
  git add webapp/src/components/DrilldownPanel.tsx webapp/src/components/DrilldownPanel.module.css webapp/src/routes/__root.tsx
  git commit -m "feat(webapp): per-challenge breakdown + per-item drilldown with URL state (?config/?attempt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 16: Whole-branch verification

**Files:** (none — verification only)

- [ ] **Step 1: Full test suite**
  Run: `npm test`  Expected: PASS, combined count ≥ 594 + the new webapp `*.test.ts` cases (colors, filter-state, and the pipeline additions) and the new backend cases.
- [ ] **Step 2: Backend lint**
  Run: `npm run lint && npm run typecheck`  Expected: PASS (no `!`, no `throw`/`try`-`catch` in non-test `src/`; `FileIOError` shape intact).
- [ ] **Step 3: Webapp typecheck + build**
  Run: `cd webapp && npx tsc --noEmit && npm run build`  Expected: PASS.
- [ ] **Step 4: Golden-hash guard**
  Run: `npx vitest run` over any hashing test, or `grep -r "71c5f440ce49" src` — confirm the golden `challengeHash 71c5f440ce49` test still passes and was not perturbed.
- [ ] **Step 5: Adversarial review gate**
  Per the standing directive, run the final whole-branch review on opus. On ANY adversarial-review failure, STOP and escalate via AskUserQuestion — do not self-merge. Merge happens later via `finishing-a-development-branch`.
