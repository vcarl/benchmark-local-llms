import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBlob, scorerHash } from "../../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { aggregate, runChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

describe("aggregate", () => {
  it("passes when perfect-score fraction meets threshold", () => {
    expect(aggregate([{ score: 1 }, { score: 1 }, { score: 0 }], 0.6)).toEqual({
      score: 2 / 3,
      passed: true,
    });
  });
  it("fails below threshold and handles empty", () => {
    expect(aggregate([{ score: 0.9 }], 0.8)).toEqual({ score: 0, passed: false }); // partial credit is not a pass
    expect(aggregate([], 0.5)).toEqual({ score: 0, passed: false });
  });
});

describe("runChallenge v2 + content store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

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
      id: "store-ch",
      version: 1,
      passThreshold: 0.5,
      challengeHash: "store-hash",
      items: [item],
    };
  };

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

  it("writes a v2 archive and populates the content store", async () => {
    const challenge = makeChallenge();
    const m = okStub();
    const manifest = await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-store",
        archiveDir: dir,
        archivePath: `${dir}/att-store.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.passThreshold).toBe(challenge.passThreshold);

    const item = challenge.items[0] as ResolvedItem;
    const prompt = await Effect.runPromise(
      Effect.provide(readBlob(dir, "prompts", item.promptHash), NodeContext.layer),
    );
    expect(prompt).toBe(item.prompt.promptText);

    const scorer = await Effect.runPromise(
      Effect.provide(readBlob(dir, "scorers", scorerHash(item.scorer)), NodeContext.layer),
    );
    expect(scorer.length).toBeGreaterThan(0);

    const system = await Effect.runPromise(
      Effect.provide(readBlob(dir, "system", config.configHash), NodeContext.layer),
    );
    expect(system).toBe(config.systemPromptText);
  });
});
