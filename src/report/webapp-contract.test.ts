import { describe, expect, it } from "vitest";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

const makeExecution = (overrides: Partial<ExecutionResult> = {}): ExecutionResult => ({
  runId: "r1",
  executedAt: "2026-01-01T00:00:00.000Z",
  promptName: "math_multiply_direct",
  temperature: 0.3,
  model: "Test Model",
  runtime: "mlx",
  quant: "4bit",
  promptTokens: 10,
  generationTokens: 5,
  promptTps: 123.456789,
  generationTps: 42.1111,
  peakMemoryGb: 3.141599,
  wallTimeSec: 1.999999,
  output: "the answer is 4183",
  error: null,
  promptHash: "abc123",
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
  ...overrides,
});

const promptEntry: PromptCorpusEntry = {
  name: "math_multiply_direct",
  category: "math",
  tier: 1,
  system: { key: "direct", text: "Be concise." },
  promptText: "What is 47*89?",
  scorer: { type: "exact_match", expected: "4183", extract: "(\\d+)" },
  promptHash: "abc123",
};

const scenarioEntry: ScenarioCorpusEntry = {
  name: "bootstrap_grind",
  fixture: "fixture.json",
  players: [],
  scorer: "bootstrap_grind",
  scorerParams: {},
  cutoffs: { wallClockSec: 600, totalTokens: 100000, toolCalls: 50 },
  tier: 2,
  scenarioMd: "# directive",
  scenarioHash: "xyz789",
};

const score: Score = { score: 1, details: "exact match" };

describe("toWebappRecord", () => {
  it("produces snake_case fields from a prompt execution", () => {
    const rec = toWebappRecord(makeExecution(), promptEntry, score);

    // Spot-check all snake_case names are present
    expect(rec).toHaveProperty("prompt_name", "math_multiply_direct");
    expect(rec).toHaveProperty("prompt_tokens", 10);
    expect(rec).toHaveProperty("generation_tokens", 5);
    expect(rec).toHaveProperty("wall_time_sec");
    expect(rec).toHaveProperty("peak_memory_gb");
    expect(rec).toHaveProperty("score_details", "exact match");
    expect(rec).toHaveProperty("prompt_text", "What is 47*89?");
    expect(rec).toHaveProperty("prompt_tps");
    expect(rec).toHaveProperty("generation_tps");
  });

  it("rounds tps/memory/wall time to 2 decimal places", () => {
    const rec = toWebappRecord(makeExecution(), promptEntry, score);
    expect(rec.prompt_tps).toBe(123.46);
    expect(rec.generation_tps).toBe(42.11);
    expect(rec.peak_memory_gb).toBe(3.14);
    expect(rec.wall_time_sec).toBe(2);
  });

  it("leaves token counts and score unrounded", () => {
    const rec = toWebappRecord(
      makeExecution({ promptTokens: 999, generationTokens: 777 }),
      promptEntry,
      { score: 0.6666666, details: "partial" },
    );
    expect(rec.prompt_tokens).toBe(999);
    expect(rec.generation_tokens).toBe(777);
    expect(rec.score).toBe(0.6666666);
  });

  it("maps scenario entries with category='game' and empty prompt_text", () => {
    const rec = toWebappRecord(
      makeExecution({ promptName: "bootstrap_grind", scenarioName: "bootstrap_grind" }),
      scenarioEntry,
      score,
    );
    expect(rec.category).toBe("game");
    expect(rec.prompt_text).toBe("");
    expect(rec.tier).toBe(2);
  });

  it("has no `style` field (removed per §2.1/§10.1)", () => {
    const rec = toWebappRecord(makeExecution(), promptEntry, score) as WebappRecord &
      Record<string, unknown>;
    expect(Object.hasOwn(rec, "style")).toBe(false);
  });

  it("preserves runtime verbatim (webapp expects 'mlx'|'llamacpp')", () => {
    expect(toWebappRecord(makeExecution({ runtime: "mlx" }), promptEntry, score).runtime).toBe(
      "mlx",
    );
    expect(toWebappRecord(makeExecution({ runtime: "llamacpp" }), promptEntry, score).runtime).toBe(
      "llamacpp",
    );
  });
});
