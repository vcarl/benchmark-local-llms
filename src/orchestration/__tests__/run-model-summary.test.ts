/**
 * Covers the end-of-model summary-block emission in `runModel`. The block
 * is rendered by `summary.formatModelBlock` and pushed through a single
 * `Effect.logInfo` call under `scope=run-model` just before the outcome
 * returns. Cross-model rollup lives in `run-loop.ts` (T10).
 */
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, LogLevel } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openManifest } from "../../archive/__tests__/fixtures.js";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { runModel } from "../run-model.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

const runtimeLayer = Layer.mergeAll(NodeContext.layer, inertHttpClientLayer);

describe("runModel — summary block emission", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("emits a formatted end-of-model block and exposes the aggregate on the outcome", async () => {
    const archivePath = path.join(dir, "run.jsonl");
    const manifest = openManifest({
      artifact: "art-1",
      runId: "run-1",
      model: "Test Model",
      runtime: "mlx",
      quant: "4bit",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });

    const sink: string[] = [];
    const { layer: chatLayer } = makeChatCompletionMock({});

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(
        Effect.provide(chatLayer),
        Effect.provide(runtimeLayer),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );

    // Header line (rule + label).
    expect(sink.some((l) => l.includes("Test Model · mlx · 4bit"))).toBe(true);
    // Archive path line.
    expect(sink.some((l) => l.includes(`archive     ${archivePath}`))).toBe(true);
    // Interrupted state (natural completion ⇒ false).
    expect(sink.some((l) => l.includes("interrupted false"))).toBe(true);
    // Block is emitted under scope=run-model.
    const blockLine = sink.find((l) => l.includes("Test Model · mlx · 4bit"));
    expect(blockLine).toBeDefined();
    expect(blockLine).toContain(" run-model | ");

    // Outcome carries the terminal aggregate.
    expect(outcome.aggregate.promptStats.completed).toBeGreaterThanOrEqual(0);
    expect(outcome.aggregate.promptStats.completed).toBe(1);
  });
});
