import { describe, expect, it } from "vitest";
import {
  applyFilters,
  groupRows,
  aggregate,
  sortRows,
  type Filters,
  type GroupBy,
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
      mk({ tier: 2, runtime: "llamacpp" }),
      mk({ tier: 3, runtime: "llamacpp" }),
      mk({ tier: 2, runtime: "mlx" }),
    ];
    expect(applyFilters(data, { tier: [2], runtime: ["llamacpp"] }).length).toBe(1);
  });
  it("excludes via negative filter", () => {
    const data = [mk({ tags: ["TODO"] }), mk({ tags: ["code-synthesis"] })];
    expect(applyFilters(data, { tagsExclude: ["TODO"] }).length).toBe(1);
  });
});

describe("groupRows + aggregate", () => {
  it("groups by model and computes mean + passRate", () => {
    const data = [
      mk({ model: "A", score: 1.0 }),
      mk({ model: "A", score: 0.3 }),
      mk({ model: "A", score: 0.8 }),
      mk({ model: "B", score: 0.1 }),
    ];
    const groups = groupRows(data, "modelOnly");
    const rows = aggregate(groups, "modelOnly");
    const a = rows.find((r) => r.key === "A")!;
    expect(a.meanScore).toBeCloseTo((1.0 + 0.3 + 0.8) / 3);
    expect(a.passRate).toBeCloseTo(2 / 3); // >= 0.5: 1.0 and 0.8
    expect(rows.find((r) => r.key === "B")?.passRate).toBe(0);
  });

  it("groups by tag and explodes multi-tag results", () => {
    const data = [
      mk({ tags: ["tool-use", "long-term-planning"], score: 0.9 }),
      mk({ tags: ["tool-use"], score: 0.5 }),
    ];
    const groups = groupRows(data, "tag");
    const rows = aggregate(groups, "tag");
    expect(rows.find((r) => r.key === "tool-use")?.runs.length).toBe(2);
    expect(rows.find((r) => r.key === "long-term-planning")?.runs.length).toBe(1);
  });

  it("emits capabilityProfile with per-tag means for model groupings", () => {
    const data = [
      mk({ model: "A", tags: ["code-synthesis"], score: 0.9 }),
      mk({ model: "A", tags: ["math-reasoning"], score: 0.4 }),
    ];
    const rows = aggregate(groupRows(data, "model"), "model");
    const profile = rows[0].capabilityProfile;
    expect(profile["code-synthesis"]?.mean).toBe(0.9);
    expect(profile["math-reasoning"]?.mean).toBe(0.4);
    expect(profile["factual-recall"]).toBeUndefined();
  });
});

describe("sortRows", () => {
  it("sorts descending by meanScore", () => {
    const rows = [
      { key: "a", label: "a", meanScore: 0.5, passRate: 0, capabilityProfile: {}, runs: [] },
      { key: "b", label: "b", meanScore: 0.9, passRate: 0, capabilityProfile: {}, runs: [] },
    ];
    const out = sortRows(rows as never, { field: "meanScore", dir: "desc" });
    expect(out[0].key).toBe("b");
  });
});
