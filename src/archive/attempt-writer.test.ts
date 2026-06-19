import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { loadAttemptArchive } from "../report/load-attempts.js";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";
import {
  appendItem,
  finalizeAttempt,
  rewriteAttempt,
  writeAttemptHeader,
} from "./attempt-writer.js";

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
  itemHash: "0a1b2c3d4e5f",
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

  it("rewriteAttempt re-encodes header + all items atomically; round-trips and preserves identity", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const path = `${dir}/att-rw.jsonl`;
        // Seed a finalized archive (header + one item) the normal way.
        yield* writeAttemptHeader(path, header);
        yield* appendItem(path, item);
        yield* finalizeAttempt(path, "2026-06-18T00:00:02.000Z", { score: 1, passed: true });

        const before = yield* loadAttemptArchive(path);
        // Rewrite: change only the per-item score + header aggregate.
        const newManifest = { ...before.manifest, aggregate: { score: 0, passed: false } };
        const newItems = before.items.map((i) => ({ ...i, score: 0 }));
        yield* rewriteAttempt(path, newManifest, newItems);

        const after = yield* loadAttemptArchive(path);
        // Only score + aggregate changed; every identity field preserved.
        expect(after.manifest.aggregate).toEqual({ score: 0, passed: false });
        expect(after.items[0]?.score).toBe(0);
        expect(after.manifest.attemptId).toBe(before.manifest.attemptId);
        expect(after.manifest.challengeHash).toBe(before.manifest.challengeHash);
        expect(after.manifest.startedAt).toBe(before.manifest.startedAt);
        expect(after.manifest.finishedAt).toBe(before.manifest.finishedAt);
        expect(after.items[0]?.itemId).toBe(before.items[0]?.itemId);
        expect(after.items[0]?.promptHash).toBe(before.items[0]?.promptHash);
        expect(after.items[0]?.output).toBe(before.items[0]?.output);
        // Atomic write leaves no temp file behind on the happy path.
        const entries = yield* fs.readDirectory(dir);
        expect(entries.filter((e) => e.endsWith(".tmp"))).toHaveLength(0);
      }),
    ).pipe(Effect.provide(NodeContext.layer), Effect.runPromise));
});
