import { describe, expect, it } from "vitest";
import { apiModelId } from "../run-prompt.js";

describe("apiModelId", () => {
  it("sends the full artifact for llamacpp", () => {
    expect(apiModelId({ artifact: "bartowski/Qwen_Qwen3-32B-GGUF", runtime: "llamacpp" })).toBe(
      "bartowski/Qwen_Qwen3-32B-GGUF",
    );
  });

  it("names the launched model for mlx, so the server never reloads by repo id", () => {
    expect(apiModelId({ artifact: "mlx-community/Qwen3-32B-4bit", runtime: "mlx" })).toBe(
      "default_model",
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

  it("sends the directory name for a path artifact on omlx", () => {
    // A locally-assembled checkpoint names its directory directly. oMLX stages
    // and registers it under the same leaf, so the request must match.
    expect(
      apiModelId({ artifact: "/Users/x/.omlx/models/Qwen3.8-27B-4bit-MTP", runtime: "omlx" }),
    ).toBe("Qwen3.8-27B-4bit-MTP");
    expect(apiModelId({ artifact: "~/.omlx/models/Qwen3.8-27B-4bit-MTP/", runtime: "omlx" })).toBe(
      "Qwen3.8-27B-4bit-MTP",
    );
  });

  it("names the launched model for a path artifact on mlx too", () => {
    expect(apiModelId({ artifact: "/Users/x/models/Local-4bit", runtime: "mlx" })).toBe(
      "default_model",
    );
  });
});
