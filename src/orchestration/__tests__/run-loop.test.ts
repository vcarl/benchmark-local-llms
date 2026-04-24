/**
 * Top-level runLoop tests. We rely on the runModel tests to cover the inner
 * correctness; here we focus on loop-level behaviours:
 *   - model filtering (active, name filter)
 *   - one archive file per model
 *   - empty-model-list is a clean no-op
 *   - per-model outcomes are returned in order
 */
import * as fsp from "node:fs/promises";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { ServerSpawnError } from "../../errors/index.js";
import { type RunLoopConfig, runLoop } from "../run-loop.js";
import type { LlmServerFactory } from "../run-model.js";
import {
  fakeDeps,
  fakeLlmServerFactory,
  inertHttpClientLayer,
  listFiles,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  sampleEnv,
  sampleModel,
  samplePromptExact,
} from "./fixtures.js";

const runtimeLayer = Layer.mergeAll(NodeContext.layer, inertHttpClientLayer);

const baseConfig = (dir: string, overrides: Partial<RunLoopConfig> = {}): RunLoopConfig => ({
  models: [sampleModel()],
  promptCorpus: [samplePromptExact({ name: "p1" })],
  scenarioCorpus: [],
  systemPrompts: { direct: "Be brief." },
  temperatures: [0.7],
  archiveDir: dir,
  fresh: false,
  maxTokens: 256,
  noSave: false,
  ...overrides,
});

describe("runLoop", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("runs one model, producing one archive file", async () => {
    const { layer } = makeChatCompletionMock({});
    const outcome = await Effect.runPromise(
      runLoop(baseConfig(dir), fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(1);
    const files = await listFiles(dir);
    expect(files.length).toBe(1);
    expect(files[0]?.endsWith(".jsonl")).toBe(true);
  });

  it("filters out inactive models", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Active", active: true }),
        sampleModel({ name: "Inactive", active: false }),
      ],
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(1);
    expect(outcome.perModel[0]?.manifest.model).toBe("Active");
  });

  it("applies modelNameFilter (substring, case-insensitive)", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Qwen 3 32B", artifact: "q/qwen" }),
        sampleModel({ name: "Llama 3 70B", artifact: "l/llama" }),
      ],
      modelNameFilter: "qwen",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(1);
    expect(outcome.perModel[0]?.manifest.model).toBe("Qwen 3 32B");
  });

  it("modelNameFilter also matches against the artifact string", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Qwen 3.5 9B", artifact: "unsloth/Qwen3.5-9B-GGUF" }),
        sampleModel({ name: "Qwen 3.5 9B", artifact: "mlx-community/Qwen3.5-9B-4bit" }),
      ],
      modelNameFilter: "unsloth",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(1);
    expect(outcome.perModel[0]?.manifest.artifact).toBe("unsloth/Qwen3.5-9B-GGUF");
  });

  it("applies quantFilter (substring, case-insensitive)", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "A", quant: "Q8_0" }),
        sampleModel({ name: "B", quant: "4bit" }),
        sampleModel({ name: "C", quant: "Q6_K" }),
      ],
      quantFilter: "q8",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.map((m) => m.manifest.model)).toEqual(["A"]);
  });

  it("applies paramsFilter (substring, case-insensitive)", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Small", params: "7B" }),
        sampleModel({ name: "Medium", params: "32B" }),
        sampleModel({ name: "Large", params: "72B" }),
      ],
      paramsFilter: "32b",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.map((m) => m.manifest.model)).toEqual(["Medium"]);
  });

  it("quantFilter + paramsFilter stack (AND)", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "A", quant: "Q8_0", params: "7B" }),
        sampleModel({ name: "B", quant: "Q8_0", params: "32B" }),
        sampleModel({ name: "C", quant: "4bit", params: "32B" }),
      ],
      quantFilter: "q8",
      paramsFilter: "32B",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.map((m) => m.manifest.model)).toEqual(["B"]);
  });

  it("quantFilter skips models with no quant value set", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "WithQuant", quant: "Q8_0" }),
        sampleModel({ name: "NoQuant", quant: undefined }),
      ],
      quantFilter: "q8",
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.map((m) => m.manifest.model)).toEqual(["WithQuant"]);
  });

  it("empty models → empty outcome, no archive files", async () => {
    const { layer } = makeChatCompletionMock({});
    const outcome = await Effect.runPromise(
      runLoop(baseConfig(dir, { models: [] }), fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(0);
    const files = await fsp.readdir(dir);
    expect(files.length).toBe(0);
  });

  it("logs ERR and continues when a single model fails to spawn", async () => {
    const { layer } = makeChatCompletionMock({});
    const failingLlm: LlmServerFactory = (m) =>
      m.name === "Broken"
        ? Effect.fail(
            new ServerSpawnError({
              runtime: m.runtime,
              reason: "No cached .gguf for x/broken (quant=Q8_0)",
            }),
          )
        : fakeLlmServerFactory(m);
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Broken", artifact: "x/broken" }),
        sampleModel({ name: "Working", artifact: "x/working" }),
      ],
    });
    const logs: string[] = [];
    const outcome = await Effect.runPromise(
      runLoop(config, { ...fakeDeps(), llmServer: failingLlm }, sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(logs)),
      ),
    );
    expect(outcome.perModel.length).toBe(1);
    expect(outcome.perModel[0]?.manifest.model).toBe("Working");
    const skipLog = logs.find((l) => l.includes("skipping Broken"));
    expect(skipLog).toBeDefined();
    expect(skipLog).toContain("No cached .gguf for x/broken");
    expect(skipLog).toContain(" ERR run-loop | ");
  });

  it("writes one archive per model when multiple models are active", async () => {
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "M1", artifact: "a/m1" }),
        sampleModel({ name: "M2", artifact: "a/m2" }),
      ],
    });
    const outcome = await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
      ),
    );
    expect(outcome.perModel.length).toBe(2);
    const files = await listFiles(dir);
    expect(files.length).toBe(2);
  });
});
