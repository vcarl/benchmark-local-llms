import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../config/hashing.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { execution } from "../store/__tests__/fixtures.js";
import { digestOf, sha256Hex } from "../store/digest.js";
import { SCORING_RULES, scoreFields, scoreRecord, scorerBlob, scorerDigest } from "./rules.js";
import { SANDBOX_IMAGE } from "./sandbox.js";

const run = <A>(eff: Effect.Effect<A, never, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

const exact: ScorerConfig = { type: "exact_match", expected: "4", extract: "(\\d+)" };

describe("scorer blob", () => {
  it("is { config, rules } for a pure scorer, plus the sandbox runner for code scorers", () => {
    expect(scorerBlob(exact)).toBe(stableStringify({ config: exact, rules: SCORING_RULES }));
    const code: ScorerConfig = { type: "code_exec", testCode: "assert True" };
    expect(scorerBlob(code)).toBe(
      stableStringify({ config: code, rules: SCORING_RULES, runner: SANDBOX_IMAGE }),
    );
    const custom: ScorerConfig = { type: "custom", source: "print(1)" };
    expect(JSON.parse(scorerBlob(custom)).runner).toBe(SANDBOX_IMAGE);
  });

  it("scorer digest is the SHA-256 of the blob bytes", () => {
    expect(scorerDigest(exact)).toBe(sha256Hex(scorerBlob(exact)));
  });
});

describe("score record computation", () => {
  it("grades the execution's output under the scorer", async () => {
    expect(await run(scoreFields(execution("a"), exact))).toEqual({
      score: 1,
      failureKind: null,
      details: "correct: 4",
      nearMiss: null,
      breakdown: null,
    });
  });

  it("does not score an errored execution", async () => {
    expect(
      await run(scoreFields(execution("a", 0, { error: "timeout", output: "4" }), exact)),
    ).toEqual({
      score: 0,
      failureKind: "execution_error",
      details: null,
      nearMiss: null,
      breakdown: null,
    });
  });

  it("drops an output that only echoes truncated reasoning", async () => {
    const echo = execution("a", 0, { output: "4", reasoning: "4", stopReason: "length" });
    expect((await run(scoreFields(echo, exact))).failureKind).toBe("thinking_truncated");
  });

  it("folds a scorer failure into a scorer_error zero", async () => {
    const game: ScorerConfig = { type: "game", gameScorer: "missing", scorerParams: {} };
    const f = await run(scoreFields(execution("a"), game));
    expect(f.score).toBe(0);
    expect(f.failureKind).toBe("scorer_error");
  });

  it("keys the record by execution digest × scorer digest and carries the stamp", async () => {
    const e = execution("a");
    const stamp = { harnessGitSha: "f".repeat(40), scoredAt: "2026-01-01T00:00:00.000Z" };
    const r = await run(scoreRecord(e, exact, stamp));
    expect(r.execution).toBe(digestOf(e));
    expect(r.scorer).toBe(scorerDigest(exact));
    expect(r.harnessGitSha).toBe(stamp.harnessGitSha);
    expect(r.scoredAt).toBe(stamp.scoredAt);
  });
});
