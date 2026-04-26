import { describe, it, expect } from "vitest";
import { isShifted } from "./shift-state";

describe("isShifted", () => {
  it("is false when model is undefined", () => {
    expect(isShifted(undefined)).toBe(false);
  });

  it("is false when model is the empty string", () => {
    expect(isShifted("")).toBe(false);
  });

  it("is true for any non-empty string", () => {
    expect(isShifted("qwen2.5-coder-32b")).toBe(true);
  });

  it("is true for whitespace-only — URL truthiness, not semantic validity", () => {
    expect(isShifted("   ")).toBe(true);
  });
});
