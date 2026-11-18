import { describe, expect, it } from "vitest";
import { computeTpsDomain, opacityForTps, starPointsForWallTime, type ScatterPoint, type TpsDomain } from "./encoding";

describe("starPointsForWallTime", () => {
  // formula: round(0.4 + 0.55 * max(s,1)^0.32), clamped to [2, 24]
  it("short runs clamped to 2 points (minimum)", () => {
    expect(starPointsForWallTime(0)).toBe(2);
    expect(starPointsForWallTime(1)).toBe(2);
    expect(starPointsForWallTime(10)).toBe(2);
  });

  it.each([
    [30, 2],
    [300, 4],
    [1800, 6],
    [7200, 10],
    [36000, 16],
  ])("%ds gives %d points", (seconds, points) => {
    expect(starPointsForWallTime(seconds)).toBe(points);
  });

  it("very long runs are clamped to 24 points (maximum)", () => {
    expect(starPointsForWallTime(1e9)).toBe(24);
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
