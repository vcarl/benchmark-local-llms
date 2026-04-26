import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, LogLevel } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { type RunLoopConfig, runLoop } from "../run-loop.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  sampleEnv,
  sampleModel,
  samplePromptExact,
} from "./fixtures.js";

const runtimeLayer = Layer.mergeAll(NodeContext.layer, inertHttpClientLayer);

const baseConfig = (dir: string, overrides: Partial<RunLoopConfig> = {}): RunLoopConfig => ({
  runId: "r-test",
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

describe("annotation boundaries", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("per-model INF line carries model/runtime/quant/archiveId/runId annotations", async () => {
    const sink: string[] = [];
    const { layer } = makeChatCompletionMock({});
    await Effect.runPromise(
      runLoop(baseConfig(dir), fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    const entry = sink.find((l) => l.includes("model 1/1"));
    expect(entry).toBeDefined();
    expect(entry).toContain(`model="Test Model"`);
    expect(entry).toContain("runtime=mlx");
    expect(entry).toContain("quant=4bit");
    expect(entry).toMatch(/archiveId=[^ ]+/);
    expect(entry).toContain("runId=r-test");
  });

  it("logs skipped inactive models", async () => {
    const sink: string[] = [];
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "Active", active: true }),
        sampleModel({ name: "Inactive", active: false }),
      ],
    });
    await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    const skip = sink.find((l) => l.includes("skipping inactive model: Inactive"));
    expect(skip).toBeDefined();
    expect(skip).toContain("model=Inactive");
    expect(skip).toContain("runtime=mlx");
  });

  it("logs skipped filter-missed models", async () => {
    const sink: string[] = [];
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [sampleModel({ name: "Alpha" }), sampleModel({ name: "Beta" })],
      modelNameFilter: "alpha",
    });
    await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    const skip = sink.find((l) => l.includes("skipping (filter miss): Beta"));
    expect(skip).toBeDefined();
    expect(skip).toContain("model=Beta");
    expect(skip).toContain("runtime=mlx");
  });

  it("emits a cross-model rollup line when >1 model runs", async () => {
    const sink: string[] = [];
    const { layer } = makeChatCompletionMock({});
    const config = baseConfig(dir, {
      models: [
        sampleModel({ name: "M1", artifact: "a/m1" }),
        sampleModel({ name: "M2", artifact: "a/m2" }),
      ],
    });
    await Effect.runPromise(
      runLoop(config, fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    expect(sink.some((l) => l.includes("2 models ·"))).toBe(true);
    const rollup = sink.find((l) => l.includes("2 models ·"));
    expect(rollup).toContain(" run-loop | ");
  });

  it("does NOT emit the rollup when only one model runs", async () => {
    const sink: string[] = [];
    const { layer } = makeChatCompletionMock({});
    await Effect.runPromise(
      runLoop(baseConfig(dir), fakeDeps(), sampleEnv).pipe(
        Effect.provide(layer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    expect(sink.every((l) => !l.includes("models ·"))).toBe(true);
  });
});
