import { describe, expect, it } from "vitest";
import { translateInlineFlags } from "./regex-flags.js";

describe("translateInlineFlags", () => {
  it("strips a leading (?i) group and returns the `i` flag", () => {
    expect(translateInlineFlags(String.raw`(?i)Data\.TaggedError`)).toEqual({
      pattern: String.raw`Data\.TaggedError`,
      flags: "i",
    });
  });

  it("handles combined leading groups like (?im) and (?si)", () => {
    expect(translateInlineFlags("(?im)^x")).toEqual({ pattern: "^x", flags: "im" });
    expect(translateInlineFlags("(?si)a.b")).toEqual({ pattern: "a.b", flags: "si" });
  });

  it("merges with harness-supplied base flags and dedupes", () => {
    expect(translateInlineFlags("(?s)a.b", "s")).toEqual({ pattern: "a.b", flags: "s" });
    expect(translateInlineFlags("(?i)x", "g")).toEqual({ pattern: "x", flags: "gi" });
  });

  it("leaves a pattern without a leading inline-flag group untouched", () => {
    expect(translateInlineFlags(String.raw`\d{3}`, "g")).toEqual({
      pattern: String.raw`\d{3}`,
      flags: "g",
    });
  });

  it("leaves mid-pattern and scoped groups untouched", () => {
    expect(translateInlineFlags("foo(?i)bar")).toEqual({ pattern: "foo(?i)bar", flags: "" });
    expect(translateInlineFlags("foo(?i:bar)")).toEqual({ pattern: "foo(?i:bar)", flags: "" });
    expect(translateInlineFlags("(?i:bar)baz")).toEqual({ pattern: "(?i:bar)baz", flags: "" });
  });

  it("leaves unsupported Python flags (e.g. (?x)) untouched so they still error", () => {
    expect(translateInlineFlags("(?x)a b")).toEqual({ pattern: "(?x)a b", flags: "" });
  });

  it("only translates a single leading group", () => {
    // Second group stays in the pattern (and will fail JS compilation later).
    expect(translateInlineFlags("(?i)(?m)^x")).toEqual({ pattern: "(?m)^x", flags: "i" });
  });
});
