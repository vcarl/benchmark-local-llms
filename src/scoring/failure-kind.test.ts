import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ScorerConfig } from "../schema/scorer.js";
import { scoreOrFold } from "./dispatch.js";
import { classifyFailure } from "./failure-kind.js";

const base = { score: 0, error: null, output: "41", reasoning: null, stopReason: "stop" };

describe("classifyFailure", () => {
  it.each([
    ["full pass", { score: 1, stopReason: "length" }, undefined, null],
    [
      "inline think never closed",
      { error: "thinking_truncated", output: "" },
      undefined,
      "thinking_truncated",
    ],
    [
      "transport error",
      { error: '{"_tag":"LlmRequestError"}', output: "" },
      undefined,
      "execution_error",
    ],
    [
      "prompt longer than the context window",
      { error: "context_exceeded", output: "" },
      undefined,
      "context_exceeded",
    ],
    ["loop abort", { stopReason: "loop", output: "" }, undefined, "loop"],
    [
      "split-reasoning budget spent thinking",
      { stopReason: "length", output: "", reasoning: "…" },
      undefined,
      "thinking_truncated",
    ],
    [
      "cut off mid-answer",
      { stopReason: "length", output: "The answer is" },
      undefined,
      "length_cutoff",
    ],
    ["scorer crashed", {}, { failure: "scorer_error" as const }, "scorer_error"],
    ["extraction miss", {}, { failure: "no_answer" as const }, "no_answer"],
    [
      "empty output, legacy row without stopReason",
      { output: " ", stopReason: undefined },
      {},
      "no_answer",
    ],
    ["wrong answer", {}, {}, "wrong"],
    ["partial credit", { score: 0.5 }, {}, "wrong"],
    ["declared near miss", { score: 0.5 }, { nearMiss: "round-at-end" }, "near_miss"],
    [
      "near miss in a cut-off output",
      { score: 0.5, stopReason: "length" },
      { nearMiss: "truncated" },
      "near_miss",
    ],
  ])("%s", (_name, over, scored, want) => {
    expect(classifyFailure({ ...base, ...over }, scored)).toBe(want);
  });
});

describe("scorer outcomes", () => {
  const score = (output: string, cfg: ScorerConfig) =>
    Effect.runPromise(scoreOrFold(output, cfg).pipe(Effect.provide(NodeContext.layer)));

  it("exact_match flags an extraction miss, not a wrong answer", async () => {
    const cfg: ScorerConfig = { type: "exact_match", expected: "42", extract: "(\\d+)" };
    expect((await score("no number", cfg)).failure).toBe("no_answer");
    expect((await score("41", cfg)).failure).toBeUndefined();
  });

  it("set_match / ordered_match flag an answer naming nothing from the vocabulary", async () => {
    const vocab = { vocabulary: ["alpha", "beta"], expected: ["alpha"] };
    expect((await score("none", { type: "set_match", ...vocab })).failure).toBe("no_answer");
    expect((await score("beta", { type: "set_match", ...vocab })).failure).toBeUndefined();
    expect((await score("none", { type: "ordered_match", ...vocab })).failure).toBe("no_answer");
  });

  it("exact_match grants a declared near miss its credit and names the slip", async () => {
    const cfg: ScorerConfig = {
      type: "exact_match",
      expected: "42",
      extract: "(\\d+)",
      nearMisses: [{ slip: "off-by-one", credit: 0.5, expected: "41" }],
    };
    expect(await score("41", cfg)).toMatchObject({ score: 0.5, nearMiss: "off-by-one" });
    expect(await score("42", cfg)).toMatchObject({ score: 1 });
    expect((await score("42", cfg)).nearMiss).toBeUndefined();
    expect(await score("40", cfg)).toMatchObject({ score: 0 });
  });

  it("constraint grants a near-miss pattern only when the constraints fall short", async () => {
    const cfg: ScorerConfig = {
      type: "constraint",
      constraints: [
        { name: "equals 0.25", check: "regex", pattern: "(?<![\\d.])0?\\.250*(?!\\d)" },
      ],
      nearMisses: [
        { slip: "percent-for-decimal", credit: 0.5, pattern: "(?<![\\d.])25(?:\\.0*)?\\s*%" },
      ],
    };
    expect(await score("0.25", cfg)).toMatchObject({ score: 1 });
    expect(await score("25%", cfg)).toMatchObject({ score: 0.5, nearMiss: "percent-for-decimal" });
    expect((await score("25%", cfg)).details).toContain("near miss (percent-for-decimal)");
    expect(await score("0.3", cfg)).toMatchObject({ score: 0 });
  });

  it("folds a scorer failure into scorer_error with the cause in details", async () => {
    const cfg = { type: "game", gameScorer: "nope", scorerParams: {} } as ScorerConfig;
    const r = await score("x", cfg);
    expect(r).toMatchObject({ score: 0, failure: "scorer_error" });
    expect(r.details).toContain("ScorerNotFound");
  });
});
