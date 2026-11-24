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

  it("rejects chatTemplate on a runtime: mlx entry (fail-fast)", () => {
    const v = {
      id: "some-mlx-model",
      artifact: "mlx-community/Some-Model-4bit",
      runtime: "mlx",
      quant: "4bit",
      temperature: 0.7,
      systemPrompt: "default",
      maxTokens: 4096,
      chatTemplate: "mistral-v7-tekken",
    };
    expect(() => Schema.decodeUnknownSync(Configuration)(v)).toThrow(
      /chatTemplate is not supported for runtime 'mlx'/,
    );
  });

  it("accepts chatTemplate on a runtime: llamacpp entry", () => {
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
      runtime: "llamacpp",
      chatTemplate: "mistral-v7-tekken",
    });
  });

  it("rejects chatTemplate on a runtime: omlx entry (fail-fast)", () => {
    const v = {
      id: "some-omlx-model",
      artifact: "mlx-community/Some-Model-4bit",
      runtime: "omlx",
      quant: "4bit",
      temperature: 0.7,
      systemPrompt: "default",
      maxTokens: 4096,
      chatTemplate: "mistral-v7-tekken",
    };
    expect(() => Schema.decodeUnknownSync(Configuration)(v)).toThrow(
      /chatTemplate is not supported for runtime 'omlx'/,
    );
  });

  describe("presenceContextSize", () => {
    const entry = (extra: object) => ({
      id: "q",
      artifact: "mlx-community/Qwen3.5-2B-4bit",
      runtime: "mlx",
      temperature: 1.0,
      systemPrompt: "default",
      maxTokens: 32768,
      ...extra,
    });
    const decode = (extra: object) => Schema.decodeUnknownSync(Configuration)(entry(extra));

    it("accepts it with a presence penalty on mlx and llamacpp", () => {
      for (const runtime of ["mlx", "llamacpp"]) {
        expect(decode({ runtime, presencePenalty: 1.5, presenceContextSize: 32768 })).toMatchObject(
          { presenceContextSize: 32768 },
        );
      }
    });

    it("rejects it without a presence penalty", () => {
      expect(() => decode({ presenceContextSize: 32768 })).toThrow(/requires presencePenalty/);
    });

    it("rejects it on omlx, which has no presence window", () => {
      expect(() =>
        decode({ runtime: "omlx", presencePenalty: 1.5, presenceContextSize: 32768 }),
      ).toThrow(/not supported for runtime 'omlx'/);
    });

    it("rejects a llamacpp entry whose two windows disagree", () => {
      const both = { runtime: "llamacpp", presencePenalty: 1.5, repetitionPenalty: 1.05 };
      expect(() =>
        decode({ ...both, repetitionContextSize: 64, presenceContextSize: 32768 }),
      ).toThrow(/must match/);
      expect(
        decode({ ...both, repetitionContextSize: 32768, presenceContextSize: 32768 }),
      ).toMatchObject({ presenceContextSize: 32768 });
    });
  });

  it("accepts a runtime: omlx entry without chatTemplate and without quant", () => {
    const v = {
      id: "some-omlx-model",
      artifact: "mlx-community/Some-Model-4bit",
      runtime: "omlx",
      temperature: 0.7,
      systemPrompt: "default",
      maxTokens: 4096,
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({
      runtime: "omlx",
    });
  });

  it("accepts a runtime: mlx entry without chatTemplate", () => {
    const v = {
      id: "some-mlx-model",
      artifact: "mlx-community/Some-Model-4bit",
      runtime: "mlx",
      quant: "4bit",
      temperature: 0.7,
      systemPrompt: "default",
      maxTokens: 4096,
    };
    expect(Schema.decodeUnknownSync(Configuration)(v)).toMatchObject({
      runtime: "mlx",
    });
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
