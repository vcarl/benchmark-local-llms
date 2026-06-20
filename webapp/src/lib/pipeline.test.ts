import { describe, expect, it } from "vitest";
import {
  aggregateMatrix,
  bestAttempt,
  computeConfigScores,
} from "./pipeline";
import type { BenchmarkResult } from "./data";

const rec = (o: Partial<BenchmarkResult>): BenchmarkResult => ({
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llamacpp",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "a", finished_at: "t",
  score: 1, passed: true, generation_tokens: 100, wall_time_sec: 2,
  item_count: 1, passed_items: 1, peak_memory_gb: 0, generation_tps: 0, prompt_tps: 0,
  ...o,
});

describe("bestAttempt", () => {
  it("returns the highest-score attempt", () => {
    const best = bestAttempt([rec({ score: 0.4 }), rec({ score: 0.9 }), rec({ score: 0.7 })]);
    expect(best!.score).toBe(0.9);
  });

  it("returns null for empty array", () => {
    expect(bestAttempt([])).toBeNull();
  });
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

describe("aggregateMatrix", () => {
  it("groups configs under artifact, columns = sorted challenges, cell = best attempt", () => {
    const { columns, groups } = aggregateMatrix([
      rec({ config_hash: "c1", challenge_id: "code", attempt_id: "1", score: 0.4, passed: false }),
      rec({ config_hash: "c1", challenge_id: "code", attempt_id: "2", score: 0.9, passed: true }),
      rec({ config_hash: "c1", challenge_id: "math", attempt_id: "3", score: 1, passed: true }),
      rec({ config_hash: "c2", artifact: "llama", challenge_id: "code", attempt_id: "4", score: 0.5, passed: false }),
    ]);
    expect(columns).toEqual(["code", "math"]);
    expect(groups.map((g) => g.artifact)).toEqual(["llama", "qwen"]);
    const qwen = groups.find((g) => g.artifact === "qwen")!;
    expect(qwen.rows[0]!.cells.code).toEqual({ score: 0.9, passed: true }); // best of 0.4/0.9
    expect(qwen.rows[0]!.cells.math).toEqual({ score: 1, passed: true });
  });

  it("returns empty columns and groups for empty input", () => {
    const { columns, groups } = aggregateMatrix([]);
    expect(columns).toEqual([]);
    expect(groups).toEqual([]);
  });

  it("populates passRate and efficiency on ConfigRow", () => {
    // code attempt: item_count=1, passed_items=1; math attempt: item_count=1, passed_items=0
    // pooled passRate = (1+0)/(1+1) = 0.5
    // unique=2, completed=2, tokens=300, time=6, denom=1800
    // efficiency = (0.5 * 2 * 2) / 1800 * 1e6 = 1111.1111
    const { groups } = aggregateMatrix([
      rec({ config_hash: "c1", challenge_id: "code", passed: true, passed_items: 1, item_count: 1, generation_tokens: 100, wall_time_sec: 2 }),
      rec({ config_hash: "c1", challenge_id: "math", passed: false, passed_items: 0, item_count: 1, generation_tokens: 200, wall_time_sec: 4 }),
    ]);
    const row = groups[0]!.rows[0]!;
    expect(row.passRate).toBeCloseTo(0.5, 10);
    expect(row.efficiency).toBeCloseTo(1111.1111, 3);
    expect(row.attemptsCompleted).toBe(2);
  });
});
