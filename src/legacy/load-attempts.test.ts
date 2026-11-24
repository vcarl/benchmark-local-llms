import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loadAttemptArchive, loadAttemptArchives } from "./load-attempts.js";

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
  itemHash: "ih",
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
    expect(res.attempts[0]?.sourcePath).toContain("att-1.jsonl");
    expect(res.attempts[0]?.manifest.attemptId).toBe("att-1");
    expect(res.attempts[0]?.items).toHaveLength(1);
    expect(res.attempts[0]?.items[0]?.generationTokens).toBe(100);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]?.path).toContain("broken.jsonl");
  });
});

const runSingle = <A>(
  eff: Effect.Effect<A, unknown, FileSystem.FileSystem | import("@effect/platform").Path.Path>,
  file: string,
  contents: string,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(file, contents);
      return yield* eff;
    }).pipe(Effect.provide(NodeContext.layer)),
  );

describe("loadAttemptArchive", () => {
  it("parses a single attempt file into { manifest, items }", async () => {
    const file = `/tmp/p3-single-ok-${process.pid}.jsonl`;
    const loaded = await runSingle(loadAttemptArchive(file), file, `${HEADER}\n${ITEM}\n`);
    expect(loaded.sourcePath).toBe(file);
    expect(loaded.manifest.attemptId).toBe("att-1");
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.itemId).toBe("i1");
  });

  it("fails with an AttemptLoadIssue on a non-attempt / legacy file", async () => {
    const file = `/tmp/p3-single-bad-${process.pid}.jsonl`;
    const result = await runSingle(
      Effect.either(loadAttemptArchive(file)),
      file,
      `{ not valid manifest }\n`,
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect((result.left as { path: string }).path).toBe(file);
      expect((result.left as { reason: string }).reason).toBeTypeOf("string");
    }
  });
});
