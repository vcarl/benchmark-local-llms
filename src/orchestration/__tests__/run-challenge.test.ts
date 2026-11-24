import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, type Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedItem } from "../../config/challenges.js";
import { type ChatCompletion, chatMessages } from "../../llm/chat-completion.js";
import { scorerDigest } from "../../scoring/rules.js";
import { appendExecution, bundlePath, createOpenBundle, readBundle } from "../../store/bundle.js";
import { digestOf } from "../../store/digest.js";
import { readScores } from "../../store/scores.js";
import { loadPresent } from "../../store/store-index.js";
import {
  aggregate,
  bundleHeader,
  type RunChallengeInput,
  runChallengeWithServer,
} from "../run-challenge.js";
import {
  config,
  env,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeChatCompletionMock,
  makeTempDir,
  okStub,
  removeDir,
} from "./fixtures.js";

describe("aggregate", () => {
  it("averages an item's samples, then items; partial credit is not a pass", () => {
    const lines = [
      { itemId: "a", score: 1 },
      { itemId: "a", score: 0 },
      { itemId: "b", score: 0.9 },
    ];
    expect(aggregate(lines, 0.2)).toEqual({ score: 0.25, passed: true });
    expect(aggregate([], 0.5)).toEqual({ score: 0, passed: false });
  });
});

let store: string;
beforeEach(async () => {
  store = await makeTempDir();
});
afterEach(async () => {
  await removeDir(store);
});

const challenge = makeChallenge();
const item = challenge.items[0] as ResolvedItem;

const input = (over: Partial<RunChallengeInput> = {}): RunChallengeInput => ({
  config,
  challenge,
  store,
  release: "draft",
  runId: "run-a",
  contributor: "tester",
  env,
  weightsDigest: null,
  present: [],
  ...over,
});

const run = (i: RunChallengeInput, chat: Layer.Layer<ChatCompletion> = okStub().layer) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* runChallengeWithServer(i, yield* fakeServerHandle());
    }).pipe(
      Effect.provide(chat),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );
const node = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

const openFiles = async () => (await fsp.readdir(path.join(store, "open")).catch(() => [])).length;

describe("runChallengeWithServer", () => {
  it("seals a v4 bundle and appends its score records", async () => {
    const out = await run(input());
    expect(out).toMatchObject({ executed: 1, skipped: 0, aggregate: { score: 1, passed: true } });
    if (out.bundle === null) throw new Error("expected a bundle");

    const b = await node(readBundle(bundlePath(store, out.bundle)));
    expect(b.digest).toBe(out.bundle);
    expect(b.header).toMatchObject({
      schemaVersion: 4,
      configId: config.id,
      release: "draft",
      challenge: challenge.id,
      run: { id: "run-a", contributor: "tester" },
      env: { hardwareId: env.hardwareId, runtimeVersion: "test" },
      executions: 1,
    });
    expect(b.header.config).toMatchObject({
      artifact: config.artifact,
      weightsDigest: null,
      systemPrompt: "Be concise.",
      chatTemplateDigest: null,
      sampling: {},
    });
    const [e] = b.executions;
    expect(e).toMatchObject({ item: `${challenge.id}/p1`, sample: 0, output: "4", error: null });
    expect(e?.messagesDigest).toBe(
      digestOf(chatMessages({ systemPrompt: "Be concise.", userPrompt: "2+2?" })),
    );

    const scores = await node(readScores(store, out.bundle));
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      execution: digestOf(e),
      scorer: scorerDigest(item.scorer),
      score: 1,
      failureKind: null,
      harnessGitSha: env.harnessGitSha,
    });
    expect(await openFiles()).toBe(0);
  });

  it("skips what the store holds: nothing executes, no bundle, summary still scored", async () => {
    await run(input());
    const m = okStub();
    const out = await run(
      input({ runId: "run-b", present: await node(loadPresent(store)) }),
      m.layer,
    );
    expect(m.log.calls).toHaveLength(0);
    expect(out).toMatchObject({ bundle: null, executed: 0, skipped: 1, aggregate: { score: 1 } });
    expect(await openFiles()).toBe(0);
  });

  it("reruns the whole cell into one bundle when more samples are requested", async () => {
    await run(input());
    const m = okStub();
    const out = await run(
      input({ runId: "run-b", present: await node(loadPresent(store)), samplesOf: () => 3 }),
      m.layer,
    );
    expect(m.log.calls).toHaveLength(3);
    if (out.bundle === null) throw new Error("expected a bundle");
    const b = await node(readBundle(bundlePath(store, out.bundle)));
    expect(b.executions.map((e) => e.sample)).toEqual([0, 1, 2]);
  });

  it("reruns the whole cell when the challenge gained an item", async () => {
    await run(input());
    const added: ResolvedItem = {
      ...item,
      itemId: "p2",
      prompt: { ...item.prompt, name: "p2", promptText: "3+3?" },
    };
    const grown = { ...challenge, items: [item, added] };
    const m = okStub();
    const out = await run(
      input({ runId: "run-b", challenge: grown, present: await node(loadPresent(store)) }),
      m.layer,
    );
    expect(m.log.calls).toHaveLength(2);
    if (out.bundle === null) throw new Error("expected a bundle");
    const b = await node(readBundle(bundlePath(store, out.bundle)));
    expect(b.executions.map((e) => e.item)).toEqual([`${challenge.id}/p1`, `${challenge.id}/p2`]);
  });

  it("never pools: items spread over two bundles leave the cell to run whole", async () => {
    const added: ResolvedItem = {
      ...item,
      itemId: "p2",
      prompt: { ...item.prompt, name: "p2", promptText: "3+3?" },
    };
    await run(input());
    await run(input({ runId: "run-b", challenge: { ...challenge, items: [added] } }));
    const m = okStub();
    await run(
      input({
        runId: "run-c",
        challenge: { ...challenge, items: [item, added] },
        present: await node(loadPresent(store)),
      }),
      m.layer,
    );
    expect(m.log.calls).toHaveLength(2);
  });

  it("re-executes an errored execution, and everything under --no-skip", async () => {
    const failing = makeChatCompletionMock({}, { kind: "fail", error: "transport" });
    const first = await run(input(), failing.layer);
    expect(first.aggregate.score).toBe(0);
    const scores = await node(readScores(store, first.bundle ?? ""));
    expect(scores[0]?.failureKind).toBe("execution_error");

    const retry = okStub();
    await run(input({ runId: "run-b", present: await node(loadPresent(store)) }), retry.layer);
    expect(retry.log.calls).toHaveLength(1);

    const forced = okStub();
    const present = await node(loadPresent(store));
    await run(input({ runId: "run-c", present, noSkip: true }), forced.layer);
    expect(forced.log.calls).toHaveLength(1);
  });

  it("resumes the open file of the same config, hardware, release and challenge", async () => {
    const crashed = bundleHeader(input({ runId: "run-crashed" }), "2026-01-01T00:00:00.000Z");
    const openPath = await node(createOpenBundle(store, crashed));
    // Sample 0 was written before the crash; the resumed run executes only sample 1.
    const m = okStub();
    const prior = {
      item: `${challenge.id}/p1`,
      sample: 0,
      seed: 1,
      messagesDigest: digestOf(chatMessages({ systemPrompt: "Be concise.", userPrompt: "2+2?" })),
      executedAt: "2026-01-01T00:00:01.000Z",
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      stopReason: null,
      measured: {
        promptTokens: 1,
        generationTokens: 1,
        promptTps: 1,
        generationTps: 1,
        peakMemoryGb: 0,
        wallTimeSec: 1,
      },
    };
    await node(appendExecution(openPath, prior));

    const out = await run(input({ runId: "run-new", samplesOf: () => 2 }), m.layer);
    expect(m.log.calls).toHaveLength(1);
    expect(out).toMatchObject({ executed: 1, skipped: 1 });
    if (out.bundle === null) throw new Error("expected a bundle");
    const b = await node(readBundle(bundlePath(store, out.bundle)));
    expect(b.header.run.id).toBe("run-crashed");
    expect(b.executions.map((e) => e.sample)).toEqual([0, 1]);
    expect(await node(readScores(store, out.bundle))).toHaveLength(2);
    expect(await openFiles()).toBe(0);
  });
});
