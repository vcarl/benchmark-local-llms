import { describe, expect, it } from "vitest";
import {
  aggregateRuns,
  applyFilters,
  challengeBreakdown,
  computeConfigScores,
  computeScatterPoints,
  starPointsForWallTime,
  computeTpsDomain,
  opacityForTps,
} from "./pipeline";
import type { RunRow, RunGroup, ScatterPoint, TpsDomain } from "./pipeline";
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
    rec({ config_hash: "c3", artifact: "Llama-3-8B", runtime: "llamacpp", quant: null, temperature: 0.4, challenge_id: "code", challenge_version: 2 }),
  ];
  it("narrows by family", () => {
    expect(applyFilters(data, { family: ["Qwen"] }).map((r) => r.config_hash)).toEqual(["c1"]);
  });
  it("narrows by quant with null → —", () => {
    expect(applyFilters(data, { quant: ["—"] }).map((r) => r.config_hash)).toEqual(["c2", "c3"]);
  });
  it("narrows by temperature (string match) and challenge (base id, version-agnostic)", () => {
    expect(applyFilters(data, { temperature: ["0.4"] }).map((r) => r.config_hash)).toEqual(["c2", "c3"]);
    // base id "code" matches both versions (v1 in c1, v2 in c3)
    expect(applyFilters(data, { challenge: ["code"] }).map((r) => r.config_hash)).toEqual(["c1", "c3"]);
  });
  it("empty filters pass everything", () => {
    expect(applyFilters(data, {})).toHaveLength(3);
  });
});

describe("challengeBreakdown", () => {
  it("one row per (challenge,version) the config ran, pooled passRate per attempt", () => {
    const rows = challengeBreakdown(
      [
        rec({ config_hash: "c1", attempt_id: "a1", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 3 }),
        rec({ config_hash: "c1", attempt_id: "a2", challenge_id: "math", challenge_version: 2, item_count: 2, passed_items: 0 }),
        rec({ config_hash: "c2", attempt_id: "a3", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 4 }),
      ],
      "c1",
    );
    expect(rows.map((r) => r.challengeKey)).toEqual(["code@1", "math@2"]);
    expect(rows[0]!.passRate).toBeCloseTo(0.75, 10);
    expect(rows[0]!.attemptId).toBe("a1");
    expect(rows[1]!.passRate).toBe(0);
  });

  it("collapses re-runs of the same config+challenge to one row (latest attempt)", () => {
    // Same config_hash ran "code@1" twice (a re-run). The pane must show one row,
    // not accumulate a duplicate-keyed row per attempt.
    const rows = challengeBreakdown(
      [
        rec({ config_hash: "c1", attempt_id: "old", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 1, finished_at: "2026-06-21T00:00:00.000Z" }),
        rec({ config_hash: "c1", attempt_id: "new", challenge_id: "code", challenge_version: 1, item_count: 4, passed_items: 3, finished_at: "2026-06-22T00:00:00.000Z" }),
      ],
      "c1",
    );
    expect(rows.map((r) => r.challengeKey)).toEqual(["code@1"]);
    expect(rows).toHaveLength(1);
    // keeps the most recent attempt
    expect(rows[0]!.attemptId).toBe("new");
    expect(rows[0]!.passRate).toBeCloseTo(0.75, 10);
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

  it("wall_time_sec is the sum of all attempts wall_time_sec", () => {
    const pts = computeScatterPoints([
      rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "code", wall_time_sec: 10 }),
      rec({ config_hash: "c1", artifact: "Qwen2.5-7B", challenge_id: "math", wall_time_sec: 25 }),
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.wall_time_sec).toBe(35); // 10 + 25
  });

  it("returns [] for empty input", () => {
    expect(computeScatterPoints([])).toEqual([]);
  });
});

describe("starPointsForWallTime", () => {
  // formula: floor(log2(max(s,1)) * 1.08) - 1, clamped to [4, 15]
  it("short runs clamped to 4 points (minimum)", () => {
    expect(starPointsForWallTime(1)).toBe(4);
    expect(starPointsForWallTime(10)).toBe(4);
    expect(starPointsForWallTime(30)).toBe(4);
  });

  it("5 minutes (300s) gives 7 points", () => {
    expect(starPointsForWallTime(300)).toBe(7);
  });

  it("30 minutes (1800s) gives 10 points", () => {
    expect(starPointsForWallTime(1800)).toBe(10);
  });

  it("2 hours (7200s) gives 12 points", () => {
    expect(starPointsForWallTime(7200)).toBe(12);
  });

  it("10 hours (36000s) gives 15 points (hits max)", () => {
    expect(starPointsForWallTime(36000)).toBe(15);
  });

  it("very long runs are clamped to 15 points (maximum)", () => {
    expect(starPointsForWallTime(1e9)).toBe(15);
  });
});

describe("computeTpsDomain", () => {
  it("returns domain from generation_tps values", () => {
    const points = [
      { generation_tps: 5 },
      { generation_tps: 50 },
      { generation_tps: 200 },
    ] as ScatterPoint[];
    const d = computeTpsDomain(points);
    expect(d.min).toBe(5);
    expect(d.max).toBe(200);
  });

  it("filters out non-positive / non-finite values; single valid value gives degenerate domain", () => {
    const points = [
      { generation_tps: 0 },
      { generation_tps: -1 },
      { generation_tps: 10 },
    ] as ScatterPoint[];
    const d = computeTpsDomain(points);
    expect(d.min).toBe(10);
    // degenerate: max is nudged slightly above min so log scale doesn't blow up
    expect(d.max).toBeGreaterThan(10);
    expect(d.max).toBeLessThan(10.1);
  });

  it("returns safe degenerate domain for empty array", () => {
    const d = computeTpsDomain([]);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
  });
});

describe("opacityForTps", () => {
  it("min tps → OPACITY_MIN (0.35)", () => {
    const domain: TpsDomain = { min: 10, max: 200 };
    expect(opacityForTps(10, domain)).toBeCloseTo(0.35, 5);
  });

  it("max tps → OPACITY_MAX (0.95)", () => {
    const domain: TpsDomain = { min: 10, max: 200 };
    expect(opacityForTps(200, domain)).toBeCloseTo(0.95, 5);
  });

  it("mid tps → value between OPACITY_MIN and OPACITY_MAX", () => {
    const domain: TpsDomain = { min: 10, max: 200 };
    const mid = opacityForTps(Math.sqrt(10 * 200), domain);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(0.95);
  });

  it("non-positive tps → OPACITY_MIN", () => {
    const domain: TpsDomain = { min: 10, max: 200 };
    expect(opacityForTps(0, domain)).toBe(0.35);
    expect(opacityForTps(-5, domain)).toBe(0.35);
  });

  it("degenerate domain returns midpoint opacity", () => {
    const domain: TpsDomain = { min: 10, max: 10 };
    const mid = opacityForTps(10, domain);
    expect(mid).toBeCloseTo((0.35 + 0.95) / 2, 5);
  });
});
