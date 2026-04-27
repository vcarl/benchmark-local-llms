import { describe, expect, it } from "vitest";
import {
  aggregateForList,
  aggregateForRunList,
  aggregateForScatter,
  applyFilters,
  applyVariantFilters,
  groupRunsByModel,
} from "./pipeline";
import type { BenchmarkResult } from "./data";

const baseRec: BenchmarkResult = {
  model: "Qwen3 32B", runtime: "llamacpp", quant: "Q4_K_M",
  prompt_name: "p", category: "code", tier: 2, temperature: 0.7,
  tags: ["code-synthesis"], is_scenario: false,
  score: 0.9, score_details: "",
  prompt_tokens: 10, generation_tokens: 20,
  prompt_tps: 100, generation_tps: 50,
  wall_time_sec: 1, peak_memory_gb: 16,
  output: "", prompt_text: "",
  scenario_name: null, termination_reason: null,
  tool_call_count: null, final_player_stats: null, events: null,
  run_id: "", executed_at: "",
};
const mk = (o: Partial<BenchmarkResult>): BenchmarkResult => ({ ...baseRec, ...o });

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
  it("excludes via negative filter", () => {
    const data = [mk({ tags: ["TODO"] }), mk({ tags: ["code-synthesis"] })];
    expect(applyFilters(data, { tagsExclude: ["TODO"] }).length).toBe(1);
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
  const baseRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p1", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 100, generation_tokens: 400, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    run_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("one dot per (model, runtime, quant, temperature) combo", () => {
    const data = [
      baseRec({ score: 0.7 }),
      baseRec({ score: 0.8 }), // same variant → same dot
      baseRec({ runtime: "mlx", score: 0.6 }),
      baseRec({ quant: "q4", score: 0.5 }),
      baseRec({ temperature: 0.7, score: 0.65 }),
    ];
    const dots = aggregateForScatter(data);
    expect(dots).toHaveLength(4);
  });

  it("averages score and tokens within a variant", () => {
    const data = [
      baseRec({ score: 0.6, prompt_tokens: 100, generation_tokens: 400 }), // 500 total
      baseRec({ score: 0.8, prompt_tokens: 100, generation_tokens: 600 }), // 700 total
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.score).toBeCloseTo(70); // (60+80)/2 as percentage
    expect(dot.tokens).toBe(600); // (500+700)/2
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
});

import { CAPABILITY_TAGS } from "./constants";

describe("aggregateForList", () => {
  const mkRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    run_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("bestScore is max across variants", () => {
    const rows = aggregateForList([
      mkRec({ runtime: "llamacpp", score: 0.68 }),
      mkRec({ runtime: "mlx", score: 0.65 }),
    ], "model");
    expect(rows[0].bestScore).toBe(68);
  });

  it("efficiency = round(tokens / score%) for the best variant", () => {
    const rows = aggregateForList([
      mkRec({ score: 0.8, prompt_tokens: 200, generation_tokens: 2600 }), // 2800 total
    ], "model");
    // 2800 / 80 = 35
    expect(rows[0].efficiency).toBe(35);
  });

  it("variants sorted best-first", () => {
    const rows = aggregateForList([
      mkRec({ runtime: "llamacpp", quant: "q4", score: 0.63 }),
      mkRec({ runtime: "llamacpp", quant: "q8", score: 0.68 }),
      mkRec({ runtime: "mlx", quant: "q4", score: 0.65 }),
    ], "model");
    const scores = rows[0].variants.map((v) => v.score);
    expect(scores).toEqual([68, 65, 63]);
  });

  it("capability profile has 10 entries (one per CAPABILITY_TAG)", () => {
    const rows = aggregateForList([mkRec({ tags: ["tool-use"] })], "model");
    expect(rows[0].capability).toHaveLength(CAPABILITY_TAGS.length);
  });

  it("capability entries with zero runs have pass=null", () => {
    const rows = aggregateForList([
      mkRec({ tags: ["tool-use"], score: 0.9 }),
    ], "model");
    const toolUse = rows[0].capability.find((c) => c.tag === "tool-use");
    expect(toolUse?.pass).toBeCloseTo(1.0); // score 0.9 >= PASS_THRESHOLD (0.5)
    expect(toolUse?.runs).toBe(1);
    const factualRecall = rows[0].capability.find((c) => c.tag === "factual-recall");
    expect(factualRecall?.pass).toBeNull();
    expect(factualRecall?.runs).toBe(0);
  });
});

describe("aggregateForRunList", () => {
  const mkRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    run_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
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

  it("score and tokens averaged within variant", () => {
    const [row] = aggregateForRunList([
      mkRec({ score: 0.6, prompt_tokens: 100, generation_tokens: 400 }),
      mkRec({ score: 0.8, prompt_tokens: 100, generation_tokens: 600 }),
    ]);
    expect(row.score).toBeCloseTo(70);
    expect(row.tokens).toBe(600);
  });

  it("efficiency = round(tokens / score)", () => {
    const [row] = aggregateForRunList([
      mkRec({ score: 0.8, prompt_tokens: 200, generation_tokens: 2600 }),
    ]);
    expect(row.efficiency).toBe(35); // 2800 / 80 = 35
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
      mkRec({ runtime: "llamacpp", tags: ["tool-use"], score: 0.9 }),
      mkRec({ runtime: "mlx", tags: ["tool-use"], score: 0.1 }),
    ]);
    const llama = rows.find((r) => r.runtime === "llamacpp");
    const mlx = rows.find((r) => r.runtime === "mlx");
    const llamaToolUse = llama?.capability.find((c) => c.tag === "tool-use");
    const mlxToolUse = mlx?.capability.find((c) => c.tag === "tool-use");
    expect(llamaToolUse?.pass).toBe(1);
    expect(mlxToolUse?.pass).toBe(0);
  });
});

describe("groupRunsByModel", () => {
  const mkRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    run_id: "", executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("groups variants by baseModel; orders groups by primary", () => {
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0.6 }),
      mkRec({ model: "A", runtime: "mlx", score: 0.5 }),
      mkRec({ model: "B", runtime: "llamacpp", score: 0.8 }),
      mkRec({ model: "B", runtime: "mlx", score: 0.4 }),
    ]);
    const groups = groupRunsByModel(rows, "score", "score");
    expect(groups.map((g) => g.baseModel)).toEqual(["B", "A"]);
  });

  it("sorts rows within a group by secondary", () => {
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0.6 }),
      mkRec({ model: "A", runtime: "mlx", score: 0.8 }),
      mkRec({ model: "A", runtime: "vllm", score: 0.7 }),
    ]);
    const groups = groupRunsByModel(rows, "score", "score");
    expect(groups[0].rows.map((r) => r.runtime)).toEqual(["mlx", "vllm", "llamacpp"]);
  });

  it("efficiency sort orders ascending (lower = better)", () => {
    // Two variants with same score but different token counts → different efficiency
    const rows = aggregateForRunList([
      // efficiency = round(800 / 80) = 10
      mkRec({ model: "A", runtime: "llamacpp", score: 0.8, prompt_tokens: 100, generation_tokens: 700 }),
      // efficiency = round(2400 / 80) = 30
      mkRec({ model: "A", runtime: "mlx", score: 0.8, prompt_tokens: 100, generation_tokens: 2300 }),
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
    // Within A: secondary=score → mlx leads (0.9). A's primaryValue (memory) = 20 (mlx)
    // Within B: secondary=score → llamacpp leads (0.8). B's primaryValue (memory) = 4
    // Primary asc → B first
    const rows = aggregateForRunList([
      mkRec({ model: "A", runtime: "llamacpp", score: 0.5, peak_memory_gb: 8 }),
      mkRec({ model: "A", runtime: "mlx", score: 0.9, peak_memory_gb: 20 }),
      mkRec({ model: "B", runtime: "llamacpp", score: 0.8, peak_memory_gb: 4 }),
    ]);
    const groups = groupRunsByModel(rows, "memory", "score");
    expect(groups.map((g) => g.baseModel)).toEqual(["B", "A"]);
  });
});
