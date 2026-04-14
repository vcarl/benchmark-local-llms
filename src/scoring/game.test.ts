import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "../schema/index.js";
import { GAME_SCORERS } from "./game.js";

const baseResult: ExecutionResult = {
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
  error: null,
  promptHash: "hash",
  scenarioHash: "scenhash",
  scenarioName: "scenario_smoke",
  terminationReason: "completed",
  toolCallCount: 0,
  finalPlayerStats: null,
  events: null,
};

const withStats = (stats: Record<string, number>): ExecutionResult => ({
  ...baseResult,
  finalPlayerStats: { stats },
});

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
  it("contains all 14 prototype scorers", () => {
    expect(Object.keys(GAME_SCORERS).sort()).toEqual(
      [
        "bootstrap_grind",
        "combat",
        "combat_pirate",
        "craft_item",
        "dock_and_sell",
        "equip_ship",
        "generic",
        "market_buy_sell",
        "navigation",
        "navigation_route",
        "refuel_loop",
        "scan_and_survey",
        "storage_management",
        "trading",
      ].sort(),
    );
  });
});

describe("game scorers — zero-input baseline", () => {
  // Two scorers grant a non-zero survival bonus when deaths==0; for every
  // other scorer a null/empty result produces exactly 0.
  const survivorBonus: Record<string, number> = {
    refuel_loop: 0.2,
    combat_pirate: 0.2,
  };
  it.each(Object.keys(GAME_SCORERS))("%s produces the expected baseline score", (name) => {
    const fn = GAME_SCORERS[name];
    expect(fn).toBeDefined();
    if (fn === undefined) return;
    const out = fn(baseResult, {});
    expect(out.score).toBeCloseTo(survivorBonus[name] ?? 0, 5);
  });
});

const run = (key: string, r: ExecutionResult): { score: number; details: string } => {
  const fn = GAME_SCORERS[key];
  return fn ? fn(r, {}) : { score: -1, details: `missing scorer: ${key}` };
};

describe("game scorers — formula correctness", () => {
  it("bootstrap_grind: full credit at thresholds", () => {
    const r = withEvents(30, 0, { credits_earned: 5000 });
    const out = run("bootstrap_grind", r);
    // creditScore=40 + efficiencyScore=20 + activityScore=20 + ratioScore=min((5000/30)/30,1)*20=20 → raw=100 → 1.0
    expect(out.score).toBeCloseTo(1.0, 5);
    expect(out.details).toContain("credits_earned=5000");
  });

  it("combat_pirate: survival bonus differs for zero vs nonzero deaths", () => {
    const noDeaths = withStats({ pirates_destroyed: 1, battles_started: 1 });
    const withDeaths = withStats({ pirates_destroyed: 1, battles_started: 1, deaths_by_pirate: 1 });
    expect(run("combat_pirate", noDeaths).score).toBeCloseTo(0.8, 5);
    expect(run("combat_pirate", withDeaths).score).toBeCloseTo(0.66, 5);
  });

  it("generic: accuracy and activity drive score equally", () => {
    const r = withEvents(10, 10);
    const out = run("generic", r);
    // accuracy=0.5 → efficiency=25; totalTools=20 → activity=clamp(20/30,1)*50=33.33
    expect(out.score).toBeCloseTo(0.25 + 0.3333333, 4);
  });

  it("trading: credits read from top-level, not stats.stats", () => {
    const r: ExecutionResult = {
      ...baseResult,
      finalPlayerStats: { credits: 15000, stats: { credits_earned: 20000 } },
    };
    const out = run("trading", r);
    // credit=40 + earned=30 + efficiency=0 + activity=0 = 70 → 0.70
    expect(out.score).toBeCloseTo(0.7, 5);
  });

  it("refuel_loop: survival bonus is all-or-nothing", () => {
    const base = { times_docked: 3, jumps_completed: 2 };
    const alive = withStats(base);
    const dead = withStats({ ...base, deaths_by_self_destruct: 1 });
    expect(run("refuel_loop", alive).score).toBeCloseTo(0.8, 5);
    expect(run("refuel_loop", dead).score).toBeCloseTo(0.6, 5);
  });
});
