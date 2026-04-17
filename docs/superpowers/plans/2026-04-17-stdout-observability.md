# Stdout Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the silent `./bench run` hot path into an informative stderr stream (per-prompt / per-scenario progress, phase boundaries, end-of-run summary) with a `--verbose` flag that adds intra-call detail, while keeping stdout machine-readable.

**Architecture:** One new logger layer in `src/cli/logger.ts` writes a compact formatted line to stderr at a minimum level controlled by `--verbose`. Hot-path modules (supervisor, phases, chat-completion, cache, admiral, sse, session, watchdog) gain `Effect.logInfo` / `Effect.logDebug` calls. A new `src/orchestration/summary.ts` aggregates per-model perf (slowest-3, token-weighted averages) and formats the end-of-model stderr block plus cross-model roll-up. The existing `console.log` end-of-run record in `src/cli/commands/run.ts` is extended with `wall`, `genTps`, and `archive` fields.

**Tech Stack:** TypeScript 5, Effect-TS (`effect`, `@effect/cli`, `@effect/platform`), Vitest.

**Spec:** `docs/superpowers/specs/2026-04-17-stdout-observability-design.md`.

---

## Shared patterns (applies to every task that writes tests)

Tests use **Vitest** with Effect programs executed via `Effect.runPromise` / `Effect.runPromiseExit`. Logs are captured with a test Logger sink — this plan introduces the helper in Task 2, and every later test that asserts log output reuses it.

Tests live beside the source file (`foo.ts` → `foo.test.ts`) except CLI integration tests which live in `src/cli/__tests__/` and orchestration integration tests which live in `src/orchestration/__tests__/`.

After each task's tests pass, run the full suite before committing:

```bash
npm run typecheck && npm run lint && npm run test
```

Task commits follow the existing convention: imperative subject line, tagged prefix (`feat:`, `test:`, `refactor:`).

---

## File Structure

**New files:**
- `src/cli/logger.ts` — formatter, `makeLoggerLayer(verbose: boolean)` factory.
- `src/cli/__tests__/logger.test.ts` — formatter tests.
- `src/cli/__tests__/log-capture.ts` — shared test helper: a `Logger` sink that appends formatted lines to an in-memory array.
- `src/orchestration/summary.ts` — `ModelAggregate` type + `emptyAggregate`, `recordPrompt`, `recordScenario`, `averageGenTps`, `averagePromptTps`, `slowest3`, `formatModelBlock`, `formatCrossModelRollup`.
- `src/orchestration/__tests__/summary.test.ts` — aggregator + formatter tests.
- `src/orchestration/__tests__/phases-logging.test.ts` — per-prompt / per-scenario log-line assertions.
- `src/cli/__tests__/run-stdout-record.test.ts` — stdout record format test.

**Modified files:**
- `src/cli/main.ts` — nothing meaningful (logger is wired per-subcommand).
- `src/cli/commands/run-options.ts` — add `verbose` option.
- `src/cli/commands/run.ts` — provide logger layer; extend stdout record.
- `src/cli/commands/report.ts`, `src/cli/commands/migrate.ts`, `src/cli/commands/score.ts`, `src/cli/commands/list.ts` — add shared `--verbose` option + provide logger layer (minimal: one line each).
- `src/orchestration/run-loop.ts` — per-model entry log; cross-model roll-up.
- `src/orchestration/run-model.ts` — annotation scope + summary emission.
- `src/orchestration/phases.ts` — per-prompt/per-scenario Info logs; aggregator threading.
- `src/orchestration/cache.ts` — Debug cache-scan logs.
- `src/llm/servers/supervisor.ts` — Info/Debug supervisor logs.
- `src/llm/servers/health.ts` — Debug poll logs.
- `src/llm/chat-completion.ts` — Debug request/response logs.
- `src/game/admiral/server.ts` — Info admiral logs.
- `src/game/admiral/sse.ts` — Debug SSE event logs.
- `src/game/session/run-session.ts` — Debug session-boundary logs.
- `src/game/session/watchdog.ts` — Debug watchdog tick logs.

---

### Task 1: Logger formatter + layer

**Goal:** A `makeLoggerLayer(verbose)` function that returns a `Layer` providing a custom-formatted logger writing to stderr, with minimum level `Info` (default) or `Debug` (when `verbose` is true).

**Files:**
- Create: `src/cli/logger.ts`
- Test: `src/cli/__tests__/logger.test.ts`

- [ ] **Step 1: Write the failing formatter test**

Create `src/cli/__tests__/logger.test.ts`:

```typescript
import { Cause, Effect, FiberId, FiberRefs, HashMap, List, LogLevel, LogSpan, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { formatLogLine } from "../logger.js";

const makeOptions = (args: {
  message: string;
  level: LogLevel.LogLevel;
  annotations?: ReadonlyArray<readonly [string, unknown]>;
  date?: Date;
}): Logger.Logger.Options<unknown> => ({
  fiberId: FiberId.none,
  logLevel: args.level,
  message: args.message,
  cause: Cause.empty,
  context: FiberRefs.unsafeMake(new Map()),
  spans: List.empty<LogSpan.LogSpan>(),
  annotations: HashMap.fromIterable(args.annotations ?? []),
  date: args.date ?? new Date("2026-04-17T15:07:42.000Z"),
});

describe("formatLogLine", () => {
  it("renders HH:MM:SS level scope | message with annotations", () => {
    const line = formatLogLine(
      makeOptions({
        message: "prompt 3/40 code_4 @0.7 → 127 gen tok, 18.3 tps gen, 142 tps prompt, 6.9s",
        level: LogLevel.Info,
        annotations: [
          ["scope", "prompt"],
          ["model", "qwen3.5-9b"],
          ["runtime", "mlx"],
        ],
      }),
    );
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} INF prompt \| prompt 3\/40 code_4 @0.7/);
    expect(line).toContain("model=qwen3.5-9b");
    expect(line).toContain("runtime=mlx");
    expect(line).not.toContain("scope="); // scope is consumed into the prefix
  });

  it("uses DBG/WRN/ERR for non-info levels", () => {
    const dbg = formatLogLine(makeOptions({ message: "x", level: LogLevel.Debug }));
    const wrn = formatLogLine(makeOptions({ message: "x", level: LogLevel.Warning }));
    const err = formatLogLine(makeOptions({ message: "x", level: LogLevel.Error }));
    expect(dbg).toContain(" DBG ");
    expect(wrn).toContain(" WRN ");
    expect(err).toContain(" ERR ");
  });

  it("falls back to 'app' scope when the scope annotation is missing", () => {
    const line = formatLogLine(makeOptions({ message: "hello", level: LogLevel.Info }));
    expect(line).toMatch(/INF app \| hello$/);
  });

  it("escapes annotation values containing spaces by quoting", () => {
    const line = formatLogLine(
      makeOptions({
        message: "m",
        level: LogLevel.Info,
        annotations: [["note", "has spaces"]],
      }),
    );
    expect(line).toContain(`note="has spaces"`);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails (module doesn't exist)**

Run: `npm run test -- --run src/cli/__tests__/logger.test.ts`
Expected: FAIL with "Cannot find module '../logger.js'".

- [ ] **Step 3: Implement `src/cli/logger.ts`**

```typescript
/**
 * Custom logger for llm-bench. Writes a compact one-line format to stderr at
 * a minimum level controlled by the `--verbose` flag. See
 * `docs/superpowers/specs/2026-04-17-stdout-observability-design.md` for the
 * format contract.
 *
 * Allowed to use `console.error` — this module lives under `src/cli/` which
 * `scripts/lint-strict.sh` whitelists.
 */
import { HashMap, type Layer, LogLevel, Logger } from "effect";

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const formatTimestamp = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

const LEVEL_TAG: Record<string, string> = {
  All: "ALL",
  Fatal: "FTL",
  Error: "ERR",
  Warning: "WRN",
  Info: "INF",
  Debug: "DBG",
  Trace: "TRC",
  None: "NON",
};

const levelTag = (level: LogLevel.LogLevel): string => LEVEL_TAG[level._tag] ?? level._tag;

const stringifyAnnotation = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const renderAnnotation = (key: string, value: unknown): string => {
  const str = stringifyAnnotation(value);
  if (/[\s"=]/.test(str)) {
    return `${key}="${str.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${str}`;
};

/**
 * Exposed for testing. The real logger (below) formats each log entry with
 * this function and writes to stderr.
 *
 * Recognized special annotation: `scope` is consumed into the prefix (it
 * controls the `scope | ` section before the message). Everything else is
 * appended as ` k=v` after the message.
 */
export const formatLogLine = (options: Logger.Logger.Options<unknown>): string => {
  const ts = formatTimestamp(options.date);
  const tag = levelTag(options.logLevel);
  const annotationEntries = Array.from(HashMap.entries(options.annotations));
  const scopeEntry = annotationEntries.find(([k]) => k === "scope");
  const scope = scopeEntry !== undefined ? stringifyAnnotation(scopeEntry[1]) : "app";
  const remaining = annotationEntries
    .filter(([k]) => k !== "scope")
    .map(([k, v]) => renderAnnotation(k, v))
    .join(" ");
  const message = typeof options.message === "string" ? options.message : String(options.message);
  const suffix = remaining.length > 0 ? ` ${remaining}` : "";
  return `${ts} ${tag} ${scope} | ${message}${suffix}`;
};

const stderrLogger = Logger.make<unknown, void>((options) => {
  // Writing to stderr via console.error. The `lint-strict.sh` allowlist
  // permits this inside `src/cli/`.
  console.error(formatLogLine(options));
});

/**
 * Build a logger layer that replaces the default logger with our compact
 * stderr formatter and sets the minimum log level based on `verbose`.
 *
 * Unset → `LogLevel.Info`. Set → `LogLevel.Debug`.
 */
export const makeLoggerLayer = (
  verbose: boolean,
): Layer.Layer<never> => {
  const replace = Logger.replace(Logger.defaultLogger, stderrLogger);
  const minLevel = Logger.minimumLogLevel(verbose ? LogLevel.Debug : LogLevel.Info);
  return Layer.merge(replace, minLevel);
};
```

Also add the `Layer` import at the top-level: the snippet already re-imports from `effect` — verify the final file only imports `HashMap`, `Layer`, `LogLevel`, `Logger` from `effect`.

- [ ] **Step 4: Run test — confirm it passes**

Run: `npm run test -- --run src/cli/__tests__/logger.test.ts`
Expected: all 4 cases pass.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/cli/logger.ts src/cli/__tests__/logger.test.ts
git commit -m "$(cat <<'EOF'
feat(logger): add compact stderr formatter + layer factory

New makeLoggerLayer(verbose) returns a Layer that replaces Effect's
default logger with a compact "HH:MM:SS LVL scope | message k=v"
format written to stderr, gated by LogLevel.Info (default) or
LogLevel.Debug (verbose). The `scope` annotation is consumed into
the prefix; other annotations render as trailing k=v pairs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared `--verbose` option + log-capture test helper + wire into all subcommands

**Goal:** Expose `--verbose` / `-v` on every subcommand and provide the logger layer around each handler. Add a reusable test helper that captures log output into an in-memory array.

**Files:**
- Create: `src/cli/__tests__/log-capture.ts`
- Modify: `src/cli/commands/run-options.ts`
- Modify: `src/cli/commands/run.ts`
- Modify: `src/cli/commands/report.ts`
- Modify: `src/cli/commands/migrate.ts`
- Modify: `src/cli/commands/score.ts`
- Modify: `src/cli/commands/list.ts`

- [ ] **Step 1: Create `src/cli/__tests__/log-capture.ts`**

```typescript
/**
 * Test helper: build a `Layer` that replaces the default logger with one
 * that writes each formatted line into a caller-supplied array. Combined with
 * `Logger.minimumLogLevel`, it lets tests assert the log stream at arbitrary
 * levels without touching stderr.
 */
import { type Layer, LogLevel, Logger } from "effect";
import { formatLogLine } from "../logger.js";

export const captureLogs = (
  sink: Array<string>,
  minLevel: LogLevel.LogLevel = LogLevel.Debug,
): Layer.Layer<never> => {
  const capture = Logger.make<unknown, void>((options) => {
    sink.push(formatLogLine(options));
  });
  const replace = Logger.replace(Logger.defaultLogger, capture);
  const min = Logger.minimumLogLevel(minLevel);
  return Layer.merge(replace, min);
};
```

(Imports — add `Layer` from `effect` at the top.)

- [ ] **Step 2: Add `verbose` option to `run-options.ts`**

In `src/cli/commands/run-options.ts`, append after `gameServerBinary`:

```typescript
export const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
  Options.withDefault(false),
);
```

Add `verbose` to the `runOptions` export object.

Also add to the `RunOptionsParsed` type in `src/cli/commands/run.ts` (insert after `gameServerBinary`):

```typescript
  readonly verbose: boolean;
```

- [ ] **Step 3: Provide the logger layer from `runCommand`**

In `src/cli/commands/run.ts`, change the handler's `.pipe(Effect.provide(ChatCompletionLive), Effect.provide(FetchHttpClient.layer))` tail to also provide the logger layer. Update the imports and the handler:

```typescript
import { makeLoggerLayer } from "../logger.js";
// ...existing imports

export const runCommand = Command.make("run", runOptions, (raw) =>
  Effect.gen(function* () {
    const parsed = raw as unknown as RunOptionsParsed;
    // ...existing body unchanged...
  }).pipe(
    Effect.provide(ChatCompletionLive),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(makeLoggerLayer((raw as unknown as RunOptionsParsed).verbose)),
  ),
).pipe(Command.withDescription("Run the benchmark suite against configured models"));
```

- [ ] **Step 4: Add `verbose` to every other subcommand**

For `src/cli/commands/report.ts`, `migrate.ts`, `score.ts`, `list.ts` — each currently exposes its own `Options.*` bag. For each:

- Define a local `const verbose = Options.boolean("verbose").pipe(Options.withAlias("v"), Options.withDefault(false));`
- Include it in the command's options record.
- Call `.pipe(Effect.provide(makeLoggerLayer(args.verbose)))` at the tail of the handler.

Example for `report.ts` — change the `Command.make("report", { archiveDir, scoring, output, promptsDir }, ...)` call:

```typescript
import { makeLoggerLayer } from "../logger.js";

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
);

export const reportCommand = Command.make(
  "report",
  { archiveDir, scoring, output, promptsDir, verbose },
  (args) =>
    Effect.gen(function* () {
      // ...existing body, reads args.archiveDir / args.scoring / args.output / args.promptsDir
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(Command.withDescription("Generate webapp report data from archive files"));
```

Repeat the same pattern for `migrate.ts`, `score.ts`, and the `listModelsCommand` / `listPromptsCommand` in `list.ts`.

- [ ] **Step 5: Write the wiring test**

Append a new test file `src/cli/__tests__/logger-wiring.test.ts`:

```typescript
import { Effect, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "./log-capture.js";

describe("log capture helper", () => {
  it("captures info lines above the min level", async () => {
    const sink: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo("hello").pipe(Effect.annotateLogs("scope", "test"));
        yield* Effect.logDebug("hidden").pipe(Effect.annotateLogs("scope", "test"));
      }).pipe(Effect.provide(captureLogs(sink, LogLevel.Info))),
    );
    expect(sink.length).toBe(1);
    expect(sink[0]).toContain("INF test | hello");
  });

  it("captures debug when min level is debug", async () => {
    const sink: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo("hello").pipe(Effect.annotateLogs("scope", "test"));
        yield* Effect.logDebug("detail").pipe(Effect.annotateLogs("scope", "test"));
      }).pipe(Effect.provide(captureLogs(sink, LogLevel.Debug))),
    );
    expect(sink.length).toBe(2);
    expect(sink[1]).toContain("DBG test | detail");
  });
});
```

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/cli/`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/run-options.ts src/cli/commands/run.ts src/cli/commands/report.ts src/cli/commands/migrate.ts src/cli/commands/score.ts src/cli/commands/list.ts src/cli/__tests__/log-capture.ts src/cli/__tests__/logger-wiring.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --verbose/-v flag + provide logger layer per subcommand

Each subcommand now accepts --verbose and wraps its handler in the
logger layer. A shared captureLogs test helper in
src/cli/__tests__/log-capture.ts lets later tests assert the log
stream at arbitrary minimum levels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Annotation boundaries in run-loop / run-model / phases

**Goal:** Attach `model`, `runtime`, `quant`, `runId`, `phase` annotations at scope boundaries so every downstream log carries them.

**Files:**
- Modify: `src/orchestration/run-loop.ts`
- Modify: `src/orchestration/run-model.ts`
- Modify: `src/orchestration/phases.ts`

- [ ] **Step 1: Write the failing test**

Create `src/orchestration/__tests__/annotations.test.ts`:

```typescript
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import type { RunLoopConfig } from "../run-loop.js";
import { runLoop } from "../run-loop.js";
import { makeFakeDeps } from "./fakes.js";

describe("annotations", () => {
  it("per-model log carries model/runtime/quant/runId annotations", async () => {
    const sink: string[] = [];
    const config: RunLoopConfig = {
      models: [{ artifact: "art", runtime: "mlx", name: "fake", quant: "Q4" }],
      promptCorpus: [],
      scenarioCorpus: [],
      systemPrompts: {},
      temperatures: [0.7],
      archiveDir: "/tmp/annotations-test",
      fresh: true,
      maxTokens: 8,
      noSave: true,
    };
    await Effect.runPromise(
      runLoop(config, makeFakeDeps()).pipe(
        Effect.provide(Layer.merge(captureLogs(sink), makeFakeDeps.layer)),
      ),
    );
    const entry = sink.find((l) => l.includes("model 1/1"));
    expect(entry).toBeDefined();
    expect(entry).toContain("model=fake");
    expect(entry).toContain("runtime=mlx");
    expect(entry).toContain("quant=Q4");
    expect(entry).toMatch(/runId=[^ ]+/);
  });
});
```

Because this test depends on fakes for `RunModelDeps`, create a companion `src/orchestration/__tests__/fakes.ts`:

```typescript
import type { CommandExecutor, HttpClient } from "@effect/platform";
import { Effect, Layer } from "effect";
import type { ServerHandle } from "../../llm/servers/supervisor.js";
import type { AdmiralHandle, GameSessionFactory, LlmServerFactory, RunModelDeps } from "../run-model.js";

const fakeServerHandle: ServerHandle = {
  runtime: "mlx",
  port: 19999,
  pid: 0,
  monitor: { exited: undefined as never },
};

export const makeFakeDeps = (): RunModelDeps => ({
  llmServer: (() => Effect.succeed(fakeServerHandle)) as LlmServerFactory,
  admiral: () =>
    Effect.succeed<AdmiralHandle>({
      baseUrl: "http://127.0.0.1:3031",
      client: {
        configureProvider: () => Effect.void,
        createProfile: () => Effect.succeed("p-1"),
        connectProfile: () => Effect.void,
        disconnectProfile: () => Effect.void,
        deleteProfile: () => Effect.void,
      },
    }),
  gameSession: (() => Effect.succeed({ gameServerBaseUrl: "http://x", admin: {} as never })) as GameSessionFactory,
});

makeFakeDeps.layer = Layer.mergeAll(
  Layer.succeed(
    // HttpClient stub: not exercised in annotation test.
    null as unknown as HttpClient.HttpClient,
    null as unknown as HttpClient.HttpClient,
  ),
);
```

> **Note to implementer:** the test depends on runLoop emitting a per-model Info line. That line is added in Step 2 below. If the fakes file fights the existing test ecosystem (e.g. there's already a shared fake in `test-mocks.ts`), reuse that instead of duplicating.

- [ ] **Step 2: Run test — confirm it fails**

Run: `npm run test -- --run src/orchestration/__tests__/annotations.test.ts`
Expected: FAIL because the per-model Info line isn't emitted yet.

- [ ] **Step 3: Add per-model annotation + Info line to `run-loop.ts`**

In `src/orchestration/run-loop.ts`, inside the `for (const model of models)` loop (line ~159), wrap each `runModel` call in an annotation + Info log. Replace:

```typescript
    for (const model of models) {
      const { runId, startedAt } = yield* makeRunId(model);
      const manifest = makeOpenManifest({ ... });
      const archivePath = pathMod.join(config.archiveDir, archiveFileName(runId));

      const outcome = yield* runModel({ ... }, deps);
      perModel.push(outcome);
    }
```

with:

```typescript
    let modelIndex = 0;
    for (const model of models) {
      modelIndex += 1;
      const { runId, startedAt } = yield* makeRunId(model);
      const manifest = makeOpenManifest({ ... });
      const archivePath = pathMod.join(config.archiveDir, archiveFileName(runId));

      const displayName = model.name ?? model.artifact;
      const quant = model.quant ?? "";

      const outcome = yield* Effect.annotateLogs(
        runModel({ ... }, deps).pipe(
          Effect.tap(() =>
            Effect.logInfo(
              `model ${modelIndex}/${models.length}: ${displayName} (${model.artifact}${quant ? `, ${quant}` : ""})`,
            ),
          ).pipe(
            // Emit the "model N/M" line BEFORE runModel's body runs, not after.
            // This pattern — tap before — doesn't compose naturally with pipe,
            // so rewrite as a sequential generator below instead.
          ),
        ),
        {
          scope: "run-loop",
          model: displayName,
          runtime: model.runtime,
          quant,
          runId,
        },
      );
      perModel.push(outcome);
    }
```

That rewrite is ugly — prefer this simpler shape using `Effect.gen`:

```typescript
    let modelIndex = 0;
    for (const model of models) {
      modelIndex += 1;
      const { runId, startedAt } = yield* makeRunId(model);
      const manifest = makeOpenManifest({
        runId,
        startedAt,
        model,
        env,
        temperatures: config.temperatures,
        promptCorpus: config.promptCorpus,
        scenarioCorpus: config.scenarioCorpus,
      });
      const archivePath = pathMod.join(config.archiveDir, archiveFileName(runId));
      const displayName = model.name ?? model.artifact;
      const quant = model.quant ?? "";

      const outcome = yield* Effect.gen(function* () {
        yield* Effect.logInfo(
          `model ${modelIndex}/${models.length}: ${displayName} (${model.artifact}${quant ? `, ${quant}` : ""})`,
        ).pipe(Effect.annotateLogs("scope", "run-loop"));

        return yield* runModel(
          {
            manifest,
            archivePath,
            prompts: config.promptCorpus,
            scenarios: config.scenarioCorpus,
            temperatures: config.temperatures,
            archiveDir: config.archiveDir,
            fresh: config.fresh,
            maxTokens: config.maxTokens,
            noSave: config.noSave ?? false,
            ...(config.idleTimeoutSec !== undefined ? { idleTimeoutSec: config.idleTimeoutSec } : {}),
            ...(config.scenariosOnly !== undefined ? { scenariosOnly: config.scenariosOnly } : {}),
            ...(config.requestTimeoutSec !== undefined
              ? { requestTimeoutSec: config.requestTimeoutSec }
              : {}),
          },
          deps,
        );
      }).pipe(
        Effect.annotateLogs({
          model: displayName,
          runtime: model.runtime,
          quant,
          runId,
        }),
      );
      perModel.push(outcome);
    }
```

Also log skipped models outside the main loop. Replace the `filterModels` call site with two passes so you can emit a line per skipped model:

```typescript
    const eligible: ModelConfig[] = [];
    for (const m of config.models) {
      if (!isActive(m)) {
        yield* Effect.logInfo(`skipping inactive model: ${m.name ?? m.artifact}`).pipe(
          Effect.annotateLogs("scope", "run-loop"),
        );
        continue;
      }
      if (!matchesName(m, config.modelNameFilter)) {
        yield* Effect.logInfo(`skipping (filter miss): ${m.name ?? m.artifact}`).pipe(
          Effect.annotateLogs("scope", "run-loop"),
        );
        continue;
      }
      eligible.push(m);
    }
    const models = eligible;
```

Remove the old `const models = filterModels(config);` line. Keep `isActive` / `matchesName` exported; delete `filterModels` if unused (grep first).

- [ ] **Step 4: Add phase annotation to `phases.ts`**

In `src/orchestration/phases.ts`:

- Wrap the `runPromptPhase` body in `Effect.annotateLogs("phase", "prompt")`.
- Wrap the `runScenarioPhase` body in `Effect.annotateLogs("phase", "scenario")`.

For `runPromptPhase`:

```typescript
export const runPromptPhase = (
  input: RunModelInput,
  statsRef: Ref.Ref<RunStats>,
): Effect.Effect<
  void,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | ChatCompletion
> =>
  Effect.gen(function* () {
    if (input.scenariosOnly === true) return;
    // ...existing body unchanged...
  }).pipe(Effect.annotateLogs("phase", "prompt"));
```

Same wrap for `runScenarioPhase` with `"scenario"`. Also set the `scope` annotation on `runScenario`'s own logs later — deferred to Task 8.

- [ ] **Step 5: Add scenario-name annotation in the scenario loop**

Inside `runScenarioPhase`'s `for (const scenario of input.scenarios)` loop, wrap the `Effect.scoped(...)` call in `Effect.annotateLogs({ scenario: scenario.name })`. Example:

```typescript
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          // ...existing body...
        }),
      ).pipe(Effect.annotateLogs({ scenario: scenario.name }));
```

- [ ] **Step 6: Run test + typecheck + lint**

Run: `npm run test -- --run src/orchestration/__tests__/annotations.test.ts && npm run typecheck && npm run lint`
Expected: green. If the fake setup in Step 1 is too brittle, simplify by omitting HTTP-dependent layers when the test path doesn't exercise them.

- [ ] **Step 7: Commit**

```bash
git add src/orchestration/run-loop.ts src/orchestration/phases.ts src/orchestration/__tests__/annotations.test.ts src/orchestration/__tests__/fakes.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): annotate per-model/per-phase log scope

runLoop now emits a per-model INF "model N/M: …" line and wraps
each runModel invocation in Effect.annotateLogs so downstream logs
carry model/runtime/quant/runId. phases.ts adds phase=prompt|scenario
and scenario-name annotations so filters like
`grep phase=prompt` select just the right slice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: LLM server supervisor Info + Debug logs

**Goal:** Emit Info lines for spawn / healthy / stopping / escalating and Debug lines for `proc.isRunning` + exit-code in `superviseServer`.

**Files:**
- Modify: `src/llm/servers/supervisor.ts`
- Create: `src/llm/servers/__tests__/supervisor-logging.test.ts` (new directory OK; vitest picks it up via the existing config)

- [ ] **Step 1: Write failing tests**

Create `src/llm/servers/__tests__/supervisor-logging.test.ts`:

```typescript
/**
 * Log-output assertions for superviseServer. We reuse `test-mocks.ts` for
 * the HttpClient + CommandExecutor fakes and capture logs via
 * `captureLogs` from cli tests.
 */
import { Effect, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../../cli/__tests__/log-capture.js";

// NOTE: The real test body depends on the test-mocks helpers (see
// src/llm/servers/test-mocks.ts) — reuse whatever is already there to
// construct an Effect that drives superviseServer. If your existing test
// file for supervisor has helper builders, hoist them into a shared
// fixture rather than duplicating.
it.todo("logs 'starting' and 'healthy' INF lines on successful boot");
it.todo("logs 'stopping' + 'escalating to SIGKILL' when graceful times out");
it.todo("at debug level, logs isRunning + exit code diagnostics");
```

> **Implementer guidance:** Use the same fake `CommandExecutor` and `HttpClient` patterns already used in `src/llm/servers/*.test.ts`. The test fixtures there can drive a health check that succeeds or times out. Once you see those helpers, replace the three `it.todo` calls with real tests whose shape mirrors them. Expected assertions:
> - Boot succeeds → `sink` contains `"starting mlx on :<port>"`, `"healthy in"` (use `toMatch(/healthy in \d+/)`).
> - Finalizer runs → `sink` contains `"stopping (SIGTERM"`, `"escalating to SIGKILL"` (for the graceful-timeout path).
> - Debug level → `sink` contains `"proc.isRunning="` and `"exit code="`.

- [ ] **Step 2: Run `it.todo` placeholders**

Run: `npm run test -- --run src/llm/servers/__tests__/supervisor-logging.test.ts`
Expected: three pending todo entries. (The implementer turns them into real tests in Step 5 after the production code is in place, following TDD's red/green cycle. That order is acceptable here because the assertions are purely additive — nothing breaks if the log lines are absent, the tests just fail.)

- [ ] **Step 3: Add Info logs to the supervisor**

In `src/llm/servers/supervisor.ts`, after the spawn succeeds and before the health probe:

```typescript
    yield* Effect.logInfo(
      `starting ${params.runtime} on :${params.port} (pid=${proc.pid})`,
    ).pipe(Effect.annotateLogs("scope", "llm-server"));
```

And introduce a `startedMs` capture before the health wait so we can log elapsed time:

```typescript
    const startedMs = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
```

(Simpler: `import { Clock } from "effect"` at the top, then `const startedMs = yield* Clock.currentTimeMillis;`.)

After `Effect.raceWith(...)` returns (i.e. health succeeded) — add:

```typescript
    const endedMs = yield* Clock.currentTimeMillis;
    const elapsedSec = ((endedMs - startedMs) / 1000).toFixed(1);
    yield* Effect.logInfo(`healthy in ${elapsedSec}s`).pipe(
      Effect.annotateLogs("scope", "llm-server"),
    );
```

Inside the finalizer:

```typescript
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const running = yield* proc.isRunning.pipe(Effect.orElseSucceed(() => false));
        yield* Effect.logDebug(`proc.isRunning=${running} before SIGTERM`).pipe(
          Effect.annotateLogs("scope", "llm-server"),
        );
        if (!running) return;

        yield* Effect.logInfo(
          `stopping (SIGTERM, ${gracefulShutdownSec}s grace)`,
        ).pipe(Effect.annotateLogs("scope", "llm-server"));

        const finalizerStartMs = yield* Clock.currentTimeMillis;

        const graceful = yield* Effect.timeout(
          proc.kill("SIGTERM").pipe(Effect.ignore),
          Duration.seconds(gracefulShutdownSec),
        ).pipe(
          Effect.map(() => true as const),
          Effect.catchTag("TimeoutException", () => Effect.succeed(false as const)),
          Effect.interruptible,
        );

        if (!graceful) {
          yield* Effect.logInfo("escalating to SIGKILL").pipe(
            Effect.annotateLogs("scope", "llm-server"),
          );
          yield* Effect.timeout(
            proc.kill("SIGKILL").pipe(Effect.ignore),
            Duration.seconds(gracefulShutdownSec),
          ).pipe(Effect.ignore, Effect.interruptible);
        }

        const finalizerEndMs = yield* Clock.currentTimeMillis;
        const exitElapsed = ((finalizerEndMs - finalizerStartMs) / 1000).toFixed(1);
        yield* Effect.logDebug(`exit (SIGTERM→SIGKILL path) completed in ${exitElapsed}s`).pipe(
          Effect.annotateLogs("scope", "llm-server"),
        );
      }),
    );
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green. The existing supervisor tests shouldn't break; they don't assert silence on log output.

- [ ] **Step 5: Replace the three `it.todo` placeholders with real tests**

Now that the production code emits the lines, write concrete assertions using the same `CommandExecutor`/`HttpClient` fakes as neighbor tests in `src/llm/servers/`. Each test provides `captureLogs(sink, ...)`, runs the supervisor, and asserts via `sink.some(l => l.includes("..."))`. Delete the `it.todo` lines.

Run again: `npm run test -- --run src/llm/servers/__tests__/supervisor-logging.test.ts`
Expected: three tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/llm/servers/supervisor.ts src/llm/servers/__tests__/supervisor-logging.test.ts
git commit -m "$(cat <<'EOF'
feat(llm): log supervisor lifecycle (spawn/healthy/stopping)

superviseServer now emits INF "starting", "healthy in Xs",
"stopping (SIGTERM)", and "escalating to SIGKILL" lines, plus DBG
"proc.isRunning" and exit-elapsed diagnostics. Scope annotation is
"llm-server" throughout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Admiral + gameserver Info logs

**Goal:** Emit `admiral | starting on :<port>`, `admiral | healthy in <s>s`, `admiral | stopping` plus `gameserver | started on :<port>` for each scenario.

**Files:**
- Modify: `src/game/admiral/server.ts`
- Modify: `src/game/server/game-server.ts`
- Modify: `src/game/admiral/server.test.ts` (add one log assertion)
- Modify: `src/game/server/game-server.test.ts` (add one log assertion)

- [ ] **Step 1: Add Admiral logs**

In `src/game/admiral/server.ts`, modify `admiralServer` to emit the three Info lines. The `superviseServer` call does most of the work; we just add explicit Admiral-scope lines around it:

```typescript
import { Clock, Effect } from "effect";

// ...inside admiralServer:
    const startMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`starting on :${port}`).pipe(Effect.annotateLogs("scope", "admiral"));

    const handle = yield* superviseServer({ ... });

    const endMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`healthy in ${((endMs - startMs) / 1000).toFixed(1)}s`).pipe(
      Effect.annotateLogs("scope", "admiral"),
    );

    yield* Effect.addFinalizer(() =>
      Effect.logInfo("stopping").pipe(Effect.annotateLogs("scope", "admiral")),
    );

    return { ...handle, baseUrl };
```

(Note: `superviseServer` itself already logs `llm-server` lines — those appear *in addition* to Admiral's. That's fine; they carry different `scope=` annotations.)

- [ ] **Step 2: Add gameserver log**

Inspect `src/game/server/game-server.ts` to find the function that spawns the gameserver (search for `superviseServer` or a direct `Command.start`). After spawn succeeds and the port is known, add:

```typescript
    yield* Effect.logInfo(`started on :${port}`).pipe(Effect.annotateLogs("scope", "gameserver"));
```

- [ ] **Step 3: Add a log assertion in `server.test.ts`**

In `src/game/admiral/server.test.ts`, append (assuming there's an existing test that drives `admiralServer` successfully):

```typescript
it("emits starting/healthy admiral INF lines", async () => {
  const sink: string[] = [];
  // ...run admiralServer with the same helpers as the neighbouring test
  // but provide captureLogs(sink) in the layer stack.
  expect(sink.some(l => l.includes("admiral | starting on :"))).toBe(true);
  expect(sink.some(l => l.match(/admiral \| healthy in \d/))).toBe(true);
});
```

Same shape in `src/game/server/game-server.test.ts` for the `started on :` line.

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/game/admiral/server.ts src/game/server/game-server.ts src/game/admiral/server.test.ts src/game/server/game-server.test.ts
git commit -m "$(cat <<'EOF'
feat(game): log admiral + gameserver lifecycle

Admiral emits INF starting/healthy-in/stopping under scope=admiral;
gameserver emits INF "started on :<port>" under scope=gameserver.
Run alongside the supervisor's own llm-server lines — different
scope, different model context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Per-model aggregator module

**Goal:** Pure data module for the end-of-model summary. No logging here — just the aggregation state and formatters.

**Files:**
- Create: `src/orchestration/summary.ts`
- Create: `src/orchestration/__tests__/summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/orchestration/__tests__/summary.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "../../schema/execution.js";
import {
  type ModelAggregate,
  averageGenTps,
  averagePromptTps,
  emptyAggregate,
  formatCrossModelRollup,
  formatModelBlock,
  recordPrompt,
  recordScenario,
  slowest3,
} from "../summary.js";

const baseResult: ExecutionResult = {
  runId: "r1",
  executedAt: "2026-04-17T00:00:00.000Z",
  promptName: "p",
  temperature: 0.7,
  model: "qwen3.5-9b",
  runtime: "mlx",
  quant: "Q4_K_M",
  promptTokens: 100,
  generationTokens: 50,
  promptTps: 100,
  generationTps: 20,
  peakMemoryGb: 0,
  wallTimeSec: 2,
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

describe("aggregator", () => {
  it("records prompts as completed", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a" }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "b" }, false);
    expect(agg.promptStats).toEqual({ completed: 2, cached: 0, errors: 0 });
  });

  it("flags cached prompts and excludes them from averages", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 10 }, false);
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 100 }, true);
    expect(agg.promptStats).toEqual({ completed: 1, cached: 1, errors: 0 });
    // Token-weighted: only the first counts → avg = 10
    expect(averageGenTps(agg)).toBe(10);
  });

  it("flags errors and excludes them from averages", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(
      agg,
      { ...baseResult, error: "boom", generationTokens: 0, generationTps: 0 },
      false,
    );
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 60, generationTps: 20 }, false);
    expect(agg.promptStats).toEqual({ completed: 1, cached: 0, errors: 1 });
    expect(averageGenTps(agg)).toBe(20);
  });

  it("token-weights averages across many prompts", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 10 }, false);
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 400, generationTps: 20 }, false);
    // Weighted mean = (100*10 + 400*20) / (100+400) = 9000/500 = 18
    expect(averageGenTps(agg)).toBe(18);
  });

  it("tracks top-3 slowest by wall time across prompts + scenarios", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a", wallTimeSec: 10 }, false);
    agg = recordScenario(agg, { ...baseResult, promptName: "s1", scenarioName: "s1", wallTimeSec: 50, terminationReason: "natural" }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "b", wallTimeSec: 30 }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "c", wallTimeSec: 5 }, false);
    agg = recordScenario(agg, { ...baseResult, promptName: "s2", scenarioName: "s2", wallTimeSec: 100, terminationReason: "natural" }, false);

    const top = slowest3(agg);
    expect(top.map(t => t.name)).toEqual(["s2", "s1", "b"]);
    expect(top.map(t => t.wallTimeSec)).toEqual([100, 50, 30]);
  });

  it("excludes cached + errored results from slowest-3", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a", wallTimeSec: 100 }, true);  // cached
    agg = recordPrompt(agg, { ...baseResult, promptName: "b", wallTimeSec: 50, error: "x" }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "c", wallTimeSec: 10 }, false);
    expect(slowest3(agg).map(t => t.name)).toEqual(["c"]);
  });

  it("formats a complete model block", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "prompt_a", wallTimeSec: 10, generationTokens: 100, generationTps: 18.2, promptTps: 142 }, false);
    agg = recordScenario(agg, { ...baseResult, scenarioName: "bootstrap_grind", wallTimeSec: 94, terminationReason: "natural" }, false);
    const block = formatModelBlock({
      modelDisplayName: "qwen3.5-9b",
      runtime: "mlx",
      quant: "Q4_K_M",
      archivePath: "./benchmark-archive/run1.jsonl",
      totalWallTimeSec: 204,
      interrupted: false,
      aggregate: agg,
    });
    expect(block).toContain("─ qwen3.5-9b · mlx · Q4_K_M ");
    expect(block).toContain("prompts     1 completed · 0 cached · 0 errors");
    expect(block).toContain("scenarios   1 completed · 0 cached · 0 errors");
    expect(block).toContain("wall        3.4 min total");
    expect(block).toContain("avg 18.2 tps gen");
    expect(block).toContain("slowest     bootstrap_grind 94s");
    expect(block).toContain("archive     ./benchmark-archive/run1.jsonl");
    expect(block).toContain("interrupted false");
  });

  it("renders duration format: <60s as s.s s, <3600s as m.m min, ≥3600 as h.h h", () => {
    let agg = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, wallTimeSec: 1 }, false);
    const short = formatModelBlock({ modelDisplayName: "m", runtime: "mlx", quant: "Q", archivePath: "/a", totalWallTimeSec: 42.3, interrupted: false, aggregate: agg });
    expect(short).toContain("wall        42.3s total");
    const mid = formatModelBlock({ modelDisplayName: "m", runtime: "mlx", quant: "Q", archivePath: "/a", totalWallTimeSec: 204, interrupted: false, aggregate: agg });
    expect(mid).toContain("wall        3.4 min total");
    const long = formatModelBlock({ modelDisplayName: "m", runtime: "mlx", quant: "Q", archivePath: "/a", totalWallTimeSec: 3900, interrupted: false, aggregate: agg });
    expect(long).toContain("wall        1.1h total");
  });

  it("formats the cross-model rollup", () => {
    const line = formatCrossModelRollup([
      { completed: 38, cached: 2, errors: 0, totalWallTimeSec: 204 },
      { completed: 13, cached: 1, errors: 1, totalWallTimeSec: 150 },
    ]);
    expect(line).toContain("2 models · 51 completed · 3 cached · 1 errors");
    expect(line).toContain("5.9 min total");
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

Run: `npm run test -- --run src/orchestration/__tests__/summary.test.ts`
Expected: FAIL with "cannot find module `../summary.js`".

- [ ] **Step 3: Implement `src/orchestration/summary.ts`**

```typescript
/**
 * Per-model aggregator + formatter for the end-of-run summary block.
 *
 * Pure data — no Effect, no logging, no I/O. The orchestration layer
 * updates a `Ref<ModelAggregate>` as results stream in, then passes the
 * terminal aggregate to `formatModelBlock` for emission.
 */
import type { TerminationReason } from "../schema/enums.js";
import type { ExecutionResult } from "../schema/execution.js";
import type { Runtime } from "../schema/enums.js";

export interface StatsCounts {
  readonly completed: number;
  readonly cached: number;
  readonly errors: number;
}

interface SlowestEntry {
  readonly name: string;
  readonly wallTimeSec: number;
  readonly kind: "prompt" | "scenario";
}

export interface ModelAggregate {
  readonly promptStats: StatsCounts;
  readonly scenarioStats: StatsCounts & { readonly lastErrorReason: TerminationReason | null };
  readonly tokenWeightedGenTpsNumerator: number;
  readonly tokenWeightedGenTpsDenominator: number;
  readonly tokenWeightedPromptTpsNumerator: number;
  readonly tokenWeightedPromptTpsDenominator: number;
  readonly slowest: ReadonlyArray<SlowestEntry>;
}

export const emptyAggregate = (): ModelAggregate => ({
  promptStats: { completed: 0, cached: 0, errors: 0 },
  scenarioStats: { completed: 0, cached: 0, errors: 0, lastErrorReason: null },
  tokenWeightedGenTpsNumerator: 0,
  tokenWeightedGenTpsDenominator: 0,
  tokenWeightedPromptTpsNumerator: 0,
  tokenWeightedPromptTpsDenominator: 0,
  slowest: [],
});

const bumpCounts = (s: StatsCounts, cached: boolean, error: boolean): StatsCounts => {
  if (error) return { ...s, errors: s.errors + 1 };
  if (cached) return { ...s, cached: s.cached + 1 };
  return { ...s, completed: s.completed + 1 };
};

const addSlowest = (
  slots: ReadonlyArray<SlowestEntry>,
  entry: SlowestEntry,
): ReadonlyArray<SlowestEntry> => {
  const merged = [...slots, entry].sort((a, b) => b.wallTimeSec - a.wallTimeSec).slice(0, 3);
  return merged;
};

const includeInSlowest = (r: ExecutionResult, cached: boolean): boolean =>
  !cached && r.error === null;

const addTps = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): Pick<
  ModelAggregate,
  | "tokenWeightedGenTpsNumerator"
  | "tokenWeightedGenTpsDenominator"
  | "tokenWeightedPromptTpsNumerator"
  | "tokenWeightedPromptTpsDenominator"
> => {
  if (cached || r.error !== null) {
    return {
      tokenWeightedGenTpsNumerator: agg.tokenWeightedGenTpsNumerator,
      tokenWeightedGenTpsDenominator: agg.tokenWeightedGenTpsDenominator,
      tokenWeightedPromptTpsNumerator: agg.tokenWeightedPromptTpsNumerator,
      tokenWeightedPromptTpsDenominator: agg.tokenWeightedPromptTpsDenominator,
    };
  }
  return {
    tokenWeightedGenTpsNumerator:
      agg.tokenWeightedGenTpsNumerator + r.generationTokens * r.generationTps,
    tokenWeightedGenTpsDenominator: agg.tokenWeightedGenTpsDenominator + r.generationTokens,
    tokenWeightedPromptTpsNumerator:
      agg.tokenWeightedPromptTpsNumerator + r.promptTokens * r.promptTps,
    tokenWeightedPromptTpsDenominator: agg.tokenWeightedPromptTpsDenominator + r.promptTokens,
  };
};

export const recordPrompt = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): ModelAggregate => {
  const tps = addTps(agg, r, cached);
  const promptStats = bumpCounts(agg.promptStats, cached, r.error !== null);
  const slowest = includeInSlowest(r, cached)
    ? addSlowest(agg.slowest, { name: r.promptName, wallTimeSec: r.wallTimeSec, kind: "prompt" })
    : agg.slowest;
  return { ...agg, ...tps, promptStats, slowest };
};

export const recordScenario = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): ModelAggregate => {
  const tps = addTps(agg, r, cached);
  const isError = r.error !== null;
  const scenarioStats: ModelAggregate["scenarioStats"] = {
    ...bumpCounts(agg.scenarioStats, cached, isError),
    lastErrorReason: isError ? r.terminationReason : agg.scenarioStats.lastErrorReason,
  };
  const name = r.scenarioName ?? r.promptName;
  const slowest = includeInSlowest(r, cached)
    ? addSlowest(agg.slowest, { name, wallTimeSec: r.wallTimeSec, kind: "scenario" })
    : agg.slowest;
  return { ...agg, ...tps, scenarioStats, slowest };
};

const safeDivide = (num: number, den: number): number => (den === 0 ? 0 : num / den);

export const averageGenTps = (agg: ModelAggregate): number =>
  safeDivide(agg.tokenWeightedGenTpsNumerator, agg.tokenWeightedGenTpsDenominator);

export const averagePromptTps = (agg: ModelAggregate): number =>
  safeDivide(agg.tokenWeightedPromptTpsNumerator, agg.tokenWeightedPromptTpsDenominator);

export const slowest3 = (agg: ModelAggregate): ReadonlyArray<SlowestEntry> => agg.slowest;

// ── Formatters ─────────────────────────────────────────────────────────────

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(1)}h`;
};

const scenarioErrorTrailer = (s: ModelAggregate["scenarioStats"]): string => {
  if (s.errors === 0) return "";
  const reason = s.lastErrorReason ?? "error";
  return ` (${reason})`;
};

const slowestLine = (slots: ReadonlyArray<SlowestEntry>): string => {
  if (slots.length === 0) return "—";
  return slots.map((s) => `${s.name} ${Math.round(s.wallTimeSec)}s`).join(" · ");
};

export interface FormatModelBlockParams {
  readonly modelDisplayName: string;
  readonly runtime: Runtime;
  readonly quant: string;
  readonly archivePath: string;
  readonly totalWallTimeSec: number;
  readonly interrupted: boolean;
  readonly aggregate: ModelAggregate;
}

export const formatModelBlock = (params: FormatModelBlockParams): string => {
  const a = params.aggregate;
  const headerLabel = `${params.modelDisplayName} · ${params.runtime}${
    params.quant ? ` · ${params.quant}` : ""
  }`;
  const headerRule = "─ " + headerLabel + " " + "─".repeat(Math.max(0, 50 - headerLabel.length));
  const promptsLine = `  prompts     ${a.promptStats.completed} completed · ${a.promptStats.cached} cached · ${a.promptStats.errors} errors`;
  const scenariosLine = `  scenarios   ${a.scenarioStats.completed} completed · ${a.scenarioStats.cached} cached · ${a.scenarioStats.errors} errors${scenarioErrorTrailer(a.scenarioStats)}`;
  const wallLine = `  wall        ${formatDuration(params.totalWallTimeSec)} total · avg ${averageGenTps(a).toFixed(1)} tps gen · avg ${averagePromptTps(a).toFixed(1)} tps prompt`;
  const slowestList = `  slowest     ${slowestLine(a.slowest)}`;
  const archiveLine = `  archive     ${params.archivePath}`;
  const interruptedLine = `  interrupted ${params.interrupted}`;
  return [headerRule, promptsLine, scenariosLine, wallLine, slowestList, archiveLine, interruptedLine].join("\n");
};

export interface ModelRollupInput {
  readonly completed: number;
  readonly cached: number;
  readonly errors: number;
  readonly totalWallTimeSec: number;
}

export const formatCrossModelRollup = (rows: ReadonlyArray<ModelRollupInput>): string => {
  const totals = rows.reduce(
    (acc, r) => ({
      completed: acc.completed + r.completed,
      cached: acc.cached + r.cached,
      errors: acc.errors + r.errors,
      wall: acc.wall + r.totalWallTimeSec,
    }),
    { completed: 0, cached: 0, errors: 0, wall: 0 },
  );
  const heading = "─ totals " + "─".repeat(50);
  const body = `  ${rows.length} models · ${totals.completed} completed · ${totals.cached} cached · ${totals.errors} errors · ${formatDuration(totals.wall)} total`;
  return `${heading}\n${body}`;
};
```

- [ ] **Step 4: Run test — confirm all pass**

Run: `npm run test -- --run src/orchestration/__tests__/summary.test.ts`
Expected: all aggregator tests pass.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/summary.ts src/orchestration/__tests__/summary.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): add per-model aggregator + summary formatters

summary.ts is pure data: emptyAggregate / recordPrompt / recordScenario
for running totals plus token-weighted TPS and top-3 slowest; formatters
render the stderr end-of-model block and cross-model rollup. No Effect
or I/O — consumed by phases.ts + run-loop.ts in later tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Per-prompt Info log + thread aggregator into `phases.ts`

**Goal:** Emit one Info line per prompt×temperature result (fresh, cache hit, error) and update the aggregator from the prompt phase.

**Files:**
- Modify: `src/orchestration/phases.ts`
- Modify: `src/orchestration/run-model.ts` (to own the aggregator ref)
- Create: `src/orchestration/__tests__/phases-logging.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/orchestration/__tests__/phases-logging.test.ts`:

```typescript
import { Effect, Layer, LogLevel, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import type { ChatCompletionService } from "../../llm/chat-completion.js";
import { ChatCompletion } from "../../llm/chat-completion.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { RunStats } from "../../schema/run-manifest.js";
import { emptyAggregate, type ModelAggregate } from "../summary.js";
import type { RunModelInput } from "../run-model.js";
import { runPromptPhase } from "../phases.js";

const fakeChat = (): ChatCompletionService => ({
  complete: () =>
    Effect.succeed({
      output: "hello",
      promptTokens: 10,
      generationTokens: 20,
      promptTps: 140,
      generationTps: 18,
    }),
});

const chatLayer = Layer.succeed(ChatCompletion, fakeChat());

const prompt: PromptCorpusEntry = {
  name: "code_4",
  system: { name: "s", text: "be helpful" },
  promptText: "hi",
  promptHash: "h",
  scorer: { type: "exact_match", expected: "hello" },
} as unknown as PromptCorpusEntry;

const baseInput = (): RunModelInput => ({
  manifest: {
    schemaVersion: 1,
    runId: "r1",
    startedAt: "2026-04-17T00:00:00Z",
    finishedAt: null,
    interrupted: false,
    artifact: "art",
    model: "qwen3.5-9b",
    runtime: "mlx",
    quant: "Q4_K_M",
    env: { hostname: "h", platform: "darwin-arm64", runtimeVersion: "u", nodeVersion: "u", benchmarkGitSha: "u" },
    temperatures: [0.7],
    promptCorpus: {},
    scenarioCorpus: {},
    stats: { totalPrompts: 1, totalExecutions: 0, completed: 0, skippedCached: 0, errors: 0, totalWallTimeSec: 0 },
  },
  archivePath: "/tmp/archive.jsonl",
  prompts: [prompt],
  scenarios: [],
  temperatures: [0.7],
  archiveDir: "/tmp",
  fresh: true,
  maxTokens: 16,
  noSave: true,
});

describe("prompt phase logging", () => {
  it("emits an INF line with prompt name, temp, tokens, tps, wall time", async () => {
    const sink: string[] = [];
    const statsRef = await Effect.runPromise(Ref.make<RunStats>(baseInput().manifest.stats));
    const aggRef = await Effect.runPromise(Ref.make<ModelAggregate>(emptyAggregate()));
    await Effect.runPromise(
      runPromptPhase(baseInput(), statsRef, aggRef).pipe(
        Effect.provide(Layer.merge(captureLogs(sink, LogLevel.Info), chatLayer)),
      ),
    );
    const line = sink.find((l) => l.includes("prompt 1/1"));
    expect(line).toBeDefined();
    expect(line).toContain("code_4 @0.7 →");
    expect(line).toContain("20 gen tok");
    expect(line).toContain("18.0 tps gen");
    expect(line).toContain("140.0 tps prompt");
  });
});
```

(If the real `PromptCorpusEntry` shape differs, fix the cast accordingly — the purpose is just to drive `runPrompt` with a minimal fixture.)

- [ ] **Step 2: Run test — confirm it fails**

Run: `npm run test -- --run src/orchestration/__tests__/phases-logging.test.ts`
Expected: FAIL — either because `runPromptPhase` doesn't take an `aggRef` yet, or because no log line appears.

- [ ] **Step 3: Extend `runPromptPhase` signature to accept an aggregator ref**

In `src/orchestration/phases.ts`, change `runPromptPhase` to take a third `aggRef: Ref.Ref<ModelAggregate>`. Inside the prompt loop:

- After a fresh result is produced, emit the Info line and update both refs.
- After a cache hit, emit the cache-hit Info line and update the aggregator (`recordPrompt(agg, carried, true)`).
- On error (`result.error !== null`), emit the error variant.

```typescript
import { emptyAggregate, recordPrompt, type ModelAggregate } from "./summary.js";

// inside runPromptPhase:
      for (const prompt of input.prompts) {
        for (const temperature of input.temperatures) {
          promptIndex += 1; // add outside the loops, initialized to 0

          const cached = yield* lookupCache({ ... });

          if (Option.isSome(cached)) {
            const carried: ExecutionResult = { ...cached.value, runId: input.manifest.runId };
            yield* appendIfSaving(carried, input.archivePath, input.noSave);
            yield* Ref.update(statsRef, (s) => tallySkipped(s, carried));
            yield* Ref.update(aggRef, (a) => recordPrompt(a, carried, true));
            yield* Effect.logInfo(
              `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — cache hit (runId=${carried.runId}, executedAt=${carried.executedAt})`,
            ).pipe(Effect.annotateLogs("scope", "prompt"));
            continue;
          }

          const result = yield* runPrompt({ ... });
          yield* appendIfSaving(result, input.archivePath, input.noSave);
          yield* Ref.update(statsRef, (s) => tallyResult(s, result));
          yield* Ref.update(aggRef, (a) => recordPrompt(a, result, false));

          if (result.error !== null) {
            yield* Effect.logInfo(
              `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} — ERROR: ${result.error}`,
            ).pipe(Effect.annotateLogs("scope", "prompt"));
          } else {
            yield* Effect.logInfo(
              `prompt ${promptIndex}/${total} ${prompt.name} @${temperature} → ${result.generationTokens} gen tok, ${result.generationTps.toFixed(1)} tps gen, ${result.promptTps.toFixed(1)} tps prompt, ${result.wallTimeSec.toFixed(1)}s`,
            ).pipe(Effect.annotateLogs("scope", "prompt"));
          }
        }
      }
```

`total = input.prompts.length * input.temperatures.length`; initialize `promptIndex = 0` before the outer loop.

- [ ] **Step 4: Thread an aggregator ref through `run-model.ts`**

In `src/orchestration/run-model.ts`, after creating `statsRef`, also create `aggRef`:

```typescript
import { emptyAggregate, type ModelAggregate } from "./summary.js";
// ...
      const aggRef = yield* Ref.make<ModelAggregate>(emptyAggregate());
```

Pass `aggRef` to `runPromptPhase` (and, in the next task, to `runScenarioPhase`). The return outcome doesn't expose the aggregate yet — that wiring happens in Task 9.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/orchestration/`
Expected: green. Existing phase tests may need a small adjustment: they now need to pass an `aggRef` (or the test helpers build one). Update as needed.

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/phases.ts src/orchestration/run-model.ts src/orchestration/__tests__/phases-logging.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): log per-prompt progress + thread aggregator

runPromptPhase emits an INF line per (prompt, temperature) pair
summarising tokens / TPS / wall time for fresh calls, a cache-hit
line for cached carries, and an ERROR variant when the LLM call
folds an error. The new aggRef threaded from runModel accumulates
ModelAggregate state for the end-of-run summary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Per-scenario Info log + aggregator update

**Goal:** Mirror Task 7 for scenarios. Emit Info lines summarising termination reason, tick count (inferred from `events` length if available), tool call count, and wall time.

**Files:**
- Modify: `src/orchestration/phases.ts`
- Modify: `src/orchestration/__tests__/phases-logging.test.ts` (add scenario test)

- [ ] **Step 1: Write the failing test**

Append to `src/orchestration/__tests__/phases-logging.test.ts`:

```typescript
// ...
it("emits an INF line per scenario with termination, tool calls, wall time", async () => {
  // use runScenarioPhase from phases; supply a GameSessionFactory fake
  // that returns a canned scenario result via sseOverride.
  // Assert sink contains `scenario 1/1 <name> — natural, ticks=N, toolCalls=N, Xs`.
  // (Implementer: reuse the existing test-mocks.ts game scenario helpers.)
});
```

Follow the shape of neighbouring scenario-phase tests to wire a fake `GameSessionFactory` and `AdmiralHandle`. Assert:

- `sink.some(l => l.includes("scenario 1/1 bootstrap_grind — natural"))` is true.
- The line contains `toolCalls=<n>` and ends with `<s>s`.

- [ ] **Step 2: Extend `runScenarioPhase` to accept `aggRef`**

Add `aggRef: Ref.Ref<ModelAggregate>` to `runScenarioPhase`'s parameter list. Update each result site:

- On cache hit: emit `scenario <i>/<n> <name> — cache hit (runId=<id>, executedAt=<iso>)`, `recordScenario(agg, carried, true)`.
- On fresh success: emit `scenario <i>/<n> <name> — <terminationReason>, ticks=<eventsLen>, toolCalls=<toolCallCount>, <wall>s`, `recordScenario(agg, result, false)`.
- On error: emit `scenario <i>/<n> <name> — <terminationReason>: <error>, ticks=<eventsLen>, toolCalls=<toolCallCount>, <wall>s`.

The `ticks` value comes from `result.events?.length ?? 0`. `toolCallCount` from `result.toolCallCount ?? 0`.

- [ ] **Step 3: Update `run-model.ts` to pass `aggRef` to the scenario phase**

```typescript
yield* runScenarioPhase(input, deps.gameSession, admiral, llmHandle, statsRef, aggRef);
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/orchestration/`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/phases.ts src/orchestration/run-model.ts src/orchestration/__tests__/phases-logging.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): log per-scenario progress + aggregate into summary

runScenarioPhase now emits an INF line per scenario showing the
termination reason, ticks (events.length), tool calls, and wall
time. Cache-hit and error variants mirror the prompt phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: End-of-model summary block emission

**Goal:** After `runModel` finishes (natural or interrupted), emit the formatted end-of-model block via `Effect.logInfo`. The outcome also exposes the aggregate so the cross-model roll-up (next task) can use it.

**Files:**
- Modify: `src/orchestration/run-model.ts`
- Modify: `src/orchestration/summary.ts` (expose `toRollupInput` helper)

- [ ] **Step 1: Add `toRollupInput` in `summary.ts`**

```typescript
export const toRollupInput = (
  agg: ModelAggregate,
  totalWallTimeSec: number,
): ModelRollupInput => ({
  completed: agg.promptStats.completed + agg.scenarioStats.completed,
  cached: agg.promptStats.cached + agg.scenarioStats.cached,
  errors: agg.promptStats.errors + agg.scenarioStats.errors,
  totalWallTimeSec,
});
```

Add a small test to `summary.test.ts`:

```typescript
it("derives rollup-input from an aggregate", () => {
  let agg = emptyAggregate();
  agg = recordPrompt(agg, { ...baseResult, wallTimeSec: 5 }, false);
  agg = recordScenario(agg, { ...baseResult, scenarioName: "s", wallTimeSec: 10, terminationReason: "natural" }, false);
  expect(toRollupInput(agg, 15)).toEqual({ completed: 2, cached: 0, errors: 0, totalWallTimeSec: 15 });
});
```

- [ ] **Step 2: Extend `RunModelOutcome` with the aggregate**

In `src/orchestration/run-model.ts`:

```typescript
import type { ModelAggregate } from "./summary.js";
// ...
export interface RunModelOutcome {
  readonly manifest: RunManifest;
  readonly stats: RunStats;
  readonly interrupted: boolean;
  readonly aggregate: ModelAggregate;
}
```

Populate it in the final `return`:

```typescript
      const finalAggregate = yield* Ref.get(aggRef);
      const finalStats = yield* Ref.get(statsRef);
      // ...

      return {
        manifest: finalizedManifest,
        stats: finalStats,
        interrupted: false,
        aggregate: finalAggregate,
      } satisfies RunModelOutcome;
```

- [ ] **Step 3: Emit the summary block before return**

Just before the `return` block in `runModel`, add:

```typescript
      yield* Effect.logInfo(
        "\n" +
          formatModelBlock({
            modelDisplayName: input.manifest.model,
            runtime: input.manifest.runtime,
            quant: input.manifest.quant,
            archivePath: input.archivePath,
            totalWallTimeSec: finalStats.totalWallTimeSec,
            interrupted: false,
            aggregate: finalAggregate,
          }),
      ).pipe(Effect.annotateLogs("scope", "run-model"));
```

The block spans multiple lines; emitting it as one `logInfo` call keeps it atomic in the stream. Leading `"\n"` gives a blank separator between the preceding per-prompt lines and the block.

- [ ] **Step 4: Update existing `run-model.test.ts` assertions**

Any existing test that matches on the exact `RunModelOutcome` shape now also needs to allow an `aggregate` field. Search for `satisfies RunModelOutcome` and `RunModelOutcome` in the tests; update fixtures by adding `aggregate: emptyAggregate()` (or similar) where needed.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/orchestration/run-model.ts src/orchestration/summary.ts src/orchestration/__tests__/summary.test.ts src/orchestration/**/*.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): emit end-of-model summary block on stderr

runModel finalises its ModelAggregate and emits the formatted block
via Effect.logInfo before returning. The outcome now carries the
aggregate so the run-loop layer can build the cross-model rollup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Cross-model roll-up in `run-loop.ts`

**Goal:** When more than one model ran, emit the rollup line after all per-model outcomes are collected.

**Files:**
- Modify: `src/orchestration/run-loop.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/orchestration/__tests__/annotations.test.ts` (or a new file — one test, reuse fixtures):

```typescript
it("emits cross-model rollup when > 1 model runs", async () => {
  // drive runLoop with two models (same fakes as prior test, duplicate entry)
  const sink: string[] = [];
  // ...
  expect(sink.some(l => l.includes("2 models ·"))).toBe(true);
});

it("does not emit rollup when exactly 1 model runs", async () => {
  const sink: string[] = [];
  // ...
  expect(sink.every(l => !l.includes("models ·"))).toBe(true);
});
```

- [ ] **Step 2: Add the rollup emission**

After the `for` loop in `run-loop.ts`, before `return { perModel }`:

```typescript
    if (perModel.length > 1) {
      yield* Effect.logInfo(
        "\n" +
          formatCrossModelRollup(
            perModel.map((m) => toRollupInput(m.aggregate, m.stats.totalWallTimeSec)),
          ),
      ).pipe(Effect.annotateLogs("scope", "run-loop"));
    }
```

Add imports:

```typescript
import { formatCrossModelRollup, toRollupInput } from "./summary.js";
```

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/orchestration/`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/orchestration/run-loop.ts src/orchestration/__tests__/annotations.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): cross-model rollup on runLoop exit

When more than one model completes, emit a single INF line with the
aggregate completed/cached/errors/wall totals under scope=run-loop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Extended stdout record in `run.ts`

**Goal:** Replace the per-model stdout line with the documented extended form:
`<model>\t<runtime>\t<quant>\tcompleted=<n>\tcached=<n>\terrors=<n>\twall=<s>\tgenTps=<f>\tinterrupted=<bool>\tarchive=<path>`.

**Files:**
- Modify: `src/cli/commands/run.ts`
- Create: `src/cli/__tests__/run-stdout-record.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cli/__tests__/run-stdout-record.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatRunRecord } from "../commands/run.js";

describe("formatRunRecord", () => {
  it("produces the documented tab-separated line", () => {
    const line = formatRunRecord({
      model: "qwen3.5-9b",
      runtime: "mlx",
      quant: "Q4_K_M",
      completed: 38,
      cached: 2,
      errors: 0,
      totalWallTimeSec: 204.3,
      genTps: 18.2,
      interrupted: false,
      archivePath: "./benchmark-archive/run1.jsonl",
    });
    expect(line).toBe(
      "qwen3.5-9b\tmlx\tQ4_K_M\tcompleted=38\tcached=2\terrors=0\twall=204.3\tgenTps=18.2\tinterrupted=false\tarchive=./benchmark-archive/run1.jsonl",
    );
  });
});
```

- [ ] **Step 2: Add `formatRunRecord` + update handler**

In `src/cli/commands/run.ts`:

```typescript
import { averageGenTps } from "../../orchestration/summary.js";

export interface RunRecordInput {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly completed: number;
  readonly cached: number;
  readonly errors: number;
  readonly totalWallTimeSec: number;
  readonly genTps: number;
  readonly interrupted: boolean;
  readonly archivePath: string;
}

export const formatRunRecord = (r: RunRecordInput): string =>
  [
    r.model,
    r.runtime,
    r.quant,
    `completed=${r.completed}`,
    `cached=${r.cached}`,
    `errors=${r.errors}`,
    `wall=${r.totalWallTimeSec.toFixed(1)}`,
    `genTps=${r.genTps.toFixed(1)}`,
    `interrupted=${r.interrupted}`,
    `archive=${r.archivePath}`,
  ].join("\t");
```

Replace the existing per-model print loop:

```typescript
    for (const m of outcome.perModel) {
      console.log(
        formatRunRecord({
          model: m.manifest.model,
          runtime: m.manifest.runtime,
          quant: m.manifest.quant,
          completed: m.stats.completed,
          cached: m.stats.skippedCached,
          errors: m.stats.errors,
          totalWallTimeSec: m.stats.totalWallTimeSec,
          genTps: averageGenTps(m.aggregate),
          interrupted: m.interrupted,
          archivePath: /* TODO: derive from runId */ "",
        }),
      );
    }
```

`archivePath` derivation: the simplest path is to expose it on `RunModelOutcome`. Go back to `run-model.ts` and add `archivePath: input.archivePath` to the outcome object. Update `RunModelOutcome` accordingly.

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/cli/ src/orchestration/`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts src/cli/__tests__/run-stdout-record.test.ts src/orchestration/run-model.ts
git commit -m "$(cat <<'EOF'
feat(cli): extend per-model stdout record with wall/genTps/archive

Replace the four-column summary line with the documented
tab-separated record: <model>\t<runtime>\t<quant>\tcompleted=…\t
cached=…\terrors=…\twall=…\tgenTps=…\tinterrupted=…\tarchive=…
Existing shell glue keeps working; new keys are tail-appended.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Chat completion Debug logs

**Goal:** Debug lines around each `complete` call: request before, response / error after.

**Files:**
- Modify: `src/llm/chat-completion.ts`
- Modify: `src/llm/chat-completion.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/llm/chat-completion.test.ts`, add:

```typescript
import { LogLevel } from "effect";
import { captureLogs } from "../cli/__tests__/log-capture.js";

it("emits DBG lines around a successful request", async () => {
  const sink: string[] = [];
  // reuse existing mockClient + params setup for a successful call
  // wrap the Effect.provide chain with captureLogs(sink, LogLevel.Debug)
  expect(sink.some(l => l.match(/DBG chat \| POST http:\/\/127\.0\.0\.1:18080/))).toBe(true);
  expect(sink.some(l => l.match(/DBG chat \| response 200 in \d/))).toBe(true);
});
```

- [ ] **Step 2: Implement the logs**

In `src/llm/chat-completion.ts`'s `makeService`, around the `executed` effect:

```typescript
import { Clock, Context, Effect, Layer, Schema } from "effect"; // add Clock

// inside complete:
      const startMs = yield* Clock.currentTimeMillis;
      yield* Effect.logDebug(
        `POST ${url} temp=${params.temperature} max_tokens=${params.maxTokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      const response = yield* executed.pipe(
        Effect.tapError((err) =>
          Effect.gen(function* () {
            const endMs = yield* Clock.currentTimeMillis;
            const elapsed = ((endMs - startMs) / 1000).toFixed(1);
            yield* Effect.logDebug(`error after ${elapsed}s: ${err._tag}`).pipe(
              Effect.annotateLogs("scope", "chat"),
            );
          }),
        ),
      );

      // ...continue reading body, decoding, etc., unchanged...

      const endMs = yield* Clock.currentTimeMillis;
      const elapsed = ((endMs - startMs) / 1000).toFixed(1);
      yield* Effect.logDebug(
        `response 200 in ${elapsed}s, prompt_tokens=${decoded.usage.prompt_tokens} gen_tokens=${decoded.usage.completion_tokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      return { ... };
```

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test -- --run src/llm/`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/llm/chat-completion.ts src/llm/chat-completion.test.ts
git commit -m "$(cat <<'EOF'
feat(llm): DBG logs around chat completions

Log POST URL + temp/max_tokens before the request and response
status + usage counters + elapsed time after. Error path logs the
tag + elapsed. All under scope=chat, Debug level.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Health + cache Debug logs

**Goal:** Debug lines for health poll attempts (retries) and cross-run cache scans.

**Files:**
- Modify: `src/llm/servers/health.ts`
- Modify: `src/orchestration/cache.ts`
- Modify: `src/archive/cache.ts` (the underlying scanner)

- [ ] **Step 1: Add health poll logging**

In `src/llm/servers/health.ts`, the current implementation wraps `probe` in `Effect.retry(...)`. Add a `.tapError` inside `probe` (or wrap the retry schedule so each attempt logs):

```typescript
import { Clock, Duration, Effect, Ref, Schedule } from "effect";

export const waitForHealthy = (
  options: HealthCheckOptions,
): Effect.Effect<void, HealthCheckTimeout, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const pollIntervalMs = options.pollIntervalMs ?? 250;
    const attemptRef = yield* Ref.make(0);
    const maxAttempts = Math.ceil((options.timeoutSec * 1000) / pollIntervalMs);

    const probe = Effect.gen(function* () {
      const n = yield* Ref.updateAndGet(attemptRef, (x) => x + 1);
      return yield* client
        .get(options.url)
        .pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.asVoid,
          Effect.tap(() =>
            Effect.logDebug(`poll ${n}/${maxAttempts} → 200`).pipe(
              Effect.annotateLogs("scope", "health"),
            ),
          ),
          Effect.tapError((err) =>
            Effect.logDebug(
              `poll ${n}/${maxAttempts} → ${err._tag ?? String(err).slice(0, 60)} (retry ${pollIntervalMs}ms)`,
            ).pipe(Effect.annotateLogs("scope", "health")),
          ),
        );
    });

    const schedule = Schedule.spaced(Duration.millis(pollIntervalMs));
    const retried = Effect.retry(probe, { schedule });

    yield* Effect.timeout(retried, Duration.seconds(options.timeoutSec)).pipe(
      Effect.catchAll(() =>
        Effect.fail(new HealthCheckTimeout({ url: options.url, timeoutSec: options.timeoutSec })),
      ),
    );
  });
```

- [ ] **Step 2: Add cache scan logging**

In `src/archive/cache.ts`, locate `findCachedResult` (not read in exploration — implementer: open and inspect). Before the scan begins, log:

```typescript
yield* Effect.logDebug(
  `scanning ${archiveDir} (${files.length} files) for key=(${key.artifact},${key.promptName},${key.promptHash},${key.temperature})`,
).pipe(Effect.annotateLogs("scope", "cache"));
```

After the scan finishes:

```typescript
yield* Effect.logDebug(
  candidates.length === 0
    ? "0 candidates"
    : `${candidates.length} candidates, picked runId=${winner.runId} (most recent)`,
).pipe(Effect.annotateLogs("scope", "cache"));
```

(Adjust local variable names to match what the file already uses. If `files` / `candidates` / `winner` aren't defined, add them — they should already be implicit in the scan logic.)

- [ ] **Step 3: Add minimal log assertions**

Append to `src/llm/servers/health.test.ts` (or the existing cache test file) a quick check that Debug-level runs produce the expected lines; skip if the existing harness is painful to extend and rely on the smoke-test acceptance instead.

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/llm/servers/health.ts src/archive/cache.ts
git commit -m "$(cat <<'EOF'
feat(health,cache): DBG logs for poll attempts and cache scans

health poll now emits a debug line per attempt (success or retry)
with attempt number and total budget. Archive cache scan logs the
directory + file count + key before reading and the candidate/winner
count after. Debug-level only; no Info-level noise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: SSE + watchdog + session Debug logs

**Goal:** Fine-grained Debug logs for scenario internals.

**Files:**
- Modify: `src/game/admiral/sse.ts`
- Modify: `src/game/session/watchdog.ts`
- Modify: `src/game/session/run-session.ts`

- [ ] **Step 1: SSE event logging**

In `src/game/admiral/sse.ts`'s `eventsFromBody`, tap each emitted event:

```typescript
    Stream.mapEffect((line) =>
      Effect.gen(function* () {
        // ...existing parse/decode/map logic...
        if (outcome.kind === "event") {
          yield* Effect.logDebug(
            `tick=${outcome.event.tick} event=${outcome.event.event}`,
          ).pipe(Effect.annotateLogs("scope", "sse"));
          return [outcome.event];
        }
        return [];
      }),
    ),
```

- [ ] **Step 2: Watchdog tick logging**

In `src/game/session/watchdog.ts`, after each `observe` update, log a snapshot at Debug:

```typescript
    const observe = (event: AgentEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Ref.update(ref, (state) => { /* existing logic */ });
        const snap = yield* Ref.get(ref);
        yield* Effect.logDebug(
          `elapsed=— tokens=${snap.totalTokens} toolCalls=${snap.toolCallCount} (limits: ${cutoffs.wallClockSec}s/${cutoffs.totalTokens}/${cutoffs.toolCalls})`,
        ).pipe(Effect.annotateLogs("scope", "watchdog"));
      });
```

(`elapsed` is tricky without a session start — leave it as `—` or remove the field; spec shows it but the watchdog alone doesn't own wall-clock elapsed. Prefer to remove the `elapsed=…` slot.)

Refined:

```typescript
        yield* Effect.logDebug(
          `tokens=${snap.totalTokens} toolCalls=${snap.toolCallCount} (limits: ${cutoffs.wallClockSec}s/${cutoffs.totalTokens}/${cutoffs.toolCalls})`,
        ).pipe(Effect.annotateLogs("scope", "watchdog"));
```

- [ ] **Step 3: Session boundary logging**

In `src/game/session/run-session.ts`, at each Admiral / admin HTTP boundary inside `work`, emit Debug lines. The call sites are explicit: `deps.admin.reset`, `deps.admin.resolveCredential`, `acquireProfile`, `deps.admin.getPlayerStats`. Wrap each with `.tap(...)` or insert a preceding `yield* Effect.logDebug(...)` line.

Example for `acquireProfile`:

```typescript
    yield* Effect.logDebug(`configure + create profile for scenario ${input.scenario.name}`).pipe(
      Effect.annotateLogs("scope", "session"),
    );
    const profile = yield* acquireProfile(deps.admiral, { ... });
    yield* Effect.logDebug(`profile ${profile.profileId} ready`).pipe(
      Effect.annotateLogs("scope", "session"),
    );
```

Tool-call events: the scenario's tool calls flow through SSE; no separate scope here unless the implementer finds a cleaner capture point. If not obvious, skip the tool-call-args variant and rely on the SSE log.

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green. No assertions added for these Debug lines beyond what Task 15's smoke covers — they're low-priority for correctness and high-noise to test directly.

- [ ] **Step 5: Commit**

```bash
git add src/game/admiral/sse.ts src/game/session/watchdog.ts src/game/session/run-session.ts
git commit -m "$(cat <<'EOF'
feat(game): DBG logs for SSE events, watchdog ticks, session boundaries

SSE emits one DBG line per mapped AgentEvent carrying tick + event
type. The watchdog's observe() logs a post-update snapshot of
tokens/toolCalls against the cutoff limits. run-session logs each
Admiral/admin HTTP boundary (profile acquire, stats fetch). All
under Debug level; no Info-level noise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Acceptance smoke + docs

**Goal:** Verify the three acceptance criteria from the spec end-to-end, and note the new flag in `README.md`.

**Files:**
- Modify: `README.md`
- Manual: run `./bench run` with the smoke corpus in three modes

- [ ] **Step 1: README update**

Add a short section after the CLI reference in `README.md`:

```markdown
### Logging

`./bench run` writes a terse per-prompt / per-scenario progress stream to
stderr, plus an end-of-model summary block. Stdout stays machine-readable —
one tab-separated record per model with `completed=`, `cached=`, `errors=`,
`wall=`, `genTps=`, `interrupted=`, `archive=` fields.

Pass `--verbose` (`-v`) to add intra-call detail (HTTP requests, cache
scans, health polls, SSE events, watchdog ticks).
```

- [ ] **Step 2: Smoke-run the acceptance criteria**

Run, on a terminal, against the smoke corpus (these commands are copy-paste from the spec's acceptance section):

```bash
./bench run --model-name qwen3.5-9b --prompts-dir smoke-prompts --scenarios none --max-tokens 128 --archive-dir /tmp/bench-obs-smoke --fresh
```

Observe on stderr: per-prompt lines, LLM-server boot/shutdown lines, and the end-of-model block.

```bash
./bench run --model-name qwen3.5-9b --prompts-dir smoke-prompts --scenarios none --max-tokens 128 --archive-dir /tmp/bench-obs-smoke --fresh 2>/dev/null
```

Observe: only the stdout record line. No block, no progress lines.

```bash
./bench run --model-name qwen3.5-9b --prompts-dir smoke-prompts --scenarios none --max-tokens 128 --archive-dir /tmp/bench-obs-smoke --fresh --verbose
```

Observe: additional DBG lines for `chat`, `health`, `cache`.

If any criterion fails, open the relevant task's commit and fix — do not land the plan until all three pass.

- [ ] **Step 3: Full test suite once more**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: green.

- [ ] **Step 4: Commit the README update**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): document logging output + --verbose flag

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review summary

- **Spec coverage:** every spec section maps to a task.
  - Stdout vs. stderr → Tasks 1–2 (logger writes stderr) + Task 11 (stdout record on stdout).
  - Verbosity flag → Task 2.
  - Logger wiring → Tasks 1–2.
  - Log-line format → Task 1 (formatter) + Tasks 3–14 (scope/annotation use).
  - Annotation boundaries → Task 3.
  - Info content (run-loop, supervisor, admiral+gameserver, prompt, scenario, end-of-model, rollup) → Tasks 3, 4, 5, 7, 8, 9, 10.
  - Debug content (chat, health, cache, sse, watchdog, session, supervisor extras) → Tasks 4 (supervisor debug), 12 (chat), 13 (health+cache), 14 (sse+watchdog+session).
  - Stdout record extension → Task 11.
  - Aggregator + duration formatting → Task 6.
  - Testing — formatter / aggregator / phases-logging / stdout-record — covered.
  - Backwards compat — tail-extension of the stdout record is baked into `formatRunRecord`.
  - Out-of-scope items are not implemented (peak-memory, json-format, ANSI, migrate/report new logs).

- **Type consistency:** `makeLoggerLayer`, `captureLogs`, `formatLogLine`, `ModelAggregate`, `emptyAggregate`, `recordPrompt`, `recordScenario`, `averageGenTps`, `averagePromptTps`, `slowest3`, `formatModelBlock`, `formatCrossModelRollup`, `toRollupInput`, `formatRunRecord`, `RunRecordInput` all match across tasks that reference them.

- **Placeholder scan:** no TODO / TBD. A couple of implementer-notes are guidance about following neighbouring test idioms — they contain enough signal to proceed without waving hands.
