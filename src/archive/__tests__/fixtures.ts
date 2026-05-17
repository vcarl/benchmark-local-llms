/**
 * Shared test fixtures for archive I/O tests. The values are chosen to round-
 * trip cleanly through Schema.encode/decode and to satisfy all Struct fields
 * in the RunManifest + ExecutionResult shapes without triggering unrelated
 * schema constraints.
 */
import type {
  ExecutionResult,
  PromptCorpusEntry,
  RunManifest,
  ScenarioCorpusEntry,
} from "../../schema/index.js";

export const samplePrompt: PromptCorpusEntry = {
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

export const sampleScenario: ScenarioCorpusEntry = {
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

/**
 * A manifest in the "open" state: finishedAt=null, stats zeroed. This is the
 * shape `writeManifestHeader` is expected to accept.
 */
export const openManifest = (overrides: Partial<RunManifest> = {}): RunManifest => ({
  schemaVersion: 1,
  archiveId: "2026-04-14_qwen3-32b_4bit_deadbe",
  runId: "r-2026-04-14-deadbe",
  startedAt: "2026-04-14T12:00:00.000Z",
  finishedAt: null,
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
  temperatures: [0.7],
  promptCorpus: { hello_prompt: samplePrompt },
  scenarioCorpus: { bootstrap_grind: sampleScenario },
  stats: {
    totalPrompts: 0,
    totalExecutions: 0,
    completed: 0,
    skippedCached: 0,
    errors: 0,
    totalWallTimeSec: 0,
  },
  ...overrides,
});

export const sampleResult = (overrides: Partial<ExecutionResult> = {}): ExecutionResult => ({
  archiveId: "2026-04-14_qwen3-32b_4bit_deadbe",
  runId: "r-2026-04-14-deadbe",
  executedAt: "2026-04-14T12:34:56.000Z",
  promptName: "hello_prompt",
  temperature: 0.7,
  model: "Qwen 3 32B",
  runtime: "mlx",
  quant: "4bit",
  promptTokens: 42,
  generationTokens: 128,
  promptTps: 100.5,
  generationTps: 42.3,
  peakMemoryGb: 18.7,
  wallTimeSec: 3.14,
  output: "hello world",
  error: null,
  promptHash: "abc123def456",
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
  ...overrides,
});
