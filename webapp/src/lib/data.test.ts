import { describe, expect, it } from "vitest";
import { normalizeRecord } from "./data";

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
    expect(rec.kind).toBe("prompt");
    expect(rec.is_scenario).toBe(false);
    expect(rec.temperature).toBe(0);
    expect(rec.events).toBeNull();
    expect(rec.scenario_name).toBeNull();
  });

  it("preserves values on a full scenario record", () => {
    const rec = normalizeRecord({
      kind: "scenario",
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "game", tier: 2, temperature: 0.7,
      tags: ["tool-use"], is_scenario: true,
      value: 47, score_field: "credits", score_details: "ok",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "",
      scenario_name: "bootstrap_grind", termination_reason: "completed",
      tool_call_count: 47, final_player_stats: { credits: 100 },
      events: [],
    });
    expect(rec.tags).toEqual(["tool-use"]);
    expect(rec.kind).toBe("scenario");
    expect(rec.is_scenario).toBe(true);
    if (rec.kind === "scenario") {
      expect(rec.value).toBe(47);
      expect(rec.score_field).toBe("credits");
      expect(rec.termination_reason).toBe("completed");
    }
  });

  it("preserves values on a full prompt record", () => {
    const rec = normalizeRecord({
      kind: "prompt",
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "code", tier: 1, temperature: 0.7,
      tags: ["code-synthesis"], is_scenario: false,
      score: 0.9, score_details: "ok",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "do x",
    });
    expect(rec.kind).toBe("prompt");
    expect(rec.is_scenario).toBe(false);
    if (rec.kind === "prompt") {
      expect(rec.score).toBe(0.9);
    }
  });

  it("preserves executed_at when present", () => {
    const r = normalizeRecord({ executed_at: "2026-04-01T12:00:00Z" });
    expect(r.executed_at).toBe("2026-04-01T12:00:00Z");
  });

  it("defaults executed_at to empty string when missing", () => {
    const r = normalizeRecord({});
    expect(r.executed_at).toBe("");
  });

  it("preserves has_events when scenario record has it set", () => {
    const rec = normalizeRecord({
      kind: "scenario",
      is_scenario: true,
      scenario_name: "scn",
      has_events: true,
    } as never);
    if (rec.kind === "scenario") {
      expect(rec.has_events).toBe(true);
    }
  });

  it("defaults has_events to false on legacy scenario records without the flag", () => {
    const rec = normalizeRecord({
      kind: "scenario",
      is_scenario: true,
      scenario_name: "scn",
    } as never);
    if (rec.kind === "scenario") {
      expect(rec.has_events).toBe(false);
    }
  });

  it("defaults has_events to false on prompt records", () => {
    const rec = normalizeRecord({ kind: "prompt", is_scenario: false } as never);
    if (rec.kind === "prompt") {
      expect(rec.has_events).toBe(false);
    }
  });
});
