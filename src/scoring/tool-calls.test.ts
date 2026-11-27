import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ToolCallsConstraint } from "../schema/constraints.js";
import { scoreConstraints } from "./constraint.js";
import { scoreToolCalls } from "./tool-calls.js";

const key = (value: ToolCallsConstraint["value"]): ToolCallsConstraint => ({
  name: "calls",
  check: "tool_calls",
  value,
});
const j = (v: unknown) => JSON.stringify(v);
const call = (name: string, args: Record<string, unknown>) => ({ name, arguments: args });

const weather = key([
  {
    name: "get_weather",
    arguments: { city: { oneOf: ["London", "London, UK"] }, days: 3 },
    optional: { units: "metric" },
  },
]);

describe("scoreToolCalls", () => {
  it("passes an exact call, a bare object, and any listed alternative", () => {
    expect(
      scoreToolCalls(j([call("get_weather", { city: "London", days: 3 })]), weather).credit,
    ).toBe(1);
    expect(
      scoreToolCalls(j(call("get_weather", { city: "London, UK", days: 3 })), weather).credit,
    ).toBe(1);
    expect(
      scoreToolCalls(
        `Sure:\n\`\`\`json\n${j([call("get_weather", { days: 3, city: "London" })])}\n\`\`\``,
        weather,
      ).credit,
    ).toBe(1);
  });

  it("does no string normalization and no type coercion", () => {
    for (const args of [
      { city: "london", days: 3 },
      { city: "London ", days: 3 },
      { city: "London", days: "3" },
      { city: "London", days: 3.5 },
    ])
      expect(scoreToolCalls(j([call("get_weather", args)]), weather).credit, j(args)).toBe(0);
  });

  it("gives 0.75 for an optional argument passed explicitly at its default and names it", () => {
    const r = scoreToolCalls(
      j([call("get_weather", { city: "London", days: 3, units: "metric" })]),
      weather,
    );
    expect(r.credit).toBe(0.75);
    expect(r.explicitDefaults).toEqual(["get_weather.units"]);
    expect(r.details).toMatch(/explicit default units/);
  });

  it("fails an optional argument at a non-default value, an unknown key, a missing required key", () => {
    for (const args of [
      { city: "London", days: 3, units: "imperial" },
      { city: "London", days: 3, lang: "en" },
      { city: "London" },
    ])
      expect(scoreToolCalls(j([call("get_weather", args)]), weather).credit, j(args)).toBe(0);
  });

  it("fails a wrong name, stringified arguments, and a wrong call count", () => {
    expect(
      scoreToolCalls(j([call("get_forecast", { city: "London", days: 3 })]), weather).details,
    ).toMatch(/missing/);
    expect(
      scoreToolCalls(
        j([{ name: "get_weather", arguments: j({ city: "London", days: 3 }) }]),
        weather,
      ).credit,
    ).toBe(0);
    const twice = scoreToolCalls(
      j([
        call("get_weather", { city: "London", days: 3 }),
        call("get_weather", { city: "London", days: 3 }),
      ]),
      weather,
    );
    expect(twice.credit).toBe(0);
    expect(twice.details).toMatch(/expected 1 call, got 2/);
  });

  it("matches calls as a multiset with a full assignment search, not greedily", () => {
    // Expected A accepts Paris or Lyon; expected B accepts only Paris. A greedy
    // pass gives the first actual call (Paris) to A and then fails B on Lyon.
    const k = key([
      { name: "get_weather", arguments: { city: { oneOf: ["Paris", "Lyon"] } } },
      { name: "get_weather", arguments: { city: "Paris" } },
    ]);
    const out = j([call("get_weather", { city: "Paris" }), call("get_weather", { city: "Lyon" })]);
    const r = scoreToolCalls(out, k);
    expect(r.credit).toBe(1);
    expect(r.details).toMatch(/2\/2 calls matched/);
  });

  it("prefers an assignment without explicit defaults when one exists", () => {
    const k = key([
      { name: "f", arguments: { a: { oneOf: [1, 2] } }, optional: { b: 0 } },
      { name: "f", arguments: { a: 1, b: 0 } },
    ]);
    expect(scoreToolCalls(j([call("f", { a: 1, b: 0 }), call("f", { a: 2 })]), k).credit).toBe(1);
  });

  it("compares arrays in order unless the key marks the argument unordered", () => {
    const ordered = key([{ name: "f", arguments: { xs: ["a", "b"] } }]);
    const unordered = key([{ name: "f", arguments: { xs: ["a", "b"] }, unordered: ["xs"] }]);
    const out = j([call("f", { xs: ["b", "a"] })]);
    expect(scoreToolCalls(out, ordered).credit).toBe(0);
    expect(scoreToolCalls(out, unordered).credit).toBe(1);
    expect(scoreToolCalls(j([call("f", { xs: ["a", "a"] })]), unordered).credit).toBe(0);
  });

  it("passes [] for an abstention key and fails any call", () => {
    const none = key([]);
    expect(scoreToolCalls("[]", none).credit).toBe(1);
    expect(scoreToolCalls("None of the tools apply, so: []", none).credit).toBe(1);
    const r = scoreToolCalls(j([call("get_weather", { city: "Oslo" })]), none);
    expect(r.credit).toBe(0);
    expect(r.details).toMatch(/expected no call, got 1/);
  });

  it("scores unparseable output 0 as no answer, never as a correct abstention", () => {
    for (const out of ["", "I can't help with that.", '[{"name": "f",']) {
      const r = scoreToolCalls(out, key([]));
      expect(r.credit, out).toBe(0);
      expect(r.noAnswer, out).toBe(true);
    }
  });

  it("names each expected call's outcome in the details", () => {
    const k = key([
      { name: "f", arguments: { a: 1 } },
      { name: "g", arguments: { b: "x" } },
      { name: "h", arguments: {} },
    ]);
    const r = scoreToolCalls(j([call("f", { a: 1 }), call("g", { b: "y" }), call("i", {})]), k);
    expect(r.credit).toBe(0);
    expect(r.details).toContain("f: matched");
    expect(r.details).toContain('g: wrong-arg b="y"');
    expect(r.details).toContain("h: missing");
    expect(r.details).toContain("unexpected i");
  });
});

describe("scoreConstraints with tool_calls", () => {
  const score = (output: string, c: ToolCallsConstraint) =>
    Effect.runSync(scoreConstraints(output, { type: "constraint", constraints: [c] }));

  it("carries the 0.75 credit, a named near miss, and the details", () => {
    const r = score(
      j([call("get_weather", { city: "London", days: 3, units: "metric" })]),
      weather,
    );
    expect(r.score).toBe(0.75);
    expect(r.nearMiss).toBe("explicit-default");
    expect(r.details).toMatch(/get_weather: matched \(explicit default units\)/);
  });

  it("marks unparseable output as no_answer", () => {
    const r = score("no", key([]));
    expect(r.score).toBe(0);
    expect(r.failure).toBe("no_answer");
  });

  it("leaves a full pass unmarked", () => {
    const r = score("[]", key([]));
    expect(r).toMatchObject({ score: 1 });
    expect(r.nearMiss).toBeUndefined();
    expect(r.failure).toBeUndefined();
  });
});
