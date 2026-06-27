import { describe, expect, it } from "vitest";
import { extractSequence, extractSet } from "./entities.js";

const vocab = ["Alice", "Bob", "Carol", "Bank A"];

describe("extractSet", () => {
  it("returns the vocabulary tokens present in the prose", () => {
    const got = extractSet("Alice and Bob colluded to fix prices.", vocab);
    expect([...got].sort()).toEqual(["Alice", "Bob"]);
  });

  it("is case-insensitive by default", () => {
    const got = extractSet("we suspect ALICE and bob", vocab);
    expect([...got].sort()).toEqual(["Alice", "Bob"]);
  });

  it("honors caseSensitive: true", () => {
    const got = extractSet("we suspect alice and Bob", vocab, { caseSensitive: true });
    expect([...got]).toEqual(["Bob"]);
  });

  it("matches whole words only — no substring false positives", () => {
    // "Bob" must not match inside "Bobby"; "Carol" not inside "Carolina".
    const got = extractSet("Bobby went to Carolina", vocab);
    expect([...got]).toEqual([]);
  });

  it("collapses duplicate mentions to a single set member", () => {
    const got = extractSet("Alice, Alice, and again Alice", vocab);
    expect([...got]).toEqual(["Alice"]);
  });

  it("matches multi-word tokens with flexible whitespace", () => {
    const got = extractSet("the culprit is Bank   A for sure", vocab);
    expect([...got]).toEqual(["Bank A"]);
  });

  it("ignores tokens outside the vocabulary", () => {
    const got = extractSet("Zara and Alice", vocab);
    expect([...got]).toEqual(["Alice"]);
  });

  it("returns an empty set for an empty answer", () => {
    expect([...extractSet("", vocab)]).toEqual([]);
  });
});

describe("extractSequence", () => {
  it("orders tokens by first occurrence in the prose", () => {
    const got = extractSequence("First Carol, then Alice, finally Bob", vocab);
    expect(got).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("dedupes keeping the first occurrence position", () => {
    const got = extractSequence("Bob, then Alice, then Bob again", vocab);
    expect(got).toEqual(["Bob", "Alice"]);
  });

  it("returns an empty array for an empty answer", () => {
    expect(extractSequence("", vocab)).toEqual([]);
  });

  it("ignores non-vocabulary tokens", () => {
    expect(extractSequence("Zara then Alice", vocab)).toEqual(["Alice"]);
  });
});
