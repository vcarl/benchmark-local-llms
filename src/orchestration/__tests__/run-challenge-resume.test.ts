import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBlob, scorerHash } from "../../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { AttemptManifest, ItemResult } from "../../schema/attempt.js";
import { ResumeMismatchError, resumeChallenge, runChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  fakeServerHandle,
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

  it("resume populates the content store for all items", async () => {
    const path = `${dir}/att-resume.jsonl`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(path, `${partialHeader()}\n${doneItem1}\n`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const m = okStub();
    await Effect.runPromise(
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

    for (const item of challenge.items) {
      const p = await Effect.runPromise(
        Effect.provide(readBlob(dir, "prompts", item.promptHash), NodeContext.layer),
      );
      expect(p).toBe(item.prompt.promptText);
      const s = await Effect.runPromise(
        Effect.provide(readBlob(dir, "scorers", scorerHash(item.scorer)), NodeContext.layer),
      );
      expect(s.length).toBeGreaterThan(0);
    }
    const sys = await Effect.runPromise(
      Effect.provide(readBlob(dir, "system", config.configHash), NodeContext.layer),
    );
    expect(sys).toBe(config.systemPromptText);
  });
});

// ── peakMemoryGb threading ─────────────────────────────────────────────────
//
// Conversion factor (from run-prompt.ts): peakRssKbToGb = kb / (1024 * 1024).
// 2_097_152 KB / (1024 * 1024) = 2.0 GB.
//
// RED: the bug discards the ServerHandle so peakRssKb never reaches runPrompt
// and every ItemResult records peakMemoryGb: 0.
// GREEN: runChallenge captures the handle and threads peakRssKb through.

describe("runChallenge — peakMemoryGb threading", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const peakChallengeConfig: ResolvedConfiguration = {
    id: "peak-cfg",
    artifact: "fake-artifact",
    runtime: "mlx",
    temperature: 0,
    systemPrompt: "direct",
    maxTokens: 128,
    systemPromptText: "Be concise.",
    configHash: "peak-cfg-hash",
  };

  const peakEnv = {
    hostname: "test",
    platform: "test",
    runtimeVersion: "test",
    nodeVersion: "test",
    benchmarkGitSha: "test",
  };

  it("records peakMemoryGb from the llmServer handle — not zero", async () => {
    const PEAK_RSS_KB = 2_097_152; // 2 GiB in KB
    const EXPECTED_PEAK_GB = 2.0; // 2_097_152 / (1024 * 1024)

    const prompt = samplePromptExact({ name: "pk1", promptHash: "ph-pk1" });
    const item: ResolvedItem = {
      itemId: "pk1",
      promptHash: prompt.promptHash,
      itemHash: "ih-pk1",
      scorer: prompt.scorer,
      prompt,
    };
    const peakChallenge: ResolvedChallenge = {
      id: "peak-ch",
      version: 1,
      passThreshold: 0.5,
      challengeHash: "peak-ch-hash",
      items: [item],
    };

    // Inject a server handle that reports a known non-zero peak RSS.
    const depsWithPeakRss = fakeDeps({
      llmServer: (_m) =>
        fakeServerHandle(18081).pipe(
          Effect.map((h) => ({ ...h, peakRssKb: Effect.succeed(PEAK_RSS_KB) })),
        ),
    });

    const m = makeChatCompletionMock(
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

    const archivePath = `${dir}/att-peak.jsonl`;
    await Effect.runPromise(
      runChallenge({
        config: peakChallengeConfig,
        challenge: peakChallenge,
        attemptId: "att-peak",
        archiveDir: dir,
        archivePath,
        env: peakEnv,
        deps: depsWithPeakRss,
      }).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    const lines = await readArchiveLines(archivePath);
    // lines[0] = header, lines[1] = item result
    const itemResult = Schema.decodeUnknownSync(ItemResult)(JSON.parse(lines[1] as string));
    expect(itemResult.peakMemoryGb).toBe(EXPECTED_PEAK_GB);
  });
});
