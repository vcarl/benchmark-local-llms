import { describe, expect, it } from "vitest";
import { PASS_THRESHOLD } from "./constants";

describe("PASS_THRESHOLD", () => {
  it("is 0.7 — score below 0.7 is a fail", () => {
    expect(PASS_THRESHOLD).toBe(0.7);
  });
});
