# Matrix Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `submit` cross-product shell loop with one command that runs a matched set of configurations against a matched set of challenges, booting each model **once per configuration** and reusing it across all that configuration's challenges.

**Architecture:** A new pure selection module (`select.ts`) picks configs/challenges by glob; the orchestration core is split so server lifetime lifts from per-attempt to per-configuration (`runChallengeWithServer` + a `runMatrix` outer loop); the existing `submit` command is evolved into the sweep and then renamed to `run`. Output is the same per-attempt `.jsonl` archives `report`/webapp already consume — this is an orchestration + selection layer, not a new archive format.

**Tech Stack:** TypeScript (NodeNext ESM), Effect-TS (`effect`, `@effect/platform`, `@effect/cli`), vitest, biome, picomatch v4.

## Global Constraints

These apply to **every** task. Each task's requirements implicitly include this section.

- **Spec of record:** `docs/superpowers/specs/2026-06-20-matrix-runner-design.md`. Where this plan and the spec's §3 flag table disagree, the plan wins — the spec table predates the inline-prompts refactor (there is no `prompts/` dir or prompt corpus anymore; system prompts live in `system-prompts.yaml` selected via `--system-prompts-file`).
- **`run` name is already free.** `src/cli/commands/run.ts` was deleted in a prior pass and is not registered in `main.ts`. This plan does **not** depend on the obsolete-run-path removal (`docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md`); that dead-code sweep is tracked separately.
- **lint-strict (`bash scripts/lint-strict.sh`):** outside `src/cli/`, code must not use `Date.now()`, argless `new Date()`, `Math.random()`, `console.*`, or `throw` (except in `*.test.ts`). Orchestration timestamps use `Clock.currentTimeMillis` (an Effect). `new Date(ms)` with an explicit argument is allowed. Files under `src/cli/` may use `console.*` and `Date.now()`.
- **Sequential model serving only.** One local model in memory at a time; v1 does not design for parallel serving. Iterating config-by-config guarantees exactly one server (per runtime's fixed port) is up at a time.
- **Attempt archives are unchanged.** Each cell mints its own `attemptId` (`att-${configHash}-${challengeHash}-${ms}`) and writes an independent finalized `.jsonl`, identical in shape to today's `submit` output.
- **TDD, frequent commits.** Every task: failing test → run-it-fails → minimal impl → run-it-passes → commit. Verify commands per task: `npx tsc --noEmit`, `npx vitest run <file>`, `npx biome check src`, `bash scripts/lint-strict.sh`.

---

### Task 1: Selection module (`select.ts`) + picomatch dependency

**Files:**
- Modify: `package.json` (add `picomatch` dep + `@types/picomatch` devDep)
- Create: `src/config/select.ts`
- Test: `src/config/select.test.ts`

**Interfaces:**
- Produces: `selectConfigs<T extends { id: string; active?: boolean }>(all: readonly T[], pattern?: string): T[]` and `selectChallengeStems(stems: readonly string[], pattern?: string): string[]`. Both pure (no Effect, no IO). Empty result is a valid return; fail-fast is the caller's job.

- [ ] **Step 1: Add the dependency**

Run:
```bash
npm install picomatch@^4 && npm install -D @types/picomatch
```
Expected: `package.json` gains `"picomatch"` under `dependencies` and `"@types/picomatch"` under `devDependencies`; `node_modules/picomatch` present.

- [ ] **Step 2: Write the failing test**

Create `src/config/select.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { selectChallengeStems, selectConfigs } from "./select.js";

const cfgs = [
  { id: "qwen2.5-7b-mlx" },
  { id: "qwen2.5-7b-llamacpp" },
  { id: "llama3.1-8b-mlx" },
  { id: "smoke-config", active: false },
];

describe("selectConfigs", () => {
  it("returns all non-disabled configs when no pattern is given", () => {
    expect(selectConfigs(cfgs).map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
      "llama3.1-8b-mlx",
    ]);
  });

  it("matches a literal id exactly (dots and dashes are literal)", () => {
    expect(selectConfigs(cfgs, "qwen2.5-7b-mlx").map((c) => c.id)).toEqual(["qwen2.5-7b-mlx"]);
    // '.' is literal, not 'any char': a different char must not match.
    expect(selectConfigs(cfgs, "qwen2X5-7b-mlx")).toEqual([]);
  });

  it("supports * wildcard and {a,b} brace alternation", () => {
    expect(selectConfigs(cfgs, "qwen*").map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
    ]);
    expect(selectConfigs(cfgs, "qwen2.5-7b-{mlx,llamacpp}").map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
    ]);
  });

  it("an explicit pattern overrides the active gate", () => {
    expect(selectConfigs(cfgs, "smoke-config").map((c) => c.id)).toEqual(["smoke-config"]);
  });

  it("returns [] on no match (caller decides to fail)", () => {
    expect(selectConfigs(cfgs, "nope*")).toEqual([]);
  });
});

describe("selectChallengeStems", () => {
  const stems = ["code", "constraint", "effect-ts", "logic", "math"];
  it("returns all when no pattern", () => {
    expect(selectChallengeStems(stems)).toEqual(stems);
  });
  it("filters by glob with literal dash", () => {
    expect(selectChallengeStems(stems, "effect-ts")).toEqual(["effect-ts"]);
    expect(selectChallengeStems(stems, "{code,math}")).toEqual(["code", "math"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/config/select.test.ts`
Expected: FAIL — `Cannot find module './select.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/config/select.ts`:
```typescript
/**
 * Pure selection helpers for the matrix runner. No Effect, no IO — glob
 * matching over already-loaded config ids and challenge file stems.
 *
 * Engine: picomatch v4. Patterns are full-string anchored. `*`, `?`, `[…]`,
 * and `{a,b}` brace alternation are supported; `.`, `-`, and `/` are literal
 * (so `qwen2.5-7b-mlx` matches itself but not `qwen2X5-7b-mlx`).
 */
import picomatch from "picomatch";

/**
 * Select configurations by id glob. With no pattern, return every config not
 * explicitly disabled (`active: false`) — opt-out semantics, matching the
 * `active: false` convention. An explicit pattern overrides the active gate:
 * explicit intent wins.
 */
export const selectConfigs = <T extends { id: string; active?: boolean }>(
  all: readonly T[],
  pattern?: string,
): T[] => {
  if (pattern === undefined) return all.filter((c) => c.active !== false);
  const isMatch = picomatch(pattern);
  return all.filter((c) => isMatch(c.id));
};

/** Select challenge file stems by glob. With no pattern, return all stems. */
export const selectChallengeStems = (stems: readonly string[], pattern?: string): string[] => {
  if (pattern === undefined) return [...stems];
  const isMatch = picomatch(pattern);
  return stems.filter((s) => isMatch(s));
};
```

- [ ] **Step 5: Run tests + lint to verify pass**

Run: `npx vitest run src/config/select.test.ts && npx tsc --noEmit && bash scripts/lint-strict.sh`
Expected: tests PASS, no type errors, lint clean. (If the default `import picomatch from "picomatch"` errors under NodeNext, change to `import * as picomatch from "picomatch"` — but esModuleInterop is on, so the default import should hold.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config/select.ts src/config/select.test.ts
git commit -m "feat(matrix): pure config/challenge selection module + picomatch dep"
```

---

### Task 2: Challenge file discovery (`listChallengeFiles`)

**Files:**
- Modify: `src/config/challenges.ts` (add exported helper near `loadChallenge`)
- Test: `src/config/__tests__/list-challenge-files.test.ts`

**Interfaces:**
- Consumes: `FileSystem.FileSystem`.
- Produces: `interface ChallengeFile { readonly stem: string; readonly path: string }` and `listChallengeFiles(dir: string): Effect.Effect<ReadonlyArray<ChallengeFile>, PlatformError, FileSystem.FileSystem>` — every `*.yaml` in `dir`, stem = filename without `.yaml`, sorted by stem. Does **not** parse the YAML (selection matches on the filename; the archive's challenge id still comes from the loaded YAML).

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/list-challenge-files.test.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listChallengeFiles } from "../challenges.js";

let dir: string;

beforeAll(async () => {
  dir = await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const d = yield* fs.makeTempDirectory();
      yield* fs.writeFileString(`${d}/math.yaml`, "id: math\n");
      yield* fs.writeFileString(`${d}/code.yaml`, "id: code\n");
      yield* fs.writeFileString(`${d}/notes.txt`, "ignore me\n");
      return d;
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});

afterAll(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(dir, { recursive: true });
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});

it("lists *.yaml stems sorted, ignoring non-yaml", async () => {
  const files = await Effect.runPromise(
    listChallengeFiles(dir).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(files.map((f) => f.stem)).toEqual(["code", "math"]);
  expect(files[0].path).toBe(`${dir}/code.yaml`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/list-challenge-files.test.ts`
Expected: FAIL — `listChallengeFiles` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/config/challenges.ts`, add near `loadChallenge` (the file already imports `path` from `node:path`, `FileSystem` from `@effect/platform`, and `Effect`):
```typescript
export interface ChallengeFile {
  readonly stem: string;
  readonly path: string;
}

/**
 * List every `*.yaml` in `dir` as `{ stem, path }`, sorted by stem. Selection
 * matches on the filename stem, so this never parses the YAML — the loaded
 * challenge's own `id` is still authoritative for the archive.
 */
export const listChallengeFiles = (
  dir: string,
): Effect.Effect<
  ReadonlyArray<ChallengeFile>,
  import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir);
    return entries
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => ({ stem: f.replace(/\.yaml$/, ""), path: path.join(dir, f) }))
      .sort((a, b) => a.stem.localeCompare(b.stem));
  });
```

- [ ] **Step 4: Run tests + lint to verify pass**

Run: `npx vitest run src/config/__tests__/list-challenge-files.test.ts && npx tsc --noEmit && bash scripts/lint-strict.sh`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/config/challenges.ts src/config/__tests__/list-challenge-files.test.ts
git commit -m "feat(matrix): listChallengeFiles directory discovery helper"
```

---

### Task 3: Split orchestration — `runChallengeWithServer` + thin `runChallenge` wrapper

**Files:**
- Modify: `src/orchestration/run-challenge.ts`
- Test: `src/orchestration/__tests__/run-challenge-with-server.test.ts` (new); existing `src/orchestration/__tests__/run-challenge.test.ts` must stay green.

**Interfaces:**
- Consumes: existing `RunChallengeInput`, `ServerHandle` (`../llm/servers/supervisor.js`), `executeOrCacheItem`, `aggregate`, `baseHeader`, `writeAttemptHeader`, `writeBlob`, `appendItem`, `finalizeAttempt` (all already in this file/imports).
- Produces:
  - `runChallengeWithServer(input: RunChallengeInput, server: ServerHandle): Effect.Effect<AttemptManifest, FileIOError | JsonlCorruptLine, FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion>` — the current inner body **minus** the scope and the boot; uses `server.peakRssKb`.
  - `runChallenge(input)` — unchanged signature; now a thin `Effect.scoped` wrapper that boots once via `input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie)` then delegates.
  - `modelFromConfig` becomes **exported** (consumed by Task 4).
  - `resumeChallenge` is **left untouched**.

- [ ] **Step 1: Write the failing test (server passed in is reused; no boot)**

Create `src/orchestration/__tests__/run-challenge-with-server.test.ts`. Mirror the setup of the existing `run-challenge.test.ts` (same imports: `okStub`, `fakeServerHandle`, `inertHttpClientLayer`, config/env/`makeChallenge` from `./fixtures.js`, `NodeContext.layer`). The new assertion is that `runChallengeWithServer` uses the **provided** handle and never calls a server factory:
```typescript
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runChallengeWithServer } from "../run-challenge.js";
import {
  config,
  env,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeTempDir,
  okStub,
  removeDir,
} from "./fixtures.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeDir(dir);
});

it("runs every item against the provided server and finalizes the archive", async () => {
  const challenge = makeChallenge();
  const m = okStub();
  const manifest = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* fakeServerHandle();
        return yield* runChallengeWithServer(
          {
            config,
            challenge,
            attemptId: "att-withserver",
            archiveDir: dir,
            archivePath: `${dir}/att-withserver.jsonl`,
            env,
            deps: { llmServer: () => Effect.die("must not boot") } as never,
          },
          server,
        );
      }),
    ).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.interrupted).toBe(false);
  expect(manifest.aggregate.score).toBeGreaterThanOrEqual(0);
});
```
> Note: if `makeTempDir`/`removeDir` helpers are not exported from `fixtures.ts`, use the same temp-dir pattern the existing `run-challenge.test.ts` uses (it manages `dir` in `beforeEach`/`afterEach`); copy that pattern verbatim rather than inventing new helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-challenge-with-server.test.ts`
Expected: FAIL — `runChallengeWithServer` is not exported.

- [ ] **Step 3: Refactor `run-challenge.ts`**

Replace the body of `runChallenge` with the split. The new `runChallengeWithServer` is the **current** inner gen with two changes: (a) remove the `const llmHandle = yield* input.deps.llmServer(...)` boot line, (b) pass `server.peakRssKb` to `executeOrCacheItem`. Add the import `import type { ServerHandle } from "../llm/servers/supervisor.js";`. Export `modelFromConfig`.

```typescript
export const runChallengeWithServer = (
  input: RunChallengeInput,
  server: ServerHandle,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const startedMs = yield* Clock.currentTimeMillis;
    const header = baseHeader(input, new Date(startedMs).toISOString());
    yield* writeAttemptHeader(input.archivePath, header);
    yield* writeBlob(
      input.archiveDir,
      "system",
      input.config.configHash,
      input.config.systemPromptText,
    );
    const scored: ItemResult[] = [];
    for (const item of input.challenge.items) {
      const row = yield* executeOrCacheItem(input, item, server.peakRssKb);
      yield* appendItem(input.archivePath, row);
      scored.push(row);
    }
    const agg = aggregate(scored, input.challenge.passThreshold);
    const finishedMs = yield* Clock.currentTimeMillis;
    const finishedAt = new Date(finishedMs).toISOString();
    yield* finalizeAttempt(input.archivePath, finishedAt, agg);
    return { ...header, finishedAt, interrupted: false, aggregate: agg };
  });

export const runChallenge = (
  input: RunChallengeInput,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);
      return yield* runChallengeWithServer(input, server);
    }),
  );
```
Change `const modelFromConfig =` to `export const modelFromConfig =` (signature unchanged).

- [ ] **Step 4: Run the new test AND the full existing orchestration suite**

Run: `npx vitest run src/orchestration && npx tsc --noEmit && bash scripts/lint-strict.sh`
Expected: the new test PASSES and **every existing** `run-challenge` / `resume-challenge` test stays green (the wrapper is behavior-preserving). Lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge-with-server.test.ts
git commit -m "refactor(matrix): split runChallengeWithServer from runChallenge; export modelFromConfig"
```

---

### Task 4: `runMatrix` orchestrator

**Files:**
- Create: `src/orchestration/run-matrix.ts`
- Test: `src/orchestration/__tests__/run-matrix.test.ts`

**Interfaces:**
- Consumes: `runChallengeWithServer`, `modelFromConfig` (Task 3); `RunModelDeps` (`./run-model.js`); `ResolvedConfiguration` (`../config/configurations.js`); `ResolvedChallenge` (`../config/challenges.js`); `RunEnv` (`../schema/run-manifest.js`); `ChatCompletion` (`../llm/chat-completion.js`).
- Produces:
  ```typescript
  export type MatrixCellStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED";
  export interface MatrixCell {
    readonly configId: string;
    readonly challengeStem: string;
    readonly challengeId: string;
    readonly version?: number;
    readonly status: MatrixCellStatus;
    readonly score?: number;
    readonly reason?: string;
  }
  export interface MatrixChallenge { readonly stem: string; readonly resolved: ResolvedChallenge }
  export interface RunMatrixInput {
    readonly configs: ReadonlyArray<ResolvedConfiguration>;
    readonly challenges: ReadonlyArray<MatrixChallenge>;
    readonly archiveDir: string;
    readonly env: RunEnv;
    readonly deps: RunModelDeps;
    readonly noCache?: boolean;
    readonly onCell?: (cell: MatrixCell, configIndex: number, configTotal: number) => Effect.Effect<void>;
  }
  export const runMatrix: (input: RunMatrixInput) => Effect.Effect<ReadonlyArray<MatrixCell>, never, FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion>
  ```
  Strictly sequential over configs. Per config: `Effect.scoped` boots the server **once**; each challenge runs `runChallengeWithServer(...).pipe(Effect.either)` so a per-cell IO error becomes an `ERROR` cell without killing the row. A boot failure is caught at the row level (`Effect.catchAll`) → the whole row is `SKIPPED`. `onCell` (when provided) is invoked as each cell resolves, for live progress.

- [ ] **Step 1: Write the failing tests**

Create `src/orchestration/__tests__/run-matrix.test.ts`. Use the same fixtures as Task 3 (`okStub`, `fakeServerHandle`, `fakeDeps`, `inertHttpClientLayer`, `config`, `env`, `makeChallenge`, temp-dir pattern). Build a second config by spreading `config` with a new `id`/`configHash`.
```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runMatrix } from "../run-matrix.js";
import {
  config,
  env,
  fakeDeps,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeTempDir,
  okStub,
  removeDir,
} from "./fixtures.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeDir(dir);
});

const challengeA = { stem: "alpha", resolved: { ...makeChallenge(), id: "alpha" } };
const challengeB = { stem: "beta", resolved: { ...makeChallenge(), id: "beta" } };

it("boots the server ONCE per configuration and reuses it across challenges", async () => {
  let boots = 0;
  const deps = { ...fakeDeps(), llmServer: () => {
    boots += 1;
    return fakeServerHandle();
  } };
  const m = okStub();

  const cells = await Effect.runPromise(
    runMatrix({
      configs: [config],
      challenges: [challengeA, challengeB],
      archiveDir: dir,
      env,
      deps: deps as never,
    }).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  expect(boots).toBe(1); // the proof: one model load for two challenges
  expect(cells).toHaveLength(2);
  expect(cells.map((c) => c.challengeStem)).toEqual(["alpha", "beta"]);
  // two finalized archives written
  const files = await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readDirectory(dir);
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(files.filter((f) => f.endsWith(".jsonl"))).toHaveLength(2);
});

it("isolates a boot failure: that row is SKIPPED, later configs still run", async () => {
  const configB = { ...config, id: "cfg-b", configHash: "hashb" };
  const deps = { ...fakeDeps(), llmServer: (model: { name: string }) =>
    model.name === config.id ? Effect.fail(new Error("boom")) : fakeServerHandle() };
  const m = okStub();

  const cells = await Effect.runPromise(
    runMatrix({
      configs: [config, configB],
      challenges: [challengeA],
      archiveDir: dir,
      env,
      deps: deps as never,
    }).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  const a = cells.find((c) => c.configId === config.id);
  const b = cells.find((c) => c.configId === "cfg-b");
  expect(a?.status).toBe("SKIPPED");
  expect(b?.status === "PASS" || b?.status === "FAIL").toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/orchestration/__tests__/run-matrix.test.ts`
Expected: FAIL — `Cannot find module '../run-matrix.js'`.

- [ ] **Step 3: Write `src/orchestration/run-matrix.ts`**

```typescript
/**
 * Matrix runner — the outer loop over a matched set of configurations and
 * challenges. Lifts server lifetime from per-attempt to per-configuration:
 * each model boots ONCE (inside an Effect.scoped that also tears it down) and
 * is reused across all of that configuration's challenges.
 *
 * Strictly sequential: one local model in memory at a time. Different runtimes
 * bind different fixed ports, so config-by-config iteration keeps exactly one
 * server up at a time. Failure isolation: a boot failure SKIPs the whole row;
 * a per-cell IO error marks that cell ERROR and the row continues.
 */
import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Clock, Effect } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { RunEnv } from "../schema/run-manifest.js";
import { modelFromConfig, runChallengeWithServer } from "./run-challenge.js";
import type { RunModelDeps } from "./run-model.js";

export type MatrixCellStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED";

export interface MatrixCell {
  readonly configId: string;
  readonly challengeStem: string;
  readonly challengeId: string;
  readonly version?: number;
  readonly status: MatrixCellStatus;
  readonly score?: number;
  readonly reason?: string;
}

export interface MatrixChallenge {
  readonly stem: string;
  readonly resolved: ResolvedChallenge;
}

export interface RunMatrixInput {
  readonly configs: ReadonlyArray<ResolvedConfiguration>;
  readonly challenges: ReadonlyArray<MatrixChallenge>;
  readonly archiveDir: string;
  readonly env: RunEnv;
  readonly deps: RunModelDeps;
  readonly noCache?: boolean;
  readonly onCell?: (
    cell: MatrixCell,
    configIndex: number,
    configTotal: number,
  ) => Effect.Effect<void>;
}

export const runMatrix = (
  input: RunMatrixInput,
): Effect.Effect<
  ReadonlyArray<MatrixCell>,
  never,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const cells: MatrixCell[] = [];
    const total = input.configs.length;
    let configIndex = 0;

    for (const config of input.configs) {
      configIndex += 1;
      const here = configIndex;

      const row = yield* Effect.scoped(
        Effect.gen(function* () {
          const server = yield* input.deps.llmServer(modelFromConfig(config));
          const rowCells: MatrixCell[] = [];
          for (const ch of input.challenges) {
            const now = yield* Clock.currentTimeMillis;
            const attemptId = `att-${config.configHash}-${ch.resolved.challengeHash}-${now}`;
            const result = yield* runChallengeWithServer(
              {
                config,
                challenge: ch.resolved,
                attemptId,
                archiveDir: input.archiveDir,
                archivePath: `${input.archiveDir}/${attemptId}.jsonl`,
                env: input.env,
                deps: input.deps,
                ...(input.noCache !== undefined ? { noCache: input.noCache } : {}),
              },
              server,
            ).pipe(Effect.either);

            const cell: MatrixCell =
              result._tag === "Right"
                ? {
                    configId: config.id,
                    challengeStem: ch.stem,
                    challengeId: ch.resolved.id,
                    version: ch.resolved.version,
                    status: result.right.aggregate.passed ? "PASS" : "FAIL",
                    score: result.right.aggregate.score,
                  }
                : {
                    configId: config.id,
                    challengeStem: ch.stem,
                    challengeId: ch.resolved.id,
                    status: "ERROR",
                    reason: String(result.left),
                  };

            if (input.onCell !== undefined) yield* input.onCell(cell, here, total);
            rowCells.push(cell);
          }
          return rowCells;
        }),
      ).pipe(
        Effect.catchAll((bootErr) =>
          Effect.gen(function* () {
            const skipped = input.challenges.map(
              (ch): MatrixCell => ({
                configId: config.id,
                challengeStem: ch.stem,
                challengeId: ch.resolved.id,
                status: "SKIPPED",
                reason: String(bootErr),
              }),
            );
            if (input.onCell !== undefined) {
              for (const c of skipped) yield* input.onCell(c, here, total);
            }
            return skipped;
          }),
        ),
      );

      cells.push(...row);
    }

    return cells;
  });
```

- [ ] **Step 4: Run tests + lint to verify pass**

Run: `npx vitest run src/orchestration/__tests__/run-matrix.test.ts && npx tsc --noEmit && bash scripts/lint-strict.sh`
Expected: both tests PASS (boot count == 1; row isolation holds), no type errors, lint clean (note `runMatrix` uses `Clock`, not `Date.now()`).

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-matrix.ts src/orchestration/__tests__/run-matrix.test.ts
git commit -m "feat(matrix): runMatrix orchestrator — one boot per config, row failure isolation"
```

---

### Task 5: Progress + grid formatting (`matrix-format.ts`)

**Files:**
- Create: `src/cli/matrix-format.ts`
- Test: `src/cli/__tests__/matrix-format.test.ts`

**Interfaces:**
- Consumes: `MatrixCell` (`../orchestration/run-matrix.js`).
- Produces:
  - `formatCellLine(cell: MatrixCell, configIndex: number, configTotal: number): string` — one live line.
  - `formatMatrixGrid(cells: ReadonlyArray<MatrixCell>, configIds: readonly string[], challengeStems: readonly string[]): string` — end-of-run grid + totals.

This module is under `src/cli/`, so string-building freedom is fine; keep the functions **pure** (return strings, no `console`) for testability.

- [ ] **Step 1: Write the failing test**

Create `src/cli/__tests__/matrix-format.test.ts`:
```typescript
import { expect, it } from "vitest";
import type { MatrixCell } from "../../orchestration/run-matrix.js";
import { formatCellLine, formatMatrixGrid } from "../matrix-format.js";

it("formats a passing cell line with index prefix and score", () => {
  const cell: MatrixCell = {
    configId: "qwen2.5-7b-mlx",
    challengeStem: "code",
    challengeId: "code",
    version: 1,
    status: "PASS",
    score: 0.8,
  };
  expect(formatCellLine(cell, 1, 2)).toBe("[1/2 qwen2.5-7b-mlx] code@1 → 0.80 PASS");
});

it("formats a skipped cell line", () => {
  const cell: MatrixCell = {
    configId: "smoke",
    challengeStem: "math",
    challengeId: "math",
    status: "SKIPPED",
    reason: "ServerSpawnError",
  };
  expect(formatCellLine(cell, 2, 2)).toBe("[2/2 smoke] math → SKIP (ServerSpawnError)");
});

it("renders a grid with a totals line", () => {
  const cells: MatrixCell[] = [
    { configId: "m1", challengeStem: "code", challengeId: "code", status: "PASS", score: 1 },
    { configId: "m1", challengeStem: "math", challengeId: "math", status: "FAIL", score: 0.5 },
  ];
  const grid = formatMatrixGrid(cells, ["m1"], ["code", "math"]);
  expect(grid).toContain("m1");
  expect(grid).toContain("code");
  expect(grid).toContain("math");
  expect(grid).toMatch(/1 \/ 2 cells passed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/__tests__/matrix-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/cli/matrix-format.ts`**

```typescript
/**
 * Pure string formatters for the matrix runner's live progress and end-of-run
 * summary. No IO — the command prints the returned strings.
 */
import type { MatrixCell } from "../orchestration/run-matrix.js";

export const formatCellLine = (
  cell: MatrixCell,
  configIndex: number,
  configTotal: number,
): string => {
  const prefix = `[${configIndex}/${configTotal} ${cell.configId}]`;
  if (cell.status === "SKIPPED") {
    return `${prefix} ${cell.challengeStem} → SKIP (${cell.reason ?? "boot failed"})`;
  }
  if (cell.status === "ERROR") {
    return `${prefix} ${cell.challengeStem} → ERR (${cell.reason ?? "error"})`;
  }
  const ver = cell.version !== undefined ? `@${cell.version}` : "";
  return `${prefix} ${cell.challengeStem}${ver} → ${(cell.score ?? 0).toFixed(2)} ${cell.status}`;
};

const cellMark = (cell: MatrixCell | undefined): string => {
  if (cell === undefined) return "-";
  if (cell.status === "SKIPPED") return "SKIP";
  if (cell.status === "ERROR") return "ERR";
  const flag = cell.status === "PASS" ? "P" : "F";
  return `${(cell.score ?? 0).toFixed(2)}${flag}`;
};

export const formatMatrixGrid = (
  cells: ReadonlyArray<MatrixCell>,
  configIds: readonly string[],
  challengeStems: readonly string[],
): string => {
  const byKey = new Map<string, MatrixCell>();
  for (const c of cells) byKey.set(`${c.configId} ${c.challengeStem}`, c);

  const labelW = Math.max(5, ...configIds.map((c) => c.length));
  const colW = Math.max(6, ...challengeStems.map((s) => s.length));
  const pad = (s: string, w: number): string => s.padEnd(w);
  const padl = (s: string, w: number): string => s.padStart(w);

  const head = `${pad("model", labelW)}  ${challengeStems.map((s) => padl(s, colW)).join(" ")}`;
  const rows = configIds.map((id) => {
    const marks = challengeStems.map((stem) =>
      padl(cellMark(byKey.get(`${id} ${stem}`)), colW),
    );
    return `${pad(id, labelW)}  ${marks.join(" ")}`;
  });

  const passed = cells.filter((c) => c.status === "PASS").length;
  const skippedRows = new Set(
    cells.filter((c) => c.status === "SKIPPED").map((c) => c.configId),
  ).size;
  const totals = `${passed} / ${cells.length} cells passed, ${skippedRows} row(s) skipped`;

  return [head, ...rows, "", totals].join("\n");
};
```

- [ ] **Step 4: Run tests + lint to verify pass**

Run: `npx vitest run src/cli/__tests__/matrix-format.test.ts && npx tsc --noEmit && bash scripts/lint-strict.sh`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/matrix-format.ts src/cli/__tests__/matrix-format.test.ts
git commit -m "feat(matrix): pure live-line + grid formatters"
```

---

### Task 6: Evolve `submit` into the sweep command

**Files:**
- Modify: `src/cli/commands/submit.ts`
- Modify: `src/cli/commands/__tests__/submit.test.ts` (update for the new flags/behavior; if no such test exists, add a focused one)

**Interfaces:**
- Consumes: `selectConfigs` (`../../config/select.js`), `selectChallengeStems` + `listChallengeFiles` (`../../config/challenges.js` & `../../config/select.js`), `runMatrix` + `MatrixCell` (`../../orchestration/run-matrix.js`), `formatCellLine` + `formatMatrixGrid` (`../matrix-format.js`), `runReport` (`../../report/index.js`), `logAuditBlock` (`./report.js`), existing loaders + `defaultRunEnv` + `makeRunDeps`.
- Produces: the `submit` command now takes `--configs`/`--challenges` globs over a `--challenges-dir`, runs the full cross product via `runMatrix`, prints live lines + an end grid, and (unless `--no-report`) regenerates the webapp data.

**Decisions baked in (flag from these at review if you disagree):**
- `--config`/`--challenge` (singular) and `--resume` are **removed**. The 1×1 case is `--configs <id> --challenges <stem>`. Re-running a sweep is the resume mechanism (the cross-attempt item cache serves completed cells); `resumeChallenge` stays in the codebase, now unused by any command (the obsolete-run-path removal will collect it).
- Zero-arg `submit` runs **all configs not marked `active: false`** against **all** challenges in `--challenges-dir`.

- [ ] **Step 1: Write/adjust the failing test**

The cleanest unit test drives the command's `handler`-equivalent indirectly is heavy; instead test the **wiring helper** by extracting the selection+fail-fast into a tiny pure step OR assert via an integration smoke. Minimum viable: an integration test that runs the command effect with `fakeDeps`. If the repo already has `src/cli/commands/__tests__/submit.test.ts`, update its expectations; otherwise add `src/cli/commands/__tests__/submit-sweep.test.ts` that:
  1. writes two challenge YAMLs + a configs.yaml + system-prompts.yaml to a temp dir,
  2. runs the command's underlying Effect with `fakeDeps()` + `okStub()` provided,
  3. asserts N `.jsonl` archives appear in the archive dir and the returned grid string contains both config ids.

Because the command builds its own layers internally, prefer extracting the core into an exported `runSweep(args, deps)` Effect in `submit.ts` and testing **that** (the `Command.make` wrapper then just parses options and calls `runSweep`). Write the failing test against `runSweep` first:
```typescript
// src/cli/commands/__tests__/submit-sweep.test.ts (sketch — fill paths from fixtures)
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runSweep } from "../submit.js";
import { fakeDeps, inertHttpClientLayer, makeTempDir, okStub, removeDir } from "../../../orchestration/__tests__/fixtures.js";

let dir: string;
beforeEach(async () => { dir = await makeTempDir(); });
afterEach(async () => { await removeDir(dir); });

it("runs the full cross product and writes one archive per cell", async () => {
  // ... write dir/configs.yaml (2 configs), dir/system-prompts.yaml, dir/challenges/{a,b}.yaml ...
  const m = okStub();
  const grid = await Effect.runPromise(
    runSweep(
      {
        configsPattern: undefined,
        challengesPattern: undefined,
        challengesDir: `${dir}/challenges`,
        configsFile: `${dir}/configs.yaml`,
        systemPromptsFile: `${dir}/system-prompts.yaml`,
        archiveDir: dir,
        noCache: false,
        noReport: true,
      },
      fakeDeps() as never,
    ).pipe(Effect.provide(m.layer), Effect.provide(inertHttpClientLayer), Effect.provide(NodeContext.layer)),
  );
  expect(grid).toContain("cfg-a");
});
```
> If extracting `runSweep` is too invasive for one task, a thinner acceptable test asserts `selectConfigs`/`selectChallengeStems`/`listChallengeFiles` compose correctly over a temp fixtures dir (the selection seam), and leave full command execution to the existing integration-smoke test. Pick the lighter option if the heavier one balloons the task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/__tests__/submit-sweep.test.ts`
Expected: FAIL — `runSweep` not exported (or selection composition not wired).

- [ ] **Step 3: Rewrite `submit.ts`**

Replace the command. Keep `--system-prompts-file`, `--configs-file`, `--archive-dir`, `--verbose`, `--no-cache`. Add `--configs`, `--challenges` (both optional text), `--challenges-dir` (default `"challenges"`), `--output` (default `"./webapp/src/data"`), `--no-report`. Provide an exported `runSweep(args, deps)` core and a thin `Command.make` over it:

```typescript
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Layer, Option } from "effect";
import { listChallengeFiles, loadChallenge } from "../../config/challenges.js";
import { loadConfigurations } from "../../config/configurations.js";
import { selectChallengeStems, selectConfigs } from "../../config/select.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { ChatCompletionLive } from "../../llm/chat-completion.js";
import { defaultRunEnv } from "../../orchestration/run-loop.js";
import {
  type MatrixChallenge,
  runMatrix,
} from "../../orchestration/run-matrix.js";
import { runReport } from "../../report/index.js";
import type { RunModelDeps } from "../../orchestration/run-model.js";
import { makeRunDeps } from "../deps.js";
import { makeLoggerLayer } from "../logger.js";
import { formatCellLine, formatMatrixGrid } from "../matrix-format.js";
import { DEFAULT_SYSTEM_PROMPTS_PATH } from "../paths.js";
import { logAuditBlock } from "./report.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

export interface SweepArgs {
  readonly configsPattern: string | undefined;
  readonly challengesPattern: string | undefined;
  readonly challengesDir: string;
  readonly configsFile: string;
  readonly systemPromptsFile: string;
  readonly archiveDir: string;
  readonly output: string;
  readonly noCache: boolean;
  readonly noReport: boolean;
}

/** Core sweep: select → load → runMatrix (live lines) → grid → report. Returns the grid. */
export const runSweep = (args: SweepArgs, deps: RunModelDeps) =>
  Effect.gen(function* () {
    const systemPrompts = yield* loadSystemPrompts(args.systemPromptsFile);
    const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
    const allConfigs = yield* loadConfigurations(args.configsFile).pipe(
      Effect.provide(registryLayer),
    );

    const configs = selectConfigs(allConfigs, args.configsPattern);
    if (configs.length === 0) {
      return yield* Effect.dieMessage(
        args.configsPattern === undefined
          ? "no active configurations (all marked active: false); pass --configs"
          : `no configurations matched '${args.configsPattern}'`,
      );
    }

    const files = yield* listChallengeFiles(args.challengesDir);
    const stems = selectChallengeStems(
      files.map((f) => f.stem),
      args.challengesPattern,
    );
    if (stems.length === 0) {
      return yield* Effect.dieMessage(
        args.challengesPattern === undefined
          ? `no challenge YAMLs found in '${args.challengesDir}'`
          : `no challenges matched '${args.challengesPattern}'`,
      );
    }
    const chosen = files.filter((f) => stems.includes(f.stem));
    const challenges: MatrixChallenge[] = yield* Effect.forEach(chosen, (f) =>
      loadChallenge(f.path).pipe(Effect.map((resolved) => ({ stem: f.stem, resolved }))),
    );

    const env = defaultRunEnv();
    const cells = yield* runMatrix({
      configs,
      challenges,
      archiveDir: args.archiveDir,
      env,
      deps,
      noCache: args.noCache,
      onCell: (cell, i, total) => printLine(formatCellLine(cell, i, total)),
    });

    const grid = formatMatrixGrid(
      cells,
      configs.map((c) => c.id),
      stems,
    );
    yield* printLine("");
    yield* printLine(grid);

    if (!args.noReport) {
      const outputPath = path.join(args.output, "data.js");
      const summary = yield* runReport({ archiveDir: args.archiveDir, outputPath });
      yield* logAuditBlock(summary);
    }
    return grid;
  });

const configsOpt = Options.text("configs").pipe(
  Options.optional,
  Options.withDescription("Glob over config ids (brace alternation ok). Default: all active."),
);
const challengesOpt = Options.text("challenges").pipe(
  Options.optional,
  Options.withDescription("Glob over challenge file stems. Default: all in --challenges-dir."),
);
const challengesDirOpt = Options.directory("challenges-dir").pipe(
  Options.withDefault("challenges"),
  Options.withDescription("Directory of challenge YAMLs"),
);
const systemPromptsFileOpt = Options.file("system-prompts-file").pipe(
  Options.withDefault(DEFAULT_SYSTEM_PROMPTS_PATH),
  Options.withDescription("Path to system-prompts YAML"),
);
const configsFileOpt = Options.file("configs-file").pipe(
  Options.withDefault("configs.yaml"),
  Options.withDescription("Path to configs YAML"),
);
const archiveDirOpt = Options.directory("archive-dir").pipe(
  Options.withDefault("benchmark-archive"),
  Options.withDescription("Directory for archive output"),
);
const outputOpt = Options.directory("output").pipe(
  Options.withDefault("./webapp/src/data"),
  Options.withDescription("Output dir for the post-sweep report's data.js"),
);
const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output"),
);
const noCacheOpt = Options.boolean("no-cache").pipe(
  Options.withDefault(false),
  Options.withDescription("Bypass the cross-attempt item cache"),
);
const noReportOpt = Options.boolean("no-report").pipe(
  Options.withDefault(false),
  Options.withDescription("Skip the end-of-sweep report regeneration"),
);

export const submitCommand = Command.make(
  "submit",
  {
    configs: configsOpt,
    challenges: challengesOpt,
    challengesDir: challengesDirOpt,
    systemPromptsFile: systemPromptsFileOpt,
    configsFile: configsFileOpt,
    archiveDir: archiveDirOpt,
    output: outputOpt,
    verbose: verboseOpt,
    noCache: noCacheOpt,
    noReport: noReportOpt,
  },
  (o) =>
    runSweep(
      {
        configsPattern: Option.getOrUndefined(o.configs),
        challengesPattern: Option.getOrUndefined(o.challenges),
        challengesDir: o.challengesDir,
        configsFile: o.configsFile,
        systemPromptsFile: o.systemPromptsFile,
        archiveDir: o.archiveDir,
        output: o.output,
        noCache: o.noCache,
        noReport: o.noReport,
      },
      makeRunDeps({}),
    ).pipe(
      Effect.asVoid,
      Effect.provide(ChatCompletionLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(makeLoggerLayer(o.verbose)),
    ),
).pipe(Command.withDescription("Run matched configurations against matched challenges (sweep)"));
```

- [ ] **Step 4: Run tests + full suite + lint**

Run: `npx vitest run src/cli && npx tsc --noEmit && npx biome check src && bash scripts/lint-strict.sh`
Expected: new sweep test PASSES; any prior `submit` test updated to the new flags is green. No type/lint errors.

- [ ] **Step 5: Manual smoke (1×1 still works)**

Run: `./bench submit --configs smoke-config --challenges smoke --no-report`
Expected: one live line `[1/1 smoke-config] smoke@1 → <score> <PASS|FAIL>` then a one-row grid + totals. An `att-*.jsonl` is written to `benchmark-archive/`.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/submit.ts src/cli/commands/__tests__
git commit -m "feat(matrix): evolve submit into a config×challenge sweep over runMatrix"
```

---

### Task 7: Rename `submit` → `run`

**Files:**
- Rename: `src/cli/commands/submit.ts` → `src/cli/commands/run.ts` (and `submitCommand` → `runCommand`)
- Modify: `src/cli/main.ts` (registration)
- Rename/Modify: `src/cli/commands/__tests__/submit-sweep.test.ts` → `run-sweep.test.ts` (and any `submit` test) — update imports + names
- Modify: docs + qa skill that reference `./bench submit`

**Interfaces:**
- Produces: `runCommand` (was `submitCommand`); CLI verb is `run`.

- [ ] **Step 1: Rename the command file and symbol**

```bash
git mv src/cli/commands/submit.ts src/cli/commands/run.ts
```
In `src/cli/commands/run.ts`: rename `export const submitCommand` → `export const runCommand`, change `Command.make("submit", …)` → `Command.make("run", …)`, and update the file's top doc comment to describe `run`.

- [ ] **Step 2: Update registration in `src/cli/main.ts`**

Replace the `submitCommand` import and its entry in `Command.withSubcommands([...])` with `runCommand`:
```typescript
import { runCommand } from "./commands/run.js";
// …
  Command.withSubcommands([
    reportCommand,
    scoreCommand,
    exportCommand,
    listModelsCommand,
    listPromptsCommand,
    runCommand,
  ]),
```

- [ ] **Step 3: Update tests**

```bash
git mv src/cli/commands/__tests__/submit-sweep.test.ts src/cli/commands/__tests__/run-sweep.test.ts
```
Update the import to `from "../run.js"` and any `submit` references to `run`. Grep for stragglers: `rg -n "submitCommand|commands/submit|\\bsubmit\\b" src`.

- [ ] **Step 4: Update docs + qa skill help expectations**

Run `rg -n "bench submit|\\bsubmit\\b" README.md docs .claude` and update each occurrence to `bench run` / `run`. In particular the qa skill's `./bench --help` expected-subcommands list must show `run` instead of `submit`.

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npx biome check src && bash scripts/lint-strict.sh`
Expected: entire suite green, no type/lint errors.

- [ ] **Step 6: Manual smoke of the renamed verb**

Run: `./bench --help` (shows `run`, not `submit`) and `./bench run --configs smoke-config --challenges smoke --no-report` (one-row grid).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(matrix): rename submit → run; update registration, tests, docs"
```

---

## Self-Review

**Spec coverage:**
- §2 sequencing — reconciled: the only hard prerequisite (free the `run` name) is already satisfied; the dead-code removal is explicitly out of scope (Global Constraints). Evolve-in-place (Task 6) → rename (Task 7) matches §2 steps 2–3.
- §3 command surface — Tasks 6–7. Flags reconciled to current reality (system-prompts-file/configs-file rather than the spec's stale `--prompts-dir`); `--configs`/`--challenges`/`--challenges-dir`/`--no-cache`/`--no-report`/`--verbose` all present.
- §3.1 selection semantics — Task 1 (picomatch, brace alternation, literal `.`/`-`, explicit-overrides-active, empty handling). Deviation logged: default is `active !== false` (opt-out), not the spec's literal `active === true`, because no real config sets `active: true` and the existing convention is `active: false` to disable.
- §3.2 cross product — Task 6 (`runSweep` builds the full product; no explicit-pairs mode).
- §4 orchestration refactor — Task 3 (`runChallengeWithServer` + wrapper, `resumeChallenge` untouched) and Task 4 (`runMatrix`, sequential, per-config boot, §4.4 failure isolation, §4.5 peak-RSS-per-row noted).
- §5 selection module — Task 1 (`selectConfigs`/`selectChallengeStems`, pure, no IO).
- §6 progress + summary — Task 5 (`formatCellLine`/`formatMatrixGrid`) wired in Task 6; report runs after the grid.
- §7 testing — headline "booted once" proof (Task 4 test 1), failure isolation (Task 4 test 2), pure selection (Task 1), preserved `runChallenge` (Task 3 runs the existing suite).
- §8 out of scope — honored: no parallel serving, no per-challenge ctxSize, no sweep `--resume`, no explicit pairs, no cached marker.

**Placeholder scan:** No "TBD"/"handle errors"/"similar to". The one soft spot is Task 6 Step 1 (test strategy offers a lighter fallback) — that's a deliberate right-sizing escape hatch, not a missing requirement; the implementation steps are fully concrete.

**Type consistency:** `runChallengeWithServer(input, server)`, `modelFromConfig` (exported in Task 3, consumed in Task 4), `MatrixCell`/`MatrixChallenge`/`RunMatrixInput` (defined Task 4, consumed Tasks 5–6), `SweepArgs`/`runSweep` (defined Task 6, renamed Task 7), `formatCellLine`/`formatMatrixGrid` (Task 5 → Task 6), `runReport`/`logAuditBlock` (existing, imported Task 6) all line up.

## Open decisions to confirm before execution

1. **Drop `--resume`** (Task 6). The sweep has no resume; re-running relies on the item cache. `resumeChallenge` is left in-tree but unused. Acceptable, or keep a 1×1 `--resume` path?
2. **`active !== false` default** vs the spec's literal `active === true`. The plan uses opt-out so a zero-arg `run` is useful with today's configs.
