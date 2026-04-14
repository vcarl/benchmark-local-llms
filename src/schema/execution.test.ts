import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AgentEvent, ExecutionResult } from "./execution.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("AgentEvent", () => {
  it.each([
    "tool_call",
    "tool_result",
    "tool_error",
    "turn_end",
    "error",
    "connection",
  ] as const)("round-trips %s event", (eventType) => {
    const v: AgentEvent = {
      event: eventType,
      tick: 17,
      ts: "2026-04-14T12:00:00.000Z",
      data: { tool: "navigate", target: "alpha-centauri" },
    };
    expect(roundTrip(AgentEvent, v)).toEqual(v);
  });

  it("round-trips with empty data", () => {
    const v: AgentEvent = {
      event: "connection",
      tick: 0,
      ts: "2026-04-14T12:00:00Z",
      data: {},
    };
    expect(roundTrip(AgentEvent, v)).toEqual(v);
  });
});

describe("ExecutionResult", () => {
  it("round-trips a prompt result (no scenario fields)", () => {
    const v: ExecutionResult = {
      runId: "2026-04-14_qwen3-32b_4bit_a1b2c3",
      executedAt: "2026-04-14T12:34:56.000Z",
      promptName: "math_multiply_cot",
      temperature: 0.7,
      model: "Qwen 3 32B",
      runtime: "mlx",
      quant: "4bit",
      promptTokens: 42,
      generationTokens: 128,
      promptTps: 100.5,
      generationTps: 42.3,
      peakMemoryGb: 18.7,
      wallTimeSec: 3.14,
      output: "ANSWER: 4183",
      error: null,
      promptHash: "abc123def456",
      scenarioHash: null,
      scenarioName: null,
      terminationReason: null,
      toolCallCount: null,
      finalPlayerStats: null,
      events: null,
    };
    expect(roundTrip(ExecutionResult, v)).toEqual(v);
  });

  it("round-trips a scenario result with events", () => {
    const v: ExecutionResult = {
      runId: "2026-04-14_qwen3-32b_4bit_a1b2c3",
      executedAt: "2026-04-14T12:34:56Z",
      promptName: "bootstrap_grind",
      temperature: 0.7,
      model: "Qwen 3 32B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      promptTokens: 500,
      generationTokens: 2000,
      promptTps: 80.2,
      generationTps: 30.1,
      peakMemoryGb: 22.5,
      wallTimeSec: 120.0,
      output: "",
      error: null,
      promptHash: "scenhash12ab",
      scenarioHash: "scenhash12ab",
      scenarioName: "bootstrap_grind",
      terminationReason: "wall_clock",
      toolCallCount: 42,
      finalPlayerStats: { credits: 500, stats: { credits_earned: 500 } },
      events: [
        {
          event: "tool_call",
          tick: 1,
          ts: "2026-04-14T12:35:00Z",
          data: { tool: "dock" },
        },
      ],
    };
    expect(roundTrip(ExecutionResult, v)).toEqual(v);
  });

  it("round-trips a result with a non-null error string", () => {
    const v: ExecutionResult = {
      runId: "run1",
      executedAt: "2026-04-14T00:00:00Z",
      promptName: "bad_prompt",
      temperature: 0.0,
      model: "Test",
      runtime: "mlx",
      quant: "4bit",
      promptTokens: 0,
      generationTokens: 0,
      promptTps: 0,
      generationTps: 0,
      peakMemoryGb: 0,
      wallTimeSec: 0.1,
      output: "",
      error: "LlmRequestError: connection refused",
      promptHash: "000000000000",
      scenarioHash: null,
      scenarioName: null,
      terminationReason: null,
      toolCallCount: null,
      finalPlayerStats: null,
      events: null,
    };
    expect(roundTrip(ExecutionResult, v)).toEqual(v);
  });
});
