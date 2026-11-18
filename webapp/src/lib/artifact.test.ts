import { describe, expect, it } from "vitest";
import { splitArtifact } from "./artifact";

describe("splitArtifact", () => {
  it("splits an org-prefixed artifact on the first slash", () => {
    expect(splitArtifact("mlx-community/Qwen3.6-35B-A3B-4bit")).toEqual({
      prefix: "mlx-community",
      name: "Qwen3.6-35B-A3B-4bit",
    });
  });

  it("returns a null prefix when there is no slash", () => {
    expect(splitArtifact("qwen")).toEqual({ prefix: null, name: "qwen" });
  });

  it("splits only on the FIRST slash, leaving later slashes in name", () => {
    expect(splitArtifact("bartowski/nvidia_Llama/v1-GGUF")).toEqual({
      prefix: "bartowski",
      name: "nvidia_Llama/v1-GGUF",
    });
  });

  it("handles an empty string", () => {
    expect(splitArtifact("")).toEqual({ prefix: null, name: "" });
  });
});

const raw = {
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llama-server",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "att-1",
  finished_at: "t", score: 0.5, passed: false, generation_tokens: 300,
  wall_time_sec: 6, item_count: 2, passed_items: 1,
};
