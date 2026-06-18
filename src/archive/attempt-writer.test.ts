import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "./attempt-writer.js";

const env = {
  hostname: "h",
  platform: "p",
  runtimeVersion: "r",
  nodeVersion: "n",
  benchmarkGitSha: "g",
};
const header = {
  schemaVersion: 1 as const,
  attemptId: "att-1",
  startedAt: "2026-06-18T00:00:00.000Z",
  finishedAt: null,
  interrupted: true,
  configId: "c1",
  configHash: "cfg123cfg123",
  artifact: "a",
  runtime: "mlx" as const,
  temperature: 0.7,
  systemPrompt: "direct",
  maxTokens: 100,
  challengeId: "ch",
  challengeVersion: 1,
  challengeHash: "chh123chh123",
  env,
  aggregate: { score: 0, passed: false },
};
const item = {
  itemId: "i",
  promptName: "i",
  promptHash: "h",
  executedAt: "2026-06-18T00:00:01.000Z",
  promptTokens: 1,
  generationTokens: 2,
  promptTps: 1,
  generationTps: 2,
  peakMemoryGb: 0,
  wallTimeSec: 1,
  output: "ok",
  reasoning: null,
  rawOutput: "ok",
  error: null,
  score: 1,
};

describe("attempt-writer", () => {
  it("writes header, appends an item, finalizes aggregate", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const path = `${dir}/att-1.jsonl`;
        yield* writeAttemptHeader(path, header);
        yield* appendItem(path, item);
        yield* finalizeAttempt(path, "2026-06-18T00:00:02.000Z", { score: 1, passed: true });
        const text = yield* fs.readFileString(path);
        const lines = text.trim().split("\n");
        const line1 = lines[0] ?? "";
        const line2 = lines[1] ?? "";
        const manifest = Schema.decodeUnknownSync(AttemptManifest)(JSON.parse(line1));
        const row = Schema.decodeUnknownSync(ItemResult)(JSON.parse(line2));
        expect(manifest.interrupted).toBe(false);
        expect(manifest.aggregate.passed).toBe(true);
        expect(manifest.finishedAt).toBe("2026-06-18T00:00:02.000Z");
        expect(row.score).toBe(1);
      }),
    ).pipe(Effect.provide(NodeContext.layer), Effect.runPromise));
});
