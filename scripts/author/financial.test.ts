// Unit tests for the financial scenario-battery solvers. Each block checks the
// solver against the pre-computed ground truth in
// docs/superpowers/specs/2026-06-26-financial-challenges-design.md AND asserts
// the non-degeneracy guards the design doc flags as risky (acyclic cascade with
// a strict default order; single sign-change / unequal-total NPV crossover;
// pinned amortization rounding). Tests may throw (lint-strict exempts *.test.ts).

import { describe, expect, it } from "vitest";
import {
  amortize,
  bestBailout,
  classifyState,
  type ContagionModel,
  crossoverRate,
  defaultCascade,
  diffStream,
  dscrSeries,
  firstBreach,
  isAcyclic,
  minBumpToHalt,
  minGrowthToAvoidBreach,
  npv,
  paybackPeriod,
  signChanges,
  type Tranche,
  waterfall,
} from "./financial.js";

// ── Scenario 1 — Payment waterfall ───────────────────────────────────────────
describe("waterfall", () => {
  const tranches: Tranche[] = [
    { name: "Senior", claim: 520 },
    { name: "Mezz", claim: 310 },
    { name: "Junior", claim: 185 },
  ];
  const r = waterfall(640, tranches);

  it("pays senior in full, mezzanine partial, junior and equity zero", () => {
    expect(r.payouts.Senior).toBe(520);
    expect(r.payouts.Mezz).toBe(120);
    expect(r.payouts.Junior).toBe(0);
    expect(r.payouts.Equity).toBe(0);
  });
  it("names the first tranche to take a loss (most senior underpaid)", () => {
    expect(r.firstLoss).toBe("Mezz");
  });
  it("equity-zero threshold is the sum of all non-equity claims", () => {
    expect(r.equityZeroThreshold).toBe(1015);
  });
  it("never over-pays a tranche and floors equity at 0", () => {
    expect(r.payouts.Senior).toBeLessThanOrEqual(520);
    expect(r.payouts.Equity).toBeGreaterThanOrEqual(0);
  });
  it("at the equity-zero threshold equity gets exactly 0, just above it gets > 0", () => {
    expect(waterfall(1015, tranches).payouts.Equity).toBe(0);
    expect(waterfall(1016, tranches).payouts.Equity).toBeGreaterThan(0);
  });
});

// ── Scenario 2 — Counterparty contagion ──────────────────────────────────────
describe("defaultCascade", () => {
  const model: ContagionModel = {
    firms: ["A", "B", "C", "D", "E"],
    buffers: { A: 50, B: 80, C: 60, D: 300, E: 45 },
    liabilities: [
      { from: "A", to: "B", amount: 100 },
      { from: "B", to: "C", amount: 120 },
      { from: "C", to: "E", amount: 70 },
      { from: "D", to: "E", amount: 55 },
      { from: "B", to: "D", amount: 40 },
    ],
    shock: { node: "A", loss: 120 },
  };
  const r = defaultCascade(model);

  it("liability graph is acyclic (single-scan helper is valid)", () => {
    expect(isAcyclic(model.firms, model.liabilities)).toBe(true);
  });
  it("firm C does not survive the shock; D does", () => {
    expect(r.survives("C")).toBe(false);
    expect(r.survives("D")).toBe(true);
  });
  it("produces the strict default order A, B, C, E", () => {
    expect(r.order).toEqual(["A", "B", "C", "E"]);
  });
  it("total firms failed is 4", () => {
    expect(r.failedCount).toBe(4);
  });
  it("no two firms cross in the same round (order is unambiguous)", () => {
    expect(new Set(r.order).size).toBe(r.order.length);
  });
  it("smallest buffer bump to B that lowers the failure count is +20", () => {
    expect(minBumpToHalt(model, "B")).toBe(20);
  });
  it("the single bailout that saves the most firms is A", () => {
    expect(bestBailout(model).firm).toBe("A");
    expect(bestBailout(model).failedCount).toBe(0);
  });
});

// ── Scenario 3 — Covenant breach timing (DSCR) ───────────────────────────────
describe("covenant DSCR", () => {
  const noi0 = 130;
  const growth = 0.02;
  const horizon = 12;
  const threshold = 1.25;
  const debtService = (m: number): number => (m <= 3 ? 80 : m <= 6 ? 110 : 140);
  const series = dscrSeries(noi0, growth, debtService, horizon);

  it("DSCR in month 1 is 1.625", () => {
    expect(series[0]).toBeCloseTo(1.625, 4);
  });
  it("first breach is month 7", () => {
    expect(firstBreach(series, threshold, "below")).toBe(7);
  });
  it("classifies as in breach (never insolvent — DSCR stays above 1.0)", () => {
    expect(classifyState(series, threshold)).toBe("in breach");
    expect(Math.min(...series)).toBeGreaterThan(1.0);
  });
  it("min monthly growth avoiding any breach rounds to 0.0508", () => {
    const g = minGrowthToAvoidBreach(noi0, debtService, horizon, threshold);
    expect(g).toBeCloseTo(0.0508, 4);
    const closed = ((1.25 * 140) / 130) ** (1 / 6) - 1; // month-7 step-up binds
    expect(g).toBeCloseTo(closed, 5);
  });
  it("firstBreach honours direction and reports the FIRST dip even if it recovers", () => {
    expect(firstBreach([2, 1, 2], 1.25, "below")).toBe(2);
    expect(firstBreach([1, 2, 3], 1.5, "above")).toBe(2);
    expect(firstBreach([2, 2, 2], 1.25, "below")).toBe(0);
  });
});

// ── Scenario 4 — NPV / project choice ────────────────────────────────────────
describe("npv & crossover", () => {
  const a = [-1000, 600, 500, 200];
  const b = [-1000, 200, 400, 800];

  it("NPV(A) @ 8% is 142.99", () => {
    expect(npv(0.08, a)).toBeCloseTo(142.99, 2);
  });
  it("NPV(B) @ 8% is 163.19", () => {
    expect(npv(0.08, b)).toBeCloseTo(163.19, 2);
  });
  it("B beats A at 8% (below the crossover)", () => {
    expect(npv(0.08, b)).toBeGreaterThan(npv(0.08, a));
  });
  it("crossover discount rate is ~0.1061", () => {
    expect(crossoverRate(a, b)).toBeCloseTo(0.1061, 4);
  });
  it("difference stream has exactly one sign change (single unique crossover)", () => {
    expect(signChanges(diffStream(a, b))).toBe(1);
  });
  it("undiscounted totals differ (crossover does not degenerate to r=0)", () => {
    const tot = (cf: number[]): number => cf.reduce((s, x) => s + x, 0);
    expect(tot(a)).not.toBe(tot(b));
    expect(tot(a)).toBe(300);
    expect(tot(b)).toBe(400);
  });
  it("payback period of A is 1.8 years (fractional) / 2 (integer)", () => {
    expect(paybackPeriod(a, true)).toBeCloseTo(1.8, 4);
    expect(paybackPeriod(a, false)).toBe(2);
  });
});

// ── Scenario 5 — Loan amortization with extra principal ──────────────────────
describe("amortize", () => {
  const r = amortize(20000, 0.005, 60, 100);

  it("scheduled monthly payment is 386.66", () => {
    expect(r.payment).toBeCloseTo(386.66, 2);
  });
  it("balance after 12 months (with $100 extra) is 15230.38", () => {
    const after12 = r.schedule[11]?.balance ?? Number.NaN;
    expect(after12).toBeCloseTo(15230.38, 2);
  });
  it("total interest over the life of the loan is 2444.38", () => {
    expect(r.totalInterest).toBeCloseTo(2444.38, 2);
  });
  it("loan is paid off in month 47 (vs 60 scheduled)", () => {
    expect(r.payoffMonth).toBe(47);
  });
  it("the extra principal shortens the term below N and clears the balance to 0", () => {
    expect(r.payoffMonth).toBeLessThan(60);
    expect(r.schedule[r.schedule.length - 1]?.balance).toBe(0);
  });
  it("zero-rate loan amortizes linearly to P/N", () => {
    const z = amortize(1200, 0, 12, 0);
    expect(z.payment).toBeCloseTo(100, 2);
    expect(z.payoffMonth).toBe(12);
  });
});
