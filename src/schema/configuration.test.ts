import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Configuration } from "./configuration.js";

describe("Configuration", () => {
  it("decodes a full entry", () => {
    const v = {
      id: "qwen3.5-9b-q4-direct",
      artifact: "Qwen/Qwen2.5-9B-Instruct-GGUF",
      runtime: "llamacpp",
      quant: "q4-k-m",
      temperature: 0.7,
      systemPrompt: "direct",
      maxTokens: 8096,
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({
      id: "qwen3.5-9b-q4-direct",
    });
  });

  it("accepts an optional chatTemplate field", () => {
    const v = {
      id: "magistral-small-2509-llamacpp",
      artifact: "mistralai/Magistral-Small-2509-GGUF",
      runtime: "llamacpp",
      quant: "Q8_0",
      temperature: 0.6,
      systemPrompt: "default",
      maxTokens: 8192,
      chatTemplate: "mistral-v7-tekken",
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({
      chatTemplate: "mistral-v7-tekken",
    });
  });

  it("decodes without chatTemplate (backward compatible)", () => {
    const v = {
      id: "qwen3.5-9b-q4-direct",
      artifact: "Qwen/Qwen2.5-9B-Instruct-GGUF",
      runtime: "llamacpp",
      quant: "q4-k-m",
      temperature: 0.7,
      systemPrompt: "direct",
      maxTokens: 8096,
    };
    const decoded = Schema.decodeUnknownSync(Configuration)(v);
    expect(decoded.chatTemplate).toBeUndefined();
  });

  it("accepts an optional extraArgs field", () => {
    const v = {
      id: "hunyuan-a13b-mlx",
      artifact: "mlx-community/Hunyuan-A13B-Instruct-4bit",
      runtime: "mlx",
      quant: "4bit",
      temperature: 0.7,
      systemPrompt: "default",
      maxTokens: 4096,
      extraArgs: ["--trust-remote-code"],
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({
      extraArgs: ["--trust-remote-code"],
    });
  });

  it("decodes without extraArgs (backward compatible)", () => {
    const v = {
      id: "qwen3.5-9b-q4-direct",
      artifact: "Qwen/Qwen2.5-9B-Instruct-GGUF",
      runtime: "llamacpp",
      quant: "q4-k-m",
      temperature: 0.7,
      systemPrompt: "direct",
      maxTokens: 8096,
    };
    const decoded = Schema.decodeUnknownSync(Configuration)(v);
    expect(decoded.extraArgs).toBeUndefined();
  });

  it("rejects an entry missing required temperature", () => {
    expect(() =>
      Schema.decodeUnknownSync(Configuration)({
        id: "x",
        artifact: "a",
        runtime: "mlx",
        systemPrompt: "direct",
        maxTokens: 8096,
      }),
    ).toThrow();
  });
});
