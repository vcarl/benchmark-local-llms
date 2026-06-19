import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runReport } from "./index.js";

const HEADER = JSON.stringify({
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
});
const ITEM = JSON.stringify({
  itemId: "i1",
  promptName: "p",
  promptHash: "h",
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
});

describe("runReport", () => {
  it("loads attempts, writes data.js, returns a summary", async () => {
    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = `/tmp/p3-report-${process.pid}`;
        const out = `${dir}/out/data.js`;
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(`${dir}/att-1.jsonl`, `${HEADER}\n${ITEM}\n`);
        const s = yield* runReport({ archiveDir: dir, outputPath: out });
        const written = yield* fs.readFileString(out);
        expect(written).toContain("__BENCHMARK_DATA");
        expect(written).toContain('"config_hash":"ch"');
        return s;
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.recordCount).toBe(1);
    expect(summary.attemptsLoaded).toBe(1);
    expect(summary.loadIssues).toHaveLength(0);
  });
});
