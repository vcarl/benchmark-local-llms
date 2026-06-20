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

describe("attempt schema v2 (additive)", () => {
  const baseManifest = {
    schemaVersion: 1,
    attemptId: "att-x",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    interrupted: true,
    configId: "c",
    configHash: "cfg",
    artifact: "a",
    runtime: "mlx",
    temperature: 0,
    systemPrompt: "default",
    maxTokens: 64,
    challengeId: "ch",
    challengeVersion: 1,
    challengeHash: "chh",
    env: {
      hostname: "h",
      platform: "p",
      runtimeVersion: "r",
      nodeVersion: "n",
      benchmarkGitSha: "g",
    },
    aggregate: { score: 0, passed: false },
  };

  it("decodes a v1 manifest with no passThreshold", () => {
    const m = Schema.decodeUnknownSync(AttemptManifest)(baseManifest);
    expect(m.schemaVersion).toBe(1);
    expect(m.passThreshold).toBeUndefined();
  });

  it("decodes a v2 manifest with schemaVersion 2 + passThreshold", () => {
    const m = Schema.decodeUnknownSync(AttemptManifest)({
      ...baseManifest,
      schemaVersion: 2,
      passThreshold: 0.8,
    });
    expect(m.schemaVersion).toBe(2);
    expect(m.passThreshold).toBe(0.8);
  });

  it("rejects schemaVersion 3", () => {
    expect(() =>
      Schema.decodeUnknownSync(AttemptManifest)({ ...baseManifest, schemaVersion: 3 }),
    ).toThrow();
  });

  const baseItem = {
    itemId: "i",
    promptName: "i",
    promptHash: "ph",
    itemHash: "ih",
    executedAt: "2026-01-01T00:00:00.000Z",
    promptTokens: 1,
    generationTokens: 1,
    promptTps: 1,
    generationTps: 1,
    peakMemoryGb: 0,
    wallTimeSec: 0,
    output: "o",
    reasoning: null,
    rawOutput: "o",
    error: null,
    score: 1,
  };

  it("decodes a v1 item with no scorerHash", () => {
    const r = Schema.decodeUnknownSync(ItemResult)(baseItem);
    expect(r.scorerHash).toBeUndefined();
  });

  it("decodes a v2 item carrying scorerHash", () => {
    const r = Schema.decodeUnknownSync(ItemResult)({ ...baseItem, scorerHash: "sh" });
    expect(r.scorerHash).toBe("sh");
  });
});
