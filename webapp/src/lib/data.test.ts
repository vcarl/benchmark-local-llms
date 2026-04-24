import { describe, expect, it } from "vitest";
import { type BenchmarkResult, normalizeRecord } from "./data";

describe("normalizeRecord", () => {
  it("fills defaults for missing new fields on legacy data.js", () => {
    const legacy = {
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "code", tier: 1, score: 1, score_details: "",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "",
    };
    const rec = normalizeRecord(legacy as never);
    expect(rec.tags).toEqual([]);
    expect(rec.is_scenario).toBe(false);
    expect(rec.temperature).toBe(0);
    expect(rec.events).toBeNull();
    expect(rec.scenario_name).toBeNull();
  });

  it("preserves values on a full record", () => {
    const rec = normalizeRecord({
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "game", tier: 2, temperature: 0.7,
      tags: ["tool-use"], is_scenario: true,
      score: 0.9, score_details: "ok",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "",
      scenario_name: "bootstrap_grind", termination_reason: "completed",
      tool_call_count: 47, final_player_stats: { credits: 100 },
      events: [],
    });
    expect(rec.tags).toEqual(["tool-use"]);
    expect(rec.is_scenario).toBe(true);
    expect(rec.termination_reason).toBe("completed");
  });

  it("preserves executed_at when present", () => {
    const r = normalizeRecord({ executed_at: "2026-04-01T12:00:00Z" } as Partial<BenchmarkResult>);
    expect(r.executed_at).toBe("2026-04-01T12:00:00Z");
  });

  it("defaults executed_at to empty string when missing", () => {
    const r = normalizeRecord({});
    expect(r.executed_at).toBe("");
  });
});
