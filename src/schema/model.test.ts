import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ModelConfig } from "./model.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("ModelConfig", () => {
  it("round-trips with only required fields (all overrides omitted)", () => {
    const v: ModelConfig = {
      artifact: "mlx-community/Qwen3-32B-4bit",
      runtime: "mlx",
    };
    expect(roundTrip(ModelConfig, v)).toEqual(v);
  });

  it("round-trips with full set of overrides", () => {
    const v: ModelConfig = {
      artifact: "Qwen/Qwen3-32B-GGUF",
      runtime: "llamacpp",
      name: "Qwen 3 32B",
      quant: "Q4_K_M",
      params: "32B",
      ctxSize: 16384,
      scenarioCtxSize: 32768,
      active: true,
    };
    expect(roundTrip(ModelConfig, v)).toEqual(v);
  });

  it("round-trips with active=false", () => {
    const v: ModelConfig = {
      artifact: "legacy/model",
      runtime: "mlx",
      active: false,
    };
    expect(roundTrip(ModelConfig, v)).toEqual(v);
  });

  it("round-trips with only ctxSize override", () => {
    const v: ModelConfig = {
      artifact: "mlx-community/DeepSeek-Coder-33B-Instruct-4bit",
      runtime: "mlx",
      ctxSize: 8192,
    };
    expect(roundTrip(ModelConfig, v)).toEqual(v);
  });

  it("accepts a model with explicit temperature", () => {
    const decoded = Schema.decodeUnknownSync(ModelConfig)({
      artifact: "test/m",
      runtime: "mlx",
      temperature: 0.7,
    });
    expect(decoded.temperature).toBe(0.7);
  });

  it("accepts a model without temperature when not validated", () => {
    const decoded = Schema.decodeUnknownSync(ModelConfig)({
      artifact: "test/m",
      runtime: "mlx",
    });
    expect(decoded.temperature).toBeUndefined();
  });
});
