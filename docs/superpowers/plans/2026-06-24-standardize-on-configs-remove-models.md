# Standardize on configs.yaml; remove models.yaml — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `configs.yaml` the single model roster — repoint `list-models` to it, migrate the 24 `models.yaml`-only artifacts as `active: false` catalog entries, and delete `models.yaml`, its loader, schema cruft, and tests.

**Architecture:** `list-models` swaps `loadModels(models.yaml)` for `loadConfigurations(configs.yaml)`, which (unlike the old loader) requires a `SystemPromptRegistry` layer built from `system-prompts.yaml` — the exact pattern `run`'s `runSweep` uses. `ModelConfig` (the runtime model shape produced by `modelFromConfig`) sheds three dead fields (`params`, `active`, `scenarioCtxSize`); the `Configuration` schema is untouched. The 24 orphaned artifacts become inactive `configs.yaml` rows so the roster history survives in one file.

**Tech Stack:** TypeScript, Effect-TS (Schema, Layer, FileSystem), Effect CLI (@effect/cli), vitest, YAML roster files.

## Global Constraints

- Commit directly to `main` (repo's established pattern); each task ends in a commit.
- `bash scripts/lint-strict.sh` must stay clean; its throw-ban exempts `*.test.ts`.
- Do NOT touch `webapp/**`.
- The `Configuration` schema is UNCHANGED — `scenarioCtxSize` is NOT added anywhere; it is only REMOVED from `ModelConfig`.
- Commit messages end with: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

---

## File Structure

**Modified**

- `src/schema/model.ts` — `ModelConfig` runtime shape; drop `params`/`active`/`scenarioCtxSize`, rewrite the doc comment to the true `ctxSize`→llamacpp-`-c` (no-op mlx, no per-phase restart) story.
- `src/schema/model.test.ts` — stop asserting the three removed fields.
- `src/cli/commands/list.ts` — `loadModels`→`loadConfigurations`; new `--configs-file`/`--system-prompts-file` options; `formatModelLine` renders `id  artifact  runtime  quant  active`.
- `src/cli/__tests__/list-models-e2e.test.ts` — stage temp `configs.yaml` + `system-prompts.yaml`; assert the new row format.
- `src/__tests__/integration-smoke.test.ts` — drop the `loadModels`/`modelsPath` step and `models` assertions.
- `src/errors/config.test.ts` — `"models.yaml"` literal → `"configs.yaml"`.
- `src/llm/servers/resolve-mlx.ts` — "adjust models.yaml" → "adjust configs.yaml".
- `src/llm/servers/resolve-gguf.ts` — "adjust models.yaml" → "adjust configs.yaml".
- `configs.yaml` — append the 24 inactive catalog entries with a comment header.
- `README.md` — line 92 `list-models` description repointed to `configs.yaml` and the new columns.
- `docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md` — note that this spec resolves the `list-models` decision.

**Deleted**

- `models.yaml` — repo-root roster file, no longer read by any code.
- `src/config/models.ts` — `loadModels` loader.
- `src/config/models.test.ts` — every case exercises the deleted loader.
- `src/config/__fixtures__/models/` — fixtures consumed only by `models.test.ts` (`models.yaml`, `models-bad-runtime.yaml`, `models-active-missing-temperature.yaml`, `models-inactive-missing-temperature.yaml`).

**Untouched (confirmed, do NOT edit)**

- `src/schema/configuration.ts` — already has `ctxSize` (line 17), `active` (line 18); no `scenarioCtxSize`.
- `src/orchestration/run-challenge.ts` — `modelFromConfig` (~line 73) never sets the removed fields.
- `src/cli/deps.ts` — `ctxSize`→`llamacppServer` wiring (~line 115).
- `webapp/**`, historical specs/plans under `docs/superpowers/` that record past state.

---

## Tasks

### Task 1 — Clean up `ModelConfig` (remove `params`, `active`, `scenarioCtxSize`; fix doc comment)

**Files:**
- Modify `src/schema/model.ts` (doc comment lines 4–16; fields lines 22, 24, 25)
- Test: Modify `src/schema/model.test.ts` (cases at lines 21–33 and 35–42)

**Interfaces:**
- Produces: `ModelConfig` struct with fields `{ artifact, runtime, name?, quant?, ctxSize?, temperature?, chatTemplate? }` — the runtime model shape. Note Task 3's `formatModelLine` does NOT consume `ModelConfig` (it consumes `ResolvedConfiguration`); the runtime path (`run-prompt`, `run-scenario`, `run-id`, `cli/deps`) is the consumer of this trimmed shape.

**Convention note (red→green for a removal):** Effect `Schema.Struct` silently *strips* unknown keys on decode (verified: decoding `{params, scenarioCtxSize, active}` through the current schema keeps them; through the trimmed schema it drops them). So the failing test is an explicit "the removed key is stripped" assertion: against the CURRENT schema the key survives (`"params" in decoded === true`), so `expect(...).toBe(false)` goes RED; after trimming the schema it goes GREEN. We also retype the round-trip fixtures to the new shape in the same step, because the `ModelConfig` type no longer permits the removed keys (tsc red) and `roundTrip` strips them at runtime so `toEqual(v)` would fail (vitest red).

**Steps:**

- [ ] **1.1 Write the failing "stripped fields" test + retype the round-trip fixtures.** Replace the two affected cases in `src/schema/model.test.ts`. Change the "round-trips with full set of overrides" case (lines 21–33) to drop `params`, `scenarioCtxSize`, `active`, and replace the "round-trips with active=false" case (lines 35–42) with a stripping assertion. The new file region reads:

```typescript
  it("round-trips with full set of overrides", () => {
    const v: ModelConfig = {
      artifact: "Qwen/Qwen3-32B-GGUF",
      runtime: "llamacpp",
      name: "Qwen 3 32B",
      quant: "Q4_K_M",
      ctxSize: 16384,
    };
    expect(roundTrip(ModelConfig, v)).toEqual(v);
  });

  it("strips removed roster fields (params, scenarioCtxSize, active)", () => {
    const decoded = Schema.decodeUnknownSync(ModelConfig)({
      artifact: "Qwen/Qwen3-32B-GGUF",
      runtime: "llamacpp",
      params: "32B",
      scenarioCtxSize: 32768,
      active: false,
    });
    expect("params" in decoded).toBe(false);
    expect("scenarioCtxSize" in decoded).toBe(false);
    expect("active" in decoded).toBe(false);
  });
```

- [ ] **1.2 Run it, see it fail.** `npm test -- src/schema/model.test.ts`. Expected: the "strips removed roster fields" case fails — against the current schema the keys are retained, so `expect("params" in decoded).toBe(false)` reports `expected false, received true`. (The retyped "full set of overrides" fixture also fails tsc because `ModelConfig` still *requires* nothing but the literal still matches — it passes; the stripping case is the load-bearing red.)

- [ ] **1.3 Remove the three fields from the schema.** In `src/schema/model.ts`, delete lines 22 (`params`), 24 (`scenarioCtxSize`), 25 (`active`). The struct becomes:

```typescript
export const ModelConfig = Schema.Struct({
  artifact: Schema.String,
  runtime: Runtime,
  name: Schema.optional(Schema.String),
  quant: Schema.optional(Schema.String),
  ctxSize: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  /**
   * Optional vendored chat-template name (see {@link Configuration.chatTemplate}).
   * Resolved to `templates/<chatTemplate>.jinja` and passed to llama-server
   * as `--jinja --chat-template-file`.
   */
  chatTemplate: Schema.optional(Schema.String),
});
```

- [ ] **1.4 Rewrite the doc comment.** Replace the doc comment block (current lines 4–16, ending just above `export const ModelConfig`) with:

```typescript
/**
 * The runtime model shape produced by `modelFromConfig`
 * (`src/orchestration/run-challenge.ts`) and consumed by the LLM-server
 * factory, `run-prompt`, `run-scenario`, `run-session`, and `run-id`.
 *
 * `ctxSize` flows to the llamacpp server's `-c` flag; the mlx server takes no
 * context flag, so `ctxSize` is a benign no-op there. There is no per-phase
 * server restart — a single server serves both the prompt and scenario phases.
 *
 * `name` defaults to the configuration id at construction; `quant`,
 * `temperature`, and `chatTemplate` carry through from the configuration.
 */
```

- [ ] **1.5 Run it, see it pass.** `npm test -- src/schema/model.test.ts`. Expected: all cases green; the stripping assertions now hold and the round-trip fixtures typecheck against the trimmed `ModelConfig`.

- [ ] **1.6 Lint.** `bash scripts/lint-strict.sh`. Expected: clean.

- [ ] **1.7 Commit.**
```
git add src/schema/model.ts src/schema/model.test.ts
git commit -m "$(cat <<'EOF'
refactor(schema): drop dead params/active/scenarioCtxSize from ModelConfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 — Append the 24 inactive catalog entries to `configs.yaml`

**Files:**
- Modify `configs.yaml` (append after the current last line, 530)
- Test: Modify `src/config/configurations.test.ts` (append a new `describe` block — this file already imports `loadConfigurations`, `SystemPromptRegistry`, `NodeContext`, `Layer`)

**Interfaces:**
- Consumes: `loadConfigurations(path)` from `src/config/configurations.js` — signature `(path: string) => Effect.Effect<ReadonlyArray<ResolvedConfiguration>, …, FileSystem.FileSystem | SystemPromptRegistry>`. Requires a `SystemPromptRegistry` layer built via `Layer.succeed(SystemPromptRegistry, systemPrompts)` where `systemPrompts = yield* loadSystemPrompts("system-prompts.yaml")`.
- Produces: a `configs.yaml` whose entries the real `default` system-prompt key (`system-prompts.yaml:4`) resolves cleanly.

**Steps:**

- [ ] **2.1 Add the test imports.** `src/config/configurations.test.ts` already imports `loadConfigurations`/`computeConfigHash` (line 5), `SystemPromptRegistry` (line 6), `NodeContext` (line 2), and `{ Effect, Layer }` (line 3). Add the two it lacks at the top: `import path from "node:path";`, `import { fileURLToPath } from "node:url";`, and add `loadSystemPrompts` to the existing system-prompts import: `import { loadSystemPrompts, SystemPromptRegistry } from "./system-prompts.js";`.

- [ ] **2.2 Write the failing catalog test.** Append this `describe` block to `src/config/configurations.test.ts`. It loads the real repo-root `configs.yaml` + `system-prompts.yaml` (this file lives at `src/config/`, so `repoRoot` is two levels up). Asserts a sampled catalog id resolves as inactive with its verbatim `ctxSize`:

```typescript
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("configs.yaml catalog-only entries", () => {
  it("loads the inactive catalog entries and they resolve as inactive", async () => {
    const program = Effect.gen(function* () {
      const prompts = yield* loadSystemPrompts(path.join(repoRoot, "system-prompts.yaml"));
      return yield* loadConfigurations(path.join(repoRoot, "configs.yaml")).pipe(
        Effect.provide(Layer.succeed(SystemPromptRegistry, prompts)),
      );
    });
    const configs = await Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)));

    const byId = new Map(configs.map((c) => [c.id, c]));
    const sample = byId.get("qwen2.5-7b-llamacpp");
    expect(sample).toBeDefined();
    expect(sample?.active).toBe(false);
    expect(byId.get("llama4-maverick-17b-128e-mlx")?.active).toBe(false);
    // ctxSize copied verbatim where present
    expect(byId.get("devstral-2-123b-llamacpp")?.ctxSize).toBe(2048);
  });
});
```

- [ ] **2.3 Run it, see it fail.** `npm test -- src/config/configurations.test.ts`. Expected: the new case fails because `qwen2.5-7b-llamacpp` (and the other sampled ids) are not yet present in `configs.yaml` — `sample` is `undefined`, so `expect(sample).toBeDefined()` fails. (The pre-existing `loadConfigurations` cases still pass.)

- [ ] **2.4 Append the catalog block to `configs.yaml`.** The file currently ends at line 530 (`active: false` of `mistral-small-4-119b-llamacpp`). Append exactly (note: NO `scenarioCtxSize` on any entry; `ctxSize: 2048` only where the spec carries it):

```yaml

# ── Catalog-only entries (inactive) ──────────────────────────────────────────
# Cached/known artifacts that are not part of any active sweep. `systemPrompt`,
# `maxTokens`, and `temperature` are placeholders here — these entries never run
# (active: false), so those fields are inert. Flip `active: true` and tune them
# before running any of these.
- id: qwen2.5-7b-llamacpp
  artifact: Qwen/Qwen2.5-7B-Instruct-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-32b-llamacpp
  artifact: Qwen/Qwen2.5-32B-Instruct-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-72b-llamacpp
  artifact: Qwen/Qwen2.5-72B-Instruct-GGUF
  runtime: llamacpp
  quant: Q5_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-72b-mlx
  artifact: mlx-community/Qwen2.5-72B-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-coder-32b-llamacpp
  artifact: Qwen/Qwen2.5-Coder-32B-Instruct-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-coder-32b-mlx
  artifact: mlx-community/Qwen2.5-Coder-32B-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: devstral-2-123b-llamacpp
  artifact: unsloth/Devstral-2-123B-Instruct-2512-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: devstral-2-123b-mlx
  artifact: mlx-community/Devstral-2-123B-Instruct-2512-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: devstral-small-2-24b-llamacpp
  artifact: unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-7b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-14b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-14b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-32b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-32b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-coder-v2-lite-mlx
  artifact: mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-llama-70b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF
  runtime: llamacpp
  quant: Q5_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-llama-70b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: gpt-oss-120b-llamacpp
  artifact: unsloth/gpt-oss-120b-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: gpt-oss-120b-mlx
  artifact: mlx-community/gpt-oss-120b-MXFP4-Q4
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: nemotron-super-49b-llamacpp
  artifact: bartowski/nvidia_Llama-3_3-Nemotron-Super-49B-v1_5-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: llama4-scout-17b-16e-llamacpp
  artifact: unsloth/Llama-4-Scout-17B-16E-Instruct-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-scout-17b-16e-mlx
  artifact: mlx-community/Llama-4-Scout-17B-16E-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-maverick-17b-128e-llamacpp
  artifact: unsloth/Llama-4-Maverick-17B-128E-Instruct-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-maverick-17b-128e-mlx
  artifact: mlx-community/Llama-4-Maverick-17B-128E-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false
```

- [ ] **2.5 Run it, see it pass.** `npm test -- src/config/configurations.test.ts`. Expected: green — all sampled ids present, `active === false`, `devstral-2-123b-llamacpp.ctxSize === 2048`.

- [ ] **2.6 Sanity-check the id count.** `grep -c "^- id:" configs.yaml`. Expected: 87 (the 63 existing entries + 24 appended).

- [ ] **2.7 Lint.** `bash scripts/lint-strict.sh`. Expected: clean.

- [ ] **2.8 Commit.**
```
git add configs.yaml src/config/
git commit -m "$(cat <<'EOF'
feat(configs): add 24 inactive catalog-only entries from models.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 — Repoint `list-models` to `configs.yaml`

**Files:**
- Modify `src/cli/commands/list.ts` (imports lines 14–17; `modelsPathOpt` lines 23–26; `formatModelLine`/`formatModelList` lines 40–50; `listModelsCommand` lines 112–120)
- Test: Modify `src/cli/__tests__/list-models-e2e.test.ts` (full rewrite of fixture + assertions)
- Test: Modify `src/cli/commands/__tests__/list.test.ts` (REQUIRED — its `model()` helper builds `ModelConfig` and its `formatModelLine`/`formatModelList` assertions expect the old 3-column shape; both stop typechecking once the formatters take `ResolvedConfiguration`)

**Interfaces:**
- Consumes: `loadConfigurations` (Task 2 interface), `loadSystemPrompts` + `SystemPromptRegistry` from `../../config/system-prompts.js`, `Layer` from `effect`, `DEFAULT_SYSTEM_PROMPTS_PATH` from `../paths.js` (value `"system-prompts.yaml"`).
- Produces — option names (mirroring `run.ts`):
  - `--configs-file` via `Options.file("configs-file")`, description `"Path to configs.yaml"`, default `"configs.yaml"`.
  - `--system-prompts-file` via `Options.file("system-prompts-file")`, description `"Path to system-prompts YAML"`, default `DEFAULT_SYSTEM_PROMPTS_PATH`.
- Produces — `formatModelLine(c: ResolvedConfiguration): string` returning `` `${c.id}\t${c.artifact}\t${c.runtime}\t${c.quant ?? "-"}\t${c.active !== false}` `` and `formatModelList(configs: ReadonlyArray<ResolvedConfiguration>): string`. (Task 9's manual check depends on this exact 5-column tab-separated format.)

**Steps:**

- [ ] **3.1 Rewrite the e2e test fixture + assertions (failing).** Replace `src/cli/__tests__/list-models-e2e.test.ts` entirely:

```typescript
/**
 * End-to-end-ish test for the `list-models` handler: point it at a fixture
 * `configs.yaml` (plus a `system-prompts.yaml` defining every referenced key),
 * capture stdout, assert the rendered lines match the fixture.
 *
 * Runs the real @effect/cli command via `Command.run`, which proves flag
 * parsing + handler wiring + FileSystem layer provisioning all work together.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listModelsCommand } from "../commands/list.js";

describe("list-models subcommand handler (e2e)", () => {
  let tmpDir: string;
  let configsPath: string;
  let systemPromptsPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "llm-bench-list-"));
    configsPath = path.join(tmpDir, "configs.yaml");
    systemPromptsPath = path.join(tmpDir, "system-prompts.yaml");
    writeFileSync(systemPromptsPath, 'default: "You are a helpful assistant."\n');
    writeFileSync(
      configsPath,
      [
        "- id: qwen-72b-llamacpp",
        "  artifact: models/qwen-72b.gguf",
        "  runtime: llamacpp",
        "  quant: Q4_K_M",
        "  temperature: 0.7",
        "  systemPrompt: default",
        "  maxTokens: 4096",
        "- id: mistral-7b-mlx",
        "  artifact: mlx-community/mistral-7b",
        "  runtime: mlx",
        "  temperature: 0.7",
        "  systemPrompt: default",
        "  maxTokens: 4096",
        "  active: false",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints one line per configuration with id/artifact/runtime/quant/active", async () => {
    const captured: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      captured.push(String(msg));
    });

    const root = Command.make("llm-bench").pipe(Command.withSubcommands([listModelsCommand]));
    const run = Command.run(root, { name: "llm-bench", version: "0.0.0" });
    const exit = await Effect.runPromiseExit(
      run([
        "node",
        "cli",
        "list-models",
        "--configs-file",
        configsPath,
        "--system-prompts-file",
        systemPromptsPath,
      ]).pipe(Effect.provide(NodeContext.layer)),
    );

    spy.mockRestore();
    expect(exit._tag).toBe("Success");

    const text = captured.join("\n");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("qwen-72b-llamacpp\tmodels/qwen-72b.gguf\tllamacpp\tQ4_K_M\ttrue");
    expect(lines[1]).toBe("mistral-7b-mlx\tmlx-community/mistral-7b\tmlx\t-\tfalse");
  });
});
```

- [ ] **3.2 Run it, see it fail.** `npm test -- src/cli/__tests__/list-models-e2e.test.ts`. Expected: the command rejects the unknown `--configs-file` flag (the handler still defines `--models`), so `exit._tag` is `"Failure"` and `expect(exit._tag).toBe("Success")` fails. (tsc will also flag the still-`ModelConfig` `formatModelLine` once edited, but the parse failure is the load-bearing red.)

- [ ] **3.3 Swap imports in `list.ts`.** Replace lines 14–17:

```typescript
import { loadChallenge } from "../../config/challenges.js";
import { loadConfigurations, type ResolvedConfiguration } from "../../config/configurations.js";
import { loadScenarioCorpus } from "../../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
```

Also add `Layer` to the `effect` import (line 13: `import { Effect, Layer } from "effect";`) and `DEFAULT_SYSTEM_PROMPTS_PATH` to the paths import (line 21: `import { DEFAULT_SCENARIOS_DIR, DEFAULT_SYSTEM_PROMPTS_PATH } from "../paths.js";`). Remove the now-unused `PromptCorpusEntry`/`ScenarioCorpusEntry`/`ModelConfig` type imports only if they become unused — `PromptCorpusEntry` and `ScenarioCorpusEntry` are still used by `list-prompts`, so keep them; drop only the `ModelConfig` import (old line 17).

- [ ] **3.4 Replace the options block.** Replace `modelsPathOpt` (lines 23–26) with:

```typescript
const configsFileOpt = Options.file("configs-file").pipe(
  Options.withDescription("Path to configs.yaml"),
  Options.withDefault("configs.yaml"),
);

const systemPromptsFileOpt = Options.file("system-prompts-file").pipe(
  Options.withDescription("Path to system-prompts YAML"),
  Options.withDefault(DEFAULT_SYSTEM_PROMPTS_PATH),
);
```

- [ ] **3.5 Update the formatters.** Replace the `formatModelLine`/`formatModelList` block (lines 40–50):

```typescript
/**
 * Render one configuration row: `id  artifact  runtime  quant  active`.
 * Missing quant renders as `"-"`; `active` is the effective boolean
 * (`active !== false`), so a config that omits the flag shows `true`.
 */
export const formatModelLine = (c: ResolvedConfiguration): string => {
  const quant = c.quant ?? "-";
  return `${c.id}\t${c.artifact}\t${c.runtime}\t${quant}\t${c.active !== false}`;
};

export const formatModelList = (configs: ReadonlyArray<ResolvedConfiguration>): string =>
  configs.map(formatModelLine).join("\n");
```

- [ ] **3.6 Update `listModelsCommand`.** Replace the command (lines 112–120):

```typescript
export const listModelsCommand = Command.make(
  "list-models",
  { configsFile: configsFileOpt, systemPromptsFile: systemPromptsFileOpt, verbose },
  ({ configsFile, systemPromptsFile, verbose: isVerbose }) =>
    Effect.gen(function* () {
      const systemPrompts = yield* loadSystemPrompts(systemPromptsFile);
      const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
      const configs = yield* loadConfigurations(configsFile).pipe(Effect.provide(registryLayer));
      yield* printLine(formatModelList(configs));
    }).pipe(Effect.provide(makeLoggerLayer(isVerbose))),
).pipe(
  Command.withDescription("Print one line per configuration (id, artifact, runtime, quant, active)"),
);
```

- [ ] **3.7 Run it, see it pass.** `npm test -- src/cli/__tests__/list-models-e2e.test.ts`. Expected: green — both rows render as `id\tartifact\truntime\tquant\tactive`, with `mistral-7b-mlx` showing `-` quant and `false` active.

- [ ] **3.8 Rewrite the unit `formatModelLine`/`formatModelList` tests.** In `src/cli/commands/__tests__/list.test.ts`, the `model()` helper (lines 13–14) builds `ModelConfig` and the two `describe`s for `formatModelLine`/`formatModelList` (lines 45–66) assert the old 3-column shape — both break now that the formatters take `ResolvedConfiguration`. Replace the `ModelConfig` import (line 2) with a `ResolvedConfiguration`-returning helper and update those two `describe` blocks (leave the prompt/scenario tests untouched):

```typescript
// replace line 2 import:
import type { ResolvedConfiguration } from "../../../config/configurations.js";

// replace the `model(...)` helper (lines 13–14):
const cfg = (
  id: string,
  artifact: string,
  runtime: "llamacpp" | "mlx",
  quant?: string,
  active?: boolean,
): ResolvedConfiguration =>
  ({
    id,
    artifact,
    runtime,
    quant,
    temperature: 0.7,
    systemPrompt: "default",
    maxTokens: 4096,
    active,
    systemPromptText: "x",
    configHash: "h",
  }) as ResolvedConfiguration;

// replace the formatModelLine + formatModelList describes (lines 45–66):
describe("formatModelLine", () => {
  it("renders id  artifact  runtime  quant  active", () => {
    expect(formatModelLine(cfg("qwen-72b-llamacpp", "qwen-72b.gguf", "llamacpp", "Q4_K_M"))).toBe(
      "qwen-72b-llamacpp\tqwen-72b.gguf\tllamacpp\tQ4_K_M\ttrue",
    );
  });

  it("uses '-' for absent quant and 'false' for active: false", () => {
    expect(formatModelLine(cfg("mistral-mlx", "mlx-community/mistral", "mlx", undefined, false))).toBe(
      "mistral-mlx\tmlx-community/mistral\tmlx\t-\tfalse",
    );
  });
});

describe("formatModelList", () => {
  it("joins rows with newlines", () => {
    const out = formatModelList([
      cfg("a-llamacpp", "a.gguf", "llamacpp", "Q4"),
      cfg("b-mlx", "b", "mlx"),
    ]);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("a-llamacpp\ta.gguf\tllamacpp\tQ4\ttrue");
    expect(out).toContain("b-mlx\tb\tmlx\t-\ttrue");
  });
});
```

Run `npm test -- src/cli/commands/__tests__/list.test.ts`. Expected: green.

- [ ] **3.9 Lint.** `bash scripts/lint-strict.sh`. Expected: clean.

- [ ] **3.10 Commit.**
```
git add src/cli/commands/list.ts src/cli/__tests__/list-models-e2e.test.ts src/cli/commands/__tests__/list.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): repoint list-models from models.yaml to configs.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 — Delete `models.yaml`, `src/config/models.ts`, `src/config/models.test.ts`, and `src/config/__fixtures__/models/`

**Files:**
- Delete `src/config/models.ts`
- Delete `src/config/models.test.ts`
- Delete `src/config/__fixtures__/models/` (`models.yaml`, `models-bad-runtime.yaml`, `models-active-missing-temperature.yaml`, `models-inactive-missing-temperature.yaml`)
- Delete `models.yaml` (repo root)

**Interfaces:** none produced. Depends on Tasks 3 and 5 having removed the last `loadModels` importers — verified in step 4.1.

**Steps:**

- [ ] **4.1 Confirm no live importers remain.** `grep -rn "loadModels\|\"./models.js\"\|/config/models.js\|__fixtures__/models" src/`. Expected: the ONLY hits are inside `src/config/models.ts`, `src/config/models.test.ts`, and `src/__tests__/integration-smoke.test.ts`. If `integration-smoke.test.ts` still imports `loadModels`, STOP and complete Task 5 first. No hit in `src/cli/commands/list.ts`.

- [ ] **4.2 Delete the files.** Remove them individually (never a broad `rm` glob over a data dir):
```
git rm src/config/models.ts src/config/models.test.ts
git rm src/config/__fixtures__/models/models.yaml src/config/__fixtures__/models/models-bad-runtime.yaml src/config/__fixtures__/models/models-active-missing-temperature.yaml src/config/__fixtures__/models/models-inactive-missing-temperature.yaml
git rm models.yaml
```
Then `ls src/config/__fixtures__/models 2>/dev/null` — if the now-empty dir lingers, `rmdir src/config/__fixtures__/models`.

- [ ] **4.3 Typecheck + test.** `npm test`. Expected: green — no module resolves `../config/models.js` any longer. (If anything still imports it, that importer was missed; fix it before proceeding.)

- [ ] **4.4 Lint.** `bash scripts/lint-strict.sh`. Expected: clean.

- [ ] **4.5 Commit.**
```
git add -A
git commit -m "$(cat <<'EOF'
chore: delete models.yaml, its loader, schema test, and fixtures

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 — Fix `src/__tests__/integration-smoke.test.ts`

**Files:**
- Test: Modify `src/__tests__/integration-smoke.test.ts` (import line 7; doc comment line 19; `modelsPath` line 30; `loadModels` step line 39; tuple line 83; assertions lines 96–99)

**Interfaces:** none produced. Must NOT import the deleted `src/config/models.js`.

**Steps:**

- [ ] **5.1 Remove the roster-load from the smoke test.** Apply these edits:
  - Delete the import on line 7: `import { loadModels } from "../config/models.js";`
  - In the doc comment, delete the `4. Load models.yaml` line (line 19) and renumber the following step.
  - Delete `const modelsPath = path.join(repoRoot, "models.yaml");` (line 30).
  - Delete `const models = yield* loadModels(modelsPath);` (line 39).
  - In the returned object (line 83), drop `models`: `return { systemPrompts, prompts, scenarios, score };`.
  - In the destructure (line 90), drop `models`: `const { systemPrompts, prompts, scenarios, score } = exit.value;`.
  - Delete the three `models`-related assertions (lines 96–99): the `// Models loaded` comment and the `expect(models...)` lines.

- [ ] **5.2 Run it, see it pass.** `npm test -- src/__tests__/integration-smoke.test.ts`. Expected: green — the system-prompts + challenge + scenario load and synthetic score still pass; no `loadModels` reference remains.

- [ ] **5.3 Lint.** `bash scripts/lint-strict.sh`. Expected: clean.

- [ ] **5.4 Commit.**
```
git add src/__tests__/integration-smoke.test.ts
git commit -m "$(cat <<'EOF'
test: drop models.yaml load from integration smoke test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

> **Ordering note:** Run Task 5 *before* Task 4's deletion (or interleave) — Task 4 step 4.1 requires this test to no longer import `loadModels`. If you used subagent-driven-development and Task 4 ran first, that's fine only if step 4.1 caught it and you completed Task 5 in between.

---

### Task 6 — Fix `src/errors/config.test.ts` literal

**Files:**
- Test: Modify `src/errors/config.test.ts` (lines 14, 18)

**Steps:**

- [ ] **6.1 Repoint the literal.** Change line 14 `path: "models.yaml",` → `path: "configs.yaml",` and line 18 `expect(e.path).toBe("models.yaml");` → `expect(e.path).toBe("configs.yaml");`.

- [ ] **6.2 Run it, see it pass.** `npm test -- src/errors/config.test.ts`. Expected: green — the `ConfigError` test carries `"configs.yaml"` and asserts the same value.

- [ ] **6.3 Commit.**
```
git add src/errors/config.test.ts
git commit -m "$(cat <<'EOF'
test: use configs.yaml literal in ConfigError path test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7 — Fix the two "adjust models.yaml" error strings

**Files:**
- Modify `src/llm/servers/resolve-mlx.ts` (line 62)
- Modify `src/llm/servers/resolve-gguf.ts` (line 62)

**Steps:**

- [ ] **7.1 Edit resolve-mlx.ts.** Change the `reason` string from `` `No cached MLX model for ${artifact}. Run \`hf download ${artifact}\` or adjust models.yaml.` `` to end with `… or adjust configs.yaml.`:

```typescript
              reason: `No cached MLX model for ${artifact}. Run \`hf download ${artifact}\` or adjust configs.yaml.`,
```

- [ ] **7.2 Edit resolve-gguf.ts.** Change the `reason` string from `… or adjust models.yaml.` to:

```typescript
                reason: `No cached .gguf for ${artifact} (quant=${quant}). Run \`hf download ${artifact}\` or adjust configs.yaml.`,
```

- [ ] **7.3 Confirm no remaining `models.yaml` in src.** `grep -rn "models.yaml\|loadModels" src/`. Expected: zero hits.

- [ ] **7.4 Test + lint.** `npm test -- src/llm` (or any suite that touches these) and `bash scripts/lint-strict.sh`. Expected: green / clean. If no test directly exercises these strings, rely on typecheck + lint passing.

- [ ] **7.5 Commit.**
```
git add src/llm/servers/resolve-mlx.ts src/llm/servers/resolve-gguf.ts
git commit -m "$(cat <<'EOF'
fix(llm): point cache-miss hints at configs.yaml not models.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8 — Doc updates

**Files:**
- Modify `README.md` (line 92)
- Modify `docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md` (line 41)

**Steps:**

- [ ] **8.1 Update README line 92.** Replace the `list-models` clause. The current sentence begins:
  `**`list-models`** reads `models.yaml` and prints one line per model (`artifact`, `runtime`, `quant`).`
  Change to:
  `**`list-models`** reads `configs.yaml` and prints one line per configuration (`id`, `artifact`, `runtime`, `quant`, `active`).`
  Leave the rest of line 92 (the `list-prompts` clause) unchanged.

- [ ] **8.2 Note the resolution in the obsolete-run-path plan.** On `docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md`, append a one-line note to the line-41 table row's Extraction cell (do NOT rewrite the historical prose). Add at the end of that cell: `**Resolved (2026-06-24):** list-models is repointed to configs.yaml; src/config/models.ts and models.yaml are deleted (see the standardize-on-configs spec).`

- [ ] **8.3 Confirm doc grep is clean of live references.** `grep -rn "models.yaml\|loadModels" README.md docs/ARCHITECTURE.md`. Expected: zero hits in `README.md` and `docs/ARCHITECTURE.md`. (Historical specs/plans under `docs/superpowers/` may still mention `models.yaml` as past state — those are intentionally NOT edited.)

- [ ] **8.4 Commit.**
```
git add README.md docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md
git commit -m "$(cat <<'EOF'
docs: repoint list-models docs to configs.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9 — Final verification

**Files:** none modified (verification only).

**Steps:**

- [ ] **9.1 Full suite green.** `npm test`. Expected: all suites pass, no reference to a deleted module.

- [ ] **9.2 Strict lint clean.** `bash scripts/lint-strict.sh`. Expected: exit 0, no findings.

- [ ] **9.3 No live `models.yaml` / `loadModels` in source.** `grep -rn "models.yaml\|loadModels" src/ README.md docs/ARCHITECTURE.md`. Expected: zero hits. (Historical `docs/superpowers/**` specs/plans recording past state are exempt and not searched here.)

- [ ] **9.4 Manual CLI smoke — default roster.** `./bench list-models`. Expected: rows in `id  artifact  runtime  quant  active` form, including the 24 new inactive entries showing `false` (e.g. `qwen2.5-7b-llamacpp` … `false`), and active entries showing `true`.

- [ ] **9.5 Manual CLI smoke — flag honored.** `./bench list-models --configs-file configs.yaml --system-prompts-file system-prompts.yaml`. Expected: identical output to 9.4, proving both flags parse and resolve.

- [ ] **9.6 Confirm webapp untouched.** `git diff --name-only main -- webapp/` over the branch's commits (or `git log --oneline --name-only | grep webapp/`). Expected: no `webapp/**` files changed.

- [ ] **9.7 No commit needed** unless 9.x surfaced a fix; if it did, commit that fix with an appropriate message ending in the Co-Authored-By trailer, then re-run 9.1–9.3.
