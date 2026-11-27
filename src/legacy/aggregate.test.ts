import { describe, expect, it } from "vitest";
import { detailSources } from "./aggregate.js";
import type { LoadedAttempt } from "./load-attempts.js";

const att = (over: Partial<LoadedAttempt["manifest"]>): LoadedAttempt => ({
  sourcePath: "/x/att.jsonl",
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
      itemHash: "ih",
      executedAt: "t",
      promptTokens: 1,
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
    },
  ],
});

describe("detailSources", () => {
  it("keeps completed attempts, in order, with their source path", () => {
    const out = detailSources([
      { ...att({ attemptId: "a" }), sourcePath: "/x/a.jsonl" },
      { ...att({ attemptId: "b" }), sourcePath: "/x/b.jsonl" },
    ]);
    expect(out.detailSources).toEqual([
      { attemptId: "a", sourcePath: "/x/a.jsonl" },
      { attemptId: "b", sourcePath: "/x/b.jsonl" },
    ]);
  });

  it("drops interrupted and unfinalized attempts", () => {
    const out = detailSources([
      att({ attemptId: "a" }),
      att({ attemptId: "b", interrupted: true }),
      att({ attemptId: "c", finishedAt: null }),
    ]);
    expect(out.detailSources).toHaveLength(1);
    expect(out.dropped.incomplete).toBe(2);
  });

  it("dedups by attemptId, counting extras as dropped", () => {
    const out = detailSources([att({ attemptId: "dup" }), att({ attemptId: "dup" })]);
    expect(out.detailSources).toHaveLength(1);
    expect(out.dropped.duplicate).toBe(1);
  });
});
