import { describe, expect, it } from "vitest";
import { normalizeRecord, splitArtifact } from "./data";

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

describe("normalizeRecord", () => {
  it("passes the per-attempt config×challenge fields through", () => {
    const r = normalizeRecord(raw);
    expect(r.config_hash).toBe("ch");
    expect(r.challenge_id).toBe("code");
    expect(r.generation_tokens).toBe(300);
    expect(r.passed).toBe(false);
  });

  it("coerces a missing quant to null", () => {
    const r = normalizeRecord({ ...raw, quant: undefined });
    expect(r.quant).toBeNull();
  });
});

describe("normalizeRecord new fields", () => {
  it("coerces peak_memory_gb / generation_tps / prompt_tps with 0 fallback", () => {
    const a = normalizeRecord({ peak_memory_gb: 3.4, generation_tps: 15, prompt_tps: 5 });
    expect(a.peak_memory_gb).toBe(3.4);
    expect(a.generation_tps).toBe(15);
    expect(a.prompt_tps).toBe(5);
    const b = normalizeRecord({});
    expect(b.peak_memory_gb).toBe(0);
    expect(b.generation_tps).toBe(0);
    expect(b.prompt_tps).toBe(0);
  });
});
