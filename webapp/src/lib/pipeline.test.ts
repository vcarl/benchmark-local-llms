import { describe, expect, it } from "vitest";
import {
  aggregateRuns,
  applyFilters,
  computeConfigScores,
  computeScatterPoints,
} from "./pipeline";
import type { RunRow, RunGroup, ScatterPoint } from "./pipeline";
import type { BenchmarkResult } from "./data";

const rec = (o: Partial<BenchmarkResult>): BenchmarkResult => ({
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llamacpp",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "a", finished_at: "t",
  score: 1, passed: true, generation_tokens: 100, wall_time_sec: 2,
  item_count: 1, passed_items: 1, peak_memory_gb: 0, generation_tps: 0, prompt_tps: 0,
  ...o,
});

describe("computeConfigScores (pooled over items)", () => {
  it("passRate = Σ passed_items / Σ item_count across attempts", () => {
    // attempt A: 3 of 4 items passed; attempt B: 1 of 4 items passed
    // pooled passRate = (3+1)/(4+4) = 0.5
    const s = computeConfigScores([
      rec({ item_count: 4, passed_items: 3, generation_tokens: 100, wall_time_sec: 2, challenge_id: "code" }),
      rec({ item_count: 4, passed_items: 1, generation_tokens: 200, wall_time_sec: 4, challenge_id: "math" }),
    ]);
    // unique=2, completed=2, overallTokens=300, timeSpent=6, denom=1800
    // efficiency = (0.5 * 2 * 2) / 1800 * 1e6 = 1111.1111
    expect(s.passRate).toBeCloseTo(0.5, 10);
    expect(s.efficiency).toBeCloseTo(1111.1111, 3);
  });

  it("passRate falls back to 0 when Σ item_count == 0", () => {
    const s = computeConfigScores([rec({ item_count: 0, passed_items: 0 })]);
    expect(s.passRate).toBe(0);
  });

  it("efficiency is null on zero token/time denom", () => {
    const s = computeConfigScores([rec({ item_count: 1, passed_items: 1, generation_tokens: 0, wall_time_sec: 5 })]);
    expect(s.efficiency).toBeNull();
    expect(s.passRate).toBe(1);
  });

  it("passRate 0 / efficiency null for empty attempts", () => {
    const s = computeConfigScores([]);
    expect(s.passRate).toBe(0);
    expect(s.efficiency).toBeNull();
  });
});

describe("aggregateRuns", () => {
  it("one row per config_hash, grouped by artifact, with stats-block aggregates", () => {
    const groups = aggregateRuns(
      [
        rec({ config_hash: "c1", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 4, generation_tokens: 100, wall_time_sec: 2, generation_tps: 10, peak_memory_gb: 1.5 }),
        rec({ config_hash: "c1", challenge_id: "math", challenge_version: 1, item_count: 4, passed_items: 2, generation_tokens: 200, wall_time_sec: 4, generation_tps: 30, peak_memory_gb: 3.0 }),
        rec({ config_hash: "c2", artifact: "llama", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 1, generation_tokens: 50, wall_time_sec: 1, generation_tps: 5, peak_memory_gb: 8.0 }),
      ],
      "score",
      "score",
    );
    expect(groups.map((g) => g.artifact)).toEqual(["qwen", "llama"]); // qwen 0.75 > llama 0.25
    const qwen = groups.find((g) => g.artifact === "qwen");
    const row = qwen?.rows[0];
    expect(row?.passRate).toBeCloseTo(0.75, 10); // (4+2)/(4+4)
    expect(row?.tokens).toBe(300);
    expect(row?.wallTime).toBe(6);
    expect(row?.mem).toBe(3.0); // max
    expect(row?.genTps).toBe(20); // mean (10+30)/2
    expect(row?.uniqueChallenges).toBe(2);
    expect(row?.itemCount).toBe(8);
    expect(row?.attemptsCompleted).toBe(2);
    expect(row?.family).toBe("Qwen");
  });

  it("returns [] for empty input", () => {
    expect(aggregateRuns([], "score", "score")).toEqual([]);
  });
});

describe("applyFilters", () => {
  const data = [
    rec({ config_hash: "c1", artifact: "Qwen2.5-7B", runtime: "mlx", quant: "4bit", temperature: 0, challenge_id: "code", challenge_version: 1 }),
    rec({ config_hash: "c2", artifact: "Llama-3-8B", runtime: "llamacpp", quant: null, temperature: 0.4, challenge_id: "math", challenge_version: 2 }),
  ];
  it("narrows by family", () => {
    expect(applyFilters(data, { family: ["Qwen"] }).map((r) => r.config_hash)).toEqual(["c1"]);
  });
  it("narrows by quant with null → —", () => {
    expect(applyFilters(data, { quant: ["—"] }).map((r) => r.config_hash)).toEqual(["c2"]);
  });
  it("narrows by temperature (string match) and challenge (id@version)", () => {
    expect(applyFilters(data, { temperature: ["0.4"] }).map((r) => r.config_hash)).toEqual(["c2"]);
    expect(applyFilters(data, { challenge: ["code@1"] }).map((r) => r.config_hash)).toEqual(["c1"]);
  });
  it("empty filters pass everything", () => {
    expect(applyFilters(data, {})).toHaveLength(2);
  });
});

describe("computeScatterPoints", () => {
  it("one point per config_hash with cost-x / quality-y / size / mem / tps", () => {
    const pts = computeScatterPoints([
      rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "code", item_count: 4, passed_items: 4, generation_tokens: 100, wall_time_sec: 2, generation_tps: 10, peak_memory_gb: 1.5 }),
      rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "math", item_count: 4, passed_items: 2, generation_tokens: 200, wall_time_sec: 4, generation_tps: 30, peak_memory_gb: 3.0 }),
    ]);
    expect(pts).toHaveLength(1);
    const p = pts[0]!;
    expect(p.config_hash).toBe("c1");
    expect(p.family).toBe("Qwen");
    expect(p.x).toBe(300); // Σ generation_tokens
    expect(p.y).toBeCloseTo(0.75, 10); // (4+2)/(4+4)
    expect(p.sizeB).toBe(7);
    expect(p.peak_memory_gb).toBe(3.0); // max
    expect(p.generation_tps).toBe(20); // mean
  });

  it("returns [] for empty input", () => {
    expect(computeScatterPoints([])).toEqual([]);
  });
});
