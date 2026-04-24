import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreExecution } from "./score-result.js";

const baseResult: ExecutionResult = {
  runId: "r1",
  executedAt: "2026-04-14T00:00:00.000Z",
  promptName: "p",
  temperature: 0.7,
  model: "test",
  runtime: "mlx",
  quant: "4bit",
  promptTokens: 0,
  generationTokens: 0,
  promptTps: 0,
  generationTps: 0,
  peakMemoryGb: 0,
  wallTimeSec: 0,
  output: "",
  error: null,
  promptHash: "hash",
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
};

describe("scoreExecution", () => {
  it("dispatches exact_match prompt entries", async () => {
    const result: ExecutionResult = { ...baseResult, output: "The answer is 42." };
    const entry: PromptCorpusEntry = {
      name: "p",
      category: "smoke",
      tier: 1,
      system: { key: "direct", text: "" },
      promptText: "what is 42",
      scorer: { type: "exact_match", expected: "42", extract: "answer is (\\d+)" },
      promptHash: "hash",
    };
    const out = await Effect.runPromise(
      scoreExecution(result, entry).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.score).toBe(1);
  });

  it("dispatches constraint prompt entries", async () => {
    const result: ExecutionResult = { ...baseResult, output: "abc def ghi" };
    const entry: PromptCorpusEntry = {
      name: "p",
      category: "smoke",
      tier: 1,
      system: { key: "direct", text: "" },
      promptText: "q",
      scorer: {
        type: "constraint",
        constraints: [{ check: "contains", name: "has_abc", value: "abc" }],
      },
      promptHash: "hash",
    };
    const out = await Effect.runPromise(
      scoreExecution(result, entry).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.score).toBe(1);
  });

  it("dispatches scenario entries via the game scorer registry", async () => {
    const result: ExecutionResult = {
      ...baseResult,
      finalPlayerStats: { stats: { credits_earned: 5000 } },
      events: [{ event: "tool_call", tick: 0, ts: "2026-04-14T00:00:00.000Z", data: {} }],
    };
    const entry: ScenarioCorpusEntry = {
      name: "s",
      fixture: "f",
      players: [],
      scorer: "bootstrap_grind",
      scorerParams: {},
      cutoffs: { wallClockSec: 0, totalTokens: 0, toolCalls: 0 },
      tier: 1,
      scenarioMd: "",
      scenarioHash: "h",
    };
    const out = await Effect.runPromise(
      scoreExecution(result, entry).pipe(Effect.provide(NodeContext.layer)),
    );
    // 1 credit_earned=5000 → credit_score=40; 1 tool call → accuracy=1 → efficiency=20,
    // activity=clamp(1/30,1)*20≈0.67, ratio=clamp((5000/1)/30,1)*20=20 → 80.67 / 100
    expect(out.score).toBeCloseTo(0.8066, 3);
  });

  it("fails with ScorerNotFound for an unknown scenario scorer name", async () => {
    const entry: ScenarioCorpusEntry = {
      name: "s",
      fixture: "f",
      players: [],
      scorer: "nonexistent_scorer",
      scorerParams: {},
      cutoffs: { wallClockSec: 0, totalTokens: 0, toolCalls: 0 },
      tier: 1,
      scenarioMd: "",
      scenarioHash: "h",
    };
    const exit = await Effect.runPromiseExit(
      scoreExecution(baseResult, entry).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("ScorerNotFound");
    }
  });
});
