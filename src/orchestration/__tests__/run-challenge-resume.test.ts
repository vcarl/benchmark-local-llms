import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { AttemptManifest } from "../../schema/attempt.js";
import { ResumeMismatchError, resumeChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  readArchiveLines,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

const config: ResolvedConfiguration = {
  id: "cfg",
  artifact: "fake",
  runtime: "mlx",
  temperature: 0,
  systemPrompt: "direct",
  maxTokens: 128,
  systemPromptText: "Be concise.",
  configHash: "cfg-hash",
};
const env = {
  hostname: "test",
  platform: "test",
  runtimeVersion: "test",
  nodeVersion: "test",
  benchmarkGitSha: "test",
};

const mkItem = (id: string, ih: string): ResolvedItem => {
  const prompt = samplePromptExact({ name: id, promptHash: `ph-${id}` });
  return { itemId: id, promptHash: prompt.promptHash, itemHash: ih, scorer: prompt.scorer, prompt };
};

const challenge: ResolvedChallenge = {
  id: "ch",
  version: 1,
  passThreshold: 0.5,
  challengeHash: "ch-hash",
  items: [mkItem("i1", "ih1"), mkItem("i2", "ih2")],
};

const partialHeader = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    attemptId: "att-resume",
    startedAt: "2026-01-01T00:00:00Z",
    finishedAt: null,
    interrupted: true,
    configId: "cfg",
    configHash: "cfg-hash",
    artifact: "fake",
    runtime: "mlx",
    quant: undefined,
    temperature: 0,
    systemPrompt: "direct",
    maxTokens: 128,
    challengeId: "ch",
    challengeVersion: 1,
    challengeHash: "ch-hash",
    env,
    aggregate: { score: 0, passed: false },
    ...over,
  });
const doneItem1 = JSON.stringify({
  itemId: "i1",
  promptName: "i1",
  promptHash: "ph-i1",
  itemHash: "ih1",
  executedAt: "2026-01-01T00:00:30Z",
  promptTokens: 5,
  generationTokens: 5,
  promptTps: 0,
  generationTps: 0,
  peakMemoryGb: 0,
  wallTimeSec: 1,
  output: "4",
  reasoning: null,
  rawOutput: "4",
  error: null,
  score: 1,
});

const okStub = () =>
  makeChatCompletionMock(
    {},
    {
      kind: "ok",
      result: {
        output: "4",
        reasoning: null,
        promptTokens: 5,
        generationTokens: 5,
        promptTps: 0,
        generationTps: 0,
      },
    },
  );

describe("resumeChallenge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("executes only the missing items and finalizes over the union", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(path, `${partialHeader()}\n${doneItem1}\n`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    const manifest = await Effect.runPromise(
      resumeChallenge({
        config,
        challenge,
        attemptId: "att-resume",
        archiveDir: dir,
        archivePath: path,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    expect(m.log.calls.length).toBe(1); // only i2 executed
    expect(manifest.interrupted).toBe(false);
    expect(manifest.aggregate.score).toBe(1); // both items score 1

    const lines = await readArchiveLines(path);
    expect(lines.length).toBe(3); // header + i1 + i2
    const decoded = Schema.decodeUnknownSync(AttemptManifest)(JSON.parse(lines[0] as string));
    expect(decoded.finishedAt).not.toBeNull();
  });

  it("fails loudly when the resolved challengeHash does not match the header", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          path,
          `${partialHeader({ challengeHash: "DIFFERENT" })}\n${doneItem1}\n`,
        );
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    const err = await Effect.runPromise(
      resumeChallenge({
        config,
        challenge,
        attemptId: "att-resume",
        archiveDir: dir,
        archivePath: path,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.flip,
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(err._tag).toBe("ResumeMismatchError");
    expect(err).toBeInstanceOf(ResumeMismatchError);
    expect(m.log.calls.length).toBe(0); // never executed; archive untouched
  });

  it("fails loudly when the resolved configHash does not match the header", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          path,
          `${partialHeader({ configHash: "DIFFERENT" })}\n${doneItem1}\n`,
        );
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    const err = await Effect.runPromise(
      resumeChallenge({
        config,
        challenge,
        attemptId: "att-resume",
        archiveDir: dir,
        archivePath: path,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.flip,
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(err._tag).toBe("ResumeMismatchError");
    expect(err).toBeInstanceOf(ResumeMismatchError);
    expect(m.log.calls.length).toBe(0); // never executed; archive untouched
  });
});
