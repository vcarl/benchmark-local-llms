import { describe, expect, it } from "vitest";
import { stableStringify } from "./hashing.js";

describe("stableStringify", () => {
  it("omits object properties whose value is undefined, producing valid round-trippable JSON", () => {
    // Mirrors the new set_match/ordered_match scorer params where the optional
    // `caseSensitive` field is undefined when unset. Native JSON.stringify omits
    // such keys; the custom serializer must do the same so the emitted blob is
    // valid JSON (no literal `undefined` token) for downstream JSON.parse.
    const out = stableStringify({ caseSensitive: undefined, expected: ["A", "B"] });

    // Must be valid JSON that round-trips.
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)).toEqual({ expected: ["A", "B"] });

    // The undefined key must be omitted entirely (matching native semantics).
    expect(out).not.toContain("undefined");
    expect(out).toBe('{"expected":["A","B"]}');
  });

  it("serializes a nested object with no undefined values byte-identically (hash stability)", () => {
    const value = {
      scorer: "set_match",
      caseSensitive: true,
      expected: ["E", "B", "C"],
      nested: { z: 1, a: 2 },
    };
    // Keys recursively sorted; values JSON-encoded.
    expect(stableStringify(value)).toBe(
      '{"caseSensitive":true,"expected":["E","B","C"],"nested":{"a":2,"z":1},"scorer":"set_match"}',
    );
  });
});
