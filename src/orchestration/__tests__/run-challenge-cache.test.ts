import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scorerHash } from "../../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { executeOrCacheItem, runChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

const SCORE_1 = "4";

const config: ResolvedConfiguration = {
  id: "smoke-config",
  artifact: "fake-artifact",
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

const makeChallenge = (): ResolvedChallenge => {
  const prompt = samplePromptExact();
  const item: ResolvedItem = {
    itemId: prompt.name,
    promptHash: prompt.promptHash,
    itemHash: "ih-fixed",
    scorer: prompt.scorer,
    prompt,
  };
  return {
    id: "cache-ch",
    version: 1,
    passThreshold: 0.5,
    challengeHash: "cache-hash",
    items: [item],
  };
};

describe("runChallenge cache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const okStub = () =>
    makeChatCompletionMock(
      {},
      {
        kind: "ok",
        result: {
          output: SCORE_1,
          reasoning: null,
          promptTokens: 5,
          generationTokens: 5,
          promptTps: 0,
          generationTps: 0,
          finishReason: null,
        },
      },
    );

  it("run 1 populates; run 2 with cache ON makes zero model calls and yields an identical aggregate", async () => {
    const challenge = makeChallenge();

    const m1 = okStub();
    const r1 = await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-1",
        archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m1.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m1.log.calls.length).toBe(1); // executed

    const m2 = okStub();
    const r2 = await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-2",
        archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m2.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m2.log.calls.length).toBe(0); // cache hit, no model call
    expect(r2.aggregate).toEqual(r1.aggregate);
  });

  it("--no-cache re-executes even with a populated archive", async () => {
    const challenge = makeChallenge();
    const m1 = okStub();
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-1",
        archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m1.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    const m2 = okStub();
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-2",
        archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`,
        env,
        deps: fakeDeps(),
        noCache: true,
      }).pipe(
        Effect.provide(m2.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m2.log.calls.length).toBe(1); // re-executed despite cache
  });

  it("scorer staleness: an edited scorer changes itemHash → cache MISS", async () => {
    const base = makeChallenge();
    const m1 = okStub();
    await Effect.runPromise(
      runChallenge({
        config,
        challenge: base,
        attemptId: "att-1",
        archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m1.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    // Same prompt, different itemHash (simulating an edited scorer's new hash).
    const first = base.items[0] as ResolvedItem;
    const edited: ResolvedChallenge = {
      ...base,
      items: [{ ...first, itemHash: "ih-edited" }],
    };
    const m2 = okStub();
    await Effect.runPromise(
      runChallenge({
        config,
        challenge: edited,
        attemptId: "att-2",
        archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m2.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m2.log.calls.length).toBe(1); // MISS → re-executed
  });

  it("cache hit returns a row with scorerHash", async () => {
    const challenge = makeChallenge();

    const m1 = okStub();
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-1",
        archiveDir: dir,
        archivePath: `${dir}/att-1.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m1.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    const m2 = okStub();
    const r2 = await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-2",
        archiveDir: dir,
        archivePath: `${dir}/att-2.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m2.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m2.log.calls.length).toBe(0); // cache hit
    const item = challenge.items[0] as ResolvedItem;
    // Read the item row from the second archive
    const text = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(`${dir}/att-2.jsonl`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    const lines = text
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    const row = JSON.parse(lines[1] ?? "{}") as Record<string, unknown>;
    expect(row["scorerHash"]).toBe(scorerHash(item.scorer));
    void r2;
  });

  it("stamps scorerHash on a hit from a v1 cached row (no scorerHash in archive)", async () => {
    const challenge = makeChallenge();
    const item = challenge.items[0] as ResolvedItem;

    const CACHED_WALL = 3.14;

    // Write a v1 completed archive (no scorerHash on item row)
    const v1Header = JSON.stringify({
      schemaVersion: 1,
      attemptId: "att-v1",
      startedAt: "2026-01-01T00:00:00Z",
      finishedAt: "2026-01-01T00:01:00Z",
      interrupted: false,
      configId: config.id,
      configHash: config.configHash,
      artifact: config.artifact,
      runtime: config.runtime,
      temperature: config.temperature,
      systemPrompt: config.systemPrompt,
      maxTokens: config.maxTokens,
      challengeId: challenge.id,
      challengeVersion: challenge.version,
      challengeHash: challenge.challengeHash,
      env,
      aggregate: { score: 1, passed: true },
    });
    const v1Item = JSON.stringify({
      itemId: item.itemId,
      promptName: item.itemId,
      promptHash: item.promptHash,
      itemHash: item.itemHash,
      executedAt: "2026-01-01T00:00:30Z",
      promptTokens: 5,
      generationTokens: 5,
      promptTps: 0,
      generationTps: 0,
      peakMemoryGb: 0,
      wallTimeSec: CACHED_WALL,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(`${dir}/att-v1.jsonl`, `${v1Header}\n${v1Item}\n`);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const input = {
      config,
      challenge,
      attemptId: "att-stamp",
      archiveDir: dir,
      archivePath: `${dir}/att-stamp.jsonl`,
      env,
      deps: fakeDeps(),
    };

    const m = okStub();
    const row = await Effect.runPromise(
      executeOrCacheItem(input, item).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    expect(m.log.calls.length).toBe(0); // cache hit, no model call
    expect(row.scorerHash).toBe(scorerHash(item.scorer));
    // All measured-cost and output fields preserved verbatim from v1 cached row
    expect(row).toMatchObject({
      executedAt: "2026-01-01T00:00:30Z",
      promptTokens: 5,
      generationTokens: 5,
      promptTps: 0,
      generationTps: 0,
      peakMemoryGb: 0,
      wallTimeSec: CACHED_WALL,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    });
  });
});
