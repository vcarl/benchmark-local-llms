import { describe, expect, it } from "vitest";
import { challengeItemDates, timingTotals } from "./timing";
import type { Timing } from "./timing";

const z = { unpublished: 0, predates: 0, "cutoff-claimed": 0, exposable: 0, unknown: 0 };
const timing: Timing = {
  itemDates: { asOf: "2026-11-01", source: "x" },
  items: {
    "a/1": { publishedAt: "2024-05-01", pushedAt: "2024-05-01", frozenAt: null, evidence: "e" },
    "a/2": { publishedAt: "2025-01-02", pushedAt: "2025-01-02", frozenAt: null, evidence: "e" },
    "a/3": null,
  },
  models: {},
  rows: { r: { a: { ...z, predates: 1, exposable: 2, unpublished: 1 }, b: { ...z, predates: 4 } } },
};

describe("timingTotals", () => {
  it("sums all challenges", () => {
    const t = timingTotals(timing, "r")!;
    expect(t.total).toBe(8);
    expect(t.counts.predates).toBe(5);
    expect(t.shares.exposable).toBe(0.25);
  });
  it("restricts to a challenge subset", () => {
    expect(timingTotals(timing, "r", ["b"])!.shares.predates).toBe(1);
  });
  it("is null for an unknown row", () => expect(timingTotals(timing, "q")).toBeNull());
});

describe("challengeItemDates", () => {
  it("gives the range and not-public count", () => {
    const d = challengeItemDates(timing, "a");
    expect([d.first, d.last, d.notPublic]).toEqual(["2024-05-01", "2025-01-02", 1]);
  });
});
