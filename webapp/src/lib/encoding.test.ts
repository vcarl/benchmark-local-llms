import { describe, expect, it } from "vitest";
import { computeTpsDomain, opacityForTps, starPointsForWallTime, type ScatterPoint, type TpsDomain } from "./encoding";

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
