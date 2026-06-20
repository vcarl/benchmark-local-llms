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
});

describe("runReport", () => {
  it("writes a detail file for a v2 attempt and reports detailsWritten", async () => {
    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const base = `/tmp/p4-report-${process.pid}`;
        const dir = `${base}/archive`;
        const out = `${base}/webapp/src/data/data.js`;
        yield* fs.makeDirectory(dir, { recursive: true });
        const sh = "deadbeef";
        const header = {
          schemaVersion: 2,
          attemptId: "att-v2",
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
          passThreshold: 0.8,
          env: {
            hostname: "h",
            platform: "p",
            runtimeVersion: "1",
            nodeVersion: "1",
            benchmarkGitSha: "s",
          },
          aggregate: { score: 1, passed: true },
        };
        const item = {
          itemId: "i1",
          promptName: "p",
          promptHash: "ph",
          itemHash: "ih",
          scorerHash: sh,
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
        };
        yield* fs.makeDirectory(`${dir}/content/prompts`, { recursive: true });
        yield* fs.makeDirectory(`${dir}/content/scorers`, { recursive: true });
        yield* fs.makeDirectory(`${dir}/content/system`, { recursive: true });
        yield* fs.writeFileString(`${dir}/content/prompts/ph.txt`, "PROMPT");
        yield* fs.writeFileString(
          `${dir}/content/scorers/${sh}.json`,
          JSON.stringify({ type: "exact_match", expected: "4", extract: "(\\d+)" }),
        );
        yield* fs.writeFileString(`${dir}/content/system/ch.txt`, "SYS");
        yield* fs.writeFileString(
          `${dir}/att-v2.jsonl`,
          `${JSON.stringify(header)}\n${JSON.stringify(item)}\n`,
        );
        const s = yield* runReport({ archiveDir: dir, outputPath: out });
        const detail = yield* fs.readFileString(`${base}/webapp/public/details/att-v2.json`);
        expect(detail).toContain('"attempt_id":"att-v2"');
        expect(detail).toContain('"prompt_text":"PROMPT"');
        return s;
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.detailsWritten).toBe(1);
    expect(summary.detailsSkipped).toBe(0);
  });

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
