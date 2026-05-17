import { describe, expect, it } from "vitest";
import {
  aggregateForRunList,
  aggregateForScatter,
  applyFilters,
  applyVariantFilters,
  groupRunsByModel,
} from "./pipeline";
import { normalizeRecord, type BenchmarkResult, type PromptBenchmarkResult } from "./data";

const baseRec: PromptBenchmarkResult = {
  kind: "prompt",
  model: "Qwen3 32B", runtime: "llamacpp", quant: "Q4_K_M",
  prompt_name: "p", category: "code", tier: 2, temperature: 0.7,
  tags: ["code-synthesis"], is_scenario: false,
  score: 0.9, score_details: "", score_breakdown: null,
  prompt_tokens: 10, generation_tokens: 20,
  prompt_tps: 100, generation_tps: 50,
  wall_time_sec: 1, peak_memory_gb: 16,
  output: "", prompt_text: "",
  scenario_name: null, termination_reason: null,
  tool_call_count: null, final_player_stats: null, events: null,
  has_events: false,
  run_id: "", archive_id: "", executed_at: "",
};
const mk = (o: Partial<PromptBenchmarkResult>): BenchmarkResult => ({ ...baseRec, ...o });

describe("applyFilters", () => {
  it("includes all when filters empty", () => {
    const data = [mk({}), mk({ model: "X" })];
    expect(applyFilters(data, {}).length).toBe(2);
  });
  it("filters by tags (OR within dimension)", () => {
    const data = [
      mk({ tags: ["code-synthesis"] }),
      mk({ tags: ["math-reasoning"] }),
      mk({ tags: ["factual-recall"] }),
    ];
    const out = applyFilters(data, { tags: ["code-synthesis", "math-reasoning"] });
    expect(out.length).toBe(2);
  });
  it("AND across chips", () => {
    const data = [
      mk({ category: "code", runtime: "llamacpp" }),
      mk({ category: "math", runtime: "llamacpp" }),
      mk({ category: "code", runtime: "mlx" }),
    ];
    expect(applyFilters(data, { category: ["code"], runtime: ["llamacpp"] }).length).toBe(1);
  });
  it("paramRange filters by parsed model size; null sizes pass through", () => {
    const data = [
      mk({ model: "Qwen3 8B" }),
      mk({ model: "Qwen3 32B" }),
      mk({ model: "Qwen3 72B" }),
      mk({ model: "GPT-mystery" }), // null size — should pass through
    ];
    const out = applyFilters(data, { paramRange: { min: 10, max: 50 } });
    expect(out.map((r) => r.model).sort()).toEqual(["GPT-mystery", "Qwen3 32B"]);
  });
  it("tempRange filters by temperature inclusively", () => {
    const data = [
      mk({ temperature: 0 }),
      mk({ temperature: 0.7 }),
      mk({ temperature: 1.2 }),
    ];
    const out = applyFilters(data, { tempRange: { min: 0.5, max: 1.0 } });
    expect(out.map((r) => r.temperature)).toEqual([0.7]);
  });
});

describe("applyVariantFilters", () => {
  it("drops whole variants by total wall_time, keeping all records of variants in range", () => {
    const data = [
      // llamacpp variant: total wall_time = 5+7 = 12 — in [0,30]
      mk({ runtime: "llamacpp", wall_time_sec: 5, prompt_name: "a" }),
      mk({ runtime: "llamacpp", wall_time_sec: 7, prompt_name: "b" }),
      // mlx variant: total wall_time = 10+90 = 100 — out of [0,30]
      mk({ runtime: "mlx", wall_time_sec: 10, prompt_name: "a" }),
      mk({ runtime: "mlx", wall_time_sec: 90, prompt_name: "b" }),
    ];
    const out = applyVariantFilters(data, { durationRange: { min: 0, max: 30 } });
    expect(out.length).toBe(2);
    expect(out.every((r) => r.runtime === "llamacpp")).toBe(true);
  });
  it("returns input unchanged when no variant-level filter is set", () => {
    const data = [mk({ wall_time_sec: 5 }), mk({ wall_time_sec: 999 })];
    expect(applyVariantFilters(data, {})).toBe(data);
  });
});

describe("aggregateForScatter", () => {
  const baseRec = (over: Partial<PromptBenchmarkResult>): BenchmarkResult => ({
    kind: "prompt",
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p1", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "", score_breakdown: null,
    prompt_tokens: 100, generation_tokens: 400, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null, has_events: false,
    run_id: "", archive_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("one dot per (model, runtime, quant, temperature) combo", () => {
    const data = [
      baseRec({ score: 1 }),
      baseRec({ score: 0 }), // same variant → same dot
      baseRec({ runtime: "mlx", score: 1 }),
      baseRec({ quant: "q4", score: 0 }),
      baseRec({ temperature: 0.7, score: 1 }),
    ];
    const dots = aggregateForScatter(data);
    expect(dots).toHaveLength(4);
  });

  it("score is the pass rate (proportion of runs with score===1) and tokens are total generation across the variant", () => {
    const data = [
      baseRec({ prompt_name: "p1", score: 0, prompt_tokens: 100, generation_tokens: 400 }),
      baseRec({ prompt_name: "p2", score: 1, prompt_tokens: 100, generation_tokens: 600 }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.score).toBeCloseTo(50); // 1 of 2 distinct prompts passed
    expect(dot.tokens).toBe(1000); // 400 + 600 generation_tokens; prompt_tokens excluded
  });

  it("partial credit (score < 1) is a fail", () => {
    const data = [
      baseRec({ prompt_name: "p1", score: 0.99 }),
      baseRec({ prompt_name: "p2", score: 1 }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.score).toBeCloseTo(50);
  });

  it("uses max peak_memory_gb across runs in the variant", () => {
    const data = [
      baseRec({ peak_memory_gb: 4.0 }),
      baseRec({ peak_memory_gb: 8.5 }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.mem).toBe(8.5);
  });

  it("falls back to sibling-variant memory when a variant lacks it", () => {
    const data = [
      baseRec({ runtime: "llamacpp", peak_memory_gb: 8.5 }),
      baseRec({ runtime: "mlx", peak_memory_gb: 0 }),
    ];
    const dots = aggregateForScatter(data);
    const mlxDot = dots.find((d) => d.runtime === "mlx");
    expect(mlxDot?.mem).toBe(8.5);
  });

  it("omits a dot when no variant has memory data for the base model", () => {
    const data = [
      baseRec({ runtime: "llamacpp", peak_memory_gb: 0 }),
      baseRec({ runtime: "mlx", peak_memory_gb: 0 }),
    ];
    const dots = aggregateForScatter(data);
    expect(dots).toHaveLength(0);
  });

  it("uses earliest executed_at when variant has multiple runs", () => {
    const data = [
      baseRec({ executed_at: "2026-04-05T00:00:00Z" }),
      baseRec({ executed_at: "2026-04-01T00:00:00Z" }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.executedAt).toBe("2026-04-01T00:00:00Z");
  });

  it("totalTokens scopes to prompt records only (scenarios excluded)", () => {
    // Scenario gen tokens (~500k) would dominate the sum if included.
    // Tokens reported should be prompt-only generation_tokens.
    const data: BenchmarkResult[] = [
      baseRec({ prompt_name: "p1", score: 1, prompt_tokens: 100, generation_tokens: 400 }),
      normalizeRecord({
        kind: "scenario",
        model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
        prompt_name: "sandbox", scenario_name: "sandbox", category: "scenario",
        tier: 1, temperature: 0, tags: [], is_scenario: true,
        value: 0, score_field: "tool_call_count", score_details: "",
        prompt_tokens: 5000, generation_tokens: 495000,
        prompt_tps: 0, generation_tps: 0,
        wall_time_sec: 0, peak_memory_gb: 8.5,
        output: "", prompt_text: "",
        run_id: "", archive_id: "", executed_at: "2026-04-01T00:00:00Z",
      }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.tokens).toBe(400); // generation_tokens of the lone prompt record
  });
});

describe("aggregateForRunList", () => {
  const mkRec = (over: Partial<PromptBenchmarkResult>): BenchmarkResult => ({
    kind: "prompt",
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "", score_breakdown: null,
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null, has_events: false,
    run_id: "", archive_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("one row per (model, runtime, quant, temperature) variant", () => {
    const rows = aggregateForRunList([
      mkRec({ runtime: "llamacpp" }),
      mkRec({ runtime: "llamacpp" }), // same variant
      mkRec({ runtime: "mlx" }),
      mkRec({ quant: "q4" }),
      mkRec({ temperature: 0.7 }),
    ]);
    expect(rows).toHaveLength(4);
  });

  it("score is the variant pass rate; tokens are total generation across the variant", () => {
    const [row] = aggregateForRunList([
      mkRec({ prompt_name: "p1", score: 0, prompt_tokens: 100, generation_tokens: 400 }),
      mkRec({ prompt_name: "p2", score: 1, prompt_tokens: 100, generation_tokens: 600 }),
    ]);
    expect(row.score).toBeCloseTo(50);
    expect(row.tokens).toBe(1000); // 400 + 600 generation_tokens
  });

  it("efficiency = round(tokens / pass%)", () => {
    const [row] = aggregateForRunList([
      mkRec({ score: 1, prompt_tokens: 200, generation_tokens: 2600 }),
    ]);
    expect(row.efficiency).toBe(26); // 2600 / 100 = 26
  });

  it("mem falls back to model-level max when variant lacks it", () => {
    const rows = aggregateForRunList([
      mkRec({ runtime: "llamacpp", peak_memory_gb: 12 }),
      mkRec({ runtime: "mlx", peak_memory_gb: 0 }),
    ]);
    const mlx = rows.find((r) => r.runtime === "mlx");
    expect(mlx?.mem).toBe(12);
  });

  it("capability scoped to this variant only", () => {
    const rows = aggregateForRunList([
      mkRec({ runtime: "llamacpp", tags: ["tool-use"], score: 1 }),
      mkRec({ runtime: "mlx", tags: ["tool-use"], score: 0 }),
    ]);
    const llama = rows.find((r) => r.runtime === "llamacpp");
    const mlx = rows.find((r) => r.runtime === "mlx");
    const llamaToolUse = llama?.capability.find((c) => c.tag === "tool-use");
    const mlxToolUse = mlx?.capability.find((c) => c.tag === "tool-use");
    expect(llamaToolUse?.pass).toBe(1);
    expect(mlxToolUse?.pass).toBe(0);
  });

  it("tokens scopes to prompt records only (scenarios excluded)", () => {
    // Scenario contributes ~500k tokens — without filtering it would skew
    // the row's `tokens` and corrupt `efficiency = tokens / score`.
    const data: BenchmarkResult[] = [
      mkRec({ prompt_name: "p1", score: 1, prompt_tokens: 200, generation_tokens: 600 }),
      normalizeRecord({
        kind: "scenario",
        model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
        prompt_name: "sandbox", scenario_name: "sandbox", category: "scenario",
        tier: 1, temperature: 0, tags: [], is_scenario: true,
        value: 0, score_field: "tool_call_count", score_details: "",
        prompt_tokens: 5000, generation_tokens: 495000,
        prompt_tps: 0, generation_tps: 0,
        wall_time_sec: 0, peak_memory_gb: 8.5,
        output: "", prompt_text: "",
        run_id: "", archive_id: "", executed_at: "2026-04-01T00:00:00Z",
      }),
    ];
    const [row] = aggregateForRunList(data);
    expect(row.tokens).toBe(600); // generation_tokens of the prompt; scenario excluded
  });
});

describe("groupRunsByModel", () => {
  const mkRec = (over: Partial<PromptBenchmarkResult>): BenchmarkResult => ({
    kind: "prompt",
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "", score_breakdown: null,
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null, has_events: false,
    run_id: "", archive_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("groups variants by baseModel; orders groups by primary", () => {
    // A llamacpp: 1/1 = 100%; A mlx: 0/1 = 0%
    // B llamacpp: 1/1 = 100%, B mlx: 1/1 = 100% — but tie broken by name (A=100% lead vs B=100% lead)
    // To make B win we use B llamacpp 1/1 = 100, B mlx = 100, A llamacpp = 100, A mlx = 0.
    // Lead row by score within each group: A→100, B→100. Tie broken by baseModel asc → A first.
    // So make A's best = 0%, B's best = 100% to force B leading.
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0 }),
      mkRec({ model: "A", runtime: "mlx", score: 0 }),
      mkRec({ model: "B", runtime: "llamacpp", score: 1 }),
      mkRec({ model: "B", runtime: "mlx", score: 0 }),
    ]);
    const groups = groupRunsByModel(rows, "score", "score");
    expect(groups.map((g) => g.baseModel)).toEqual(["B", "A"]);
  });

  it("sorts rows within a group by secondary", () => {
    // Use multi-run variants so pass rates differ: mlx 100% > vllm 50% > llamacpp 0%
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0 }),
      mkRec({ model: "A", runtime: "llamacpp", score: 0 }),
      mkRec({ model: "A", runtime: "mlx", score: 1 }),
      mkRec({ model: "A", runtime: "mlx", score: 1 }),
      mkRec({ model: "A", runtime: "vllm", score: 1 }),
      mkRec({ model: "A", runtime: "vllm", score: 0 }),
    ]);
    const groups = groupRunsByModel(rows, "score", "score");
    expect(groups[0].rows.map((r) => r.runtime)).toEqual(["mlx", "vllm", "llamacpp"]);
  });

  it("efficiency sort orders ascending (lower = better)", () => {
    // Two variants with same pass rate but different token counts → different efficiency
    const rows = aggregateForRunList([
      // efficiency = round(700 / 100) = 7
      mkRec({ model: "A", runtime: "llamacpp", score: 1, prompt_tokens: 100, generation_tokens: 700 }),
      // efficiency = round(2300 / 100) = 23
      mkRec({ model: "A", runtime: "mlx", score: 1, prompt_tokens: 100, generation_tokens: 2300 }),
    ]);
    const groups = groupRunsByModel(rows, "score", "efficiency");
    expect(groups[0].rows.map((r) => r.runtime)).toEqual(["llamacpp", "mlx"]);
  });

  it("memory sort orders ascending; primary picks group's lead memory", () => {
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", peak_memory_gb: 20 }),
      mkRec({ model: "A", runtime: "mlx", peak_memory_gb: 8 }),
      mkRec({ model: "B", runtime: "llamacpp", peak_memory_gb: 4 }),
    ]);
    const groups = groupRunsByModel(rows, "memory", "memory");
    expect(groups.map((g) => g.baseModel)).toEqual(["B", "A"]);
    expect(groups[1].rows.map((r) => r.runtime)).toEqual(["mlx", "llamacpp"]);
  });

  it("primary uses lead row's metric AFTER secondary sort within group", () => {
    // Within A: secondary=score → mlx leads (100%). A's primaryValue (memory) = 20 (mlx)
    // Within B: secondary=score → llamacpp leads (100%). B's primaryValue (memory) = 4
    // Primary asc → B first
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0, peak_memory_gb: 8 }),
      mkRec({ model: "A", runtime: "mlx", score: 1, peak_memory_gb: 20 }),
      mkRec({ model: "B", runtime: "llamacpp", score: 1, peak_memory_gb: 4 }),
    ]);
    const groups = groupRunsByModel(rows, "memory", "score");
    expect(groups.map((g) => g.baseModel)).toEqual(["B", "A"]);
  });
});
