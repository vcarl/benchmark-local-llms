// Hand-worked and independent checks for the stretch solvers (derivations in stretch-solvers.ts).
import { describe, expect, it } from "vitest";
import { amortize } from "../financial.js";
import { mulberry32 } from "./common.js";
import { armAmort, grimLag, ocWaterfall, stackelberg, trustDecay } from "./stretch-solvers.js";

describe("stackelberg", () => {
  it("symmetric costs: a=120, b=1, c=20 → leader 50, follower 25, P 45", () => {
    // Follower BR q2 = (100 − q1)/2; leader max (100 − q1 − q2)·q1 = (50 − q1/2)·q1 → q1 = 50.
    // Cournot: q = 100/3 each, P = 120 − 200/3 = 160/3 → π = (100/3)² = 1111.11.
    const s = stackelberg({ a: 120, b: 1, c1: 20, c2: 20 });
    expect([s.q1, s.q2, s.price, s.profit1, s.profit2]).toEqual([50, 25, 45, 1250, 625]);
    expect(s.cournotProfit1).toBeCloseTo(10000 / 9, 9);
  });
  it("asymmetric: a=100, b=2, c1=10, c2=16 → 24, 9, P 34", () => {
    // q1 = (100 − 20 + 16)/4 = 24; q2 = (100 + 20 − 48)/8 = 9; P = 100 − 2·33 = 34.
    const s = stackelberg({ a: 100, b: 2, c1: 10, c2: 16 });
    expect([s.q1, s.q2, s.price, s.profit1, s.profit2]).toEqual([24, 9, 34, 576, 162]);
    // Cournot: q1 = (100 − 20 + 16)/6 = 16, q2 = (100 − 32 + 10)/6 = 13,
    // P = 100 − 2·29 = 42 → π1 = 32·16 = 512.
    expect(s.cournotProfit1).toBe(512);
  });
});

describe("grimLag", () => {
  const pd = { T: 5, R: 3, P: 1 };
  it("lag 0 is the textbook threshold (T−R)/(T−P)", () => {
    expect(grimLag({ ...pd, lag: 0 }).deltaStar).toBe(0.5);
  });
  it("lag L raises the threshold to ratio^(1/(L+1))", () => {
    expect(grimLag({ ...pd, lag: 1 }).deltaStar).toBeCloseTo(Math.SQRT1_2, 12);
    expect(grimLag({ ...pd, lag: 2 }).deltaStar).toBeCloseTo(0.7937005259841, 12);
  });
  it("max sustainable lag at δ: largest L with δ^(L+1) ≥ ratio", () => {
    // 0.9^6 = 0.531 ≥ 0.5, 0.9^7 = 0.478 < 0.5 → L+1 = 6 → L = 5.
    expect(grimLag({ ...pd, lag: 0 }).maxLagAt(0.9)).toBe(5);
    // δ below the lag-0 threshold sustains nothing.
    expect(grimLag({ ...pd, lag: 0 }).maxLagAt(0.4)).toBe(-1);
  });
});

describe("trustDecay", () => {
  // Oldest first: G G B, λ = 0.5 → ages 2,1,0 → P = 0.25 + 0.5, N = 1.
  const t = trustDecay([true, true, false], 0.5);
  it("hand-worked: decayed (P+1)/(P+N+2) and its slips", () => {
    expect(t.decayed).toBeCloseTo(1.75 / 3.75, 12);
    expect(t.laplace).toBeCloseTo(3 / 5, 12); // (2+1)/(3+2)
    expect(t.offByOne).toBeCloseTo((0.375 + 1) / (0.875 + 2), 12); // every weight ×λ
    expect(t.decayedPrior).toBeCloseTo((0.75 + 0.125) / (1.75 + 0.25), 12); // prior weight λ^3
    expect(t.unsmoothed).toBeCloseTo(0.75 / 1.75, 12);
  });
  it("goodsToReach: smallest run of further goods with mean ≥ target", () => {
    // Everything ages by one per added round. +0: 0.467.
    // +1 (GGBG): P = 0.125+0.25+1 = 1.375, N = 0.5 → 2.375/3.875 = 0.613.
    expect(t.goodsToReach(0.6)).toBe(1);
    expect(t.goodsToReach(0.4)).toBe(0);
    // +2 (GGBGG): P = 1.6875, N = 0.25 → 0.6825; +3: P = 1.84375, N = 0.125 → 0.7165.
    expect(t.goodsToReach(0.7)).toBe(3);
  });
  it("matches a one-round-at-a-time recursion over random histories", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const h = Array.from({ length: 1 + Math.floor(rng() * 15) }, () => rng() < 0.5);
      const lambda = 0.5 + rng() * 0.5;
      let p = 0;
      let n = 0;
      for (const g of h) {
        p = lambda * p + (g ? 1 : 0);
        n = lambda * n + (g ? 0 : 1);
      }
      expect(trustDecay(h, lambda).decayed).toBeCloseTo((p + 1) / (p + n + 2), 12);
    }
  });
});

describe("armAmort", () => {
  it("hand-worked: $1000, 1%/mo, 3 months, resets to 2%/mo after month 1", () => {
    // A1 = 1000·0.01/(1 − 1.01^−3) = 340.0221 → 340.02. Month 1: interest 10.00, principal 330.02 → B1 = 669.98.
    // A2 = 669.98·0.02/(1 − 1.02^−2) = 345.0727 → 345.07. Month 2: interest 13.40 → 338.31;
    // month 3: interest 6.7662 → 6.77, final payment clears. Total interest 10.00 + 13.40 + 6.77 = 30.17.
    const r = armAmort({ P: 1000, i1: 0.01, i2: 0.02, N: 3, k: 1 });
    expect([r.payment1, r.balanceK, r.payment2, r.totalInterest]).toEqual([
      340.02, 669.98, 345.07, 30.17,
    ]);
  });
  const p = { P: 25000, i1: 0.005, i2: 0.0075, N: 120, k: 36 };
  it("full precision matches the closed form and amortize's round-at-end simulation", () => {
    const g = 1.005 ** 36;
    const A1 = (25000 * 0.005) / (1 - 1.005 ** -120);
    const Bk = 25000 * g - (A1 * (g - 1)) / 0.005; // closed-form remaining balance
    const A2 = (Bk * 0.0075) / (1 - 1.0075 ** -84);
    const r = armAmort(p, false);
    expect(r.payment1).toBeCloseTo(A1, 9);
    expect(r.balanceK).toBeCloseTo(Bk, 9);
    expect(r.payment2).toBeCloseTo(A2, 9);
    expect(r.totalInterest).toBeCloseTo(36 * A1 + 84 * A2 - 25000, 6);
    // Independent: amortize's own unrounded simulation (reports rounded to the cent).
    expect(amortize(25000, 0.005, 120, 0, false).schedule[35]?.balance ?? 0).toBeCloseTo(Bk, 2);
    expect(amortize(Bk, 0.0075, 84, 0, false).payment).toBeCloseTo(A2, 2);
  });
  it("per-step rounding lands within a few cents of full precision", () => {
    const exact = armAmort(p, false);
    const cents = armAmort(p);
    for (const key of ["payment1", "balanceK", "payment2", "totalInterest"] as const)
      expect(Math.abs(cents[key] - exact[key])).toBeLessThan(0.1);
  });
});

describe("ocWaterfall", () => {
  // C0 10M, A 7.6M @3%, B 1.5M @6%, collateral 8%, sched principal 200k, defaults 1.2M then 300k.
  const p = {
    C0: 10_000_000,
    A0: 7_600_000,
    B0: 1_500_000,
    rc: 8,
    rA: 3,
    rB: 6,
    trigger: 125,
    sched: 200_000,
    defaults: [1_200_000, 300_000],
  };
  it("hand-worked two periods with cure-only diversion", () => {
    // P1: collect 800k + 200k = 1,000,000; senior int 228,000 → 772,000 left.
    //     par 10M − 200k − 1.2M = 8.6M; 8.6/7.6 = 113.16% < 125% → cure 7.6M − 0.8·8.6M = 720,000.
    //     52,000 left → junior gets 52,000 of 90,000 (38,000 lost), equity 0. A → 6,880,000.
    // P2: collect 8% · 8.6M + 200k = 888,000; senior int 3% · 6.88M = 206,400 → 681,600.
    //     par 8.6M − 200k − 300k = 8.1M; cure 6.88M − 6.48M = 400,000 → 281,600;
    //     junior 90,000, equity 191,600. A → 6,480,000.
    const r = ocWaterfall(p);
    expect(r.periods.map((x) => [x.seniorInterest, x.diverted, x.junior, x.equity])).toEqual([
      [228_000, 720_000, 52_000, 0],
      [206_400, 400_000, 90_000, 191_600],
    ]);
    expect(r.periods[0]?.ratio).toBeCloseTo(8.6 / 7.6, 12);
    expect([r.juniorTotal, r.equityTotal, r.seniorEnd]).toEqual([142_000, 191_600, 6_480_000]);
  });
  it("no OC test: junior paid in full, everything else to equity", () => {
    const r = ocWaterfall({ ...p, modes: ["none", "none"] });
    expect([r.juniorTotal, r.equityTotal, r.seniorEnd]).toEqual([
      180_000,
      682_000 + 570_000,
      7_600_000,
    ]);
  });
  it("divert-all slip sends every post-senior dollar to A while failing", () => {
    // P1 772,000 to A → 6,828,000. P2 senior int 204,840, 683,160 left; 8.1/6.828 < 1.25 → all diverted.
    const r = ocWaterfall({ ...p, modes: ["all", "all"] });
    expect(r.periods.map((x) => x.diverted)).toEqual([772_000, 683_160]);
    expect([r.juniorTotal, r.equityTotal]).toEqual([0, 0]);
  });
  it("closed-form cure = smallest whole-dollar paydown that passes the test (brute force)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const A = 100_000 + Math.floor(rng() * 900_000);
      const C = 5 * Math.floor((A * (0.9 + rng() * 0.35)) / 5);
      const r = ocWaterfall({
        C0: C + 100_000,
        A0: A,
        B0: 0,
        rc: 50,
        rA: 0,
        rB: 0,
        trigger: 125,
        sched: 100_000,
        defaults: [0],
      });
      let x = 0;
      while (C * 100 < 125 * (A - x)) x++;
      expect(r.periods[0]?.diverted, `A=${A} C=${C}`).toBe(x);
    }
  });
});
