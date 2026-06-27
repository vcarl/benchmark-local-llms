// Unit tests for the trust-battery solvers, checked against the worked-example
// ground truth in docs/superpowers/specs/2026-06-26-trust-challenges-design.md.
// Also asserts the non-degeneracy / uniqueness guards the design requires.
//
// NOTE: these live under scripts/, which the repo's `vitest run` (include:
// src/**, webapp/src/**) does not pick up. Run directly via a scratch config or
//   npx vitest run --root scripts/author --config <cfg> trust-solvers.test.ts

import { describe, expect, it } from "vitest";
import {
  decayedScore,
  flatScore,
  mostTrustworthyDecayed,
  posteriorMean,
  posteriorOdds,
  type RepActor,
  signalsToReach,
} from "./alignment.js";
import {
  folkThreshold,
  minBonusIC,
  type PayoffMatrix,
  perPeriodCoop,
  principalProfitAtIC,
  shirksUnderFlat,
  sustainableAt,
  temptationGain,
  worthIncentivizing,
} from "./repeated.js";
import { bestPathTrust, type Edge, pathsAbove, reachableAbove } from "./webOfTrust.js";

// ── Scenario 1 — Bayesian trust calibration ─────────────────────────────────────
describe("scenario 1 — Bayesian trust calibration", () => {
  const [pi, s, t] = [0.4, 0.8, 0.7];
  it("posterior odds after g=4 good, b=2 bad ≈ 2.751994", () => {
    expect(posteriorOdds(pi, s, t, 4, 2)).toBeCloseTo(2.751994, 5);
  });
  it("1a capstone P(H|history) = 0.733475", () => {
    expect(posteriorMean(pi, s, t, 4, 2)).toBe(0.733475);
  });
  it("1b posterior after one more bad signal = 0.440179", () => {
    expect(posteriorMean(pi, s, t, 4, 3)).toBe(0.440179);
  });
  it("1c belief crosses below one-half after the extra bad signal", () => {
    expect(posteriorMean(pi, s, t, 4, 2)).toBeGreaterThan(0.5);
    expect(posteriorMean(pi, s, t, 4, 3)).toBeLessThan(0.5);
  });
  it("1d needs 2 consecutive good signals to reach 90%", () => {
    expect(signalsToReach(pi, s, t, 4, 2, 0.9)).toBe(2);
  });
  it("non-degeneracy: parameters strictly interior (no 0/1 boundaries)", () => {
    for (const v of [pi, s, t]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
    expect(s).not.toBe(t); // asymmetric — diverges from naive counting
  });
});

// ── Scenario 2 — Folk-theorem cooperation threshold ─────────────────────────────
describe("scenario 2 — folk-theorem threshold (grim trigger)", () => {
  // T=9, R=5, P=2, S=0 read off the matrix (my-payoff entries).
  const game: PayoffMatrix = {
    C: { C: [5, 5], D: [0, 9] },
    D: { C: [9, 0], D: [2, 2] },
  };
  it("2a temptation gain T − R = 4", () => {
    expect(temptationGain(game)).toBe(4);
  });
  it("2b capstone δ* = 4/7 ≈ 0.571429", () => {
    expect(folkThreshold(game).deltaStar).toBe(0.571429);
  });
  it("2c sustainable at δ = 0.6 (yes)", () => {
    expect(sustainableAt(game, 0.6)).toBe(true);
  });
  it("2d per-period cooperative payoff = 5", () => {
    expect(perPeriodCoop(game)).toBe(5);
  });
  it("non-degeneracy: T > R > P (δ* interior) and δ* ≠ 0.5", () => {
    const { T, R, P } = folkThreshold(game);
    expect(T).toBeGreaterThan(R);
    expect(R).toBeGreaterThan(P);
    expect(folkThreshold(game).deltaStar).not.toBe(0.5);
  });
});

// ── Scenario 3 — Moral hazard / incentive design ────────────────────────────────
describe("scenario 3 — moral hazard / incentive design", () => {
  const [pH, pL, cH, cL, vGood, vBad] = [0.8, 0.5, 10, 2, 100, 0];
  it("3a agent shirks under a flat wage (yes)", () => {
    expect(shirksUnderFlat(cH, cL)).toBe(true);
  });
  it("3b capstone minimum bonus Δ* ≈ 26.666667", () => {
    expect(minBonusIC(pH, pL, cH, cL)).toBe(26.666667);
  });
  it("3c principal profit at Δ* = 70", () => {
    expect(principalProfitAtIC(pH, vGood, vBad, cH)).toBe(70);
  });
  it("3d worth incentivizing high effort (yes)", () => {
    expect(worthIncentivizing(pH, pL, vGood, vBad, cH, cL)).toBe(true);
  });
  it("non-degeneracy: p_H > p_L (Δ* well-defined) and strict shirk inequality", () => {
    expect(pH).toBeGreaterThan(pL);
    expect(cH).toBeGreaterThan(cL);
  });
});

// ── Scenario 4 — Web of trust / transitive trust ────────────────────────────────
describe("scenario 4 — web of trust", () => {
  const edges: Edge[] = [
    { from: "S", to: "A", w: 0.9 },
    { from: "S", to: "B", w: 0.5 },
    { from: "A", to: "T", w: 0.7 },
    { from: "A", to: "C", w: 0.8 },
    { from: "C", to: "T", w: 0.9 },
    { from: "B", to: "T", w: 0.95 },
    { from: "B", to: "C", w: 0.6 },
  ];
  it("4a capstone strongest-chain trust S→T = 0.648", () => {
    expect(bestPathTrust(edges, "S", "T").value).toBe(0.648);
  });
  it("4b strongest path is S → A → C → T, strictly unique (tie === false)", () => {
    const best = bestPathTrust(edges, "S", "T");
    expect(best.path).toEqual(["S", "A", "C", "T"]);
    expect(best.tie).toBe(false);
  });
  it("4c T reachable from S above 0.6 (yes)", () => {
    expect(reachableAbove(edges, "S", "T", 0.6)).toBe(true);
  });
  it("4d 3 distinct paths above 0.4", () => {
    expect(pathsAbove(edges, "S", "T", 0.4)).toBe(3);
  });
  it("non-degeneracy: all weights in [0,1], no negative/distrust edges", () => {
    for (const e of edges) {
      expect(e.w).toBeGreaterThanOrEqual(0);
      expect(e.w).toBeLessThanOrEqual(1);
    }
  });
});

// ── Scenario 5 — Decayed reputation with late reversal ──────────────────────────
describe("scenario 5 — decayed reputation", () => {
  const lambda = 0.6;
  // ages 0 (newest) … 5 (oldest)
  const vale: RepActor = {
    name: "Vale",
    events: [
      { age: 0, good: false },
      { age: 1, good: false },
      { age: 2, good: true },
      { age: 3, good: true },
      { age: 4, good: true },
      { age: 5, good: true },
    ],
  };
  const pell: RepActor = {
    name: "Pell",
    events: [
      { age: 0, good: true },
      { age: 1, good: true },
      { age: 2, good: true },
      { age: 3, good: false },
      { age: 4, good: false },
      { age: 5, good: false },
    ],
  };
  it("5a flat reliability of Vale = 0.666667", () => {
    expect(flatScore(vale)).toBe(0.666667);
  });
  // NOTE: doc cites 0.406846, but 1.78336/4.38336 = 0.40684771… rounds to
  // 0.406848 (verified by exact rational 5573/13698). Doc has a last-digit typo;
  // the mathematically correct ground truth is 0.406848.
  it("5b capstone decayed score of Vale (λ=0.6) = 0.406848", () => {
    expect(decayedScore(vale, lambda)).toBe(0.406848);
  });
  it("decayed score of Pell (λ=0.6) = 0.675281", () => {
    expect(decayedScore(pell, lambda)).toBe(0.675281);
  });
  it("5c most trustworthy under decay is Pell, strictly unique (tie === false)", () => {
    const r = mostTrustworthyDecayed([vale, pell], lambda);
    expect(r.answer).toBe("Pell");
    expect(r.tie).toBe(false);
  });
  // Consequent of the 5b correction: 0.666667 − 0.406848 = 0.259819 (doc: 0.259821).
  it("5d flat-vs-decay gap for Vale = 0.259819", () => {
    const gap = Math.round((flatScore(vale) - decayedScore(vale, lambda)) * 1e6) / 1e6;
    expect(gap).toBe(0.259819);
  });
  it("decay winner (Pell) differs from flat winner (Vale)", () => {
    const flatWinner = flatScore(vale) > flatScore(pell) ? "Vale" : "Pell";
    const decayWinner = mostTrustworthyDecayed([vale, pell], lambda).answer;
    expect(flatWinner).toBe("Vale");
    expect(decayWinner).toBe("Pell");
    expect(decayWinner).not.toBe(flatWinner);
  });
});
