import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { OrderedMatchConfig } from "../schema/scorer.js";
import { scoreOrderedMatch } from "./ordered-match.js";

const run = (output: string, config: OrderedMatchConfig) =>
  Effect.runSync(scoreOrderedMatch(output, config));

const cfg = (expected: string[]): OrderedMatchConfig => ({
  type: "ordered_match",
  vocabulary: ["A", "B", "C", "D", "X"],
  expected,
});

describe("scoreOrderedMatch", () => {
  it("returns 1.0 for the exact sequence (all and only, in order)", () => {
    const r = run("First A, then B, then C, then D", cfg(["A", "B", "C", "D"]));
    expect(r.kind).toBe("prompt");
    expect(r.score).toBe(1);
  });

  it("gives 0.75 for a single missing element (LCS 3 / 4)", () => {
    const r = run("A, then B, then D", cfg(["A", "B", "C", "D"]));
    expect(r.score).toBeCloseTo(0.75, 5);
  });

  it("gives 0.75 for one adjacent swap (LCS 3 / 4)", () => {
    const r = run("A, then C, then B, then D", cfg(["A", "B", "C", "D"]));
    expect(r.score).toBeCloseTo(0.75, 5);
  });

  it("scores a fully reversed sequence near zero (LCS 1 / 4)", () => {
    const r = run("D, then C, then B, then A", cfg(["A", "B", "C", "D"]));
    expect(r.score).toBeCloseTo(0.25, 5);
  });

  it("penalizes an extra element via the max denominator (LCS 4 / 5)", () => {
    const r = run("A, B, C, D, then X", cfg(["A", "B", "C", "D"]));
    expect(r.score).toBeCloseTo(0.8, 5);
  });

  it("returns 0 for an empty answer", () => {
    const r = run("no idea", cfg(["A", "B", "C", "D"]));
    expect(r.score).toBe(0);
  });

  it("order matters: same set, wrong order scores below 1", () => {
    const r = run("B then A", cfg(["A", "B"]));
    expect(r.score).toBeLessThan(1);
  });
});
