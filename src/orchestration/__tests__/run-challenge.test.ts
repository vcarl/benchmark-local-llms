import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBlob, scorerHash } from "../../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import { resolveChallenge } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { loadAttemptArchive } from "../../report/load-attempts.js";
import { aggregate, baseHeader, runChallenge } from "../run-challenge.js";
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
    expect(
      aggregate(
        [
          { itemId: "a", score: 1 },
          { itemId: "b", score: 1 },
          { itemId: "c", score: 0 },
        ],
        0.6,
      ),
    ).toEqual({
      score: 2 / 3,
      passed: true,
    });
  });
  it("fails below threshold and handles empty", () => {
    expect(aggregate([{ itemId: "a", score: 0.9 }], 0.8)).toEqual({ score: 0, passed: false }); // partial credit is not a pass
    expect(aggregate([], 0.5)).toEqual({ score: 0, passed: false });
  });
  it("averages an item's samples before averaging over items", () => {
    const lines = [
      { itemId: "a", score: 1 },
      { itemId: "a", score: 0, sample: 1 },
      { itemId: "a", score: 1, sample: 2 },
      { itemId: "a", score: 1, sample: 3 },
      { itemId: "b", score: 1 },
    ];
    expect(aggregate(lines, 0.8)).toEqual({ score: (0.75 + 1) / 2, passed: true });
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
      family: prompt.name,
      scope: "core",
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
          finishReason: null,
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

describe("runChallenge multi-turn items", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const config: ResolvedConfiguration = {
    id: "mt-config",
    artifact: "fake-artifact",
    runtime: "mlx",
    temperature: 0,
    systemPrompt: "direct",
    maxTokens: 128,
    systemPromptText: "Be concise.",
    configHash: "cfg-mt",
  };
  const env = {
    hostname: "test",
    platform: "test",
    runtimeVersion: "test",
    nodeVersion: "test",
    benchmarkGitSha: "test",
  };
  const turn = (prompt: string, answer: string) => ({
    prompt,
    answer,
    scorer: "exact_match" as const,
    expected: answer,
    extract: "(\\d+)",
  });

  it("sends gold history, archives one line per turn with parent + turn, stores the conversation", async () => {
    const challenge = await Effect.runPromise(
      resolveChallenge(
        {
          id: "mt",
          version: 1,
          passThreshold: 0.5,
          items: [
            { name: "ch", category: "x", tier: 1, turns: [turn("p1", "1"), turn("p2", "2")] },
          ],
        } as never,
        dir,
      ).pipe(Effect.provide(NodeContext.layer)),
    );
    // The model gets turn 1 wrong ("4"); turn 2 must still see the gold "1".
    const m = makeChatCompletionMock(
      {},
      {
        kind: "ok",
        result: {
          output: "4",
          reasoning: null,
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 0,
          generationTps: 0,
          finishReason: null,
        },
      },
    );
    const archivePath = `${dir}/att-mt.jsonl`;
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-mt",
        archiveDir: dir,
        archivePath,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    expect(m.log.calls.map((c) => c.history)).toEqual([
      undefined,
      [
        { role: "user", content: "p1" },
        { role: "assistant", content: "1" },
      ],
    ]);
    expect(m.log.calls.map((c) => c.userPrompt)).toEqual(["p1", "p2"]);

    const { items: rows } = await Effect.runPromise(
      loadAttemptArchive(archivePath).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(rows.map((r) => [r.itemId, r.parentItemId, r.turn])).toEqual([
      ["ch#1", "ch", 1],
      ["ch#2", "ch", 2],
    ]);

    const t2 = challenge.items[1] as ResolvedItem;
    const blob = await Effect.runPromise(
      Effect.provide(readBlob(dir, "prompts", t2.promptHash), NodeContext.layer),
    );
    expect(JSON.parse(blob)).toEqual([
      { role: "user", content: "p1" },
      { role: "assistant", content: "1" },
      { role: "user", content: "p2" },
    ]);

    // A second attempt serves every turn from the cache, parent + turn intact.
    const again = makeChatCompletionMock({});
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-mt2",
        archiveDir: dir,
        archivePath: `${dir}/att-mt2.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(again.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(again.log.calls).toHaveLength(0);
    const { items: cached } = await Effect.runPromise(
      loadAttemptArchive(`${dir}/att-mt2.jsonl`).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(cached.map((r) => [r.itemId, r.parentItemId, r.turn])).toEqual([
      ["ch#1", "ch", 1],
      ["ch#2", "ch", 2],
    ]);
  });
});

describe("baseHeader provenance", () => {
  const challenge: ResolvedChallenge = {
    id: "c",
    version: 1,
    passThreshold: 1,
    challengeHash: "chh",
    items: [],
  };
  const header = (config: ResolvedConfiguration) =>
    baseHeader(
      {
        config,
        challenge,
        attemptId: "att",
        archiveDir: "/x",
        archivePath: "/x/att.jsonl",
        env: {
          hostname: "h",
          platform: "p",
          runtimeVersion: "r",
          nodeVersion: "n",
          benchmarkGitSha: "g",
        },
        deps: fakeDeps(),
      },
      "2026-01-01T00:00:00Z",
    );
  const minimal: ResolvedConfiguration = {
    id: "m",
    artifact: "a",
    runtime: "mlx",
    temperature: 0.7,
    systemPrompt: "direct",
    maxTokens: 100,
    systemPromptText: "",
    configHash: "cfg",
  };

  it("records every sampler and server knob the configuration sets", () => {
    const h = header({
      ...minimal,
      runtime: "llamacpp",
      topP: 0.95,
      topK: 20,
      minP: 0,
      presencePenalty: 1.5,
      repetitionPenalty: 1.1,
      repetitionContextSize: 64,
      chatTemplateKwargs: { enable_thinking: true },
      ctxSize: 32768,
      chatTemplate: "tpl",
      chatTemplateSha: "abc123abc123",
    });
    expect(h).toMatchObject({
      configHash: "cfg",
      topP: 0.95,
      topK: 20,
      minP: 0,
      presencePenalty: 1.5,
      repetitionPenalty: 1.1,
      repetitionContextSize: 64,
      chatTemplateKwargs: { enable_thinking: true },
      ctxSize: 32768,
      chatTemplate: "tpl",
      chatTemplateSha: "abc123abc123",
    });
    expect(h.serverFlags).toContain("--reasoning-format");
  });

  it("records extraArgs where the runtime passes them to its server", () => {
    expect(header({ ...minimal, extraArgs: ["--trust-remote-code"] }).extraArgs).toEqual([
      "--trust-remote-code",
    ]);
  });

  it("omits every unset knob, and serverFlags off llamacpp", () => {
    const h = header(minimal);
    for (const k of ["topP", "minP", "ctxSize", "chatTemplate", "serverFlags"]) {
      expect(k in h).toBe(false);
    }
  });
});
