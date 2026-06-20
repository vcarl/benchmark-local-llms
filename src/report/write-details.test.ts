import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scorerHash, writeBlob } from "../archive/content-store.js";
import { writeDetails } from "./write-details.js";

const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };

const v2Header = {
  schemaVersion: 2,
  attemptId: "att-x",
  startedAt: "t",
  finishedAt: "t",
  interrupted: false,
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
  passThreshold: 0.8,
  env: {
    hostname: "h",
    platform: "p",
    runtimeVersion: "r",
    nodeVersion: "n",
    benchmarkGitSha: "g",
  },
  aggregate: { score: 1, passed: true },
};

const v1Header = { ...v2Header, schemaVersion: 1, attemptId: "att-v1" };

describe("writeDetails", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "details-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes one detail file per v2 attempt with the joined per-item shape", async () => {
    const sh = scorerHash(SCORER as never);
    const item = {
      itemId: "i",
      promptName: "i",
      promptHash: "ph",
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    };
    const file = join(dir, "att-x.jsonl");
    const out = join(dir, "out");
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
          yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
          yield* writeBlob(dir, "system", "cfg", "Be concise.");
          yield* Effect.promise(() =>
            writeFile(file, `${JSON.stringify(v2Header)}\n${JSON.stringify(item)}\n`),
          );
          return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }]);
        }),
        NodeContext.layer,
      ),
    );
    expect(result).toEqual({ written: 1, skipped: 0 });
    const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
    expect(detail.attempt_id).toBe("att-x");
    expect(detail.config_hash).toBe("cfg");
    expect(detail.challenge_id).toBe("ch");
    expect(detail.system_prompt_text).toBe("Be concise.");
    expect(detail.items[0].prompt_text).toBe("What is 2+2?");
    expect(detail.items[0].output).toBe("4");
    expect(detail.items[0].score).toBe(1);
    expect(detail.items[0].scorer.type).toBe("exact_match");
  });

  it("skips a v1 attempt gracefully (no file, counted as skipped)", async () => {
    const file = join(dir, "att-v1.jsonl");
    const out = join(dir, "out");
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* Effect.promise(() => writeFile(file, `${JSON.stringify(v1Header)}\n`));
          return yield* writeDetails(out, [{ attemptId: "att-v1", sourcePath: file }]);
        }),
        NodeContext.layer,
      ),
    );
    expect(result).toEqual({ written: 0, skipped: 1 });
  });
});
