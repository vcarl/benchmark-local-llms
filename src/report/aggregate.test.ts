import { describe, expect, it } from "vitest";
import { aggregateAttempts } from "./aggregate.js";
import type { LoadedAttempt } from "./load-attempts.js";

const att = (over: Partial<LoadedAttempt["manifest"]>, gen = 100, wall = 2): LoadedAttempt => ({
  manifest: {
    schemaVersion: 1,
    attemptId: "att-1",
    startedAt: "t",
    finishedAt: "t2",
    interrupted: false,
    configId: "cfg",
    configHash: "ch",
    artifact: "qwen",
    runtime: "llamacpp",
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
    aggregate: { score: 1, passed: true },
    ...over,
  },
  items: [
    {
      itemId: "i1",
      promptName: "p",
      promptHash: "h",
      executedAt: "t",
      promptTokens: 1,
      generationTokens: gen,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: wall,
      output: "o",
      reasoning: null,
      rawOutput: "o",
      error: null,
      score: 1,
    },
  ],
});

describe("aggregateAttempts", () => {
  it("keeps completed attempts and emits one record each", () => {
    const out = aggregateAttempts([att({ attemptId: "a" }), att({ attemptId: "b" })]);
    expect(out.records).toHaveLength(2);
    expect(out.records[0]?.generation_tokens).toBe(100);
  });

  it("drops interrupted and unfinalized attempts", () => {
    const out = aggregateAttempts([
      att({ attemptId: "a" }),
      att({ attemptId: "b", interrupted: true }),
      att({ attemptId: "c", finishedAt: null }),
    ]);
    expect(out.records).toHaveLength(1);
    expect(out.dropped.incomplete).toBe(2);
  });

  it("dedups by attemptId, counting extras as dropped", () => {
    const out = aggregateAttempts([att({ attemptId: "dup" }), att({ attemptId: "dup" })]);
    expect(out.records).toHaveLength(1);
    expect(out.dropped.duplicate).toBe(1);
  });
});
