import { describe, expect, it } from "vitest";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

const makeExecution = (overrides: Partial<ExecutionResult> = {}): ExecutionResult => ({
  archiveId: "a1",
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

  it("emits tags from the corpus entry", () => {
    const entry = { ...promptEntry, tags: ["math-reasoning", "TODO"] };
    const rec = toWebappRecord(makeExecution(), entry, score);
    expect(rec.tags).toEqual(["math-reasoning", "TODO"]);
    expect(rec.is_scenario).toBe(false);
  });

  it("defaults tags to [] when the corpus entry has no tags", () => {
    const rec = toWebappRecord(makeExecution(), promptEntry, score);
    expect(rec.tags).toEqual([]);
  });

  it("emits scenario fields on a scenario result", () => {
    const scenarioExec = makeExecution({
      promptName: "bootstrap_grind",
      scenarioName: "bootstrap_grind",
      scenarioHash: "xyz789",
      terminationReason: "completed",
      toolCallCount: 47,
      finalPlayerStats: { credits: 2840, fuel: 87 },
      events: [{ event: "tool_call", tick: 1, ts: "1700000000", data: { tool: "scan_system" } }],
    });
    const rec = toWebappRecord(scenarioExec, scenarioEntry, score);
    expect(rec.is_scenario).toBe(true);
    expect(rec.scenario_name).toBe("bootstrap_grind");
    expect(rec.termination_reason).toBe("completed");
    expect(rec.tool_call_count).toBe(47);
    expect(rec.final_player_stats).toEqual({ credits: 2840, fuel: 87 });
    const events = rec.events;
    expect(events).toHaveLength(1);
    expect(events?.[0]?.event).toBe("tool_call");
  });

  it("nulls scenario fields on a prompt result", () => {
    const rec = toWebappRecord(makeExecution(), promptEntry, score);
    expect(rec.is_scenario).toBe(false);
    expect(rec.scenario_name).toBeNull();
    expect(rec.termination_reason).toBeNull();
    expect(rec.tool_call_count).toBeNull();
    expect(rec.final_player_stats).toBeNull();
    expect(rec.events).toBeNull();
  });

  it("includes executed_at from ExecutionResult.executedAt", () => {
    const rec = toWebappRecord(
      makeExecution({ executedAt: "2026-04-14T12:34:56.000Z" }),
      promptEntry,
      score,
    );
    expect(rec.executed_at).toBe("2026-04-14T12:34:56.000Z");
  });

  it("includes run_id from ExecutionResult.runId", () => {
    const rec = toWebappRecord(makeExecution({ runId: "r-2026-04-14-deadbe" }), promptEntry, score);
    expect(rec.run_id).toBe("r-2026-04-14-deadbe");
  });
});
