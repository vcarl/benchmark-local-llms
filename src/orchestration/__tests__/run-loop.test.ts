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
import { type RunLoopConfig, runLoop } from "../run-loop.js";
import {
  fakeDeps,
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
