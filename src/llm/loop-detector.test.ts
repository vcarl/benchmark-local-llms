import { describe, expect, it } from "vitest";
import { makeLoopDetector } from "./loop-detector.js";

/** Feed text in awkward chunks, the way a stream actually arrives. */
const feed = (text: string, chunk = 37): { tripped: boolean; atWord: number } => {
  const d = makeLoopDetector();
  for (let i = 0; i < text.length; i += chunk) {
    if (d.push(text.slice(i, i + chunk))) return { tripped: true, atWord: d.wordCount() };
  }
  return { tripped: false, atWord: d.wordCount() };
};

const filler = (words: number, seed = "alpha beta gamma delta epsilon zeta eta theta"): string => {
  const pool = seed.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words; i += 1) {
    // Non-repeating: index each word so no 12-gram ever recurs.
    out.push(`${pool[i % pool.length]}${i}`);
  }
  return out.join(" ");
};

describe("makeLoopDetector", () => {
  it("catches a degenerate loop like the one observed in the archive", () => {
    // "an upstream" repeated is the real shape that burned 346s for score 0.
    const text = `${filler(420)} ${"an upstream ".repeat(600)}`;
    const { tripped } = feed(text);
    expect(tripped).toBe(true);
  });

  it("does not fire on long non-repeating reasoning", () => {
    // The third observed failure: 3,798 words, 99.6% distinct 12-grams. It is
    // not a loop, and killing it would destroy a legitimate (if doomed) answer.
    const { tripped } = feed(filler(4000));
    expect(tripped).toBe(false);
  });

  it("does not fire on short answers that reuse phrasing", () => {
    const json = `{"disposition":"discard","weight":0,"interrupt":false} `.repeat(30);
    expect(feed(json).tripped).toBe(false);
  });

  it("stays quiet below the minimum word count no matter how repetitive", () => {
    // Repetition alone is not evidence until there is enough text to judge.
    const { tripped } = feed("same words over and over again forever ".repeat(20));
    expect(tripped).toBe(false);
  });

  it("is insensitive to how the stream chops the text", () => {
    const text = `${filler(420)} ${"round and round it goes ".repeat(400)}`;
    for (const chunk of [1, 7, 256, 100_000]) {
      expect(feed(text, chunk).tripped).toBe(true);
    }
  });

  it("does not split words across chunk boundaries", () => {
    const d = makeLoopDetector();
    d.push("hello wor");
    d.push("ld again");
    // "hello", "world", and a still-growing "again" → 2 complete words.
    expect(d.wordCount()).toBe(2);
  });

  it("latches once tripped", () => {
    const d = makeLoopDetector({ minWords: 0, threshold: 2, n: 2 });
    d.push("a b a b a b ");
    expect(d.push("")).toBe(true);
  });

  it("honours a custom threshold", () => {
    const text = `${filler(420)} ${"tick tock ".repeat(30)}`;
    const strict = makeLoopDetector({ threshold: 5 });
    let tripped = false;
    for (const w of text.split(" ")) tripped = strict.push(`${w} `) || tripped;
    expect(tripped).toBe(true);
  });
});
