import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import type { ChatCompletionService } from "../../llm/chat-completion.js";
import { ChatCompletion } from "../../llm/chat-completion.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { RunStats } from "../../schema/run-manifest.js";
import { runPromptPhase, runScenarioPhase } from "../phases.js";
import type { RunModelInput } from "../run-model.js";
import { emptyAggregate, type ModelAggregate } from "../summary.js";
import {
  agentEvent,
  fakeAdmiralClient,
  fakeGameSessionFactory,
  fakeServerHandle,
  inertHttpClientLayer,
  sampleScenario,
} from "./fixtures.js";

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

const failingChat = (cause: unknown): ChatCompletionService => ({
  // Cast via `never` — `runPrompt` only stringifies the cause, so we can
  // inject any shape without breaking the declared error channel.
  complete: () => Effect.fail(cause as never),
});

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
    archiveId: "a1",
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

  it("emits an ERROR line for failing prompts with error truncated to 200 chars + …", async () => {
    // `runPrompt`'s `stringifyLlmError` caps `result.error` at 200 chars —
    // verify the logged line carries the capped error end-to-end.
    const longCause = "A".repeat(250);
    const sink: string[] = [];
    const statsRef = await Effect.runPromise(Ref.make<RunStats>(baseInput().manifest.stats));
    const aggRef = await Effect.runPromise(Ref.make<ModelAggregate>(emptyAggregate()));
    await Effect.runPromise(
      runPromptPhase(baseInput(), statsRef, aggRef).pipe(
        Effect.provide(
          Layer.merge(
            captureLogs(sink, LogLevel.Info),
            Layer.succeed(ChatCompletion, failingChat(longCause)),
          ),
        ),
        Effect.provide(NodeContext.layer),
      ),
    );
    const line = sink.find((l) => l.includes("prompt 1/1") && l.includes("ERROR:"));
    expect(line).toBeDefined();
    expect(line).toContain(`ERROR: ${"A".repeat(200)}`);
  });
});

describe("scenario phase logging", () => {
  it("emits an INF line with scenario name, termination reason, ticks, tool calls, wall time", async () => {
    // 12 events total, 5 of which are tool_call; natural stream completion
    // → terminationReason: "completed", toolCallCount: 5, events.length: 12.
    const events = [
      agentEvent("tool_call", { name: "build" }),
      agentEvent("tool_result", {}),
      agentEvent("tool_call", { name: "run" }),
      agentEvent("tool_result", {}),
      agentEvent("tool_call", { name: "inspect" }),
      agentEvent("tool_result", {}),
      agentEvent("tool_call", { name: "grow" }),
      agentEvent("tool_result", {}),
      agentEvent("tool_call", { name: "harvest" }),
      agentEvent("tool_result", {}),
      agentEvent("turn_end", { totalTokensIn: 100, totalTokensOut: 200 }),
      agentEvent("turn_end", { totalTokensIn: 150, totalTokensOut: 300 }),
    ];
    const scenario = sampleScenario({ name: "bootstrap_grind" });
    const input: RunModelInput = {
      ...baseInput(),
      scenarios: [scenario],
    };
    const sink: string[] = [];
    const statsRef = await Effect.runPromise(Ref.make<RunStats>(input.manifest.stats));
    const aggRef = await Effect.runPromise(Ref.make<ModelAggregate>(emptyAggregate()));
    const admiral = {
      baseUrl: "http://127.0.0.1:3031",
      client: fakeAdmiralClient,
    };
    const llmHandle = await Effect.runPromise(fakeServerHandle(18081));
    await Effect.runPromise(
      runScenarioPhase(
        input,
        fakeGameSessionFactory({ events }),
        admiral,
        llmHandle,
        statsRef,
        aggRef,
      ).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(captureLogs(sink, LogLevel.Info), inertHttpClientLayer)),
        Effect.provide(NodeContext.layer),
      ),
    );
    const line = sink.find((l) => l.includes("scenario 1/1 bootstrap_grind"));
    expect(line).toBeDefined();
    expect(line).toContain("\u2014 completed");
    expect(line).toContain("ticks=12");
    expect(line).toContain("toolCalls=5");
    expect(line).toMatch(/\d+\.\ds/);
  });
});
