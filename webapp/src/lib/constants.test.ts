import { describe, expect, it } from "vitest";
import { formatEfficiency, isPass } from "./constants";

describe("isPass", () => {
  it("only a perfect score passes", () => {
    expect(isPass(1)).toBe(true);
    expect(isPass(0.99)).toBe(false);
    expect(isPass(0)).toBe(false);
  });
});

describe("formatEfficiency", () => {
  it("formats efficiency, dash for null", () => {
    expect(formatEfficiency(null)).toBe("—");
    expect(formatEfficiency(1111.1111)).toBe("1111.11");
  });
});
