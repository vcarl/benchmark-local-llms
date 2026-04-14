import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "../../../schema/execution.js";
import type { PromptCorpusEntry } from "../../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../../schema/scenario.js";
import { formatScoredLine, resolveCorpusEntry } from "../score.js";

const executionResult = (overrides: Partial<ExecutionResult> = {}): ExecutionResult =>
  ({
    runId: "r1",
    executedAt: "2024-01-01T00:00:00Z",
    promptName: "math_direct",
    temperature: 0.7,
    model: "test-model",
    runtime: "mlx",
    quant: "",
    promptTokens: 0,
    generationTokens: 0,
    promptTps: 0,
    generationTps: 0,
    peakMemoryGb: 0,
    wallTimeSec: 0,
    output: "",
    error: null,
    promptHash: "h",
    scenarioHash: null,
    scenarioName: null,
    terminationReason: null,
    toolCallCount: null,
    finalPlayerStats: null,
    events: null,
    ...overrides,
  }) as ExecutionResult;

const prompt = (name: string): PromptCorpusEntry =>
  ({
    name,
    category: "math",
    tier: 1,
    system: { key: "cot", text: "" },
    promptText: "",
    scorer: { type: "exact_match", expected: "42", extract: "(\\d+)" },
    promptHash: "h",
  }) as unknown as PromptCorpusEntry;

const scenario = (name: string): ScenarioCorpusEntry =>
  ({
    name,
    fixture: "fx",
    players: [],
    scorer: "noop",
    scorerParams: {},
    cutoffs: { wallClockSec: 60, totalTokens: 1000, toolCalls: 10 },
    tier: 1,
    scenarioMd: "",
    scenarioHash: "h",
  }) as unknown as ScenarioCorpusEntry;

describe("resolveCorpusEntry", () => {
  it("resolves a scenario result against the scenario corpus", () => {
    const r = executionResult({ scenarioName: "pvp_skirmish", promptName: "pvp_skirmish" });
    const prompts: Record<string, PromptCorpusEntry> = {};
    const scenarios: Record<string, ScenarioCorpusEntry> = {
      pvp_skirmish: scenario("pvp_skirmish"),
    };
    expect(resolveCorpusEntry(r, prompts, scenarios)).toBe(scenarios["pvp_skirmish"]);
  });

  it("resolves a prompt result against the prompt corpus", () => {
    const r = executionResult({ scenarioName: null, promptName: "math_direct" });
    const prompts: Record<string, PromptCorpusEntry> = { math_direct: prompt("math_direct") };
    const scenarios: Record<string, ScenarioCorpusEntry> = {};
    expect(resolveCorpusEntry(r, prompts, scenarios)).toBe(prompts["math_direct"]);
  });

  it("returns null when no corpus entry matches", () => {
    const r = executionResult({ promptName: "unknown" });
    expect(resolveCorpusEntry(r, {}, {})).toBeNull();
  });
});

describe("formatScoredLine", () => {
  it("renders 'no-corpus' when score is null", () => {
    const r = executionResult();
    expect(formatScoredLine(r, null)).toContain("no-corpus");
  });

  it("renders the score rounded to 3 decimals", () => {
    const r = executionResult();
    expect(formatScoredLine(r, { score: 0.6666666, details: "ok" })).toContain("0.667");
  });

  it("includes model, prompt name, and temperature in the output", () => {
    const r = executionResult({ model: "qwen-72b", promptName: "prompt_x", temperature: 1.0 });
    const line = formatScoredLine(r, { score: 1, details: "" });
    expect(line).toContain("qwen-72b");
    expect(line).toContain("prompt_x");
    expect(line).toContain("temp=1");
  });
});
