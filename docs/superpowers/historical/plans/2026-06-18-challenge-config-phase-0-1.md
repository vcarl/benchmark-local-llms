# Challenge × Configuration — Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new entity model (Configuration, Challenge, Result) plus a custom subprocess scorer, then make `./bench submit --config <id> --challenge <id>` run one configuration against one challenge end-to-end and write a scored attempt archive.

**Architecture:** New `@effect/schema` types and YAML loaders sit beside the existing model-centric ones (clean break, no migration). A new `runChallenge` orchestrator reuses the existing LLM-server scope and `runPrompt`, sourcing the system prompt from the **configuration** instead of the prompt. Results are written as a per-attempt JSONL archive (header manifest + one line per challenge item) and aggregated into `{ score, passed }`.

**Tech Stack:** TypeScript, Effect-TS (`effect`, `@effect/cli`, `@effect/platform`), `@effect/schema`, vitest, YAML. Node `node:crypto` for hashing.

## Global Constraints

- **No `try`/`catch`/`throw`/`console.*` outside `src/cli/`** — enforced by `scripts/lint-strict.sh`. Use the Effect error channel with `Data.TaggedError` classes. (`*.test.ts` files are exempt from the throw ban.)
- **All I/O and subprocesses acquired through Effect `Scope`.** Anything spawning a process/HTTP/temp file takes `Scope` in its environment.
- **Fail-fast config:** YAML loaders fully decode at startup; a malformed file fails the load with a typed error.
- **One file per concept;** split when a module approaches ~300 lines.
- **Hashing:** SHA-256 hex truncated to the first 12 chars, via `shortSha256` in `src/config/hashing.ts`. Reuse it; do not introduce a second hash width.
- **Scorer discriminator field is `type`** (e.g. `{ type: "custom", script: "..." }`), matching the existing `ScorerConfig` union.
- Run `npm run lint && npm run typecheck && npm test` before each commit; all must pass.

---

## File structure

**Phase 0 — foundation (schemas, loaders, hashing, scorer):**
- `src/schema/configuration.ts` — `Configuration` struct (raw YAML shape).
- `src/config/configurations.ts` — `loadConfigurations`: YAML → resolved configs (system-prompt text + `configHash`).
- `src/schema/challenge.ts` — `Challenge` + `ChallengeItem` structs (raw YAML shape).
- `src/config/challenges.ts` — `loadChallenge`: YAML → `ResolvedChallenge` (item prompt refs resolved, `challengeHash`).
- `src/schema/scorer.ts` — **modify**: add `CustomConfig` 5th union variant.
- `src/scoring/dispatch.ts` — `scoreByConfig(output, cfg)`: pure scorer dispatch extracted from `score-result.ts`.
- `src/scoring/custom.ts` — `scoreCustom`: subprocess scorer (mirrors `code-exec.ts`).
- `src/schema/attempt.ts` — `AttemptManifest` (header) + `ItemResult` (body line).

**Phase 1 — proof of life (orchestration, archive, CLI):**
- `src/archive/attempt-writer.ts` — `writeAttemptHeader` / `appendItem` / `finalizeAttempt`.
- `src/orchestration/run-challenge.ts` — `runChallenge`: boot server, loop items, score, aggregate, write.
- `src/cli/commands/submit.ts` — `submitCommand`.
- `src/cli/main.ts` — **modify**: register `submitCommand`.
- `configs.yaml`, `challenges/smoke.yaml` — minimal fixtures for the slice.

**Interface conventions used throughout** (defined in the tasks below):
- `Configuration` (raw) → `ResolvedConfiguration = Configuration & { systemPromptText: string; configHash: string }`
- `ResolvedChallenge = { id; version; passThreshold; challengeHash; items: ResolvedItem[] }`
- `ResolvedItem = { itemId: string; promptHash: string; scorer: ScorerConfig; prompt: PromptCorpusEntry }`
- `ItemResult` body rows + `AttemptManifest` header.

---

## Task 1: Configuration schema + loader + hash

**Files:**
- Create: `src/schema/configuration.ts`
- Create: `src/config/configurations.ts`
- Test: `src/schema/configuration.test.ts`, `src/config/configurations.test.ts`
- Reference: `src/schema/model.ts`, `src/config/models.ts`, `src/config/hashing.ts`, `src/config/system-prompts.ts`

**Interfaces:**
- Consumes: `Runtime` from `src/schema/enums.js`; `shortSha256` from `src/config/hashing.js`; `loadSystemPrompts` + `SystemPromptRegistry` from `src/config/system-prompts.js`; `parseYaml` from `src/config/yaml.js`; `SchemaDecodeError`, `ConfigError` from `src/errors/config.js`.
- Produces:
  - `Configuration` (decoded struct) with fields `{ id, artifact, runtime, quant?, temperature, systemPrompt, maxTokens, ctxSize?, active? }`.
  - `ResolvedConfiguration = Configuration & { systemPromptText: string; configHash: string }`.
  - `computeConfigHash(c: { artifact; runtime; quant?; temperature; maxTokens }, systemPromptText: string): string`.
  - `loadConfigurations(path: string): Effect<ReadonlyArray<ResolvedConfiguration>, …, FileSystem | SystemPromptRegistry>`.

- [ ] **Step 1: Write the failing schema test**

`src/schema/configuration.test.ts`:
```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Configuration } from "./configuration.js";

describe("Configuration", () => {
  it("decodes a full entry", () => {
    const v = {
      id: "qwen3.5-9b-q4-direct",
      artifact: "Qwen/Qwen2.5-9B-Instruct-GGUF",
      runtime: "llamacpp",
      quant: "q4-k-m",
      temperature: 0.7,
      systemPrompt: "direct",
      maxTokens: 8096,
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({ id: "qwen3.5-9b-q4-direct" });
  });

  it("rejects an entry missing required temperature", () => {
    expect(() =>
      Schema.decodeUnknownSync(Configuration)({
        id: "x", artifact: "a", runtime: "mlx", systemPrompt: "direct", maxTokens: 8096,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/configuration.test.ts`
Expected: FAIL — cannot find module `./configuration.js`.

- [ ] **Step 3: Write the schema**

`src/schema/configuration.ts`:
```typescript
import { Schema } from "effect";
import { Runtime } from "./enums.js";

/**
 * A named, hashable LLM configuration: the knobs a user sets when submitting
 * a model to a challenge. The system prompt is part of the configuration
 * (resolved from `system-prompts.yaml` by key), not the prompt.
 */
export const Configuration = Schema.Struct({
  id: Schema.String,
  artifact: Schema.String,
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  systemPrompt: Schema.String,
  maxTokens: Schema.Number,
  ctxSize: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
});
export type Configuration = typeof Configuration.Type;
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `npx vitest run src/schema/configuration.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Write the failing loader test**

`src/config/configurations.test.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { computeConfigHash, loadConfigurations } from "./configurations.js";
import { SystemPromptRegistry } from "./system-prompts.js";

const registry = Layer.succeed(SystemPromptRegistry, { direct: "Be concise." } as Record<string, string>);

const writeTmp = (body: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/configs.yaml`;
    yield* fs.writeFileString(path, body);
    return path;
  });

describe("loadConfigurations", () => {
  it("resolves system prompt text and stamps configHash", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const path = yield* writeTmp(
          `- id: c1\n  artifact: a\n  runtime: mlx\n  temperature: 0.7\n  systemPrompt: direct\n  maxTokens: 100\n`,
        );
        const [cfg] = yield* loadConfigurations(path);
        expect(cfg.systemPromptText).toBe("Be concise.");
        expect(cfg.configHash).toHaveLength(12);
      }),
    ).pipe(Effect.provide(Layer.mergeAll(NodeContext.layer, registry)), Effect.runPromise));

  it("computeConfigHash is stable and order-insensitive to unrelated fields", () => {
    const h1 = computeConfigHash({ artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 }, "Be concise.");
    const h2 = computeConfigHash({ artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 }, "Be concise.");
    expect(h1).toBe(h2);
  });
});
```

- [ ] **Step 6: Run loader test to verify it fails**

Run: `npx vitest run src/config/configurations.test.ts`
Expected: FAIL — cannot find module `./configurations.js`.

- [ ] **Step 7: Write the loader**

`src/config/configurations.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { Configuration } from "../schema/configuration.js";
import { shortSha256 } from "./hashing.js";
import { SystemPromptRegistry } from "./system-prompts.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedConfiguration extends Configuration {
  readonly systemPromptText: string;
  readonly configHash: string;
}

const ConfigArray = Schema.Array(Configuration);

/** Identity hash for a configuration: knobs the user sets, not code version. */
export const computeConfigHash = (
  c: { artifact: string; runtime: string; quant?: string; temperature: number; maxTokens: number },
  systemPromptText: string,
): string =>
  shortSha256(
    [c.artifact, c.runtime, c.quant ?? "", String(c.temperature), String(c.maxTokens), systemPromptText].join("|"),
  );

export const loadConfigurations = (
  path: string,
): Effect.Effect<
  ReadonlyArray<ResolvedConfiguration>,
  YamlParseError | SchemaDecodeError | ConfigError | PlatformError,
  FileSystem.FileSystem | SystemPromptRegistry
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const registry = yield* SystemPromptRegistry;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(ConfigArray)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "Configuration[]", cause })),
    );
    return yield* Effect.forEach(decoded, (c) =>
      Effect.gen(function* () {
        const systemPromptText = registry[c.systemPrompt];
        if (systemPromptText === undefined) {
          return yield* Effect.fail(
            new ConfigError({ path, message: `Configuration '${c.id}' references unknown system prompt '${c.systemPrompt}'.` }),
          );
        }
        return { ...c, systemPromptText, configHash: computeConfigHash(c, systemPromptText) };
      }),
    );
  });
```

> Note: `SystemPromptRegistry` is the existing `Context.Tag` from `src/config/system-prompts.ts` whose service value is `Record<string, string>`. If its accessor differs (e.g. a `.get(key)` method), adapt the two `registry[...]` reads accordingly — check `src/config/system-prompts.ts` before implementing.

- [ ] **Step 8: Run both test files to verify they pass**

Run: `npx vitest run src/schema/configuration.test.ts src/config/configurations.test.ts`
Expected: PASS.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/schema/configuration.ts src/schema/configuration.test.ts src/config/configurations.ts src/config/configurations.test.ts
git commit -m "feat(config): Configuration schema + loader with configHash"
```

---

## Task 2: Challenge schema + loader + hash

**Files:**
- Create: `src/schema/challenge.ts`
- Create: `src/config/challenges.ts`
- Test: `src/schema/challenge.test.ts`, `src/config/challenges.test.ts`
- Reference: `src/config/prompt-corpus.ts` (how `PromptCorpusEntry` + `promptHash` are produced), `src/schema/scorer.ts`.

**Interfaces:**
- Consumes: `ScorerConfig` from `src/schema/scorer.js`; `PromptCorpusEntry` from `src/schema/prompt.js`; `shortSha256` from `src/config/hashing.js`; `parseYaml`, `SchemaDecodeError`, `ConfigError`.
- Produces:
  - `Challenge` (decoded) `{ id, version: number, passThreshold: number, items: ReadonlyArray<{ prompt: string; scorer?: ScorerConfig }> }`.
  - `ResolvedItem = { itemId: string; promptHash: string; scorer: ScorerConfig; prompt: PromptCorpusEntry }`.
  - `ResolvedChallenge = { id: string; version: number; passThreshold: number; challengeHash: string; items: ReadonlyArray<ResolvedItem> }`.
  - `resolveChallenge(challenge: Challenge, corpus: ReadonlyArray<PromptCorpusEntry>): Effect<ResolvedChallenge, ConfigError, never>`.
  - `loadChallenge(path, corpus): Effect<ResolvedChallenge, …, FileSystem>`.

- [ ] **Step 1: Write the failing schema test**

`src/schema/challenge.test.ts`:
```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Challenge } from "./challenge.js";

describe("Challenge", () => {
  it("decodes items with and without a scorer override", () => {
    const v = {
      id: "instruction-following",
      version: 1,
      passThreshold: 0.8,
      items: [
        { prompt: "json-output", scorer: { type: "constraint", constraints: [] } },
        { prompt: "word-count-limit" },
      ],
    };
    expect(Schema.decodeUnknownSync(Challenge)(v).items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/challenge.test.ts`
Expected: FAIL — cannot find module `./challenge.js`.

- [ ] **Step 3: Write the schema**

`src/schema/challenge.ts`:
```typescript
import { Schema } from "effect";
import { ScorerConfig } from "./scorer.js";

export const ChallengeItem = Schema.Struct({
  prompt: Schema.String,
  scorer: Schema.optional(ScorerConfig),
});
export type ChallengeItem = typeof ChallengeItem.Type;

/**
 * A named, versioned suite — a quiz/exam/certification. Edited by bumping
 * `version`, never by mutating a published version in place. Passes when the
 * fraction of items scored perfect is >= `passThreshold`.
 */
export const Challenge = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  passThreshold: Schema.Number,
  items: Schema.Array(ChallengeItem),
});
export type Challenge = typeof Challenge.Type;
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `npx vitest run src/schema/challenge.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing loader/resolve test**

`src/config/challenges.test.ts`:
```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { resolveChallenge } from "./challenges.js";

const promptEntry = (name: string, hash: string) => ({
  name, category: "x", tier: 1,
  system: { key: "direct", text: "Be concise." },
  promptText: `q-${name}`,
  scorer: { type: "exact_match", expected: "1", extract: "(\\d)" },
  promptHash: hash, tags: [],
}) as unknown as import("../schema/prompt.js").PromptCorpusEntry;

describe("resolveChallenge", () => {
  it("resolves prompt refs, picks item scorer override, stamps challengeHash", () =>
    Effect.runPromise(
      resolveChallenge(
        { id: "c", version: 1, passThreshold: 0.5, items: [
          { prompt: "a", scorer: { type: "constraint", constraints: [] } },
          { prompt: "b" },
        ] },
        [promptEntry("a", "h-a"), promptEntry("b", "h-b")],
      ),
    ).then((r) => {
      expect(r.challengeHash).toHaveLength(12);
      expect(r.items[0].scorer.type).toBe("constraint"); // override wins
      expect(r.items[1].scorer.type).toBe("exact_match"); // falls back to prompt's
    }));

  it("fails when an item references an unknown prompt", () =>
    Effect.runPromise(
      resolveChallenge({ id: "c", version: 1, passThreshold: 0.5, items: [{ prompt: "missing" }] }, []).pipe(
        Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" }),
      ),
    ).then((x) => expect(x).toBe("failed")));
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/config/challenges.test.ts`
Expected: FAIL — cannot find module `./challenges.js`.

- [ ] **Step 7: Write the resolver + loader**

`src/config/challenges.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { Challenge } from "../schema/challenge.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { shortSha256 } from "./hashing.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedItem {
  readonly itemId: string;
  readonly promptHash: string;
  readonly scorer: ScorerConfig;
  readonly prompt: PromptCorpusEntry;
}
export interface ResolvedChallenge {
  readonly id: string;
  readonly version: number;
  readonly passThreshold: number;
  readonly challengeHash: string;
  readonly items: ReadonlyArray<ResolvedItem>;
}

const scorerKey = (s: ScorerConfig): string => JSON.stringify(s);

export const resolveChallenge = (
  challenge: Challenge,
  corpus: ReadonlyArray<PromptCorpusEntry>,
): Effect.Effect<ResolvedChallenge, ConfigError, never> =>
  Effect.gen(function* () {
    const byName = new Map(corpus.map((p) => [p.name, p]));
    const items = yield* Effect.forEach(challenge.items, (item) =>
      Effect.gen(function* () {
        const prompt = byName.get(item.prompt);
        if (prompt === undefined) {
          return yield* Effect.fail(
            new ConfigError({ path: challenge.id, message: `Challenge '${challenge.id}' references unknown prompt '${item.prompt}'.` }),
          );
        }
        const scorer = item.scorer ?? prompt.scorer;
        return { itemId: prompt.name, promptHash: prompt.promptHash, scorer, prompt } satisfies ResolvedItem;
      }),
    );
    const challengeHash = shortSha256(items.map((i) => `${i.promptHash}:${scorerKey(i.scorer)}`).join("|"));
    return { id: challenge.id, version: challenge.version, passThreshold: challenge.passThreshold, challengeHash, items };
  });

export const loadChallenge = (
  path: string,
  corpus: ReadonlyArray<PromptCorpusEntry>,
): Effect.Effect<
  ResolvedChallenge,
  YamlParseError | SchemaDecodeError | ConfigError | PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(Challenge)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "Challenge", cause })),
    );
    return yield* resolveChallenge(decoded, corpus);
  });
```

> Note: confirm the `PromptCorpusEntry` field names (`name`, `promptHash`, `scorer`) against `src/schema/prompt.ts` before implementing; the test fixture above assumes them.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/schema/challenge.test.ts src/config/challenges.test.ts`
Expected: PASS.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/schema/challenge.ts src/schema/challenge.test.ts src/config/challenges.ts src/config/challenges.test.ts
git commit -m "feat(config): Challenge schema + resolver with challengeHash"
```

---

## Task 3: Custom subprocess scorer + shared dispatch

**Files:**
- Modify: `src/schema/scorer.ts` (add `CustomConfig`)
- Create: `src/scoring/custom.ts`
- Create: `src/scoring/dispatch.ts`
- Test: `src/schema/scorer.test.ts` (add case), `src/scoring/custom.test.ts`
- Reference: `src/scoring/code-exec.ts`, `src/scoring/score-result.ts`.

**Interfaces:**
- Consumes: `Command`, `CommandExecutor` from `@effect/platform`; `ScorerConfig` union; `PromptScore` type (shape `{ kind: "prompt"; score: number; details: string }`) — re-export or import from `src/scoring/score-result.js`.
- Produces:
  - `CustomConfig = { type: "custom"; script: string }` added to `ScorerConfig`.
  - `scoreCustom(output: string, scriptPath: string, meta: Record<string, unknown>): Effect<PromptScore, CodeExecTimeout | CodeExecFailed, CommandExecutor>`.
  - `scoreByConfig(output: string, cfg: ScorerConfig): Effect<PromptScore, ScorerNotFound | CodeExecTimeout | CodeExecFailed, CommandExecutor>` — prompt-scorer dispatch reused by `score-result.ts` and `run-challenge.ts`.

- [ ] **Step 1: Add the failing schema test case**

Append to `src/schema/scorer.test.ts`:
```typescript
import { CustomConfig } from "./scorer.js";

describe("CustomConfig", () => {
  it("round-trips", () => {
    const v = { type: "custom" as const, script: "scorers/weird_task.py" };
    expect(roundTrip(CustomConfig, v)).toEqual(v);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/schema/scorer.test.ts`
Expected: FAIL — `CustomConfig` is not exported.

- [ ] **Step 3: Add the union variant**

In `src/schema/scorer.ts`, add before the `ScorerConfig` union and include it:
```typescript
/** Challenge-supplied scorer. `script` is a path to an executable scored via subprocess (§ Scoring). */
export const CustomConfig = Schema.Struct({
  type: Schema.Literal("custom"),
  script: Schema.String,
});
export type CustomConfig = typeof CustomConfig.Type;

export const ScorerConfig = Schema.Union(
  ExactMatchConfig,
  ConstraintConfig,
  CodeExecConfig,
  GameScorerConfig,
  CustomConfig,
);
export type ScorerConfig = typeof ScorerConfig.Type;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/schema/scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing custom-scorer test**

`src/scoring/custom.test.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { scoreCustom } from "./custom.js";

const withScript = (body: string, run: (path: string) => Effect.Effect<unknown, unknown, FileSystem.FileSystem>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const path = `${dir}/scorer.py`;
      yield* fs.writeFileString(path, body);
      return yield* run(path);
    }),
  ).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);

describe("scoreCustom", () => {
  it("returns the score the script prints", () =>
    withScript(
      "import sys, json\nd = json.load(sys.stdin)\nprint(json.dumps({'score': 1.0 if d['output']=='ok' else 0.0}))\n",
      (path) => scoreCustom("ok", path, {}).pipe(Effect.tap((s) => Effect.sync(() => expect(s.score).toBe(1.0)))),
    ));
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/scoring/custom.test.ts`
Expected: FAIL — cannot find module `./custom.js`.

- [ ] **Step 7: Implement the subprocess scorer**

`src/scoring/custom.ts`:
```typescript
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect, Stream } from "effect";
import { CodeExecFailed, CodeExecTimeout } from "../errors/index.js";
import type { PromptScore } from "./score-result.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes);

/**
 * Run a challenge-supplied scorer script. Contract: harness writes
 * `{ output, ...meta }` as JSON to stdin; script prints `{ score, breakdown? }`
 * JSON to stdout. Non-zero exit or unparseable stdout -> CodeExecFailed.
 */
export const scoreCustom = (
  output: string,
  scriptPath: string,
  meta: Record<string, unknown>,
  options: { timeoutMs?: number; pythonBin?: string } = {},
): Effect.Effect<PromptScore, CodeExecTimeout | CodeExecFailed, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pythonBin = options.pythonBin ?? "python3";
    const stdin = JSON.stringify({ output, ...meta });
    const cmd = Command.make(pythonBin, scriptPath).pipe(Command.feed(stdin));

    const collect = Effect.scoped(
      Effect.gen(function* () {
        const process = yield* Command.start(cmd);
        const out = yield* Stream.runCollect(process.stdout).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const err = yield* Stream.runCollect(process.stderr).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const exitCode = yield* process.exitCode;
        return { out, err, exitCode };
      }),
    );

    const raced = yield* Effect.timeout(collect, timeoutMs).pipe(
      Effect.map((ok) => ({ tag: "ok" as const, ...ok })),
      Effect.catchTag("TimeoutException", () => Effect.succeed({ tag: "timeout" as const })),
      Effect.catchAll((cause) => Effect.succeed({ tag: "fail" as const, cause: String(cause) })),
    );

    if (raced.tag === "timeout") return yield* Effect.fail(new CodeExecTimeout({ timeoutSec: timeoutMs / 1000 }));
    if (raced.tag === "fail") return yield* Effect.fail(new CodeExecFailed({ exitCode: -1, stderr: raced.cause }));
    if (raced.exitCode !== 0) return yield* Effect.fail(new CodeExecFailed({ exitCode: raced.exitCode, stderr: raced.err.slice(0, 200) }));

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raced.out) as { score: number; breakdown?: unknown },
      catch: () => new CodeExecFailed({ exitCode: 0, stderr: `unparseable scorer output: ${raced.out.slice(0, 120)}` }),
    });
    const score = Math.max(0, Math.min(1, Number(parsed.score)));
    return { kind: "prompt", score, details: `custom: ${score}` };
  });
```

> `Command.feed(stdin)` supplies stdin; verify the exact helper name in the installed `@effect/platform` (`Command.feed` / `Command.feedString` / `Command.stdin`). `Effect.try({ try, catch })` is **lint-safe** here: `scripts/lint-strict.sh` bans only the literal `try {` block statement and `throw ` statements (via `grep 'try\s*{'` and `grep 'throw '`), neither of which `Effect.try(...)` produces. So the parse block above passes strict lint unchanged.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/scoring/custom.test.ts`
Expected: PASS.

- [ ] **Step 9: Extract shared prompt-scorer dispatch**

`src/scoring/dispatch.ts`:
```typescript
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { type CodeExecFailed, type CodeExecTimeout, ScorerNotFound } from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { scoreCodeExec } from "./code-exec.js";
import { scoreConstraints } from "./constraint.js";
import { scoreCustom } from "./custom.js";
import { scoreExactMatch } from "./exact-match.js";
import type { PromptScore } from "./score-result.js";

/** Dispatch a prompt-style scorer config to its scorer. Game scorers are handled separately. */
export const scoreByConfig = (
  output: string,
  cfg: ScorerConfig,
  meta: Record<string, unknown> = {},
): Effect.Effect<PromptScore, ScorerNotFound | CodeExecTimeout | CodeExecFailed, CommandExecutor.CommandExecutor> => {
  switch (cfg.type) {
    case "exact_match":
      return scoreExactMatch(output, cfg);
    case "constraint":
      return scoreConstraints(output, cfg);
    case "code_exec":
      return scoreCodeExec(output, cfg.testCode);
    case "custom":
      return scoreCustom(output, cfg.script, meta);
    case "game":
      return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
  }
};
```

- [ ] **Step 10: Rewire `score-result.ts` to use the shared dispatch**

In `src/scoring/score-result.ts`, replace the inline `switch (cfg.type)` block (the prompt-entry branch) with a call to `scoreByConfig(result.output, cfg)`. Keep the game-entry branch unchanged. Add `import { scoreByConfig } from "./dispatch.js";`.

- [ ] **Step 11: Run the full scoring test suite**

Run: `npx vitest run src/scoring`
Expected: PASS (existing scorer tests unaffected).

- [ ] **Step 12: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/schema/scorer.ts src/schema/scorer.test.ts src/scoring/custom.ts src/scoring/custom.test.ts src/scoring/dispatch.ts src/scoring/score-result.ts
git commit -m "feat(scoring): custom subprocess scorer + shared prompt-scorer dispatch"
```

---

## Task 4: Attempt result schema

**Files:**
- Create: `src/schema/attempt.ts`
- Test: `src/schema/attempt.test.ts`
- Reference: `src/schema/run-manifest.ts` (reuse `RunEnv`), `src/schema/execution.ts`.

**Interfaces:**
- Consumes: `RunEnv` from `src/schema/run-manifest.js`; `Runtime` from `src/schema/enums.js`.
- Produces:
  - `ItemResult` (one body line): `{ itemId, promptName, promptHash, executedAt, promptTokens, generationTokens, promptTps, generationTps, peakMemoryGb, wallTimeSec, output, reasoning, rawOutput, error, score }`.
  - `AttemptAggregate = { score: number; passed: boolean }`.
  - `AttemptManifest` (header): identity + config denorm + challenge denorm + `env` + `aggregate`.

- [ ] **Step 1: Write the failing test**

`src/schema/attempt.test.ts`:
```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AttemptManifest, ItemResult } from "./attempt.js";

const env = { hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" };

describe("attempt schemas", () => {
  it("decodes an ItemResult", () => {
    const v = {
      itemId: "json-output", promptName: "json-output", promptHash: "abc123abc123",
      executedAt: "2026-06-18T00:00:00.000Z", promptTokens: 10, generationTokens: 20,
      promptTps: 1, generationTps: 2, peakMemoryGb: 0, wallTimeSec: 1.5,
      output: "ok", reasoning: null, rawOutput: "ok", error: null, score: 1,
    };
    expect(Schema.decodeUnknownSync(ItemResult)(v).score).toBe(1);
  });

  it("decodes an AttemptManifest header", () => {
    const v = {
      schemaVersion: 1, attemptId: "att-1", startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: null, interrupted: true,
      configId: "c1", configHash: "cfg123cfg123", artifact: "a", runtime: "mlx",
      quant: "q4-k-m", temperature: 0.7, systemPrompt: "direct", maxTokens: 100,
      challengeId: "ch", challengeVersion: 1, challengeHash: "chh123chh123",
      env, aggregate: { score: 0, passed: false },
    };
    expect(Schema.decodeUnknownSync(AttemptManifest)(v).attemptId).toBe("att-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/schema/attempt.test.ts`
Expected: FAIL — cannot find module `./attempt.js`.

- [ ] **Step 3: Write the schema**

`src/schema/attempt.ts`:
```typescript
import { Schema } from "effect";
import { Runtime } from "./enums.js";
import { RunEnv } from "./run-manifest.js";

/** One challenge item's execution + per-item score. Body line of the attempt archive. */
export const ItemResult = Schema.Struct({
  itemId: Schema.String,
  promptName: Schema.String,
  promptHash: Schema.String,
  executedAt: Schema.String,
  promptTokens: Schema.Number,
  generationTokens: Schema.Number,
  promptTps: Schema.Number,
  generationTps: Schema.Number,
  peakMemoryGb: Schema.Number,
  wallTimeSec: Schema.Number,
  output: Schema.String,
  reasoning: Schema.NullOr(Schema.String),
  rawOutput: Schema.String,
  error: Schema.NullOr(Schema.String),
  score: Schema.Number,
});
export type ItemResult = typeof ItemResult.Type;

export const AttemptAggregate = Schema.Struct({
  score: Schema.Number,
  passed: Schema.Boolean,
});
export type AttemptAggregate = typeof AttemptAggregate.Type;

/**
 * Header of one `(config × challenge)` attempt archive. Config and challenge
 * identity are denormalized; `env` is provenance (incl. harness git sha) and
 * is NOT part of `configHash`. `aggregate` is zeroed at header-write and
 * filled at finalize.
 */
export const AttemptManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  attemptId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
  interrupted: Schema.Boolean,

  configId: Schema.String,
  configHash: Schema.String,
  artifact: Schema.String,
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  systemPrompt: Schema.String,
  maxTokens: Schema.Number,

  challengeId: Schema.String,
  challengeVersion: Schema.Number,
  challengeHash: Schema.String,

  env: RunEnv,
  aggregate: AttemptAggregate,
});
export type AttemptManifest = typeof AttemptManifest.Type;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/schema/attempt.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/schema/attempt.ts src/schema/attempt.test.ts
git commit -m "feat(schema): per-attempt manifest + item result"
```

---

## Task 5: Attempt archive writer

**Files:**
- Create: `src/archive/attempt-writer.ts`
- Test: `src/archive/attempt-writer.test.ts`
- Reference: `src/archive/writer.ts` (JSONL header/append pattern), `src/orchestration/finalize-archive.ts` (head-rewrite pattern).

**Interfaces:**
- Consumes: `FileSystem` from `@effect/platform`; `AttemptManifest`, `ItemResult`, `AttemptAggregate` from `src/schema/attempt.js`; `FileIOError` from `src/errors/io.js` (confirm name against `writer.ts`).
- Produces:
  - `writeAttemptHeader(path, manifest): Effect<void, FileIOError, FileSystem>`
  - `appendItem(path, item): Effect<void, FileIOError, FileSystem>`
  - `finalizeAttempt(path, finishedAt, aggregate): Effect<void, FileIOError, FileSystem>` — rewrites line 1 with `finishedAt`, `interrupted: false`, filled `aggregate`, preserving body bytes.

- [ ] **Step 1: Write the failing round-trip test**

`src/archive/attempt-writer.test.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "./attempt-writer.js";

const env = { hostname: "h", platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" };
const header = {
  schemaVersion: 1 as const, attemptId: "att-1", startedAt: "2026-06-18T00:00:00.000Z",
  finishedAt: null, interrupted: true, configId: "c1", configHash: "cfg123cfg123",
  artifact: "a", runtime: "mlx" as const, temperature: 0.7, systemPrompt: "direct", maxTokens: 100,
  challengeId: "ch", challengeVersion: 1, challengeHash: "chh123chh123",
  env, aggregate: { score: 0, passed: false },
};
const item = {
  itemId: "i", promptName: "i", promptHash: "h", executedAt: "2026-06-18T00:00:01.000Z",
  promptTokens: 1, generationTokens: 2, promptTps: 1, generationTps: 2, peakMemoryGb: 0,
  wallTimeSec: 1, output: "ok", reasoning: null, rawOutput: "ok", error: null, score: 1,
};

describe("attempt-writer", () => {
  it("writes header, appends an item, finalizes aggregate", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const path = `${dir}/att-1.jsonl`;
        yield* writeAttemptHeader(path, header);
        yield* appendItem(path, item);
        yield* finalizeAttempt(path, "2026-06-18T00:00:02.000Z", { score: 1, passed: true });
        const text = yield* fs.readFileString(path);
        const [line1, line2] = text.trim().split("\n");
        const manifest = Schema.decodeUnknownSync(AttemptManifest)(JSON.parse(line1));
        const row = Schema.decodeUnknownSync(ItemResult)(JSON.parse(line2));
        expect(manifest.interrupted).toBe(false);
        expect(manifest.aggregate.passed).toBe(true);
        expect(manifest.finishedAt).toBe("2026-06-18T00:00:02.000Z");
        expect(row.score).toBe(1);
      }),
    ).pipe(Effect.provide(NodeContext.layer), Effect.runPromise));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/archive/attempt-writer.test.ts`
Expected: FAIL — cannot find module `./attempt-writer.js`.

- [ ] **Step 3: Implement the writer**

`src/archive/attempt-writer.ts`:
```typescript
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { AttemptAggregate, AttemptManifest, ItemResult } from "../schema/attempt.js";

const encodeManifest = Schema.encodeSync(AttemptManifest);
const encodeItem = Schema.encodeSync(ItemResult);

export const writeAttemptHeader = (
  path: string,
  manifest: AttemptManifest,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, `${JSON.stringify(encodeManifest(manifest))}\n`);
  });

export const appendItem = (
  path: string,
  item: ItemResult,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, `${JSON.stringify(encodeItem(item))}\n`, { flag: "a" });
  });

/** Rewrite line 1 with finalized fields, preserving body lines byte-for-byte. */
export const finalizeAttempt = (
  path: string,
  finishedAt: string,
  aggregate: AttemptAggregate,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(path);
    const newlineIdx = text.indexOf("\n");
    const headerJson = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
    const body = newlineIdx === -1 ? "" : text.slice(newlineIdx + 1);
    const manifest = Schema.decodeUnknownSync(AttemptManifest)(JSON.parse(headerJson));
    const finalized: AttemptManifest = { ...manifest, finishedAt, interrupted: false, aggregate };
    yield* fs.writeFileString(path, `${JSON.stringify(encodeManifest(finalized))}\n${body}`);
  });
```

> Note: `writer.ts` may wrap `PlatformError` into a domain `FileIOError`. If so, mirror that mapping here for consistency; the test only checks the on-disk bytes, so either error type passes. Confirm the append API: this plan uses `fs.writeFileString(path, line, { flag: "a" })`; if `writer.ts` uses a different append mechanism (e.g. `fs.open` + `Sink`), follow that instead.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/archive/attempt-writer.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/archive/attempt-writer.ts src/archive/attempt-writer.test.ts
git commit -m "feat(archive): per-attempt JSONL writer + finalize trailer"
```

---

## Task 6: Source the system prompt from the configuration in run-prompt

**Files:**
- Modify: `src/orchestration/run-prompt.ts` (add `systemPrompt` to `RunPromptInput`; `toCompletionParams` reads it)
- Test: `src/orchestration/__tests__/run-prompt.test.ts` (add/adjust — confirm existing test file path first)
- Reference: extracted `RunPromptInput` (lines 28-44) and `toCompletionParams` (lines 226-235).

**Interfaces:**
- Consumes: existing `RunPromptInput`.
- Produces: `RunPromptInput` gains `readonly systemPrompt: string`. `toCompletionParams` uses `input.systemPrompt` instead of `input.prompt.system.text`. All existing callers must pass `systemPrompt` (the current `run-loop`/`phases` callers pass `input.prompt.system.text` to preserve behavior).

- [ ] **Step 1: Add `systemPrompt` to the input type**

In `src/orchestration/run-prompt.ts`, add to `RunPromptInput`:
```typescript
  readonly systemPrompt: string;
```

- [ ] **Step 2: Read it in `toCompletionParams`**

Change the `systemPrompt` line in `toCompletionParams`:
```typescript
  systemPrompt: input.systemPrompt,
```

- [ ] **Step 3: Fix existing callers to preserve current behavior**

In every existing place that builds a `RunPromptInput` (search: `grep -rn "prompt:" src/orchestration/phases.ts src/orchestration/run-prompt.ts`), add `systemPrompt: <entry>.system.text` alongside `prompt: <entry>`. This keeps the legacy prompt-phase path behaving exactly as before (system prompt still comes from the prompt there).

- [ ] **Step 4: Run the orchestration tests**

Run: `npx vitest run src/orchestration`
Expected: PASS — behavior unchanged for existing callers.

- [ ] **Step 5: Typecheck (catches any missed caller), lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/orchestration/run-prompt.ts src/orchestration/phases.ts
git commit -m "refactor(orchestration): run-prompt takes explicit systemPrompt"
```

---

## Task 7: `runChallenge` orchestrator

**Files:**
- Create: `src/orchestration/run-challenge.ts`
- Test: `src/orchestration/__tests__/run-challenge.test.ts`
- Reference: `src/orchestration/run-model.ts` (server scope + finalizer pattern), `src/cli/deps.ts` (`makeLlmServerFactory`), `src/orchestration/run-prompt.ts`, `src/scoring/dispatch.ts`, `src/archive/attempt-writer.ts`.

**Interfaces:**
- Consumes: `ResolvedConfiguration`; `ResolvedChallenge`; `runPrompt` + `RunPromptInput`; `scoreByConfig`; `writeAttemptHeader`/`appendItem`/`finalizeAttempt`; `RunModelDeps` (uses `.llmServer: LlmServerFactory`, `(model: ModelConfig) => Effect<ServerHandle, unknown, CommandExecutor | HttpClient | Scope>`); `ChatCompletion` is required in the environment and provided by the caller, not constructed here; `RunEnv` is passed in (built by `defaultRunEnv()` in submit.ts).
- Produces:
  - `aggregate(items: ReadonlyArray<{ score: number }>, passThreshold: number): AttemptAggregate` — `score = (# items with score === 1) / items.length`; `passed = score >= passThreshold`; empty items → `{ score: 0, passed: false }`.
  - `runChallenge(input): Effect<AttemptManifest, …, FileSystem | CommandExecutor | …>` where `input = { config: ResolvedConfiguration; challenge: ResolvedChallenge; attemptId: string; archivePath: string; env: RunEnv; deps: RunDeps }`.

- [ ] **Step 1: Write the failing aggregate test (pure)**

`src/orchestration/__tests__/run-challenge.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { aggregate } from "../run-challenge.js";

describe("aggregate", () => {
  it("passes when perfect-score fraction meets threshold", () => {
    expect(aggregate([{ score: 1 }, { score: 1 }, { score: 0 }], 0.6)).toEqual({ score: 2 / 3, passed: true });
  });
  it("fails below threshold and handles empty", () => {
    expect(aggregate([{ score: 0.9 }], 0.8)).toEqual({ score: 0, passed: false }); // partial credit is not a pass
    expect(aggregate([], 0.5)).toEqual({ score: 0, passed: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-challenge.test.ts`
Expected: FAIL — cannot find module `../run-challenge.js`.

- [ ] **Step 3: Implement `aggregate` + `runChallenge`**

`src/orchestration/run-challenge.ts`:
```typescript
import type { CommandExecutor, FileSystem, HttpClient } from "@effect/platform";
import { Clock, Effect } from "effect";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "../archive/attempt-writer.js";
import type { ResolvedChallenge } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import { scoreByConfig } from "../scoring/dispatch.js";
import type { AttemptAggregate, AttemptManifest, ItemResult } from "../schema/attempt.js";
import type { ModelConfig } from "../schema/model.js";
import type { RunEnv } from "../schema/run-manifest.js";
import type { RunModelDeps } from "./run-model.js";
import { runPrompt, type RunPromptInput } from "./run-prompt.js";

export const aggregate = (
  items: ReadonlyArray<{ score: number }>,
  passThreshold: number,
): AttemptAggregate => {
  if (items.length === 0) return { score: 0, passed: false };
  const perfect = items.filter((i) => i.score === 1).length;
  const score = perfect / items.length;
  return { score, passed: score >= passThreshold };
};

export interface RunChallengeInput {
  readonly config: ResolvedConfiguration;
  readonly challenge: ResolvedChallenge;
  readonly attemptId: string;
  readonly archivePath: string;
  readonly env: RunEnv;
  /** Same deps bundle run.ts builds via makeRunDeps; only `.llmServer` is used here. */
  readonly deps: RunModelDeps;
}

/** Build the existing ModelConfig shape the LLM-server factory + run-prompt expect. */
const modelFromConfig = (c: ResolvedConfiguration): ModelConfig => ({
  artifact: c.artifact,
  runtime: c.runtime,
  name: c.id,
  quant: c.quant,
  ctxSize: c.ctxSize,
  temperature: c.temperature,
});

const baseHeader = (input: RunChallengeInput, startedAt: string): AttemptManifest => ({
  schemaVersion: 1,
  attemptId: input.attemptId,
  startedAt,
  finishedAt: null,
  interrupted: true,
  configId: input.config.id,
  configHash: input.config.configHash,
  artifact: input.config.artifact,
  runtime: input.config.runtime,
  quant: input.config.quant,
  temperature: input.config.temperature,
  systemPrompt: input.config.systemPrompt,
  maxTokens: input.config.maxTokens,
  challengeId: input.challenge.id,
  challengeVersion: input.challenge.version,
  challengeHash: input.challenge.challengeHash,
  env: input.env,
  aggregate: { score: 0, passed: false },
});
```

> **Server wiring:** `deps.llmServer(model)` (the existing `LlmServerFactory` from `run-model.ts:70`) acquires the llama.cpp/MLX server **within this scope** and keeps it alive for the duration. `ChatCompletion` is a *separate* service provided as a layer by the caller (submit.ts), exactly as `run.ts` does for `runLoop` — `runChallenge` only lists `ChatCompletion` in its environment, it does not construct it (see `run-model.ts:236-241` + the `ChatCompletion` requirement in `runModel`'s signature at line 203). The fixed-port `ChatCompletion` client talks to whichever server is alive in scope. Then implement the body:

```typescript
export const runChallenge = (
  input: RunChallengeInput,
): Effect.Effect<
  AttemptManifest,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const startedMs = yield* Clock.currentTimeMillis;
      const header = baseHeader(input, new Date(startedMs).toISOString());
      yield* writeAttemptHeader(input.archivePath, header);

      // Keep the LLM server alive in this scope; the caller-provided ChatCompletion
      // talks to it on the fixed runtime port. A server that won't boot is a hard
      // failure for a single submit -> orDie surfaces it as a CLI defect.
      yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);

      const scored: ItemResult[] = [];
      for (const item of input.challenge.items) {
        const promptInput: RunPromptInput = {
          archiveId: input.attemptId,
          runId: input.attemptId,
          model: modelFromConfig(input.config),
          prompt: item.prompt,
          systemPrompt: input.config.systemPromptText,
          temperature: input.config.temperature,
          maxTokens: input.config.maxTokens,
        };
        const exec = yield* runPrompt(promptInput);
        const scoreResult = yield* scoreByConfig(exec.output, item.scorer, { promptName: item.itemId });
        const row: ItemResult = {
          itemId: item.itemId,
          promptName: item.itemId,
          promptHash: item.promptHash,
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
        };
        yield* appendItem(input.archivePath, row);
        scored.push(row);
      }

      const agg = aggregate(scored, input.challenge.passThreshold);
      const finishedMs = yield* Clock.currentTimeMillis;
      const finishedAt = new Date(finishedMs).toISOString();
      yield* finalizeAttempt(input.archivePath, finishedAt, agg);
      return { ...header, finishedAt, interrupted: false, aggregate: agg };
    }),
  );
```

> The aggregate unit test (Step 1) is the gate for this task. End-to-end server/ChatCompletion wiring is exercised by the smoke test in Task 9 (with a fake `ChatCompletion` layer), not by a unit test here. `modelFromConfig` produces the real `ModelConfig` shape — no casts needed; verify its field names against `src/schema/model.ts`.

- [ ] **Step 4: Run the aggregate test**

Run: `npx vitest run src/orchestration/__tests__/run-challenge.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge.test.ts
git commit -m "feat(orchestration): runChallenge — submit one config to one challenge"
```

---

## Task 8: `./bench submit` CLI command

**Files:**
- Create: `src/cli/commands/submit.ts`
- Modify: `src/cli/main.ts` (register `submitCommand`)
- Create fixtures: `configs.yaml`, `challenges/smoke.yaml`
- Reference: `src/cli/commands/run.ts` (loaders + deps + env build + `Command.make`), `src/cli/commands/list.ts` (option/layer pattern), `src/cli/deps.ts`, `src/cli/paths.ts`.

**Interfaces:**
- Consumes: `loadConfigurations`, `loadChallenge`, `loadPromptCorpus` + `registryLayer`, `loadSystemPrompts` + `SystemPromptRegistry`, `makeRunDeps` (returns `RunModelDeps` with a `.llmServer` factory), `defaultRunEnv` (from `orchestration/run-loop.ts`), `runChallenge`.
- Produces: `submitCommand` (an `@effect/cli` `Command`) selecting one config id + one challenge file, running `runChallenge`, printing the aggregate.

- [ ] **Step 1: Add the fixtures**

`configs.yaml`:
```yaml
- id: smoke-config
  artifact: Qwen/Qwen2.5-0.5B-Instruct-GGUF
  runtime: llamacpp
  quant: q4-k-m
  temperature: 0.0
  systemPrompt: direct
  maxTokens: 128
```

`challenges/smoke.yaml`:
```yaml
id: smoke
version: 1
passThreshold: 0.5
items:
  - prompt: <pick an existing prompt name from `./bench list-prompts`>
```

> Replace the `prompt:` placeholder with a real prompt name from the existing corpus (run `./bench list-prompts`). Pick one with a cheap scorer (exact_match or constraint).

- [ ] **Step 2: Write the command**

`src/cli/commands/submit.ts`:
```typescript
import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { loadChallenge } from "../../config/challenges.js";
import { loadConfigurations } from "../../config/configurations.js";
import { loadPromptCorpus, registryLayer } from "../../config/prompt-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { runChallenge } from "../../orchestration/run-challenge.js";
import { defaultRunEnv } from "../../orchestration/run-loop.js";
import { makeRunDeps } from "../deps.js";
import { systemPromptsPath } from "../paths.js";

// printLine is a local helper in list.ts/score.ts (not shared) — copy it verbatim:
const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

const configOpt = Options.text("config").pipe(Options.withDescription("Configuration id from configs.yaml"));
const challengeOpt = Options.file("challenge").pipe(Options.withDescription("Path to a challenge YAML"));
const promptsDirOpt = Options.directory("prompts-dir").pipe(Options.withDefault("prompts"));
const configsFileOpt = Options.file("configs-file").pipe(Options.withDefault("configs.yaml"));
const archiveDirOpt = Options.directory("archive-dir").pipe(Options.withDefault("benchmark-archive"));

export const submitCommand = Command.make(
  "submit",
  { config: configOpt, challenge: challengeOpt, promptsDir: promptsDirOpt, configsFile: configsFileOpt, archiveDir: archiveDirOpt },
  ({ config, challenge, promptsDir, configsFile, archiveDir }) =>
    Effect.gen(function* () {
      const systemPrompts = yield* loadSystemPrompts(systemPromptsPath(promptsDir));
      const corpus = yield* loadPromptCorpus(promptsDir).pipe(Effect.provide(registryLayer(promptsDir)));
      const configs = yield* loadConfigurations(configsFile).pipe(
        Effect.provideService(SystemPromptRegistry, systemPrompts),
      );
      const cfg = configs.find((c) => c.id === config);
      if (cfg === undefined) return yield* Effect.dieMessage(`Unknown config id '${config}'`);
      const resolved = yield* loadChallenge(challenge, corpus);

      // attemptId: deterministic-ish without Date.now in lib code — build from clock in the handler (cli may use Date).
      const attemptId = `att-${cfg.configHash}-${resolved.challengeHash}-${Date.now()}`;
      const archivePath = `${archiveDir}/${attemptId}.jsonl`;

      const env = defaultRunEnv(); // RunEnv builder exported from orchestration/run-loop.ts
      const deps = makeRunDeps({});

      const manifest = yield* runChallenge({ config: cfg, challenge: resolved, attemptId, archivePath, env, deps });

      yield* printLine(`submit: ${cfg.id} × ${resolved.id}@${resolved.version} → score ${manifest.aggregate.score.toFixed(2)} ${manifest.aggregate.passed ? "PASS" : "FAIL"}`);
    }).pipe(Effect.provide(/* same layer stack run.ts provides to runLoop: ChatCompletion + HttpClient + logger */ runtimeLayers)),
).pipe(Command.withDescription("Submit one configuration to one challenge"));
```

> This handler lives under `src/cli/`, so `Date.now()`, `console.*`, and `try`/`throw` are allowed here (the lint ban is `src/` minus `cli`). **`runtimeLayers`** is the one piece to graft from `run.ts`: `runChallenge` requires `ChatCompletion` (and `HttpClient`) in its environment, so submit.ts must `Effect.provide` the *same* layer stack `run.ts` builds and provides around its `runLoop` call (the `ChatCompletion` layer + `HttpClient` + logger). Locate that provision in `run.ts` and reuse it verbatim; `NodeContext.layer` (CommandExecutor + FileSystem) is already provided at the root in `main.ts`. Confirm `Options.file`/`Options.directory`/`Options.text` names against `run.ts`'s option definitions.

- [ ] **Step 3: Register in `main.ts`**

In `src/cli/main.ts`, import `submitCommand` and add it to `Command.withSubcommands([...])`.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Sanity-check the command is wired**

Run: `./bench submit --help`
Expected: usage text listing `--config`, `--challenge`, `--prompts-dir`, `--configs-file`, `--archive-dir`.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/submit.ts src/cli/main.ts configs.yaml challenges/smoke.yaml
git commit -m "feat(cli): ./bench submit — run one config against one challenge"
```

---

## Task 9: End-to-end smoke verification

**Files:**
- Create: `src/__tests__/submit-smoke.test.ts` (mirrors `src/__tests__/integration-smoke.test.ts` — confirm its structure first)
- Reference: `src/__tests__/integration-smoke.test.ts`.

**Interfaces:**
- Consumes: everything above. This task produces no new production code — it is the gate that proves the slice runs.

- [ ] **Step 1: Decide the smoke strategy**

Read `src/__tests__/integration-smoke.test.ts`. If it stubs the LLM (no live server), mirror that stubbing for `runChallenge` (provide a fake `ChatCompletion` layer that returns a canned completion). If it requires a live runtime and is gated/skipped in CI, mark this smoke test the same way (`it.skip` unless an env flag is set).

- [ ] **Step 2: Write the smoke test**

```typescript
import { describe, expect, it } from "vitest";
import { aggregate } from "../orchestration/run-challenge.js";
// + imports to build a ResolvedConfiguration, ResolvedChallenge, fake ChatCompletion layer

describe("submit slice", () => {
  it("runs a config against a 1-item challenge and writes a finalized archive", async () => {
    // 1. build a ResolvedConfiguration + a ResolvedChallenge with one exact_match item
    // 2. provide a fake ChatCompletion layer returning the expected answer
    // 3. run runChallenge to a temp archive path
    // 4. read line 1 → AttemptManifest: interrupted === false, aggregate.passed === true
    // 5. read line 2 → ItemResult: score === 1
    expect(aggregate([{ score: 1 }], 0.5)).toEqual({ score: 1, passed: true });
  });
});
```

> Fill in steps 1–5 with the same fake-ChatCompletion pattern the existing integration-smoke test uses. The `aggregate` assertion is a placeholder so the file is runnable before the live wiring lands; replace it with the real archive assertions once the fake layer is wired.

- [ ] **Step 3: Run the smoke test**

Run: `npx vitest run src/__tests__/submit-smoke.test.ts`
Expected: PASS.

- [ ] **Step 4: Full suite + manual run**

```bash
npm test
```
Then, if a small model is available locally, a real end-to-end check:
```bash
./bench submit --config smoke-config --challenge challenges/smoke.yaml --archive-dir /tmp/submit-smoke
```
Expected: prints `submit: smoke-config × smoke@1 → score X.XX PASS|FAIL` and writes `/tmp/submit-smoke/att-*.jsonl` with a finalized header (`interrupted: false`) and one item line.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/submit-smoke.test.ts
git commit -m "test: end-to-end smoke for ./bench submit slice"
```

---

## Self-review notes (for the implementer)

- **Spec ↔ field-name drift:** the design spec sketches scorer configs as `{ kind: ... }`; the real union (and this plan) use `{ type: ... }`. Use `type`.
- **Hashes are 12-char SHA-256 prefixes** everywhere (`configHash`, `challengeHash`, `promptHash`). Don't widen.
- **`env` is provenance, never part of `configHash`.** `configHash` covers only `{ artifact, runtime, quant, temperature, maxTokens, systemPromptText }`.
- **Scenario items are out of scope for this slice.** `ItemResult` is prompt-only; challenges referencing scenarios are a later phase.
- **Server/ChatCompletion wiring is the one genuinely fiddly part** (Tasks 7–8): copy the scoped acquire + layer-provision from `run-model.ts` verbatim rather than improvising. Several steps flag `as never`/placeholder casts to remove once that shape is grafted in.
- **The report/webapp is untouched** in Phase 0–1 — it still reads the legacy archives. The two-score webapp model (pass rate + efficiency score) lands in Phase 3.
