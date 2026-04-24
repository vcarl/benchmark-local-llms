import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "../../schema/execution.js";
import {
  averageGenTps,
  emptyAggregate,
  formatCrossModelRollup,
  formatModelBlock,
  type ModelAggregate,
  recordPrompt,
  recordScenario,
  slowest3,
  toRollupInput,
} from "../summary.js";

const baseResult: ExecutionResult = {
  runId: "r1",
  executedAt: "2026-04-17T00:00:00.000Z",
  promptName: "p",
  temperature: 0.7,
  model: "qwen3.5-9b",
  runtime: "mlx",
  quant: "Q4_K_M",
  promptTokens: 100,
  generationTokens: 50,
  promptTps: 100,
  generationTps: 20,
  peakMemoryGb: 0,
  wallTimeSec: 2,
  output: "x",
  error: null,
  promptHash: "h",
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
};

describe("aggregator", () => {
  it("records prompts as completed", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a" }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "b" }, false);
    expect(agg.promptStats).toEqual({ completed: 2, cached: 0, errors: 0 });
  });

  it("flags cached prompts and excludes them from averages", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 10 }, false);
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 100 }, true);
    expect(agg.promptStats).toEqual({ completed: 1, cached: 1, errors: 0 });
    // Token-weighted: only the first counts → avg = 10
    expect(averageGenTps(agg)).toBe(10);
  });

  it("flags errors and excludes them from averages", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(
      agg,
      { ...baseResult, error: "boom", generationTokens: 0, generationTps: 0 },
      false,
    );
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 60, generationTps: 20 }, false);
    expect(agg.promptStats).toEqual({ completed: 1, cached: 0, errors: 1 });
    expect(averageGenTps(agg)).toBe(20);
  });

  it("token-weights averages across many prompts", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 100, generationTps: 10 }, false);
    agg = recordPrompt(agg, { ...baseResult, generationTokens: 400, generationTps: 20 }, false);
    // Weighted mean = (100*10 + 400*20) / (100+400) = 9000/500 = 18
    expect(averageGenTps(agg)).toBe(18);
  });

  it("tracks top-3 slowest by wall time across prompts + scenarios", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a", wallTimeSec: 10 }, false);
    agg = recordScenario(
      agg,
      {
        ...baseResult,
        promptName: "s1",
        scenarioName: "s1",
        wallTimeSec: 50,
        terminationReason: "completed",
      },
      false,
    );
    agg = recordPrompt(agg, { ...baseResult, promptName: "b", wallTimeSec: 30 }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "c", wallTimeSec: 5 }, false);
    agg = recordScenario(
      agg,
      {
        ...baseResult,
        promptName: "s2",
        scenarioName: "s2",
        wallTimeSec: 100,
        terminationReason: "completed",
      },
      false,
    );

    const top = slowest3(agg);
    expect(top.map((t) => t.name)).toEqual(["s2", "s1", "b"]);
    expect(top.map((t) => t.wallTimeSec)).toEqual([100, 50, 30]);
  });

  it("excludes cached + errored results from slowest-3", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, promptName: "a", wallTimeSec: 100 }, true); // cached
    agg = recordPrompt(agg, { ...baseResult, promptName: "b", wallTimeSec: 50, error: "x" }, false);
    agg = recordPrompt(agg, { ...baseResult, promptName: "c", wallTimeSec: 10 }, false);
    expect(slowest3(agg).map((t) => t.name)).toEqual(["c"]);
  });

  it("formats a complete model block", () => {
    let agg: ModelAggregate = emptyAggregate();
    agg = recordPrompt(
      agg,
      {
        ...baseResult,
        promptName: "prompt_a",
        wallTimeSec: 10,
        generationTokens: 100,
        generationTps: 18.2,
        promptTps: 142,
      },
      false,
    );
    agg = recordScenario(
      agg,
      {
        ...baseResult,
        scenarioName: "bootstrap_grind",
        wallTimeSec: 94,
        terminationReason: "completed",
      },
      false,
    );
    const block = formatModelBlock({
      modelDisplayName: "qwen3.5-9b",
      runId: "run-abc",
      runtime: "mlx",
      quant: "Q4_K_M",
      archivePath: "./benchmark-archive/run1.jsonl",
      totalWallTimeSec: 204,
      interrupted: false,
      aggregate: agg,
    });
    expect(block).toContain("─ qwen3.5-9b · mlx · Q4_K_M ");
    expect(block).toContain("runId       run-abc");
    expect(block).toContain("prompts     1 completed · 0 cached · 0 errors");
    expect(block).toContain("scenarios   1 completed · 0 cached · 0 errors");
    expect(block).toContain("wall        3.4 min total");
    expect(block).toContain("avg 18.8 tps gen");
    expect(block).toContain("avg 121.0 tps prompt");
    expect(block).toContain("slowest     bootstrap_grind 94s");
    expect(block).toContain("archive     ./benchmark-archive/run1.jsonl");
    expect(block).toContain("interrupted false");
  });

  it("formats scenario-error trailer with termination reason", () => {
    let agg = emptyAggregate();
    agg = recordScenario(
      agg,
      {
        ...baseResult,
        scenarioName: "cutoff_scenario",
        error: "timeout",
        terminationReason: "wall_clock",
      },
      false,
    );
    const block = formatModelBlock({
      modelDisplayName: "m",
      runId: "r",
      runtime: "mlx",
      quant: "Q",
      archivePath: "/a",
      totalWallTimeSec: 10,
      interrupted: false,
      aggregate: agg,
    });
    expect(block).toContain("scenarios   0 completed · 0 cached · 1 errors (wall_clock)");
  });

  it("falls back to '(error)' when errored scenario has no termination reason", () => {
    let agg = emptyAggregate();
    agg = recordScenario(
      agg,
      { ...baseResult, scenarioName: "s", error: "boom", terminationReason: null },
      false,
    );
    const block = formatModelBlock({
      modelDisplayName: "m",
      runId: "r",
      runtime: "mlx",
      quant: "Q",
      archivePath: "/a",
      totalWallTimeSec: 10,
      interrupted: false,
      aggregate: agg,
    });
    expect(block).toContain("1 errors (error)");
  });

  it("renders duration format: <60s as s.s s, <3600s as m.m min, ≥3600 as h.h h", () => {
    let agg = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, wallTimeSec: 1 }, false);
    const short = formatModelBlock({
      modelDisplayName: "m",
      runId: "r",
      runtime: "mlx",
      quant: "Q",
      archivePath: "/a",
      totalWallTimeSec: 42.3,
      interrupted: false,
      aggregate: agg,
    });
    expect(short).toContain("wall        42.3s total");
    const mid = formatModelBlock({
      modelDisplayName: "m",
      runId: "r",
      runtime: "mlx",
      quant: "Q",
      archivePath: "/a",
      totalWallTimeSec: 204,
      interrupted: false,
      aggregate: agg,
    });
    expect(mid).toContain("wall        3.4 min total");
    const long = formatModelBlock({
      modelDisplayName: "m",
      runId: "r",
      runtime: "mlx",
      quant: "Q",
      archivePath: "/a",
      totalWallTimeSec: 3900,
      interrupted: false,
      aggregate: agg,
    });
    expect(long).toContain("wall        1.1h total");
  });

  it("formats the cross-model rollup", () => {
    const line = formatCrossModelRollup([
      { completed: 38, cached: 2, errors: 0, totalWallTimeSec: 204 },
      { completed: 13, cached: 1, errors: 1, totalWallTimeSec: 150 },
    ]);
    expect(line).toContain("2 models · 51 completed · 3 cached · 1 errors");
    expect(line).toContain("5.9 min total");
  });

  it("derives rollup-input from an aggregate", () => {
    let agg = emptyAggregate();
    agg = recordPrompt(agg, { ...baseResult, wallTimeSec: 5 }, false);
    agg = recordScenario(
      agg,
      { ...baseResult, scenarioName: "s", wallTimeSec: 10, terminationReason: "completed" },
      false,
    );
    expect(toRollupInput(agg, 15)).toEqual({
      completed: 2,
      cached: 0,
      errors: 0,
      totalWallTimeSec: 15,
    });
  });
});
