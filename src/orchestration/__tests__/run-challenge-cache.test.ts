import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { runChallenge } from "../run-challenge.js";
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
});
