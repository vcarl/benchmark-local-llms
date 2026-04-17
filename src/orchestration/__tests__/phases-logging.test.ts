import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import type { ChatCompletionService } from "../../llm/chat-completion.js";
import { ChatCompletion } from "../../llm/chat-completion.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { RunStats } from "../../schema/run-manifest.js";
import { runPromptPhase } from "../phases.js";
import type { RunModelInput } from "../run-model.js";
import { emptyAggregate, type ModelAggregate } from "../summary.js";

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
    env: {
      hostname: "h",
      platform: "darwin-arm64",
      runtimeVersion: "u",
      nodeVersion: "u",
      benchmarkGitSha: "u",
    },
    temperatures: [0.7],
    promptCorpus: {},
    scenarioCorpus: {},
    stats: {
      totalPrompts: 1,
      totalExecutions: 0,
      completed: 0,
      skippedCached: 0,
      errors: 0,
      totalWallTimeSec: 0,
    },
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
        Effect.provide(NodeContext.layer),
      ),
    );
    const line = sink.find((l) => l.includes("prompt 1/1"));
    expect(line).toBeDefined();
    expect(line).toContain("code_4 @0.7 \u2192");
    expect(line).toContain("20 gen tok");
    expect(line).toContain("18.0 tps gen");
    expect(line).toContain("140.0 tps prompt");
  });
});
