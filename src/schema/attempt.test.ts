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
  it("decodes an ItemResult with required itemHash", () => {
    const v = {
      itemId: "json-output",
      promptName: "json-output",
      promptHash: "abc123abc123",
      itemHash: "ddeeff001122",
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
    const decoded = Schema.decodeUnknownSync(ItemResult)(v);
    expect(decoded.score).toBe(1);
    expect(decoded.itemHash).toBe("ddeeff001122");
  });

  it("rejects an ItemResult missing itemHash", () => {
    const { itemHash: _omit, ...without } = {
      itemId: "x",
      promptName: "x",
      promptHash: "p",
      itemHash: "h",
      executedAt: "t",
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
      score: 0,
    };
    expect(() => Schema.decodeUnknownSync(ItemResult)(without)).toThrow();
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
