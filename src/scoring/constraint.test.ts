import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ConstraintConfig } from "../schema/scorer.js";
import { scoreConstraints } from "./constraint.js";

const run = (output: string, config: ConstraintConfig) =>
  Effect.runSync(scoreConstraints(output, config));

describe("scoreConstraints", () => {
  it("returns 1.0 when every constraint passes", () => {
    const config: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "a", value: "foo" },
        { check: "min_length", name: "b", length: 2 },
      ],
    };
    const r = run("foo bar", config);
    expect(r.score).toBe(1);
    expect(r.breakdown?.passed).toEqual(["a", "b"]);
    expect(r.breakdown?.failed).toEqual([]);
  });

  it("returns 0 when empty constraint list (prototype guard)", () => {
    const config: ConstraintConfig = { type: "constraint", constraints: [] };
    const r = run("irrelevant", config);
    expect(r.score).toBe(0);
  });

  it("returns passed/total fraction", () => {
    const config: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "hit", value: "foo" },
        { check: "contains", name: "miss", value: "xyz" },
      ],
    };
    const r = run("foo bar", config);
    expect(r.score).toBe(0.5);
    expect(r.breakdown?.passed).toEqual(["hit"]);
    expect(r.breakdown?.failed).toEqual(["miss"]);
  });

  it("records an errored check as separate from a failed check", () => {
    // Invalid regex — `[` unclosed. RegExp construction throws, which the
    // evaluator maps to `ConstraintEvalError`, and the scorer records it
    // as errored (not failed).
    const config: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "ok", value: "foo" },
        { check: "regex", name: "bad_regex", pattern: "[" },
      ],
    };
    const r = run("foo", config);
    expect(r.score).toBe(0.5); // 1 passed out of 2
    expect(r.breakdown?.passed).toEqual(["ok"]);
    expect(r.breakdown?.errored).toEqual(["bad_regex"]);
    expect(r.breakdown?.failed).toEqual([]);
  });

  it("details string reports counts", () => {
    const config: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "p", value: "a" },
        { check: "contains", name: "f", value: "zzz" },
      ],
    };
    const r = run("abc", config);
    expect(r.details).toContain("1/2");
    expect(r.details).toContain("failed [f]");
  });
});
