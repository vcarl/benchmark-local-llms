# Runtime Version Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the benchmark harness to current local-LLM runtimes (pinned llama.cpp build; mlx-lm 0.31.x), make the `llama-server` binary configurable, and capture the real per-runtime version into every manifest (replacing the hardcoded `"unknown"`), with refreshed docs.

**Architecture:** A new `runtime-version.ts` module exposes pure version parsers plus an Effect-based probe (`Command.string` over `sh -c '"$0" … 2>&1'` to capture llama-server's stderr-only `--version`). `RunModelDeps` gains a `runtimeVersion(runtime)` seam wired in `deps.ts` with the resolved binary paths; `run-loop.ts` probes once per distinct runtime and stamps the result into each per-model manifest's `env.runtimeVersion`. A new `--llama-server-binary` CLI flag threads a pinned-tarball binary path through to both the server supervisor and the probe. The cache key is **unchanged** — re-baselining old-version scores remains a manual `--fresh`.

**Tech Stack:** TypeScript, Effect-TS (`effect`, `@effect/platform`, `@effect/platform-node`, `@effect/cli`), vitest, biome. macOS / Apple Silicon only.

## Global Constraints

- **No `try`/`catch`/`throw`/`console` outside `src/cli/`** — enforced by `scripts/lint-strict.sh`. Use Effect error channels. (Exemption: `*.test.ts` may use vitest narrowing-throws.)
- **Effect error discipline:** version-probe failures must degrade to the string `"unknown"`, never fail a run.
- **Platform:** macOS/Apple Silicon; `sh` is always present and may be used to merge stderr→stdout.
- **Runtime literal type:** `Runtime = "llamacpp" | "mlx"` (from `src/schema/enums.ts`).
- **Pinned llama.cpp build:** chosen at execution time from the latest `*-bin-macos-arm64.tar.gz` GitHub release asset (head was `b9692` on 2026-06-17). Record the exact build in docs.
- **mlx-lm:** already `0.31.2` (current); confirm, optional bump to latest 0.31.x. No code change required for mlx upgrade.
- **Run verification before claiming done:** `npm run typecheck`, `npm run lint`, `npm run test` must all pass.
- **Commit after each task.**

---

### Task 1: Version parser pure functions

**Files:**
- Create: `src/llm/servers/runtime-version.ts`
- Test: `src/llm/servers/runtime-version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseLlamacppVersion(raw: string): string` — from a blob containing a `version: <build> (<sha>)` line, returns `"llama.cpp b<build> (<sha>)"`, else `"unknown"`.
  - `parseMlxVersion(raw: string): string` — from a blob containing a semver, returns `"mlx-lm <semver>"`, else `"unknown"`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/llm/servers/runtime-version.test.ts
import { describe, expect, it } from "vitest";
import { parseLlamacppVersion, parseMlxVersion } from "./runtime-version.js";

describe("parseLlamacppVersion", () => {
  it("extracts build + sha from the version line", () => {
    expect(parseLlamacppVersion("version: 8390 (b6c83aad5)")).toBe(
      "llama.cpp b8390 (b6c83aad5)",
    );
  });

  it("finds the version line amid Metal-init stderr noise", () => {
    const raw = [
      "ggml_metal_device_init: testing tensor API for f16 support",
      "ggml_metal_library_compile_pipeline: compiling pipeline: base = 'dummy_kernel'",
      "version: 9692 (deadbeef)",
      "built with Apple clang",
    ].join("\n");
    expect(parseLlamacppVersion(raw)).toBe("llama.cpp b9692 (deadbeef)");
  });

  it("returns 'unknown' when no version line is present", () => {
    expect(parseLlamacppVersion("some unrelated output")).toBe("unknown");
  });
});

describe("parseMlxVersion", () => {
  it("extracts a bare semver", () => {
    expect(parseMlxVersion("0.31.2")).toBe("mlx-lm 0.31.2");
  });

  it("extracts a semver amid surrounding text/newlines", () => {
    expect(parseMlxVersion("mlx_lm version 0.31.3\n")).toBe("mlx-lm 0.31.3");
  });

  it("returns 'unknown' when no semver is present", () => {
    expect(parseMlxVersion("no version here")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/servers/runtime-version.test.ts`
Expected: FAIL — cannot resolve `./runtime-version.js` / functions not exported.

- [ ] **Step 3: Write the parsers**

```typescript
// src/llm/servers/runtime-version.ts
/**
 * Probe the installed runtime versions and parse them into the stable
 * display strings stamped into `RunManifest.env.runtimeVersion`.
 *
 * `llama-server --version` writes `version: <build> (<sha>)` to STDERR, mixed
 * with Metal-init noise; `mlx_lm --version` writes a bare semver to STDOUT.
 * The probe (below) merges stderr→stdout via `sh -c '"$0" … 2>&1'` so a
 * single `Command.string` capture works for both, and these pure parsers
 * scan the resulting blob. Any unparseable / failed probe degrades to
 * "unknown" — a version probe must never fail a benchmark run.
 */

/** `version: 8390 (b6c83aad5)` → `llama.cpp b8390 (b6c83aad5)`. */
export const parseLlamacppVersion = (raw: string): string => {
  const m = raw.match(/^version:\s*(\d+)\s*\(([0-9a-f]+)\)/m);
  return m ? `llama.cpp b${m[1]} (${m[2]})` : "unknown";
};

/** `0.31.2` → `mlx-lm 0.31.2`. */
export const parseMlxVersion = (raw: string): string => {
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? `mlx-lm ${m[1]}` : "unknown";
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/servers/runtime-version.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/servers/runtime-version.ts src/llm/servers/runtime-version.test.ts
git commit -m "feat: runtime version parsers for llama.cpp + mlx-lm"
```

---

### Task 2: `probeRuntimeVersion` Effect

**Files:**
- Modify: `src/llm/servers/runtime-version.ts`
- Test: `src/llm/servers/runtime-version.test.ts` (append)

**Interfaces:**
- Consumes: `parseLlamacppVersion`, `parseMlxVersion` (Task 1); `Runtime` from `src/schema/enums.ts`.
- Produces:
  - `probeRuntimeVersion(runtime: Runtime, bin: string): Effect.Effect<string, never, CommandExecutor.CommandExecutor>` — for `"llamacpp"` runs `sh -c '"$0" --version 2>&1'` with `bin` as `$0`; for `"mlx"` runs `sh -c '"$0" -m mlx_lm --version 2>&1'` (where `bin` is the python interpreter). Parses with the matching parser. Any failure (missing binary, nonzero exit) → `"unknown"`.

- [ ] **Step 1: Write the failing test (append to existing file)**

```typescript
// append to src/llm/servers/runtime-version.test.ts
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { probeRuntimeVersion } from "./runtime-version.js";

describe("probeRuntimeVersion", () => {
  it("degrades to 'unknown' when the binary does not exist (llamacpp)", async () => {
    const result = await Effect.runPromise(
      probeRuntimeVersion("llamacpp", "/nonexistent/llama-server").pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(result).toBe("unknown");
  });

  it("degrades to 'unknown' when the binary does not exist (mlx)", async () => {
    const result = await Effect.runPromise(
      probeRuntimeVersion("mlx", "/nonexistent/python3").pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(result).toBe("unknown");
  });
});
```

Note: the happy path (a real, installed binary) is intentionally not unit-tested — it depends on machine-local installs. It is verified end-to-end in Task 7 by inspecting a real archive's `env.runtimeVersion`. The parsing logic it relies on is fully covered by Task 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/servers/runtime-version.test.ts`
Expected: FAIL — `probeRuntimeVersion` not exported.

- [ ] **Step 3: Add the probe to `runtime-version.ts`**

```typescript
// add to src/llm/servers/runtime-version.ts
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { Runtime } from "../../schema/enums.js";

/**
 * Probe the installed version for `runtime` using `bin`. `bin` is the
 * `llama-server` binary for llamacpp, or the python interpreter for mlx.
 *
 * We invoke through `sh -c '"$0" … 2>&1'` (binary passed as the positional
 * `$0`, so there is no shell-injection surface) to merge the subprocess's
 * stderr into stdout: llama-server prints its version banner to stderr, and
 * `Command.string` only captures stdout. Any failure collapses to "unknown".
 */
export const probeRuntimeVersion = (
  runtime: Runtime,
  bin: string,
): Effect.Effect<string, never, CommandExecutor.CommandExecutor> => {
  const command =
    runtime === "llamacpp"
      ? Command.make("sh", "-c", '"$0" --version 2>&1', bin)
      : Command.make("sh", "-c", '"$0" -m mlx_lm --version 2>&1', bin);
  const parse = runtime === "llamacpp" ? parseLlamacppVersion : parseMlxVersion;
  return Command.string(command).pipe(
    Effect.map(parse),
    Effect.catchAll(() => Effect.succeed("unknown")),
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/servers/runtime-version.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/servers/runtime-version.ts src/llm/servers/runtime-version.test.ts
git commit -m "feat: probeRuntimeVersion Effect with unknown-fallback"
```

---

### Task 3: Configurable `--llama-server-binary` flag (server supervisor path)

**Files:**
- Modify: `src/cli/commands/run-options.ts` (add option + register in `runOptions`)
- Modify: `src/cli/commands/run.ts` (add to `RunOptionsParsed`, pass to `makeRunDeps`)
- Modify: `src/cli/deps.ts` (`MakeRunDepsInput`, `makeLlmServerFactory`, `makeRunDeps`)
- Test: `src/llm/servers/llamacpp.test.ts` already covers `binPath` threading into `llamacppServer`; no new test here — covered by typecheck + the Task 7 smoke run.

**Interfaces:**
- Consumes: existing `LlamacppConfig.binPath` (already supported by `llamacppServer`).
- Produces: `MakeRunDepsInput.llamaServerBinary?: string`; `makeLlmServerFactory(llamaServerBinary?: string)`. Task 4 extends `makeRunDeps`'s return; this task only adds the field plumbing + factory binPath passthrough.

- [ ] **Step 1: Add the CLI option in `run-options.ts`**

After the `gameServerBinary` option (around line 78), add:

```typescript
export const llamaServerBinary = Options.file("llama-server-binary").pipe(
  Options.withDescription(
    "Path to the llama-server binary (default: llama-server on PATH). Use for a pinned release tarball.",
  ),
  Options.optional,
);
```

Then add `llamaServerBinary,` to the `runOptions` object literal (alongside `gameServerBinary`).

- [ ] **Step 2: Thread through `run.ts`**

In `RunOptionsParsed` (after `gameServerBinary`), add:

```typescript
  readonly llamaServerBinary: Option.Option<string>;
```

In the `makeRunDeps({ … })` call inside `runCommand`, add the field:

```typescript
    const deps = makeRunDeps({
      admiralDir: Option.getOrUndefined(parsed.admiralDir),
      gameServerBinary: Option.getOrUndefined(parsed.gameServerBinary),
      llamaServerBinary: Option.getOrUndefined(parsed.llamaServerBinary),
    });
```

- [ ] **Step 3: Plumb through `deps.ts`**

Add to `MakeRunDepsInput`:

```typescript
  /** llama-server binary path; defaults to `llama-server` on PATH. */
  readonly llamaServerBinary?: string | undefined;
```

Change `makeLlmServerFactory` to accept the binary and pass it as `binPath`:

```typescript
export const makeLlmServerFactory =
  (llamaServerBinary?: string): LlmServerFactory =>
  (model: ModelConfig) => {
    if (model.runtime === "llamacpp") {
      return Effect.gen(function* () {
        if (model.quant === undefined) {
          return yield* Effect.die(
            new Error(`llamacpp model ${model.artifact} is missing required 'quant' field`),
          );
        }
        const artifactPath = yield* resolveLlamacppGguf(model.artifact, model.quant);
        return yield* llamacppServer({
          artifactPath,
          ...(llamaServerBinary !== undefined ? { binPath: llamaServerBinary } : {}),
          ...(model.ctxSize !== undefined ? { ctxSize: model.ctxSize } : {}),
        });
      });
    }
    return Effect.gen(function* () {
      const artifactPath = yield* resolveMlxModel(model.artifact);
      return yield* mlxServer({ artifactPath, pythonBin: resolveMlxPython() });
    });
  };
```

Update `makeRunDeps` to pass it (the `runtimeVersion` field is added in Task 4):

```typescript
export const makeRunDeps = (input: MakeRunDepsInput): RunModelDeps => ({
  llmServer: makeLlmServerFactory(input.llamaServerBinary),
  admiral: makeAdmiralFactory(input.admiralDir),
  gameSession: makeGameSessionFactory(input.gameServerBinary),
});
```

- [ ] **Step 4: Verify typecheck + existing tests pass**

Run: `npm run typecheck && npx vitest run src/llm/servers/llamacpp.test.ts src/cli`
Expected: PASS. (The `--llama-server-binary` flag now exists; `binPath` still flows into `llamacppServer`.)

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/run-options.ts src/cli/commands/run.ts src/cli/deps.ts
git commit -m "feat: --llama-server-binary flag for pinned llama.cpp builds"
```

---

### Task 4: Add `runtimeVersion` seam to `RunModelDeps` and wire the probe

**Files:**
- Modify: `src/orchestration/run-model.ts` (extend `RunModelDeps`)
- Modify: `src/cli/deps.ts` (wire `runtimeVersion` in `makeRunDeps`)
- Modify: `src/orchestration/__tests__/fixtures.ts` (add stub to `fakeDeps`)

**Interfaces:**
- Consumes: `probeRuntimeVersion` (Task 2); `resolveMlxPython` (existing, private in `deps.ts`); `input.llamaServerBinary` (Task 3).
- Produces: `RunModelDeps.runtimeVersion: (runtime: Runtime) => Effect.Effect<string, never, CommandExecutor.CommandExecutor>`. Consumed by Task 5 (`run-loop.ts`).

- [ ] **Step 1: Extend the `RunModelDeps` interface**

In `src/orchestration/run-model.ts`, add the `Runtime` import (top, alongside the other schema imports):

```typescript
import type { Runtime } from "../schema/enums.js";
```

Extend the interface (it currently has three fields):

```typescript
export interface RunModelDeps {
  readonly llmServer: LlmServerFactory;
  readonly admiral: AdmiralFactory;
  readonly gameSession: GameSessionFactory;
  /**
   * Probe the installed version string for a runtime (e.g.
   * "llama.cpp b9692 (…)", "mlx-lm 0.31.2"). Never fails — degrades to
   * "unknown". The run loop calls this once per distinct runtime and stamps
   * the result into each model's manifest `env.runtimeVersion`.
   */
  readonly runtimeVersion: (
    runtime: Runtime,
  ) => Effect.Effect<string, never, CommandExecutor.CommandExecutor>;
}
```

(`CommandExecutor` and `Effect` are already imported in this file.)

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `npm run typecheck`
Expected: FAIL — `makeRunDeps` return and `fakeDeps` are missing `runtimeVersion`.

- [ ] **Step 3: Wire the production probe in `deps.ts`**

Add the import:

```typescript
import { probeRuntimeVersion } from "../llm/servers/runtime-version.js";
```

Replace `makeRunDeps`:

```typescript
export const makeRunDeps = (input: MakeRunDepsInput): RunModelDeps => {
  const llamaServerBin = input.llamaServerBinary ?? "llama-server";
  const mlxPythonBin = resolveMlxPython();
  return {
    llmServer: makeLlmServerFactory(input.llamaServerBinary),
    admiral: makeAdmiralFactory(input.admiralDir),
    gameSession: makeGameSessionFactory(input.gameServerBinary),
    runtimeVersion: (runtime) =>
      runtime === "llamacpp"
        ? probeRuntimeVersion("llamacpp", llamaServerBin)
        : probeRuntimeVersion("mlx", mlxPythonBin),
  };
};
```

- [ ] **Step 4: Add the stub to `fakeDeps` in fixtures**

In `src/orchestration/__tests__/fixtures.ts`, update the `fakeDeps` literal (around line 247). `Effect` is already imported in this file:

```typescript
export const fakeDeps = (overrides: Partial<RunModelDeps> = {}): RunModelDeps => ({
  llmServer: fakeLlmServerFactory,
  admiral: fakeAdmiralFactory,
  gameSession: fakeGameSessionFactory(),
  runtimeVersion: () => Effect.succeed("test-runtime 0.0.0"),
  ...overrides,
});
```

- [ ] **Step 5: Run typecheck + the orchestration tests**

Run: `npm run typecheck && npx vitest run src/orchestration`
Expected: PASS — interface satisfied everywhere; existing behaviour unchanged (env still carries `defaultRunEnv()`'s `"unknown"` until Task 5 wires the stamping).

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/run-model.ts src/cli/deps.ts src/orchestration/__tests__/fixtures.ts
git commit -m "feat: runtimeVersion probe seam on RunModelDeps"
```

---

### Task 5: Stamp per-runtime version into per-model manifests

**Files:**
- Modify: `src/orchestration/run-loop.ts` (probe per distinct runtime, override `env.runtimeVersion` per model)
- Test: `src/orchestration/__tests__/run-loop.test.ts` (append)

**Interfaces:**
- Consumes: `deps.runtimeVersion` (Task 4); `RunModelOutcome.manifest` (existing).
- Produces: each per-model manifest's `env.runtimeVersion` reflects the serving runtime's probed version.

- [ ] **Step 1: Write the failing test (append to run-loop.test.ts)**

Use the same `baseConfig`/`fakeDeps`/`sampleEnv` helpers the file already imports. This asserts the override reaches the manifest:

```typescript
it("stamps the probed runtime version into each model's manifest env", async () => {
  const dir = await makeTmpArchiveDir();
  const outcome = await Effect.runPromise(
    runLoop(
      baseConfig(dir),
      fakeDeps({ runtimeVersion: () => Effect.succeed("llama.cpp b9999 (cafef00d)") }),
      sampleEnv,
    ).pipe(Effect.provide(testLayer)),
  );
  expect(outcome.perModel.length).toBeGreaterThan(0);
  for (const m of outcome.perModel) {
    expect(m.manifest.env.runtimeVersion).toBe("llama.cpp b9999 (cafef00d)");
  }
});
```

Note: reuse the existing test's layer/tmp-dir helpers (`testLayer`, `makeTmpArchiveDir` or equivalent) exactly as the neighbouring tests in this file do — match their names. If a neighbouring test calls the dir helper inline, copy that call shape. Do not invent new helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-loop.test.ts`
Expected: FAIL — `env.runtimeVersion` is still `sampleEnv`'s value (`"unknown"` or the fixture's), not the override.

- [ ] **Step 3: Implement the per-runtime probe + stamping in `run-loop.ts`**

Add the `Runtime` import if not present:

```typescript
import type { Runtime } from "../schema/enums.js";
```

In `runLoop`, after the `eligible` array is fully built (immediately before `let modelIndex = 0;`), probe each distinct runtime once:

```typescript
    // Probe the installed runtime version once per distinct runtime present
    // in this run; stamp it into each model's manifest env below. Probes
    // never fail (they degrade to "unknown"), so this can't sink the run.
    const versionByRuntime = new Map<Runtime, string>();
    for (const rt of new Set(eligible.map((m) => m.runtime))) {
      versionByRuntime.set(rt, yield* deps.runtimeVersion(rt));
    }
```

Then change the `makeOpenManifest({ … })` call to override `env`:

```typescript
      const manifest = makeOpenManifest({
        archiveId,
        runId: config.runId,
        startedAt,
        model,
        env: {
          ...env,
          runtimeVersion: versionByRuntime.get(model.runtime) ?? env.runtimeVersion,
        },
        temperature: modelTemperature,
        promptCorpus: config.promptCorpus,
        scenarioCorpus: config.scenarioCorpus,
      });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/orchestration/__tests__/run-loop.test.ts`
Expected: PASS — including the new test and all pre-existing ones.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/run-loop.ts src/orchestration/__tests__/run-loop.test.ts
git commit -m "feat: stamp per-runtime version into per-model manifests"
```

---

### Task 6: Refresh runtime documentation

**Files:**
- Modify: `llama-cpp-guide.md`
- Modify: `local-llms.md`
- Modify: `README.md`

**Interfaces:** none (docs only). Use the build chosen in Task 7 for the pin; if Task 7 runs after this, use `b9692` as the documented example and adjust if a newer build is pinned.

- [ ] **Step 1: Update `llama-cpp-guide.md`**

- Change the header `_Last updated: March 2026 — based on release b8400_` to `_Last updated: 2026-06-17 — based on release b9692_` (or the actual pinned build).
- Update the install snippet's filenames from `llama-b8400-…` to the pinned build, e.g.:

```bash
tar xzf llama-b9692-bin-macos-arm64.tar.gz
xattr -r -d com.apple.quarantine llama-b9692/
```

- Add a short subsection "Pointing the harness at this build" documenting the new flag:

```markdown
### Pointing the benchmark harness at a pinned build

A pinned-tarball `llama-server` is not on `PATH`. Tell the harness where it is:

    ./bench run --llama-server-binary /path/to/llama-b9692/build/bin/llama-server …

(The exact path inside the extracted dir: `find llama-b9692 -name llama-server`.)
The version string the harness records in each manifest comes from
`llama-server --version`, e.g. `llama.cpp b9692 (<sha>)`.
```

- Add a "What changed since b8400" note listing the new capabilities surfaced by research, clearly marked as upstream features (not harness features): Q1_0 1-bit quant, Walsh-Hadamard KV-cache rotation (improves low-bit KV quality), FP8 hybrid inference, DeepSeek V4 + Gemma 4 support, backend-agnostic tensor parallelism.

- [ ] **Step 2: Update `local-llms.md`**

- Change `_Last updated: March 2026_` to `_Last updated: 2026-06-17_`.
- Update the MLX section: mlx-lm is now `0.31.x`; note new flags (`--prefill-step-size`, `--allowed-origins`, prompt-cache flags) and the **known limitation** that `mlx_lm.server` has no `--kv-bits` flag (defaults to a 16-bit KV cache → large models can swap at long context; ref upstream issue #1308), and that thinking can be toggled via `--chat-template-args '{"enable_thinking":false}'`.
- Add one line under "Others" noting `vllm-mlx` exists (MLX-based continuous batching, wins at high concurrency) but is **not adopted** here — single-request benchmarking doesn't benefit, and it's early (v0.3.0).
- Do not change model recommendations (new models are a separate project).

- [ ] **Step 3: Update `README.md` prerequisites**

In the Prerequisites list, change the `llama-server` line to mention the pinned-tarball install and the `--llama-server-binary` flag, and the mlx line to note the current `mlx-lm` version. Example replacement for the two bullets:

```markdown
- `llama-server` (llama.cpp) — install a pinned release tarball (see [`llama-cpp-guide.md`](./llama-cpp-guide.md)); point the harness at it with `--llama-server-binary`, or symlink it onto `PATH`.
- `python3 -m mlx_lm.server` (MLX runtime, mlx-lm 0.31.x) — `pip install mlx-lm` into a venv, default `~/llm-env`.
```

- [ ] **Step 4: Verify docs reference the same build number consistently**

Run: `grep -rnE "b8400|March 2026|b9692" llama-cpp-guide.md local-llms.md README.md`
Expected: no stale `b8400` / `March 2026`; the pinned build appears consistently.

- [ ] **Step 5: Commit**

```bash
git add llama-cpp-guide.md local-llms.md README.md
git commit -m "docs: refresh runtime guides for pinned llama.cpp build + mlx-lm 0.31.x"
```

---

### Task 7: Upgrade llama.cpp to the pinned build and smoke-verify end-to-end

**Files:** none (operational). This task installs the runtime and verifies the whole chain on real binaries.

**Interfaces:** Consumes everything from Tasks 1–5.

- [ ] **Step 1: Pick the build and download the macOS arm64 tarball**

```bash
gh release list --repo ggml-org/llama.cpp --limit 5
# Pick the latest bNNNN (head was b9692 on 2026-06-17), then:
gh release download bNNNN --repo ggml-org/llama.cpp \
  --pattern 'llama-bNNNN-bin-macos-arm64.tar.gz' --dir ~/Downloads
```

- [ ] **Step 2: Extract, de-quarantine, and locate the binary**

```bash
mkdir -p ~/llama.cpp && tar xzf ~/Downloads/llama-bNNNN-bin-macos-arm64.tar.gz -C ~/llama.cpp
xattr -r -d com.apple.quarantine ~/llama.cpp/* 2>/dev/null || true
find ~/llama.cpp -name llama-server
```
Record the resolved `llama-server` path as `$LLAMA_BIN`.

- [ ] **Step 3: Confirm the version probe agrees**

```bash
"$LLAMA_BIN" --version 2>&1 | grep -E '^version:'
# Expect: version: NNNN (<sha>)  → harness will record "llama.cpp bNNNN (<sha>)"
~/llm-env/bin/python -m mlx_lm --version
# Expect: 0.31.x → harness records "mlx-lm 0.31.x"
```

- [ ] **Step 4: Smoke run on llama.cpp (fresh, tiny) and inspect the stamped version**

```bash
./bench run --model-name qwen3.5-9b --prompts-dir smoke-prompts --scenarios none \
  --max-tokens 128 --archive-dir /tmp/bench-smoke --fresh \
  --llama-server-binary "$LLAMA_BIN"

# Inspect the manifest header (line 1) of the produced archive:
head -1 /tmp/bench-smoke/*.jsonl | python3 -c 'import sys,json; print(json.loads(sys.stdin.readline())["env"]["runtimeVersion"])'
```
Expected: prints `llama.cpp bNNNN (<sha>)` — NOT `unknown`. Server boots, prompts complete, scores produced.

- [ ] **Step 5: Smoke run on MLX and inspect the stamped version**

```bash
# Pick a small cached MLX model from `./bench list-models`, then:
./bench run --model-name <mlx-model> --prompts-dir smoke-prompts --scenarios none \
  --max-tokens 128 --archive-dir /tmp/bench-smoke-mlx --fresh
head -1 /tmp/bench-smoke-mlx/*.jsonl | python3 -c 'import sys,json; print(json.loads(sys.stdin.readline())["env"]["runtimeVersion"])'
```
Expected: prints `mlx-lm 0.31.x`.

- [ ] **Step 6: Record the outcome**

Confirm in writing (commit message / PR note) the exact pinned build, that both runtimes booted, and that `env.runtimeVersion` was correctly stamped for each. To re-baseline the existing corpus under the new versions, re-run without a fresh `--archive-dir` but **with `--fresh`** (the cache key does not include version, so stale results are otherwise reused).

---

## Self-Review

**Spec coverage:**
- "Capture runtime version" → Tasks 1, 2, 4, 5 (parsers, probe, seam, stamping). ✓
- "Adapt harness to new behavior" → Task 3 (configurable binary for pinned builds); known-limitation documentation (mlx `--kv-bits` gap, thinking workaround) in Task 6. No speculative flag changes (YAGNI). ✓
- "Refresh the docs" → Task 6. ✓
- "Start using the new updates" → Task 7 (actual upgrade + smoke verify on real binaries). ✓
- Cache identity decision (record-only, `--fresh` is the lever) → honored: cache key untouched; re-baseline note in Tasks 6 & 7. ✓
- Deferred (out of scope, correctly absent): new models in `models.yaml`; alternative runtimes (vllm-mlx etc.). ✓

**Placeholder scan:** `bNNNN` in Task 7 is a deliberately operator-resolved value (the latest build at execution time), with the exact resolving commands given — not a code placeholder. All code steps contain complete code. No TODO/TBD.

**Type consistency:** `probeRuntimeVersion(runtime: Runtime, bin: string): Effect<string, never, CommandExecutor>` is defined identically in Task 2 and consumed in Task 4; `RunModelDeps.runtimeVersion: (runtime: Runtime) => Effect<string, never, CommandExecutor>` defined in Task 4 and consumed in Task 5; `parseLlamacppVersion`/`parseMlxVersion` names consistent across Tasks 1–2. `MakeRunDepsInput.llamaServerBinary` / `makeLlmServerFactory(llamaServerBinary?)` consistent across Task 3–4. ✓
