import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loadAttemptArchives } from "./load-attempts.js";

const HEADER = JSON.stringify({
  schemaVersion: 1,
  attemptId: "att-1",
  startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:01:00Z",
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
  promptName: "p1",
  promptHash: "h",
  executedAt: "2026-01-01T00:00:30Z",
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
});

const run = <A>(
  eff: Effect.Effect<A, unknown, FileSystem.FileSystem | import("@effect/platform").Path.Path>,
  dir: string,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(`${dir}/att-1.jsonl`, `${HEADER}\n${ITEM}\n`);
      yield* fs.writeFileString(`${dir}/broken.jsonl`, `{ not valid manifest }\n`);
      return yield* eff;
    }).pipe(Effect.provide(NodeContext.layer)),
  );

describe("loadAttemptArchives", () => {
  it("decodes a manifest header + item lines, and reports malformed files as issues", async () => {
    const dir = `/tmp/p3-load-${process.pid}`;
    const res = await run(loadAttemptArchives(dir), dir);
    expect(res.attempts).toHaveLength(1);
    expect(res.attempts[0]?.manifest.attemptId).toBe("att-1");
    expect(res.attempts[0]?.items).toHaveLength(1);
    expect(res.attempts[0]?.items[0]?.generationTokens).toBe(100);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]?.path).toContain("broken.jsonl");
  });
});
