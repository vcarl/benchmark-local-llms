import { describe, expect, it } from "vitest";
import { frozenSpan, rowWeights, timingTotals } from "./timing";
import type { Timing } from "./timing";

const z = { predates: 0, exposable: 0, unknown: 0 };
const w = { repo: "o/m", revision: "a".repeat(40), publishedAt: "2027-03-01T00:00:00.000Z" };
const timing: Timing = {
  items: { "a/1": "2027-02-01T00:00:00.000Z", "a/2": "2027-05-01T00:00:00.000Z", "b/1": "2027-02-01T00:00:00.000Z" },
  rows: {
    r: {
      a: { weights: w, labels: { ...z, predates: 1, exposable: 1 } },
      b: { weights: null, labels: { ...z, unknown: 2 } },
    },
  },
};

describe("timingTotals", () => {
  it("sums all challenges", () => {
    const t = timingTotals(timing, "r")!;
    expect(t.total).toBe(4);
    expect(t.shares).toEqual({ predates: 0.25, exposable: 0.25, unknown: 0.5 });
  });
  it("restricts to a challenge subset", () => {
    expect(timingTotals(timing, "r", ["b"])!.shares.unknown).toBe(1);
  });
  it("is null for an unknown row", () => expect(timingTotals(timing, "q")).toBeNull());
});

describe("rowWeights and frozenSpan", () => {
  it("lists distinct weights and a challenge's freeze range", () => {
    expect(rowWeights(timing, "r")).toEqual([w, null]);
    expect(rowWeights(timing, "r", ["a"])).toEqual([w]);
    expect(frozenSpan(timing, "a")).toEqual(["2027-02-01", "2027-05-01"]);
    expect(frozenSpan(timing, "c")).toBeNull();
  });
});
