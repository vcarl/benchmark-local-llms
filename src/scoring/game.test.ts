import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "../schema/index.js";
import { GAME_SCORERS } from "./game.js";

const baseResult: ExecutionResult = {
  archiveId: "a1",
  runId: "r1",
  executedAt: "2026-04-14T00:00:00.000Z",
  promptName: "scenario_smoke",
  temperature: 0.7,
  model: "test-model",
  runtime: "mlx",
  quant: "4bit",
  promptTokens: 0,
  generationTokens: 0,
  promptTps: 0,
  generationTps: 0,
  peakMemoryGb: 0,
  wallTimeSec: 0,
  output: "",
  reasoning: null,
  rawOutput: "",
  error: null,
  promptHash: "hash",
  scenarioHash: "scenhash",
  scenarioName: "scenario_smoke",
  terminationReason: "completed",
  toolCallCount: 0,
  finalPlayerStats: null,
  events: null,
  blobPool: null,
};

const withEvents = (
  toolCalls: number,
  toolErrors: number,
  stats: Record<string, number> = {},
): ExecutionResult => ({
  ...baseResult,
  finalPlayerStats: { stats },
  events: [
    ...Array.from({ length: toolCalls }, (_, i) => ({
      event: "tool_call" as const,
      tick: i,
      ts: "2026-04-14T00:00:00.000Z",
      data: {},
    })),
    ...Array.from({ length: toolErrors }, (_, i) => ({
      event: "tool_error" as const,
      tick: toolCalls + i,
      ts: "2026-04-14T00:00:00.000Z",
      data: {},
    })),
  ],
});

describe("game scorers — registry", () => {
  it("contains exactly the retained scorers", () => {
    expect(Object.keys(GAME_SCORERS).sort()).toEqual(["api_field", "dock_and_sell", "generic"]);
  });
});

describe("game scorers — zero-input baseline", () => {
  it.each(Object.keys(GAME_SCORERS))("%s produces a zero baseline score", (name) => {
    const fn = GAME_SCORERS[name];
    expect(fn).toBeDefined();
    if (fn === undefined) return;
    const out = fn(baseResult, {});
    expect(out.kind).toBe("scenario");
    expect(out.value).toBeCloseTo(0, 5);
  });
});

const run = (
  key: string,
  r: ExecutionResult,
): { kind: "scenario"; value: number; scoreField: string; details: string } => {
  const fn = GAME_SCORERS[key];
  return fn
    ? fn(r, {})
    : { kind: "scenario", value: -1, scoreField: "missing", details: `missing scorer: ${key}` };
};

describe("game scorers — formula correctness", () => {
  it("generic: accuracy and activity drive score equally", () => {
    const r = withEvents(10, 10);
    const out = run("generic", r);
    // accuracy=0.5 → efficiency=25; totalTools=20 → activity=clamp(20/30,1)*50=33.33
    expect(out.value).toBeCloseTo(0.25 + 0.3333333, 4);
    expect(out.scoreField).toBe("generic");
  });

  it("dock_and_sell: metadata includes scoreField=composite and kind=scenario", () => {
    const r = withEvents(5, 2, { ore_mined: 10, times_docked: 3, credits_earned: 100 });
    const out = run("dock_and_sell", r);
    expect(out.kind).toBe("scenario");
    expect(out.scoreField).toBe("composite");
  });
});

describe("api_field scorer", () => {
  const score = GAME_SCORERS["api_field"];
  if (!score) throw new Error("api_field not registered");

  it("reads the default 'score' field as a number", () => {
    const result = withFinalStats({ score: 4200, leaderboard_rank: 3 });
    const out = score(result, {});
    expect(out.kind).toBe("scenario");
    expect(out.value).toBe(4200);
    expect(out.scoreField).toBe("score");
  });

  it("respects an overridden scoreField param", () => {
    const result = withFinalStats({ score: 4200, leaderboard_rank: 3 });
    const out = score(result, { scoreField: "leaderboard_rank" });
    expect(out.value).toBe(3);
    expect(out.scoreField).toBe("leaderboard_rank");
  });

  it("returns 0 with details when the field is missing", () => {
    const result = withFinalStats({ leaderboard_rank: 3 });
    const out = score(result, { scoreField: "score" });
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/missing/i);
  });

  it("returns 0 with details when the field is non-numeric", () => {
    const result = withFinalStats({ score: "high" });
    const out = score(result, {});
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/non.*numeric|not.*number/i);
  });

  it("returns 0 with details when finalPlayerStats is null", () => {
    const result = { ...baseResult, finalPlayerStats: null };
    const out = score(result, {});
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/no.*stats/i);
  });

  it("returns value 0 on the happy path when the field is exactly 0", () => {
    const result = withFinalStats({ score: 0 });
    const out = score(result, {});
    expect(out.kind).toBe("scenario");
    expect(out.value).toBe(0);
    expect(out.scoreField).toBe("score");
    expect(out.details).toMatch(/score=0/);
  });
});

const withFinalStats = (stats: Record<string, unknown>): ExecutionResult => ({
  ...baseResult,
  finalPlayerStats: stats,
});
