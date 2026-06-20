import { describe, expect, it } from "vitest";
import { familyColor } from "./colors";

describe("familyColor", () => {
  it("maps a known family to its swatch", () => {
    expect(familyColor("Qwen")).toBe("#6fa8dc");
  });
  it("falls back to Other for unknown / null", () => {
    expect(familyColor("Nope")).toBe("#9aa0a6");
    expect(familyColor(null)).toBe("#9aa0a6");
  });
});
