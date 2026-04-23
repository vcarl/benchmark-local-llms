/**
 * Shared test fixtures for the report + migrate modules. These return
 * plain JSON objects in the on-disk shape the Schema encoders produce, not
 * the decoded domain types — that way fixture files can be written with
 * `JSON.stringify` and still round-trip through the loader. For schemas
 * without encode transforms, encoded === decoded.
 *
 * Deliberately minimal: one prompt + one scenario in the corpus, one
 * execution result. Tests that need specific shapes override fields.
 */
import type { ExecutionResult, RunManifest } from "../../schema/index.js";

export const fixturePrompt = (
  overrides: Partial<{
    name: string;
    category: string;
    tier: number;
    promptText: string;
    promptHash: string;
  }> = {},
): RunManifest["promptCorpus"][string] => ({
  name: overrides.name ?? "p1",
  category: overrides.category ?? "math",
  tier: overrides.tier ?? 1,
  system: { key: "direct", text: "Be concise." },
  promptText: overrides.promptText ?? "What is 47*89?",
  scorer: { type: "exact_match", expected: "4183", extract: "(\\d+)" },
  promptHash: overrides.promptHash ?? "hashP",
});

export const fixtureScenario = (
  overrides: Partial<{ name: string; scorer: string; tier: number; tags: string[] }> = {},
): RunManifest["scenarioCorpus"][string] => ({
  name: overrides.name ?? "s1",
  fixture: "fixture.json",
  players: [{ id: "adventurer", controlledBy: "llm" as const }],
  scorer: overrides.scorer ?? "bootstrap_grind",
  scorerParams: {},
  cutoffs: { wallClockSec: 600, totalTokens: 100000, toolCalls: 50 },
  tier: overrides.tier ?? 2,
  scenarioMd: "# directive",
  scenarioHash: "hashS",
  tags: overrides.tags,
});

export const fixtureManifest = (
  overrides: Partial<{
    runId: string;
    model: string;
    artifact: string;
    runtime: "mlx" | "llamacpp";
    quant: string;
    prompts: ReadonlyArray<RunManifest["promptCorpus"][string]>;
    scenarios: ReadonlyArray<RunManifest["scenarioCorpus"][string]>;
  }> = {},
): RunManifest => {
  const prompts = overrides.prompts ?? [fixturePrompt()];
  const scenarios = overrides.scenarios ?? [fixtureScenario()];
  const promptCorpus: Record<string, RunManifest["promptCorpus"][string]> = {};
  for (const p of prompts) promptCorpus[p.name] = p;
  const scenarioCorpus: Record<string, RunManifest["scenarioCorpus"][string]> = {};
  for (const s of scenarios) scenarioCorpus[s.name] = s;

  return {
    schemaVersion: 1,
    runId: overrides.runId ?? "runX",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    interrupted: false,
    artifact: overrides.artifact ?? "test/artifact",
    model: overrides.model ?? "Test Model",
    runtime: overrides.runtime ?? "mlx",
    quant: overrides.quant ?? "4bit",
    env: {
      hostname: "test",
      platform: "linux-arm64",
      runtimeVersion: "0.0",
      nodeVersion: "v22.0.0",
      benchmarkGitSha: "deadbeef",
    },
    temperatures: [0.3],
    promptCorpus,
    scenarioCorpus,
    stats: {
      totalPrompts: prompts.length,
      totalExecutions: prompts.length,
      completed: prompts.length,
      skippedCached: 0,
      errors: 0,
      totalWallTimeSec: 1,
    },
  };
};

export const fixtureResult = (overrides: Partial<ExecutionResult> = {}): ExecutionResult => ({
  runId: overrides.runId ?? "runX",
  executedAt: overrides.executedAt ?? "2026-01-01T00:00:30.000Z",
  promptName: overrides.promptName ?? "p1",
  temperature: overrides.temperature ?? 0.3,
  model: overrides.model ?? "Test Model",
  runtime: overrides.runtime ?? "mlx",
  quant: overrides.quant ?? "4bit",
  promptTokens: overrides.promptTokens ?? 10,
  generationTokens: overrides.generationTokens ?? 5,
  promptTps: overrides.promptTps ?? 100,
  generationTps: overrides.generationTps ?? 50,
  peakMemoryGb: overrides.peakMemoryGb ?? 3.14,
  wallTimeSec: overrides.wallTimeSec ?? 1,
  output: overrides.output ?? "the answer is 4183",
  error: overrides.error ?? null,
  promptHash: overrides.promptHash ?? "hashP",
  scenarioHash: overrides.scenarioHash ?? null,
  scenarioName: overrides.scenarioName ?? null,
  terminationReason: overrides.terminationReason ?? null,
  toolCallCount: overrides.toolCallCount ?? null,
  finalPlayerStats: overrides.finalPlayerStats ?? null,
  events: overrides.events ?? null,
});
