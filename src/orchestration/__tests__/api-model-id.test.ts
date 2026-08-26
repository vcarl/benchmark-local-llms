import { describe, expect, it } from "vitest";
import { apiModelId } from "../run-prompt.js";

describe("apiModelId", () => {
  it("sends the full artifact for llamacpp", () => {
    expect(apiModelId({ artifact: "bartowski/Qwen_Qwen3-32B-GGUF", runtime: "llamacpp" })).toBe(
      "bartowski/Qwen_Qwen3-32B-GGUF",
    );
  });

  it("sends the full artifact for mlx", () => {
    expect(apiModelId({ artifact: "mlx-community/Qwen3-32B-4bit", runtime: "mlx" })).toBe(
      "mlx-community/Qwen3-32B-4bit",
    );
  });

  it("sends the leaf directory name for omlx", () => {
    // oMLX registers discovered models under the leaf directory name, never
    // `org/repo`, so the OpenAI `model` field must carry the leaf.
    expect(apiModelId({ artifact: "mlx-community/Qwen3-32B-4bit", runtime: "omlx" })).toBe(
      "Qwen3-32B-4bit",
    );
  });

  it("passes an already-leaf artifact through unchanged for omlx", () => {
    expect(apiModelId({ artifact: "Qwen3-32B-4bit", runtime: "omlx" })).toBe("Qwen3-32B-4bit");
  });
});
