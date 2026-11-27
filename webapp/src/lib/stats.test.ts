import { describe, expect, it } from "vitest";
import { pairedDiff, passRateSE, tCrit, type Cluster } from "./stats";

const clusters = (ys: number[], n = 10): Map<string, Cluster> =>
  new Map(ys.map((y, i) => [`c${i}`, { n, y }]));

describe("passRateSE", () => {
  it("matches the hand-computed CR1 sandwich SE", () => {
    // r = 30/50 = 0.6; residuals y − 6 = [-1,0,-2,-1,4]; Σ² = 22; √(5/4·22)/50
    expect(passRateSE(clusters([5, 6, 4, 5, 10]))).toBeCloseTo(Math.sqrt(27.5) / 50, 10);
  });

  it("is 0 when every challenge has the same pass rate", () => {
    expect(passRateSE(clusters([5, 5, 5, 5, 5]))).toBe(0);
  });

  it("is null below 5 clusters or with no items", () => {
    expect(passRateSE(clusters([5, 6, 4, 5]))).toBeNull();
    expect(passRateSE(clusters([0, 0, 0, 0, 0], 0))).toBeNull();
  });
});

describe("tCrit", () => {
  it("is the two-sided 95% Student-t critical value, tending to 1.96", () => {
    expect(tCrit(4)).toBe(2.776);
    expect(tCrit(30)).toBe(2.042);
    expect(tCrit(60)).toBeCloseTo(2.0, 2);
    expect(tCrit(120)).toBeCloseTo(1.98, 2);
    expect(tCrit(1e6)).toBeCloseTo(1.96, 4);
  });
});

describe("pairedDiff", () => {
  it("matches the hand-computed paired difference and CI", () => {
    // d = [1,0,1,0,2], D = 4/50; residuals d − 0.8·… Σ² = 2.8; √(5/4·2.8)/50
    const p = pairedDiff(clusters([5, 6, 4, 5, 10]), clusters([4, 6, 3, 5, 8]));
    const se = Math.sqrt(3.5) / 50;
    expect(p?.diff).toBeCloseTo(0.08, 10);
    expect(p?.se).toBeCloseTo(se, 10);
    // 5 clusters → t with 4 df (2.776), not z = 1.96: this gap is not resolved.
    expect(p?.lo).toBeCloseTo(0.08 - 2.776 * se, 10);
    expect(p?.hi).toBeCloseTo(0.08 + 2.776 * se, 10);
    expect(p!.lo).toBeLessThan(0);
  });

  it("a noisy small gap's interval includes 0", () => {
    const p = pairedDiff(clusters([6, 5, 4, 5, 10]), clusters([5, 6, 5, 4, 9]))!;
    expect(p.lo).toBeLessThan(0);
    expect(p.hi).toBeGreaterThan(0);
  });

  it("pairs only shared challenges with matching item counts; null below 5", () => {
    const a = clusters([5, 6, 4, 5, 10]);
    const b = clusters([4, 6, 3, 5, 8]);
    b.set("c4", { n: 12, y: 8 }); // different items → dropped → 4 shared
    expect(pairedDiff(a, b)).toBeNull();
  });
});
