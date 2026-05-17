import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CodeExecConfig,
  ConstraintConfig,
  ExactMatchConfig,
  GameScorerConfig,
  ScorerConfig,
} from "./scorer.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("ExactMatchConfig", () => {
  it("round-trips", () => {
    const v: ExactMatchConfig = {
      type: "exact_match",
      expected: "4183",
      extract: "ANSWER:\\s*(\\d[\\d,]*)",
    };
    expect(roundTrip(ExactMatchConfig, v)).toEqual(v);
  });
});

describe("ConstraintConfig", () => {
  it("round-trips with multiple constraints", () => {
    const v: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "has_hello", value: "hello" },
        { check: "min_length", name: "long", length: 50 },
        { check: "regex", name: "matches", pattern: "foo" },
      ],
    };
    expect(roundTrip(ConstraintConfig, v)).toEqual(v);
  });

  it("round-trips with empty constraints list", () => {
    const v: ConstraintConfig = { type: "constraint", constraints: [] };
    expect(roundTrip(ConstraintConfig, v)).toEqual(v);
  });
});

describe("CodeExecConfig", () => {
  it("round-trips with test code", () => {
    const v: CodeExecConfig = {
      type: "code_exec",
      testCode: "assert foo(1) == 1\nassert foo(2) == 2\n",
    };
    expect(roundTrip(CodeExecConfig, v)).toEqual(v);
  });
});

describe("GameScorerConfig", () => {
  it("round-trips with empty params", () => {
    const v: GameScorerConfig = {
      type: "game",
      gameScorer: "bootstrap_grind",
      scorerParams: {},
    };
    expect(roundTrip(GameScorerConfig, v)).toEqual(v);
  });

  it("round-trips with mixed-type params", () => {
    const v: GameScorerConfig = {
      type: "game",
      gameScorer: "combat_pirate",
      scorerParams: {
        targetPirates: 5,
        allowedShips: ["fighter", "cruiser"],
        threshold: 0.75,
      },
    };
    expect(roundTrip(GameScorerConfig, v)).toEqual(v);
  });
});

describe("ScorerConfig union", () => {
  it("round-trips each of the 4 variants", () => {
    const variants: ScorerConfig[] = [
      { type: "exact_match", expected: "42", extract: "(\\d+)" },
      {
        type: "constraint",
        constraints: [{ check: "valid_json", name: "parses" }],
      },
      { type: "code_exec", testCode: "assert True" },
      { type: "game", gameScorer: "navigation", scorerParams: { minSystems: 3 } },
    ];
    for (const v of variants) {
      expect(roundTrip(ScorerConfig, v)).toEqual(v);
    }
  });

  it("rejects unknown type discriminator", () => {
    expect(() => Schema.decodeUnknownSync(ScorerConfig)({ type: "manual", score: 1 })).toThrow();
  });
});
