import { describe, expect, it } from "vitest";
import { digestOf, sha256Hex } from "../digest.js";

describe("digests", () => {
  it("sha256Hex is the full lowercase hex SHA-256 of strings and bytes alike", () => {
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256Hex("abc")).toBe(abc);
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(abc);
  });

  it("digestOf hashes the stableStringify of a value, so key order never matters", () => {
    expect(digestOf({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      digestOf({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
    expect(digestOf({ a: 1 })).toBe(sha256Hex('{"a":1}'));
    expect(digestOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
