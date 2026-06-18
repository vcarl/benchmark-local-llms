import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AttemptManifest, ItemResult } from "./attempt.js";

const env = {
  hostname: "h",
  platform: "p",
  runtimeVersion: "r",
  nodeVersion: "n",
  benchmarkGitSha: "g",
};

describe("attempt schemas", () => {
  it("decodes an ItemResult", () => {
    const v = {
      itemId: "json-output",
      promptName: "json-output",
      promptHash: "abc123abc123",
      executedAt: "2026-06-18T00:00:00.000Z",
      promptTokens: 10,
      generationTokens: 20,
      promptTps: 1,
      generationTps: 2,
      peakMemoryGb: 0,
      wallTimeSec: 1.5,
      output: "ok",
      reasoning: null,
      rawOutput: "ok",
      error: null,
      score: 1,
    };
    expect(Schema.decodeUnknownSync(ItemResult)(v).score).toBe(1);
  });

  it("decodes an AttemptManifest header", () => {
    const v = {
      schemaVersion: 1,
      attemptId: "att-1",
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: null,
      interrupted: true,
      configId: "c1",
      configHash: "cfg123cfg123",
      artifact: "a",
      runtime: "mlx",
      quant: "q4-k-m",
      temperature: 0.7,
      systemPrompt: "direct",
      maxTokens: 100,
      challengeId: "ch",
      challengeVersion: 1,
      challengeHash: "chh123chh123",
      env,
      aggregate: { score: 0, passed: false },
    };
    expect(Schema.decodeUnknownSync(AttemptManifest)(v).attemptId).toBe("att-1");
  });
});
