import { describe, expect, it } from "vitest";
import { normalizeRecord } from "./data";

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
