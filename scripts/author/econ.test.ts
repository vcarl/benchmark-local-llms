// Unit tests for the economics battery solvers. These assert each helper against
// the worked-example ground truth in
// docs/superpowers/specs/2026-06-26-economics-challenges-design.md AND verify the
// non-degeneracy screening (interior mixed Nash + no pure NE; strictly-unique SPE
// optima; all-positive Cournot quantities) the author script relies on. Tests may
// throw (vitest narrowing); the solvers themselves never do.
//
// Run (outside the default `src/**` vitest include) via the scratchpad config:
//   npx vitest run --config <scratchpad>/vitest.authoring.config.ts

import { describe, expect, it } from "vitest";
import {
  backwardInduct,
  cournot,
  type Game,
  type GameNode,
  mixedNash2x2,
  monopolyLinear,
  pureNash,
  taxIncidence,
  uniqueOptima,
} from "./econ.js";

// ── Scenario 1: mixed-strategy Nash (tennis serve) ───────────────────────────
const tennis: Game = {
  rowName: "Server",
  colName: "Receiver",
  rowStrategies: ["Aim L", "Aim R"],
  colStrategies: ["Anticipate L", "Anticipate R"],
  payoffs: [
    [
      [10, 2],
      [4, 8],
    ],
    [
      [6, 6],
      [10, 2],
    ],
  ],
};

describe("mixedNash2x2", () => {
  it("solves the tennis-serve worked example (p=0.4, q=0.6, value=7.6)", () => {
    const mn = mixedNash2x2(tennis);
    if (mn === null) throw new Error("expected an interior mixed equilibrium");
    expect(mn.p).toBeCloseTo(0.4, 10);
    expect(mn.q).toBeCloseTo(0.6, 10);
    expect(mn.value).toBeCloseTo(7.6, 10);
  });

  it("screens the scenario as non-degenerate (interior AND no pure NE)", () => {
    expect(mixedNash2x2(tennis)).not.toBeNull();
    expect(pureNash(tennis)).toHaveLength(0);
  });

  it("returns null when a player has a dominant strategy (no interior mix)", () => {
    // Prisoner's-dilemma shape: Confess dominates, so no fully-mixed equilibrium.
    const pd: Game = {
      rowName: "You",
      colName: "Them",
      rowStrategies: ["Silent", "Confess"],
      colStrategies: ["Silent", "Confess"],
      payoffs: [
        [
          [2, 2],
          [0, 3],
        ],
        [
          [3, 0],
          [1, 1],
        ],
      ],
    };
    expect(mixedNash2x2(pd)).toBeNull();
    // ... and it DOES have a pure NE, so it would fail the screen either way.
    expect(pureNash(pd).length).toBeGreaterThan(0);
  });

  it("returns null on a zero denominator", () => {
    const degenerate: Game = {
      rowName: "R",
      colName: "C",
      rowStrategies: ["A", "B"],
      colStrategies: ["X", "Y"],
      payoffs: [
        [
          [1, 1],
          [1, 1],
        ],
        [
          [1, 1],
          [1, 1],
        ],
      ],
    };
    expect(mixedNash2x2(degenerate)).toBeNull();
  });
});

// ── Scenario 2: sequential entry / backward induction ────────────────────────
const entryTree: GameNode = {
  player: 0, // entrant
  actions: ["Enter", "Stay Out"],
  children: [
    {
      player: 1, // incumbent
      actions: ["Accommodate", "Fight"],
      children: [{ payoffs: [40, 50] }, { payoffs: [-30, 25] }],
    },
    { payoffs: [0, 120] },
  ],
};

describe("backwardInduct", () => {
  it("folds the entry game to SPE (Enter, Accommodate) with payoffs [40,50]", () => {
    const spe = backwardInduct(entryTree);
    expect(spe.firstAction).toBe("Enter");
    expect(spe.path).toEqual(["Enter", "Accommodate"]);
    expect(spe.payoffs).toEqual([40, 50]);
  });

  it("screens the tree as having strictly-unique optima (single SPE)", () => {
    expect(uniqueOptima(entryTree)).toBe(true);
  });

  it("the threat-supported (Stay-Out) leaf gives the incumbent 120, gap to SPE = 70", () => {
    const spe = backwardInduct(entryTree);
    const naiveIncumbent = 120; // off-path Stay-Out leaf, authored directly
    expect(naiveIncumbent - spe.payoffs[1]).toBe(70);
  });

  it("detects a tie (multiple SPE) at a decision node", () => {
    const tied: GameNode = {
      player: 0,
      actions: ["L", "R"],
      children: [{ payoffs: [5, 1] }, { payoffs: [5, 9] }],
    };
    expect(uniqueOptima(tied)).toBe(false);
  });
});

// ── Scenario 3: Cournot duopoly with asymmetric costs ────────────────────────
describe("cournot", () => {
  it("solves the asymmetric duopoly (q=[40,20], P=60, profit=[1600,400])", () => {
    const r = cournot({ a: 120, b: 1, costs: [20, 40] });
    expect(r.quantities).toEqual([40, 20]);
    expect(r.price).toBe(60);
    expect(r.profits).toEqual([1600, 400]);
  });

  it("screens all firms producing a positive quantity", () => {
    const r = cournot({ a: 120, b: 1, costs: [20, 40] });
    expect(r.quantities.every((q) => q > 0)).toBe(true);
  });

  it("flags a corner solution (a high-cost firm would produce q<0)", () => {
    // c2 = 110 is so high firm 2's naive quantity goes negative — a corner the
    // author script must screen out.
    const r = cournot({ a: 120, b: 1, costs: [20, 110] });
    expect(r.quantities.some((q) => q <= 0)).toBe(true);
  });
});

// ── Scenario 4: tax incidence & deadweight loss ──────────────────────────────
describe("taxIncidence", () => {
  it("solves the worked example", () => {
    const r = taxIncidence({ alpha: 100, beta: 1, gamma: 20, delta: 3, t: 8 });
    expect(r.Pstar).toBe(20);
    expect(r.Qstar).toBe(80);
    expect(r.buyerShare).toBeCloseTo(0.75, 10);
    expect(r.sellerShare).toBeCloseTo(0.25, 10);
    expect(r.Pb).toBe(26);
    expect(r.Ps).toBe(18);
    expect(r.Pb - r.Ps).toBeCloseTo(8, 10); // wedge equals the tax
    expect(r.Qtax).toBe(74);
    expect(r.dwl).toBe(24);
    expect(r.revenue).toBe(592);
  });
});

// ── Scenario 5: monopoly with rising marginal cost ───────────────────────────
describe("monopolyLinear", () => {
  it("solves the rising-MC worked example", () => {
    const r = monopolyLinear({ a: 100, b: 1, mc: { e: 10, f: 1 } });
    expect(r.Q).toBe(30);
    expect(r.P).toBe(70);
    expect(r.profit).toBe(1350);
    expect(r.Qc).toBe(45);
    expect(r.Pc).toBe(55);
    expect(r.dwl).toBe(225);
  });

  it("handles the constant-MC branch (Q=(a-c)/2b, P=(a+c)/2)", () => {
    const r = monopolyLinear({ a: 100, b: 1, mc: { c: 20 } });
    expect(r.Q).toBe(40);
    expect(r.P).toBe(60);
    expect(r.Qc).toBe(80); // P = MC = c
    expect(r.Pc).toBe(20);
  });
});
