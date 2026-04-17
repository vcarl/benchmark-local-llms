import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ExactMatchConfig } from "../schema/scorer.js";
import { scoreExactMatch } from "./exact-match.js";

const run = <A>(effect: Effect.Effect<A>) => Effect.runSync(effect);

const cfg = (expected: string, extract: string): ExactMatchConfig => ({
  type: "exact_match",
  expected,
  extract,
});

describe("scoreExactMatch", () => {
  it("returns 1 for an exact match on a single capture", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    expect(run(scoreExactMatch("answer: 42", c))).toEqual({
      score: 1,
      details: "correct: 42",
    });
  });

  it("returns 0 and a `no match` message when regex does not match", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    const r = run(scoreExactMatch("I have no idea.", c));
    expect(r.score).toBe(0);
    expect(r.details).toContain("no match");
  });

  it("uses the LAST match when multiple captures exist (show-your-work)", () => {
    // Prototype behavior: models show scratch work then the final answer.
    const c = cfg("7", String.raw`answer:\s*(\d+)`);
    const out = "scratch: answer: 3\nrethink: answer: 5\nfinal: answer: 7";
    expect(run(scoreExactMatch(out, c))).toEqual({
      score: 1,
      details: "correct: 7",
    });
  });

  it("strips commas from numeric answers before comparing", () => {
    const c = cfg("2395912", String.raw`=\s*([\d,]+)`);
    expect(run(scoreExactMatch("result = 2,395,912", c))).toEqual({
      score: 1,
      details: "correct: 2395912",
    });
  });

  it("reports `got` value on mismatch", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    const r = run(scoreExactMatch("answer: 41", c));
    expect(r).toEqual({ score: 0, details: "expected 42, got 41" });
  });

  it("falls back to whole match when pattern has no capture group", () => {
    // Python: re.findall with no capture returns the whole match.
    const c = cfg("42", String.raw`\d+`);
    expect(run(scoreExactMatch("sum = 10 + 32 = 42", c))).toEqual({
      score: 1,
      details: "correct: 42",
    });
  });

  it("is case-sensitive on the expected comparison", () => {
    const c = cfg("YES", "([A-Za-z]+)");
    const r = run(scoreExactMatch("answer: yes", c));
    expect(r.score).toBe(0);
  });
});
