import { describe, expect, it } from "vitest";
import { formatCount } from "./format";

describe("formatCount", () => {
  it("prints whole counts as-is and resampled (fractional) counts to one decimal", () => {
    expect(formatCount(47)).toBe("47");
    expect(formatCount(47.6000001)).toBe("47.6");
  });
});
