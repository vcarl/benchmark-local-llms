import { describe, expect, it } from "vitest";
import { isPass } from "./constants";

describe("isPass", () => {
  it("only a perfect score passes", () => {
    expect(isPass(1)).toBe(true);
    expect(isPass(0.99)).toBe(false);
    expect(isPass(0)).toBe(false);
  });
});
