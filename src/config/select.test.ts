import { describe, expect, it } from "vitest";
import { selectChallengeStems, selectConfigs } from "./select.js";

const cfgs = [
  { id: "qwen2.5-7b-mlx" },
  { id: "qwen2.5-7b-llamacpp" },
  { id: "llama3.1-8b-mlx" },
  { id: "smoke-config", active: false },
];

describe("selectConfigs", () => {
  it("returns all non-disabled configs when no pattern is given", () => {
    expect(selectConfigs(cfgs).map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
      "llama3.1-8b-mlx",
    ]);
  });

  it("matches a literal id exactly (dots and dashes are literal)", () => {
    expect(selectConfigs(cfgs, "qwen2.5-7b-mlx").map((c) => c.id)).toEqual(["qwen2.5-7b-mlx"]);
    // '.' is literal, not 'any char': a different char must not match.
    expect(selectConfigs(cfgs, "qwen2X5-7b-mlx")).toEqual([]);
  });

  it("supports * wildcard and {a,b} brace alternation", () => {
    expect(selectConfigs(cfgs, "qwen*").map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
    ]);
    expect(selectConfigs(cfgs, "qwen2.5-7b-{mlx,llamacpp}").map((c) => c.id)).toEqual([
      "qwen2.5-7b-mlx",
      "qwen2.5-7b-llamacpp",
    ]);
  });

  it("an explicit pattern overrides the active gate", () => {
    expect(selectConfigs(cfgs, "smoke-config").map((c) => c.id)).toEqual(["smoke-config"]);
  });

  it("returns [] on no match (caller decides to fail)", () => {
    expect(selectConfigs(cfgs, "nope*")).toEqual([]);
  });
});

describe("selectChallengeStems", () => {
  const stems = ["code", "constraint", "effect-ts", "logic", "math"];
  it("returns all when no pattern", () => {
    expect(selectChallengeStems(stems)).toEqual(stems);
  });
  it("filters by glob with literal dash", () => {
    expect(selectChallengeStems(stems, "effect-ts")).toEqual(["effect-ts"]);
    expect(selectChallengeStems(stems, "{code,math}")).toEqual(["code", "math"]);
  });
});
