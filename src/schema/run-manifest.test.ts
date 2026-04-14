import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { PromptCorpusEntry } from "./prompt.js";
import { RunManifest } from "./run-manifest.js";
import type { ScenarioCorpusEntry } from "./scenario.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

const samplePrompt: PromptCorpusEntry = {
  name: "hello_prompt",
  category: "smoke",
  tier: 1,
  system: { key: "direct", text: "Be brief." },
  promptText: "Say hello.",
  scorer: {
    type: "exact_match",
    expected: "hello",
    extract: "(hello)",
  },
  promptHash: "hashhashhash",
};

const sampleScenario: ScenarioCorpusEntry = {
  name: "bootstrap_grind",
  fixture: "starter",
  players: [{ id: "p1", controlledBy: "llm" }],
  scorer: "bootstrap_grind",
  scorerParams: {},
  cutoffs: { wallClockSec: 900, totalTokens: 32000, toolCalls: 100 },
  tier: 2,
  scenarioMd: "# Directive",
  scenarioHash: "sceneabcdef0",
};

describe("RunManifest", () => {
  it("round-trips a completed run", () => {
    const v: RunManifest = {
      schemaVersion: 1,
      runId: "2026-04-14_qwen3-32b_4bit_deadbe",
      startedAt: "2026-04-14T12:00:00.000Z",
      finishedAt: "2026-04-14T13:00:00.000Z",
      interrupted: false,
      artifact: "mlx-community/Qwen3-32B-4bit",
      model: "Qwen 3 32B",
      runtime: "mlx",
      quant: "4bit",
      env: {
        hostname: "laptop.local",
        platform: "darwin-arm64",
        runtimeVersion: "mlx-lm 0.20.0",
        nodeVersion: "v22.0.0",
        benchmarkGitSha: "abcdef0",
      },
      temperatures: [0.3, 0.7, 1.0],
      promptCorpus: { hello_prompt: samplePrompt },
      scenarioCorpus: { bootstrap_grind: sampleScenario },
      stats: {
        totalPrompts: 1,
        totalExecutions: 3,
        completed: 3,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 42.7,
      },
    };
    expect(roundTrip(RunManifest, v)).toEqual(v);
  });

  it("round-trips an interrupted run (finishedAt null)", () => {
    const v: RunManifest = {
      schemaVersion: 1,
      runId: "2026-04-14_qwen3-32b_4bit_cafeba",
      startedAt: "2026-04-14T12:00:00.000Z",
      finishedAt: null,
      interrupted: true,
      artifact: "mlx-community/Qwen3-32B-4bit",
      model: "Qwen 3 32B",
      runtime: "mlx",
      quant: "4bit",
      env: {
        hostname: "laptop.local",
        platform: "darwin-arm64",
        runtimeVersion: "mlx-lm 0.20.0",
        nodeVersion: "v22.0.0",
        benchmarkGitSha: "abcdef0",
      },
      temperatures: [0.7],
      promptCorpus: {},
      scenarioCorpus: {},
      stats: {
        totalPrompts: 0,
        totalExecutions: 0,
        completed: 0,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 0,
      },
    };
    expect(roundTrip(RunManifest, v)).toEqual(v);
  });

  it("rejects schemaVersion !== 1", () => {
    expect(() =>
      Schema.decodeUnknownSync(RunManifest)({
        schemaVersion: 2,
      }),
    ).toThrow();
  });
});
