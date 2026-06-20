import { describe, expect, it } from "vitest";
import { csv, parseFilters } from "./filter-state";

describe("filter-state", () => {
  it("csv splits a comma list, empty/undefined → []", () => {
    expect(csv("a,b")).toEqual(["a", "b"]);
    expect(csv("")).toEqual([]);
    expect(csv(undefined)).toEqual([]);
  });
  it("parseFilters maps each dimension to a string[]", () => {
    const f = parseFilters({ family: "Qwen,Llama", runtime: "mlx", quant: "—", temperature: "0,0.4", challenge: "code@1,math@2" });
    expect(f.family).toEqual(["Qwen", "Llama"]);
    expect(f.runtime).toEqual(["mlx"]);
    expect(f.quant).toEqual(["—"]);
    expect(f.temperature).toEqual(["0", "0.4"]);
    expect(f.challenge).toEqual(["code@1", "math@2"]);
  });
});
