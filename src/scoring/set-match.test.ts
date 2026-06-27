import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { SetMatchConfig } from "../schema/scorer.js";
import { scoreSetMatch } from "./set-match.js";

const run = (output: string, config: SetMatchConfig) =>
  Effect.runSync(scoreSetMatch(output, config));

const cfg = (expected: string[]): SetMatchConfig => ({
  type: "set_match",
  vocabulary: ["Alice", "Bob", "Carol", "Dave", "Eve"],
  expected,
});

describe("scoreSetMatch", () => {
  it("returns 1.0 for all-and-only (exact set)", () => {
    const r = run("Alice, Bob and Carol colluded.", cfg(["Alice", "Bob", "Carol"]));
    expect(r.kind).toBe("prompt");
    expect(r.score).toBe(1);
  });

  it("set membership is order-independent", () => {
    const r = run("Carol, Alice, Bob", cfg(["Alice", "Bob", "Carol"]));
    expect(r.score).toBe(1);
  });

  it("awards F1 partial credit for a missing element", () => {
    // E={A,B,C}, P={A,B}: F1 = 2*2/(2+3) = 0.8
    const r = run("Alice and Bob", cfg(["Alice", "Bob", "Carol"]));
    expect(r.score).toBeCloseTo(0.8, 5);
  });

  it("penalizes an extra (false-positive) element", () => {
    // E={A,B,C}, P={A,B,C,D}: F1 = 2*3/(4+3) = 0.857
    const r = run("Alice, Bob, Carol and Dave", cfg(["Alice", "Bob", "Carol"]));
    expect(r.score).toBeCloseTo(6 / 7, 5);
  });

  it("returns 0 for an empty answer", () => {
    const r = run("I cannot determine the answer.", cfg(["Alice", "Bob", "Carol"]));
    expect(r.score).toBe(0);
  });

  it("returns 0 when all named entities are wrong", () => {
    const r = run("Dave and Eve", cfg(["Alice", "Bob", "Carol"]));
    expect(r.score).toBe(0);
  });

  it("reports precision/recall/matched/missing in details", () => {
    const r = run("Alice and Bob", cfg(["Alice", "Bob", "Carol"]));
    expect(r.details).toContain("recall");
    expect(r.details).toContain("Carol");
  });
});
