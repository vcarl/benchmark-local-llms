import { describe, expect, it } from "vitest";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { toWebappRecord } from "./webapp-contract.js";

const item = (over: Partial<ItemResult>): ItemResult => ({
  itemId: "i1",
  promptName: "p1",
  promptHash: "h",
  executedAt: "2026-01-01T00:00:00Z",
  promptTokens: 10,
  generationTokens: 100,
  promptTps: 1,
  generationTps: 1,
  peakMemoryGb: 0,
  wallTimeSec: 2,
  output: "o",
  reasoning: null,
  rawOutput: "o",
  error: null,
  score: 1,
  ...over,
});

const manifest = (over: Partial<AttemptManifest>): AttemptManifest => ({
  schemaVersion: 1,
  attemptId: "att-1",
  startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:01:00Z",
  interrupted: false,
  configId: "cfg",
  configHash: "ch",
  artifact: "qwen",
  runtime: "llama-server",
  quant: "q4",
  temperature: 0,
  systemPrompt: "concise",
  maxTokens: 512,
  challengeId: "code",
  challengeVersion: 1,
  challengeHash: "xh",
  env: {
    hostname: "h",
    platform: "p",
    runtimeVersion: "1",
    nodeVersion: "1",
    benchmarkGitSha: "s",
  },
  aggregate: { score: 0.5, passed: false },
  ...over,
});

describe("toWebappRecord", () => {
  it("maps a completed attempt + items to a per-attempt record with summed efficiency inputs", () => {
    const rec = toWebappRecord(manifest({}), [
      item({ generationTokens: 100, wallTimeSec: 2, score: 1 }),
      item({ itemId: "i2", generationTokens: 200, wallTimeSec: 4, score: 0 }),
    ]);
    expect(rec).toMatchObject({
      config_hash: "ch",
      artifact: "qwen",
      runtime: "llama-server",
      quant: "q4",
      temperature: 0,
      system_prompt: "concise",
      max_tokens: 512,
      challenge_id: "code",
      challenge_version: 1,
      attempt_id: "att-1",
      finished_at: "2026-01-01T00:01:00Z",
      score: 0.5,
      passed: false,
      generation_tokens: 300,
      wall_time_sec: 6,
      item_count: 2,
      passed_items: 1,
    });
  });

  it("maps an absent quant to null", () => {
    const rec = toWebappRecord(manifest({ quant: undefined }), [item({})]);
    expect(rec.quant).toBeNull();
  });
});
