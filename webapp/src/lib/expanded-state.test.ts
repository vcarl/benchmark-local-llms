import { describe, it, expect } from "vitest";
import { parseExpanded, encodeExpanded } from "./expanded-state";

describe("parseExpanded", () => {
  it("returns empty set when param is undefined", () => {
    expect(parseExpanded(undefined, ["a", "b"]).size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    expect(parseExpanded("", ["a", "b"]).size).toBe(0);
  });

  it("returns all names for the 'full' sentinel", () => {
    const got = parseExpanded("full", ["a", "b", "c"]);
    expect([...got].sort()).toEqual(["a", "b", "c"]);
  });

  it("parses a comma list and intersects with allNames", () => {
    const got = parseExpanded("a,c,zzz", ["a", "b", "c"]);
    expect([...got].sort()).toEqual(["a", "c"]);
  });

  it("ignores empty entries in a comma list", () => {
    const got = parseExpanded("a,,b,", ["a", "b"]);
    expect([...got].sort()).toEqual(["a", "b"]);
  });
});

describe("encodeExpanded", () => {
  it("returns empty string for empty set", () => {
    expect(encodeExpanded(new Set(), ["a", "b"])).toBe("");
  });

  it("returns 'full' when set equals allNames (any order)", () => {
    expect(encodeExpanded(new Set(["b", "a"]), ["a", "b"])).toBe("full");
  });

  it("returns sorted comma list otherwise", () => {
    expect(encodeExpanded(new Set(["c", "a"]), ["a", "b", "c"])).toBe("a,c");
  });

  it("ignores entries not in allNames when checking 'full'", () => {
    // A stale name in the set shouldn't trigger 'full'
    expect(encodeExpanded(new Set(["a", "b", "stale"]), ["a", "b"])).toBe("a,b");
  });
});

describe("parse/encode round trip", () => {
  it("'full' round trips", () => {
    const all = ["a", "b"];
    const set = parseExpanded("full", all);
    expect(encodeExpanded(set, all)).toBe("full");
  });

  it("'' round trips", () => {
    const set = parseExpanded("", ["a", "b"]);
    expect(encodeExpanded(set, ["a", "b"])).toBe("");
  });
});
