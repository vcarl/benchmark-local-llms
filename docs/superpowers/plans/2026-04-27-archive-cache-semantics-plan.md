# Archive, cache, and report semantics — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the webapp's pass-rate denominator reliable. One score per (model + prompt content + temperature) cell. Stale prompt versions, drifted content, and cache carry-forward duplicates do not appear in the report.

**Architecture:** Three changes implement the spec. (1) Per-model temperature replaces a CLI flag, requiring schema changes to `ModelConfig` and `RunManifest`. (2) The run loop stops carrying cached results into new archive files. (3) The report build adds prompt-side current-corpus filtering, cell-level deduplication with a deterministic tie-break, and a drop-reason summary. Webapp `PASS_THRESHOLD` bumps from 0.5 to 0.7 to match the new "1 score per cell" semantics.

**Tech Stack:** TypeScript, Effect-TS, Effect Schema, vitest. Webapp is React. Tests run via `npx vitest run <path>`.

**Spec reference:** `docs/superpowers/specs/2026-04-27-archive-cache-semantics-design.md`

---

## File map

### Files to create

- `scripts/inventory.ts` — one-off operator script. Walks `benchmark-archive/*.jsonl`, prints per-model temperature usage and prompt-drift counts. Used during migration to populate `temperature:` fields in `models.yaml`.

### Files to modify

**Schema (`src/schema/`)**
- `model.ts` — add `temperature: Schema.optional(Schema.Number)` to `ModelConfig`. Active models without `temperature` fail config-load validation (enforced in the loader, not the schema, since "required only when active" is a relational constraint).
- `run-manifest.ts` — `temperatures: Schema.Array(Schema.Number)` → `temperature: Schema.Number`.

**Archive layer (`src/archive/`)**
- `loader.ts` — extend `translateLegacyShape` to translate `temperatures: [...]` → `temperature: ...` on read.

**Run-time orchestration (`src/orchestration/`)**
- `run-loop.ts` — `RunLoopConfig.temperatures: number[]` removed. Per-model `temperature` is read off the model entry.
- `run-model.ts` — `RunModelInput.temperatures: ReadonlyArray<number>` → `temperature: number` (single).
- `phases.ts` — prompt loop becomes 1D over prompts (no inner temperature loop). Cache-hit branch removes the `appendIfSaving(carried, ...)` call. Scenario phase reads single temperature directly from input.

**CLI (`src/cli/commands/`)**
- `run-options.ts` — remove the `temperatures` Option export.
- `run.ts` — remove parsing/wiring of `--temperatures`. Per-model temperature flows from `models.yaml` through `enumeratePlannedCells` and `runLoop`.
- `report.ts` — remove `--scoring` flag. Always load current corpus from `prompts/`. Print drop-reason summary.

**Report (`src/report/`)**
- `aggregate.ts` — drop `ScoringMode` and `AggregateOptions`. Take `currentPromptCorpus` + `currentScenarioCorpus` as required arguments. Add prompt-side filter (drop on absent / drift) before scoring. Add cell-level dedup with tie-break.
- `load-archives.ts` — return `mtime: Date` alongside each loaded archive.
- `index.ts` — drop `scoringMode` from `ReportOptions`. `ReportSummary` gains `dropped: { promptAbsent: number; promptDrifted: number }`.

**Webapp (`webapp/src/lib/`)**
- `constants.ts` — `PASS_THRESHOLD = 0.7`.
- `pipeline.test.ts` — bump expected pass-rate values that depend on the threshold.

**Config (root)**
- `models.yaml` — operator adds `temperature:` to each `active: true` model entry. Done outside the test loop, after the inventory script runs.

---

## Tasks

The order minimizes broken-test states. Each task should leave the suite green at commit.

### Task 1: Bump webapp `PASS_THRESHOLD` to 0.7

**Files:**
- Modify: `webapp/src/lib/constants.ts:16`
- Test: `webapp/src/lib/pipeline.test.ts`

This is a small isolated change to validate the test setup before touching schemas.

- [ ] **Step 1: Inspect existing pipeline tests for PASS_THRESHOLD assumptions**

Run:
```bash
grep -n "PASS_THRESHOLD\|pass:" webapp/src/lib/pipeline.test.ts
```

Read each test that asserts a `pass` value or filters by score; identify any expected values that depend on the 0.5 threshold (e.g. a fixture with score 0.55 that currently passes will now fail).

- [ ] **Step 2: Add a constant test asserting `PASS_THRESHOLD === 0.7`**

If `webapp/src/lib/constants.test.ts` does not exist, create it. Add:

```typescript
import { describe, expect, it } from "vitest";
import { PASS_THRESHOLD } from "./constants";

describe("PASS_THRESHOLD", () => {
  it("is 0.7 — score below 0.7 is a fail", () => {
    expect(PASS_THRESHOLD).toBe(0.7);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx vitest run webapp/src/lib/constants.test.ts
```

Expected: FAIL with `Expected: 0.7, Received: 0.5`.

- [ ] **Step 4: Update the constant**

Edit `webapp/src/lib/constants.ts:16`:

```typescript
export const PASS_THRESHOLD = 0.7;
```

- [ ] **Step 5: Update fixtures / expected values in `pipeline.test.ts`**

For each test identified in Step 1, recompute expected `pass` ratios using the new threshold. Update inline. If a test relies on a fixture with score `0.5` to "pass", change either the fixture's score to ≥ 0.7 or the assertion to `pass: 0` (whichever the test was actually trying to express).

- [ ] **Step 6: Run all webapp tests**

Run:
```bash
npx vitest run webapp/src/lib
```

Expected: PASS, all tests in the webapp lib directory.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/lib/constants.ts webapp/src/lib/constants.test.ts webapp/src/lib/pipeline.test.ts
git commit -m "feat(webapp): bump PASS_THRESHOLD to 0.7"
```

---

### Task 2: Add `temperature` to `ModelConfig`

**Files:**
- Modify: `src/schema/model.ts`
- Modify: `src/config/models-yaml.ts` (or wherever `models.yaml` is loaded — confirm path with `grep -rn "models.yaml" src/`)
- Test: `src/schema/model.test.ts` (create if missing)

The field is schema-optional but enforced as required when `active: true` at config-load time.

- [ ] **Step 1: Locate the models.yaml loader**

Run:
```bash
grep -rln "ModelConfig" src/config/ src/cli/
```

Identify the function that reads `models.yaml` and returns parsed `ModelConfig[]`. The validation step lives there.

- [ ] **Step 2: Write a failing schema test**

In `src/schema/model.test.ts` (create if missing):

```typescript
import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { ModelConfig } from "./model";

describe("ModelConfig", () => {
  it("accepts a model with explicit temperature", () => {
    const decoded = Schema.decodeUnknownSync(ModelConfig)({
      artifact: "test/m",
      runtime: "mlx",
      temperature: 0.7,
    });
    expect(decoded.temperature).toBe(0.7);
  });

  it("accepts a model without temperature when not validated", () => {
    const decoded = Schema.decodeUnknownSync(ModelConfig)({
      artifact: "test/m",
      runtime: "mlx",
    });
    expect(decoded.temperature).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx vitest run src/schema/model.test.ts
```

Expected: FAIL on the first test — schema doesn't know about `temperature`.

- [ ] **Step 4: Add the field to the schema**

Edit `src/schema/model.ts`:

```typescript
export const ModelConfig = Schema.Struct({
  artifact: Schema.String,
  runtime: Runtime,
  name: Schema.optional(Schema.String),
  quant: Schema.optional(Schema.String),
  params: Schema.optional(Schema.String),
  ctxSize: Schema.optional(Schema.Number),
  scenarioCtxSize: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Number),
});
```

- [ ] **Step 5: Run the schema test to verify it passes**

Run:
```bash
npx vitest run src/schema/model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add a config-loader test for required-when-active**

Add a test in the file identified at Step 1 (e.g. `src/config/__tests__/models-yaml.test.ts`):

```typescript
it("rejects active model missing temperature", async () => {
  const yaml = `
- artifact: test/m
  runtime: mlx
  active: true
`;
  // adapt this call to whatever the loader's signature is:
  const result = await Effect.runPromise(loadModelsYaml(yaml).pipe(Effect.either));
  expect(result._tag).toBe("Left");
  // Optional: assert error message mentions "temperature" and the model
});

it("accepts inactive model missing temperature", async () => {
  const yaml = `
- artifact: test/m
  runtime: mlx
  active: false
`;
  const result = await Effect.runPromise(loadModelsYaml(yaml));
  expect(result[0].temperature).toBeUndefined();
});
```

- [ ] **Step 7: Run the loader test to verify it fails**

Expected: FAIL on the first case — current loader doesn't validate temperature presence.

- [ ] **Step 8: Add the validation to the loader**

In the loader function, after schema decode, iterate the entries and fail with a descriptive error when `entry.active !== false && entry.temperature === undefined`:

```typescript
for (const entry of entries) {
  const effectivelyActive = entry.active !== false;
  if (effectivelyActive && entry.temperature === undefined) {
    return yield* Effect.fail(
      new ConfigValidationError({
        path: modelsPath,
        message: `Model '${entry.artifact}' is active but has no 'temperature'. Run scripts/inventory.ts and add a value to models.yaml.`,
      }),
    );
  }
}
```

(If the loader does not currently raise a typed `ConfigValidationError`, use the existing error type or extend as the codebase pattern dictates.)

- [ ] **Step 9: Run loader tests to verify they pass**

Run:
```bash
npx vitest run src/config
```

Expected: PASS.

- [ ] **Step 10: Add `temperature: 0.7` to all `active: true` entries in `models.yaml`**

Use 0.7 as a placeholder for now — the operator will replace with per-model values via the inventory script in Task 11. The placeholder unblocks the rest of the test suite.

```bash
# Run a check first to see how many entries will need editing:
grep -c "^- artifact:" models.yaml
```

Edit `models.yaml`. For every entry that is not `active: false`, add `temperature: 0.7` directly under the `artifact` line (or wherever the existing convention places non-display fields).

- [ ] **Step 11: Run the full test suite to make sure nothing else broke**

Run:
```bash
npx vitest run src/
```

Expected: PASS. (Some tests in `src/schema/run-manifest.test.ts` may still fail because of Task 3's schema change, but those will be addressed in Task 3. If unrelated tests fail, investigate.)

- [ ] **Step 12: Commit**

```bash
git add src/schema/model.ts src/schema/model.test.ts \
        src/config/models-yaml.ts src/config/__tests__/models-yaml.test.ts \
        models.yaml
git commit -m "feat(schema): add ModelConfig.temperature, required when active"
```

---

### Task 3: `RunManifest` single temperature + loader translation

**Files:**
- Modify: `src/schema/run-manifest.ts`
- Modify: `src/archive/loader.ts`
- Modify: `src/archive/writer.ts` (no behavior change — just type updates from manifest field rename)
- Modify: `src/report/__fixtures__/archive-fixtures.ts`
- Modify: `src/migrate/reconstruct-manifest.ts` (writes manifest values)
- Test: `src/archive/__tests__/loader-legacy.test.ts`
- Test: `src/schema/run-manifest.test.ts`

- [ ] **Step 1: Write a failing loader translation test**

In `src/archive/__tests__/loader-legacy.test.ts`, add:

```typescript
it("translates legacy temperatures: number[] to temperature: number", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const dir = yield* makeTmpArchiveDir();
      const path = `${dir}/legacy-temps.jsonl`;
      // Write a manifest line containing the legacy `temperatures: [0.3]` shape
      const legacyManifest = JSON.stringify({
        schemaVersion: 1,
        archiveId: "a1",
        runId: "r1",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: null,
        interrupted: false,
        artifact: "test/m",
        model: "Test",
        runtime: "mlx",
        quant: "4bit",
        env: {
          hostname: "h",
          platform: "p",
          runtimeVersion: "0",
          nodeVersion: "0",
          benchmarkGitSha: "0",
        },
        temperatures: [0.3],
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
      });
      yield* Effect.tryPromise(() =>
        require("node:fs/promises").writeFile(path, `${legacyManifest}\n`),
      );
      const loaded = yield* loadManifest(path);
      expect((loaded.manifest as any).temperature).toBe(0.3);
      expect((loaded.manifest as any).temperatures).toBeUndefined();
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/archive/__tests__/loader-legacy.test.ts
```

Expected: FAIL — schema rejects unknown `temperatures` field, or asserts undefined `temperature`.

- [ ] **Step 3: Update the schema**

Edit `src/schema/run-manifest.ts`:

```typescript
export const RunManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  archiveId: Schema.String,
  runId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  interrupted: Schema.Boolean,

  artifact: Schema.String,
  model: Schema.String,
  runtime: Runtime,
  quant: Schema.String,

  env: RunEnv,

  temperature: Schema.Number,

  promptCorpus: Schema.Record({ key: Schema.String, value: PromptCorpusEntry }),
  scenarioCorpus: Schema.Record({ key: Schema.String, value: ScenarioCorpusEntry }),

  stats: RunStats,
});
```

- [ ] **Step 4: Extend the loader's legacy-shape translator**

Edit `src/archive/loader.ts`. Update `translateLegacyShape` to handle the temperatures translation:

```typescript
const translateLegacyShape = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  // Existing runId → archiveId rename
  if (typeof obj["archiveId"] !== "string") {
    const legacyId = obj["runId"];
    if (typeof legacyId === "string") {
      obj.archiveId = legacyId;
      obj.runId = `legacy-${legacyId}`;
    }
  }

  // New: temperatures: number[] → temperature: number
  if (Array.isArray(obj["temperatures"]) && obj["temperature"] === undefined) {
    obj.temperature = (obj["temperatures"] as number[])[0] ?? 0;
    delete obj.temperatures;
  }

  return obj;
};
```

- [ ] **Step 5: Run the legacy loader test to verify it passes**

Run:
```bash
npx vitest run src/archive/__tests__/loader-legacy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update fixtures**

Edit `src/report/__fixtures__/archive-fixtures.ts:83`:

```typescript
// before:
//   temperatures: [0.3],
// after:
temperature: 0.3,
```

Search for any other fixture or test that constructs a `RunManifest` literal with `temperatures: [...]`:

```bash
grep -rn "temperatures:" src/ | grep -v node_modules
```

Update each occurrence: `temperatures: [X]` → `temperature: X`.

- [ ] **Step 7: Update the manifest reconstruction in migrate**

Edit `src/migrate/reconstruct-manifest.ts:363` and surrounding lines. The migrate script reconstructs manifests from legacy data; ensure it emits `temperature: <value>` instead of `temperatures: [...]`. Since the legacy data has only one temperature per file, the conversion is `temperature: legacyTemps[0] ?? 0`.

- [ ] **Step 8: Update writer if needed**

Read `src/archive/writer.ts` for any reference to `manifest.temperatures`:

```bash
grep -n "temperatures" src/archive/writer.ts
```

If found, rename to `manifest.temperature`. The writer should be schema-driven (Effect Schema encode), so likely no manual change is needed — but verify.

- [ ] **Step 9: Run the full test suite**

Run:
```bash
npx vitest run src/
```

Expected: PASS (with the exception of orchestration tests that pass `temperatures: [...]` into `RunModelInput` — those are addressed in Task 4. If those fail, that's expected; note them.)

- [ ] **Step 10: Commit**

```bash
git add src/schema/run-manifest.ts src/archive/loader.ts \
        src/archive/__tests__/loader-legacy.test.ts \
        src/report/__fixtures__/archive-fixtures.ts \
        src/migrate/reconstruct-manifest.ts \
        src/archive/writer.ts
# add any other files touched in steps 6-8 — DO NOT use `git add -u`
git commit -m "feat(schema): RunManifest.temperatures[] → temperature, loader translates legacy shape"
```

---

### Task 4: Per-model temperature in the run loop, remove `--temperatures` flag

**Files:**
- Modify: `src/cli/commands/run-options.ts`
- Modify: `src/cli/commands/run.ts`
- Modify: `src/orchestration/run-loop.ts`
- Modify: `src/orchestration/run-model.ts`
- Modify: `src/orchestration/phases.ts`
- Modify: `src/orchestration/__tests__/run-model.test.ts`
- Modify: `src/orchestration/__tests__/phases-logging.test.ts`
- Modify: `src/orchestration/__tests__/run-loop.test.ts`
- Modify: `src/orchestration/__tests__/cache.test.ts`
- Modify: `src/cli/commands/__tests__/run.test.ts`

This is the largest task. The change is mechanical: a list-of-temperatures input axis becomes a single per-model value. Test suite breaks all over until done; commit once everything is green.

- [ ] **Step 1: Add a failing test for "temperature comes from model config"**

In `src/cli/commands/__tests__/run.test.ts`, add:

```typescript
it("uses each model's configured temperature when planning cells", async () => {
  // construct a config with two models at different temps
  // assert enumeratePlannedCells emits cells with each model's temperature
  // (mirror the existing planned-cells test for shape)
});
```

(Use the existing test in this file as a template — same mocks, just verify `temperature` propagation.)

- [ ] **Step 2: Run the test to verify it fails**

Expected: FAIL — current code doesn't read `model.temperature`.

- [ ] **Step 3: Remove the temperatures Option**

Edit `src/cli/commands/run-options.ts`:

- Delete the `temperatures` Option export (lines 45-48).
- Remove `temperatures` from the `runOptions` object (line 99).

- [ ] **Step 4: Remove `--temperatures` parsing from `run.ts`**

Edit `src/cli/commands/run.ts`:

- Remove `temperatures: Option.Option<string>` from the parsed-flags interface (around line 88).
- Remove the call to `parseTemperatures` and the surrounding error branch (around lines 109-113).
- Remove `temperatures: temps` from the resulting flags object (line 124).
- In `enumeratePlannedCells` (around line 198), replace the inner `for (const t of config.temperatures)` loop with:

```typescript
for (const p of config.promptCorpus) {
  if (m.temperature === undefined) continue; // inactive models filtered earlier
  out.push({
    artifact: m.artifact,
    promptName: p.name,
    promptHash: p.promptHash,
    temperature: m.temperature,
    kind: "prompt",
  });
}
```

- For scenarios (around line 210), replace `const t0 = config.temperatures[0]` with `const t0 = m.temperature` and use that directly.

- [ ] **Step 5: Update `RunLoopConfig` and `RunModelInput`**

Edit `src/orchestration/run-loop.ts`:

- Remove `readonly temperatures: ReadonlyArray<number>` from `RunLoopConfig` (line 36).
- Remove `temperatures` from any params object that mirrors it (line 135).
- Where `temperatures: config.temperatures` is passed forward (lines 233, 252), replace with `temperature: m.temperature` (m is the current model in scope).
- Where `RunModelInput.temperatures` was passed (lines 150 — adjust as needed), pass `temperature: m.temperature` instead.

Edit `src/orchestration/run-model.ts:119`:

```typescript
// before:
//   readonly temperatures: ReadonlyArray<number>;
// after:
readonly temperature: number;
```

Update the comment block above to describe singular temperature.

- [ ] **Step 6: Update `phases.ts` prompt loop**

Edit `src/orchestration/phases.ts`:

- Line ~92: `const total = input.prompts.length` (remove the `* input.temperatures.length` factor).
- Lines ~96-144: remove the inner `for (const temperature of input.temperatures)` loop. Use `const temperature = input.temperature` once at the top of the prompt iteration.
- Line ~173-175 (scenario phase): delete the empty-temperatures guard. Use `const temperature = input.temperature` directly.

- [ ] **Step 7: Update orchestration tests**

For each of:
- `src/orchestration/__tests__/run-model.test.ts`
- `src/orchestration/__tests__/phases-logging.test.ts`
- `src/orchestration/__tests__/run-loop.test.ts`
- `src/orchestration/__tests__/cache.test.ts`

Find every `temperatures: [...]` literal and replace with `temperature: <single value>`. Cells previously enumerated by 2 temps × N prompts become N prompts (the test expectations need to halve where they double-counted on the temperature axis). Read each test and adjust both the input and the expected output count.

The test at `src/orchestration/__tests__/run-model.test.ts:58-82` ("happy path: 2 prompts × 2 temperatures produces 4 results") is the canary — it explicitly tests temperature multiplication. Rename the test and adjust to "happy path: 2 prompts produces 2 results".

- [ ] **Step 8: Update the planned-cells test from Step 1 to also assert no `temperatures` axis**

Adjust the test you wrote in Step 1 so its expectations match the now-correct implementation.

- [ ] **Step 9: Run the full test suite**

Run:
```bash
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/cli/commands/run-options.ts src/cli/commands/run.ts \
        src/cli/commands/__tests__/run.test.ts \
        src/orchestration/run-loop.ts src/orchestration/run-model.ts src/orchestration/phases.ts \
        src/orchestration/__tests__/run-model.test.ts \
        src/orchestration/__tests__/phases-logging.test.ts \
        src/orchestration/__tests__/run-loop.test.ts \
        src/orchestration/__tests__/cache.test.ts
git commit -m "feat(run): per-model temperature, remove --temperatures CLI flag"
```

---

### Task 5: Cache hit produces no archive write

**Files:**
- Modify: `src/orchestration/phases.ts:108-121`
- Test: `src/orchestration/__tests__/cache.test.ts` (add new case)

- [ ] **Step 1: Write a failing test**

In `src/orchestration/__tests__/cache.test.ts`, add:

```typescript
it("cache hit writes nothing to the new archive", async () => {
  // Setup: a pre-existing archive with one cached result for cell (model, prompt, temp)
  // and a runId matching the new run.
  // Run the new model invocation.
  // Assert: the new archive contains the manifest header and zero result lines.
  // Assert: stats.skippedCached === 1.
  await Effect.runPromise(
    Effect.gen(function* () {
      const dir = yield* makeTmpArchiveDir();
      const oldArchive = `${dir}/old.jsonl`;
      yield* writeManifestHeader(oldArchive, fixtureManifest({ archiveId: "old", runId: "r1" }));
      yield* appendResult(oldArchive, fixtureResult({
        archiveId: "old",
        runId: "r1",
        promptName: "p1",
        promptHash: "abc",
        temperature: 0.3,
      }));

      // Now run the model with the same runId — it should hit cache.
      // (use the existing test harness in this file as a template)
      const outcome = yield* runModelTestHarness({
        archiveDir: dir,
        runId: "r1",
        prompt: "p1",
        promptHash: "abc",
        temperature: 0.3,
      });

      // Inspect the *new* archive
      const newPath = outcome.archivePath;
      const lines = (yield* fs.readFileString(newPath)).split("\n").filter(Boolean);
      expect(lines.length).toBe(1); // only the manifest header
      expect(outcome.stats.skippedCached).toBe(1);
      expect(outcome.stats.completed).toBe(0);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
```

(Adapt the harness call to whatever pattern the existing tests use.)

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/orchestration/__tests__/cache.test.ts -t "cache hit writes nothing"
```

Expected: FAIL — `lines.length` is 2 (header + carried-forward result).

- [ ] **Step 3: Remove the carry-forward write**

Edit `src/orchestration/phases.ts:108-121`. Replace the entire cache-hit block:

```typescript
// before:
//   if (Option.isSome(cached)) {
//     const carried: ExecutionResult = {
//       ...cached.value,
//       archiveId: input.manifest.archiveId,
//       runId: input.manifest.runId,
//     };
//     yield* appendIfSaving(carried, input.archivePath, input.noSave);
//     yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
//     yield* Ref.update(aggRef, (a) => recordPrompt(a, carried, true));
//     yield* Effect.logInfo(...);
//     continue;
//   }

if (Option.isSome(cached)) {
  yield* Ref.update(statsRef, (s) => tallySkipped(s, cached.value));
  yield* Ref.update(aggRef, (a) => recordPrompt(a, cached.value, true));
  yield* Effect.logInfo(
    `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — cache hit (existing archiveId=${cached.value.archiveId}, executedAt=${cached.value.executedAt})`,
  ).pipe(Effect.annotateLogs("scope", "prompt"));
  continue;
}
```

Apply the equivalent change to the scenario phase block (around `phases.ts:194-...`).

- [ ] **Step 4: Run the cache test to verify it passes**

Run:
```bash
npx vitest run src/orchestration/__tests__/cache.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full orchestration suite**

Run:
```bash
npx vitest run src/orchestration
```

Expected: PASS. Existing tests that previously asserted carry-forward (if any) need updating — search:

```bash
grep -n "appendIfSaving\|carried" src/orchestration/__tests__
```

If any test asserts `lines.length === 2` after a cache hit, flip to `=== 1`.

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/phases.ts src/orchestration/__tests__/cache.test.ts
git commit -m "feat(run): cache hit no longer carries result into new archive"
```

---

### Task 6: Drop `scoringMode`, add prompt-side current-corpus filter

**Files:**
- Modify: `src/report/aggregate.ts`
- Modify: `src/report/index.ts`
- Modify: `src/cli/commands/report.ts`
- Modify: `src/report/aggregate.test.ts`
- Modify: `src/cli/commands/__tests__/report.test.ts`

- [ ] **Step 1: Write failing tests for the new filter**

In `src/report/aggregate.test.ts`, add:

```typescript
it("drops result when promptName is absent from current corpus", async () => {
  const archive = makeArchiveWithResults([
    fixtureResult({ promptName: "ghost-prompt", promptHash: "h1" }),
  ]);
  const out = await Effect.runPromise(
    aggregateAll([{ path: "a.jsonl", mtime: new Date(0), data: archive }], {
      currentPromptCorpus: {}, // empty
      currentScenarioCorpus: {},
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(out.records).toHaveLength(0);
  expect(out.dropped.promptAbsent).toBe(1);
});

it("drops result when promptHash differs from current corpus entry", async () => {
  const archive = makeArchiveWithResults([
    fixtureResult({ promptName: "p1", promptHash: "old-hash" }),
  ]);
  const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "new-hash" }) };
  const out = await Effect.runPromise(
    aggregateAll([{ path: "a.jsonl", mtime: new Date(0), data: archive }], {
      currentPromptCorpus: corpus,
      currentScenarioCorpus: {},
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(out.records).toHaveLength(0);
  expect(out.dropped.promptDrifted).toBe(1);
});

it("keeps result whose model is not in current models.yaml", async () => {
  // The aggregator does not consult models.yaml at all.
  const archive = makeArchiveWithResults([
    fixtureResult({ promptName: "p1", promptHash: "h1", model: "ghost-model" }),
  ]);
  const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "h1" }) };
  const out = await Effect.runPromise(
    aggregateAll([{ path: "a.jsonl", mtime: new Date(0), data: archive }], {
      currentPromptCorpus: corpus,
      currentScenarioCorpus: {},
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(out.records).toHaveLength(1);
  expect(out.records[0].model).toBe("ghost-model");
});
```

(Note: the new signature passes `mtime` per archive and a flat corpus object instead of `AggregateOptions`. The tests therefore won't compile until Step 3 lands.)

- [ ] **Step 2: Run the tests to verify they fail to even compile**

Run:
```bash
npx vitest run src/report/aggregate.test.ts
```

Expected: TS error or test failure — `aggregateAll` signature doesn't match yet.

- [ ] **Step 3: Rewrite `aggregateAll`'s signature and logic**

Edit `src/report/aggregate.ts`. Replace the file's public surface:

```typescript
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { LoadedArchive } from "../archive/loader.js";
import type {
  ExecutionResult,
  PromptCorpusEntry,
  RunManifest,
  ScenarioCorpusEntry,
} from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";
import { scoreExecution } from "../scoring/score-result.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

export interface AggregateInput {
  readonly archives: ReadonlyArray<{
    readonly path: string;
    readonly mtime: Date;
    readonly data: LoadedArchive;
  }>;
  readonly currentPromptCorpus: Record<string, PromptCorpusEntry>;
  readonly currentScenarioCorpus: Record<string, ScenarioCorpusEntry>;
}

export interface AggregateResult {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly dropped: {
    readonly promptAbsent: number;
    readonly promptDrifted: number;
  };
}

const safeScore = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
): Effect.Effect<Score, never, CommandExecutor.CommandExecutor> =>
  scoreExecution(result, entry).pipe(
    Effect.catchAll((err) =>
      Effect.succeed<Score>({ score: 0, details: `scorer error: ${err._tag}` }),
    ),
  );

const errorScore = (result: ExecutionResult): Score => ({
  score: 0,
  details: `execution error: ${(result.error ?? "").slice(0, 160)}`,
});

export const aggregateAll = (
  input: AggregateInput,
): Effect.Effect<AggregateResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const records: WebappRecord[] = [];
    let promptAbsent = 0;
    let promptDrifted = 0;

    for (const archive of input.archives) {
      for (const result of archive.data.results) {
        const isScenario = result.scenarioName !== null;
        const corpus = isScenario ? input.currentScenarioCorpus : input.currentPromptCorpus;
        const entry = corpus[result.promptName];
        if (entry === undefined) {
          promptAbsent += 1;
          continue;
        }
        if (entry.promptHash !== result.promptHash) {
          promptDrifted += 1;
          continue;
        }
        const score =
          result.error !== null && result.error.length > 0
            ? errorScore(result)
            : yield* safeScore(result, entry);
        const rec = toWebappRecord(result, entry, score);
        records.push({ ...rec, tags: entry.tags ?? [] });
      }
    }

    // Cell-level dedup is added in Task 8. For now, return all surviving records.
    return { records, dropped: { promptAbsent, promptDrifted } };
  });
```

- [ ] **Step 4: Update `src/report/index.ts`**

- Drop `scoringMode` and `currentPromptCorpus`/`currentScenarioCorpus` parameters' optionality.
- The `ReportOptions.scoringMode` field is removed.
- `currentPromptCorpus` and `currentScenarioCorpus` become required.
- Wire the new `aggregateAll` shape: pass `archives` with `mtime` (Task 7 adds the mtime; for now, pass `mtime: new Date(0)` as a placeholder — this is an internal detail nothing else reads yet).
- Add `dropped: AggregateResult["dropped"]` to `ReportSummary`.

```typescript
export interface ReportSummary {
  readonly archiveDir: string;
  readonly outputPath: string;
  readonly archivesLoaded: number;
  readonly recordCount: number;
  readonly loadIssues: ReadonlyArray<ReportLoadIssue>;
  readonly dropped: { readonly promptAbsent: number; readonly promptDrifted: number };
  readonly dryRun: boolean;
  readonly records: ReadonlyArray<WebappRecord>;
}
```

Remove the `unmatched` field (replaced by `dropped`).

- [ ] **Step 5: Update `src/cli/commands/report.ts`**

- Remove the `scoring` Option (lines 40-43).
- Remove `useCurrent` and the catchAll fallback (lines 67, 76, 79). Always load the current corpus; failure to load is fatal:

```typescript
const currentPromptCorpus = yield* loadPrompts;
const currentScenarioCorpus = yield* loadScenarios;
```

- Remove the `--prompts-dir` description's "(only used when --scoring=current)" qualifier.
- Pass `currentPromptCorpus` / `currentScenarioCorpus` as required to `runReport`.
- Replace the warning logs about `unmatched` with the dropped summary:

```typescript
yield* Effect.logInfo(
  `report: wrote ${summary.recordCount} records from ${summary.archivesLoaded} archives → ${summary.outputPath}`,
);
yield* Effect.logInfo(
  `report: dropped ${summary.dropped.promptAbsent} (prompt absent), ${summary.dropped.promptDrifted} (prompt drifted)`,
);
```

- Update the file's header comment to remove `--scoring` references.

- [ ] **Step 6: Update existing tests**

In `src/report/aggregate.test.ts`, delete tests for `scoringMode: as-run`. Tests that used `aggregateAll(archives, options)` with the old shape need rewriting to the new `aggregateAll({archives, currentPromptCorpus, currentScenarioCorpus})` shape.

In `src/cli/commands/__tests__/report.test.ts`, remove any reference to `--scoring=as-run` and update assertions to not check `unmatched`.

- [ ] **Step 7: Run the full test suite**

Run:
```bash
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/report/aggregate.ts src/report/index.ts \
        src/cli/commands/report.ts \
        src/report/aggregate.test.ts \
        src/cli/commands/__tests__/report.test.ts
git commit -m "feat(report): drop scoringMode, add prompt-side current-corpus filter"
```

---

### Task 7: Thread archive `mtime` through the loader

**Files:**
- Modify: `src/report/load-archives.ts`
- Modify: `src/report/index.ts` (consumer)
- Test: `src/report/load-archives.test.ts` (create or extend)

The mtime is needed for the dedup tie-break in Task 8. It's purely plumbing in this task.

- [ ] **Step 1: Update `ArchiveLoadResult`**

Edit `src/report/load-archives.ts`:

```typescript
export interface ArchiveLoadResult {
  readonly archives: ReadonlyArray<{
    readonly path: string;
    readonly mtime: Date;
    readonly data: LoadedArchive;
  }>;
  readonly issues: ReadonlyArray<ReportLoadIssue>;
}
```

In `loadAllArchives`, after `loadManifest(path)` succeeds, stat the file to get mtime:

```typescript
const stat = yield* fs.stat(path).pipe(Effect.mapError(toFileIOError(path, "stat-archive")));
const mtime = stat.mtime ?? new Date(0);
```

(Adapt to Effect's filesystem stat shape — `mtime` may be at `stat.mtime` or `stat.modifyTime`; check the surrounding code or `@effect/platform` docs.)

Push `{ path, mtime, data }` into the archives array.

- [ ] **Step 2: Update the consumer in `src/report/index.ts`**

The `loaded.archives` is now `Array<{path, mtime, data}>`. Pass it through to `aggregateAll`:

```typescript
const result = yield* aggregateAll({
  archives: loaded.archives,
  currentPromptCorpus,
  currentScenarioCorpus,
});
```

(Replaces the placeholder `mtime: new Date(0)` from Task 6.)

- [ ] **Step 3: Add a small test for mtime presence**

In `src/report/load-archives.test.ts`:

```typescript
it("returns archive mtime alongside loaded data", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const dir = yield* makeTmpArchiveDir();
      const path = `${dir}/m.jsonl`;
      yield* writeManifestHeader(path, fixtureManifest({}));
      const result = yield* loadAllArchives(dir);
      expect(result.archives).toHaveLength(1);
      expect(result.archives[0].mtime).toBeInstanceOf(Date);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
```

- [ ] **Step 4: Run the test**

Run:
```bash
npx vitest run src/report/load-archives.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run:
```bash
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/report/load-archives.ts src/report/index.ts src/report/load-archives.test.ts
git commit -m "feat(report): thread archive mtime through the loader for tie-break"
```

---

### Task 8: Cell-level dedup with tie-break

**Files:**
- Modify: `src/report/aggregate.ts`
- Test: `src/report/aggregate.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/report/aggregate.test.ts`:

```typescript
it("dedups same cell across archives, latest executedAt wins", async () => {
  const olderResult = fixtureResult({
    promptName: "p1",
    promptHash: "h1",
    executedAt: "2026-01-01T00:00:00.000Z",
    output: "old-output",
  });
  const newerResult = fixtureResult({
    promptName: "p1",
    promptHash: "h1",
    executedAt: "2026-01-02T00:00:00.000Z",
    output: "new-output",
  });
  const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "h1" }) };
  const out = await Effect.runPromise(
    aggregateAll({
      archives: [
        { path: "a.jsonl", mtime: new Date(1), data: makeArchiveWithResults([olderResult]) },
        { path: "b.jsonl", mtime: new Date(2), data: makeArchiveWithResults([newerResult]) },
      ],
      currentPromptCorpus: corpus,
      currentScenarioCorpus: {},
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(out.records).toHaveLength(1);
  // Webapp record carries `output` only indirectly; assert via a field that does cross over,
  // or assert the executedAt the record reports.
  expect(out.records[0].executedAt).toBe("2026-01-02T00:00:00.000Z");
});

it("tie-breaks identical executedAt by archive mtime descending", async () => {
  const sameTime = "2026-01-01T00:00:00.000Z";
  const r1 = fixtureResult({
    promptName: "p1", promptHash: "h1", executedAt: sameTime, archiveId: "a",
  });
  const r2 = fixtureResult({
    promptName: "p1", promptHash: "h1", executedAt: sameTime, archiveId: "b",
  });
  const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "h1" }) };
  const out = await Effect.runPromise(
    aggregateAll({
      archives: [
        { path: "older.jsonl", mtime: new Date(1000), data: makeArchiveWithResults([r1]) },
        { path: "newer.jsonl", mtime: new Date(2000), data: makeArchiveWithResults([r2]) },
      ],
      currentPromptCorpus: corpus,
      currentScenarioCorpus: {},
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(out.records).toHaveLength(1);
  // The "b" archive has newer mtime — its result wins
  expect(out.records[0].archiveId).toBe("b");
});
```

(Adapt the assertion fields to whatever `WebappRecord` actually exposes; if `executedAt`/`archiveId` aren't on `WebappRecord`, expose them or assert on a derived field that distinguishes the two records.)

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run src/report/aggregate.test.ts
```

Expected: FAIL — both records currently survive (no dedup yet).

- [ ] **Step 3: Implement dedup with tie-break**

Edit `src/report/aggregate.ts`. After the per-archive scoring loop produces a flat list, group by cell key, pick the winner per group, and emit one record per cell.

```typescript
type CellKey = string;
const cellKeyOf = (r: ExecutionResult): CellKey =>
  // artifact comes via manifest, not result — but ExecutionResult has model/runtime/quant
  // already denormalized. The cell key is on those + prompt + temperature.
  `${r.model}|${r.runtime}|${r.quant}|${r.promptName}|${r.promptHash}|${r.temperature}`;

interface Candidate {
  readonly archivePath: string;
  readonly mtime: Date;
  readonly result: ExecutionResult;
  readonly entry: PromptCorpusEntry | ScenarioCorpusEntry;
  readonly score: Score;
}

// Inside aggregateAll, replace the inner record-push with collection of candidates:
const candidates = new Map<CellKey, Candidate>();

// ...existing scoring loop produces a `Candidate` for each surviving result...
const candidate: Candidate = { archivePath: archive.path, mtime: archive.mtime, result, entry, score };
const key = cellKeyOf(result);
const existing = candidates.get(key);
if (existing === undefined) {
  candidates.set(key, candidate);
} else {
  candidates.set(key, pickWinner(existing, candidate));
}
```

Add `pickWinner`:

```typescript
const pickWinner = (a: Candidate, b: Candidate): Candidate => {
  if (a.result.executedAt !== b.result.executedAt) {
    return a.result.executedAt > b.result.executedAt ? a : b;
  }
  if (a.mtime.getTime() !== b.mtime.getTime()) {
    return a.mtime.getTime() > b.mtime.getTime() ? a : b;
  }
  return a.archivePath < b.archivePath ? a : b;
};
```

Convert the surviving candidates into records:

```typescript
const records: WebappRecord[] = [];
for (const c of candidates.values()) {
  const rec = toWebappRecord(c.result, c.entry, c.score);
  records.push({ ...rec, tags: c.entry.tags ?? [] });
}
return { records, dropped: { promptAbsent, promptDrifted } };
```

- [ ] **Step 4: Run the dedup tests**

Run:
```bash
npx vitest run src/report/aggregate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run:
```bash
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/report/aggregate.ts src/report/aggregate.test.ts
git commit -m "feat(report): cell-level dedup with executedAt → mtime → path tie-break"
```

---

### Task 9: Drop-reason summary in CLI output

**Files:**
- Modify: `src/cli/commands/report.ts`
- Modify: `src/cli/commands/__tests__/report.test.ts`

This task formalizes the operator-facing summary block so it stands out as an audit trail rather than a logged warning.

- [ ] **Step 1: Write a failing test**

In `src/cli/commands/__tests__/report.test.ts`, add:

```typescript
it("prints a drop-reason summary block", async () => {
  // Set up a tmp archive dir with one archive containing:
  //  - 1 result for an unknown prompt (-> promptAbsent)
  //  - 1 result with stale promptHash (-> promptDrifted)
  //  - 1 result that survives
  // Run the CLI's report subcommand with mocked corpus loaders.
  // Capture log lines.
  // Assert one log line includes "dropped 1 (prompt absent), 1 (prompt drifted)".
});
```

(Use the existing test setup in this file as a template for how it captures log output.)

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/cli/commands/__tests__/report.test.ts -t "drop-reason"
```

Expected: FAIL — log lines don't match.

- [ ] **Step 3: Format the summary in the CLI handler**

Edit `src/cli/commands/report.ts`:

```typescript
yield* Effect.logInfo(
  `report: loaded ${summary.archivesLoaded} archives, ${totalScannedResults(summary)} results`,
);
yield* Effect.logInfo(
  `report: dropped ${summary.dropped.promptAbsent} (prompt absent), ${summary.dropped.promptDrifted} (prompt drifted)`,
);
yield* Effect.logInfo(
  `report: wrote ${summary.recordCount} cells → ${summary.outputPath}`,
);
```

If `totalScannedResults` doesn't exist, derive locally from `recordCount + dropped.promptAbsent + dropped.promptDrifted`, or surface the total in `ReportSummary`. Choose whichever is cleanest given the existing summary shape.

- [ ] **Step 4: Run the report-CLI tests**

Run:
```bash
npx vitest run src/cli/commands/__tests__/report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify end-to-end manually**

Run:
```bash
./bench report --archive-dir ./benchmark-archive --output webapp/src/data
```

Expected output includes the drop-reason line. Eyeball the numbers — `dropped` plus `recordCount` should equal the scanned-results total, and the `recordCount` should be lower than before (since dedup is now happening).

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/report.ts src/cli/commands/__tests__/report.test.ts
git commit -m "feat(report): print drop-reason summary as audit trail"
```

---

### Task 10: Inventory script

**Files:**
- Create: `scripts/inventory.ts`

A one-off operator tool. Reads archives, prints per-model temperature usage and prompt-drift counts. Used to populate `temperature:` in `models.yaml` with values reflecting existing data.

- [ ] **Step 1: Write the script**

Create `scripts/inventory.ts`:

```typescript
#!/usr/bin/env -S npx tsx
/**
 * One-off migration helper. Walks `benchmark-archive/*.jsonl` and prints a
 * per-model summary of recorded temperatures and prompt-drift counts so the
 * operator can populate `temperature:` in models.yaml.
 *
 * Usage:
 *   npx tsx scripts/inventory.ts [archive-dir] [prompts-dir]
 *
 * Defaults: ./benchmark-archive ./prompts
 */
import { Effect } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { loadAllArchives } from "../src/report/load-archives.js";
import { loadPromptCorpus } from "../src/config/prompt-corpus.js";
import { loadScenarioCorpus } from "../src/config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../src/config/system-prompts.js";
import { Layer } from "effect";
import { scenariosSubdir, systemPromptsPath } from "../src/cli/paths.js";

const archiveDir = process.argv[2] ?? "./benchmark-archive";
const promptsDir = process.argv[3] ?? "./prompts";

interface ModelStats {
  readonly temps: Map<number, number>;
  readonly drifted: number;
  readonly total: number;
}

const modelKey = (model: string, runtime: string, quant: string) =>
  `${model}|${runtime}|${quant}`;

const program = Effect.gen(function* () {
  const registry = Layer.effect(SystemPromptRegistry, loadSystemPrompts(systemPromptsPath(promptsDir)));
  const promptCorpus = yield* loadPromptCorpus(promptsDir).pipe(Effect.provide(registry));
  const scenarioCorpus = yield* loadScenarioCorpus(scenariosSubdir(promptsDir));
  const promptIndex = Object.fromEntries(promptCorpus.map((p) => [p.name, p]));
  const scenarioIndex = Object.fromEntries(scenarioCorpus.map((s) => [s.name, s]));

  const loaded = yield* loadAllArchives(archiveDir);

  const stats = new Map<string, ModelStats>();
  for (const archive of loaded.archives) {
    for (const r of archive.data.results) {
      const key = modelKey(r.model, r.runtime, r.quant);
      const cur = stats.get(key) ?? { temps: new Map(), drifted: 0, total: 0 };
      const isScenario = r.scenarioName !== null;
      const corpus = isScenario ? scenarioIndex : promptIndex;
      const entry = corpus[r.promptName];
      const drifted = entry !== undefined && entry.promptHash !== r.promptHash ? 1 : 0;
      const next: ModelStats = {
        temps: new Map(cur.temps).set(r.temperature, (cur.temps.get(r.temperature) ?? 0) + 1),
        drifted: cur.drifted + drifted,
        total: cur.total + 1,
      };
      stats.set(key, next);
    }
  }

  const sorted = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
  console.log("Model | Runtime | Quant | Temperatures (count) | Drift / Total");
  for (const [key, s] of sorted) {
    const tempsList = [...s.temps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    console.log(`${key} | ${tempsList} | ${s.drifted}/${s.total}`);
  }
});

NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)));
```

(Confirm import paths — they may need extension adjustments depending on tsconfig settings. The other `scripts/*.ts` files are reference templates.)

- [ ] **Step 2: Run the script against the actual archive directory**

Run:
```bash
npx tsx scripts/inventory.ts
```

Expected: a table listing each `(model, runtime, quant)` triple along with which temperatures it has data at and how many results have drifted prompt content. No errors.

- [ ] **Step 3: Use the output to populate `models.yaml`**

For each `active: true` model in `models.yaml`, replace the placeholder `temperature: 0.7` (added in Task 2 Step 10) with the dominant temperature from the inventory output. If a model has data at multiple temps, pick the lowest unless the operator has reason to prefer otherwise.

- [ ] **Step 4: Run the report and verify the drop counts**

Run:
```bash
./bench report --archive-dir ./benchmark-archive --output webapp/src/data
```

Eyeball the drop-reason summary. The drift count should match the inventory's drift column. The `recordCount` should be reasonable (one per cell in the current corpus, capped by what's actually in archives).

- [ ] **Step 5: Commit**

```bash
git add scripts/inventory.ts models.yaml webapp/src/data/data.js
git commit -m "chore(migration): add inventory script and populate models.yaml temperatures"
```

(Include `data.js` in the commit so the webapp reflects the new state.)

---

## Self-review

**Spec coverage check:**

- ✅ Cell uniqueness key — Task 8 (`cellKeyOf`)
- ✅ Latest executedAt + mtime tie-break — Task 8 (`pickWinner`)
- ✅ RunId clarification — covered by spec; no code change.
- ✅ Cache hit no-write — Task 5
- ✅ ModelConfig.temperature — Task 2
- ✅ RunManifest single temperature + loader translation — Task 3
- ✅ CLI flag removal + per-model wiring — Task 4
- ✅ Drop scoringMode — Task 6
- ✅ Prompt-side current-corpus filter (absent + drifted) — Task 6
- ✅ Past runs survive without models.yaml ref — verified by Task 6 Step 1 third test
- ✅ Drop-reason summary — Tasks 6 (data) and 9 (CLI output)
- ✅ PASS_THRESHOLD = 0.7 — Task 1
- ✅ Inventory script + migration — Tasks 10
- ✅ Test 1 (cell-level dedup) — Task 8
- ✅ Test 2 (tie-break on identical executedAt) — Task 8
- ✅ Test 3 (drop on prompt absent) — Task 6
- ✅ Test 4 (drop on prompt drift) — Task 6
- ✅ Test 5 (past runs survive without models.yaml) — Task 6
- ✅ Test 6 (cache hit produces no write) — Task 5
- ✅ Test 7 (ModelConfig.temperature roundtrip + active validation) — Task 2
- ✅ Test 8 (loader translates legacy temperatures shape) — Task 3

No gaps. The spec's edge cases and invariants are observable consequences of the code paths covered above.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" steps. Code blocks accompany every code-changing step. Task 4 has a "use existing test as a template" note — that's a pointer to in-repo example, not a placeholder.

**Type / signature consistency:**

- `aggregateAll` signature changes once in Task 6 (introduce `AggregateInput` / `AggregateResult`) and is consumed in Tasks 7 and 8 with the same shape. Tests in Task 6 use `mtime: new Date(0)` placeholder; Task 7 wires real mtimes; Task 8 relies on real mtimes. The progression is intentional.
- `RunModelInput.temperature: number` (Task 4) is referenced in the test fixture changes (Task 4 Step 7) consistently.
- `ReportSummary.dropped` field is introduced in Task 6 Step 4 and consumed in Task 9.

No drift detected.
