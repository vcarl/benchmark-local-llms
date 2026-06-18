import { describe, expect, it } from "vitest";
import { aggregate } from "../run-challenge.js";

describe("aggregate", () => {
  it("passes when perfect-score fraction meets threshold", () => {
    expect(aggregate([{ score: 1 }, { score: 1 }, { score: 0 }], 0.6)).toEqual({
      score: 2 / 3,
      passed: true,
    });
  });
  it("fails below threshold and handles empty", () => {
    expect(aggregate([{ score: 0.9 }], 0.8)).toEqual({ score: 0, passed: false }); // partial credit is not a pass
    expect(aggregate([], 0.5)).toEqual({ score: 0, passed: false });
  });
});
