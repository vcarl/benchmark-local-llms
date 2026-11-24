import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadChallenge } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import { writeManifest } from "../dataset/manifest.js";
import { MESSAGES_DIGEST, makeDraftRelease } from "../release/__tests__/fixtures.js";
import { hardware } from "../store/__tests__/fixtures.js";
import { readBundle } from "../store/bundle.js";
import { type ConvertOptions, convertLegacy } from "./convert.js";
import { freezeLegacy } from "./freeze.js";
import { computeConfigHash, legacyItemIdentity, shortSha256 } from "./identity.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

const SYSTEM = "Be concise.";
const KNOBS = {
  artifact: "org/model",
  runtime: "mlx" as const,
  temperature: 0,
  maxTokens: 64,
  topP: 0.9,
};
const CFG = computeConfigHash(KNOBS, SYSTEM);
const { os: _os, ...spec } = hardware;
const HW = shortSha256(stableStringify(spec));

let root: string;
let opts: ConvertOptions;
let ids: Record<string, { promptHash: string; itemHash: string; scorerHash: string }>;

const header = (id: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  attemptId: id,
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:10:00.000Z",
  interrupted: false,
  configId: "cfg",
  configHash: CFG,
  ...KNOBS,
  systemPrompt: "default",
  challengeId: "math",
  challengeVersion: 1,
  challengeHash: "chh",
  submitter: "local",
  env: {
    platform: "p",
    runtimeVersion: "r",
    nodeVersion: "n",
    benchmarkGitSha: "g",
    hardware,
    hardwareId: HW,
  },
  aggregate: { score: 1, passed: true },
  ...over,
});

const line = (item: string, output: string, over: Record<string, unknown> = {}) => ({
  itemId: item,
  promptName: item,
  ...(ids[item] as object),
  executedAt: "2026-01-01T00:01:00.000Z",
  promptTokens: 5,
  generationTokens: 7,
  promptTps: 100,
  generationTps: 20,
  peakMemoryGb: 1.5,
  wallTimeSec: 0.4,
  ttftMs: 120,
  output,
  reasoning: null,
  rawOutput: output,
  error: null,
  score: 1,
  ...over,
});

const attempt = (name: string, h: object, lines: object[]) =>
  fsp.writeFile(
    path.join(root, "arch", name),
    [h, ...lines].map((l) => `${JSON.stringify(l)}\n`).join(""),
  );

/** Content blobs for every item and the config, then pin the archive into `datasets/src.yaml`. */
const freeze = async () => {
  const blob = async (rel: string, text: string) => {
    await fsp.mkdir(path.dirname(path.join(root, "arch/content", rel)), { recursive: true });
    await fsp.writeFile(path.join(root, "arch/content", rel), text);
  };
  const ch = await run(loadChallenge(path.join(root, "releases/draft/challenges/math.yaml")));
  for (const [i, it] of ch.items.entries()) {
    const id = legacyItemIdentity(ch).items[i];
    if (id === undefined) continue;
    await blob(
      `prompts/${id.promptHash}.txt`,
      it.prompt.history === undefined
        ? it.prompt.promptText
        : JSON.stringify([...it.prompt.history, { role: "user", content: it.prompt.promptText }]),
    );
    await blob(`scorers/${id.scorerHash}.json`, stableStringify(it.scorer));
  }
  await blob(`system/${CFG}.txt`, SYSTEM);
  const legacy = await run(
    freezeLegacy({
      archive: path.join(root, "arch"),
      challengesDir: path.join(root, "releases/draft/challenges"),
      legacyHardware: { id: HW, profile: hardware },
    }),
  );
  await run(
    writeManifest(opts.source, {
      name: "src",
      title: "Source",
      release: "draft",
      evalVersion: null,
      ranked: true,
      legacy,
    }),
  );
};

beforeEach(async () => {
  const made = await makeDraftRelease();
  root = made.root;
  await fsp.mkdir(path.join(root, "arch"));
  await fsp.mkdir(path.join(root, "datasets"));
  opts = {
    source: path.join(root, "datasets/src.yaml"),
    legacyRoot: root,
    store: path.join(root, "store"),
    releasesDir: made.releases,
    templatesDir: path.join(root, "templates"),
  };
  const ch = await run(loadChallenge(path.join(root, "releases/draft/challenges/math.yaml")));
  ids = Object.fromEntries(
    legacyItemIdentity(ch).items.map((x) => [
      x.itemId,
      { promptHash: x.promptHash, itemHash: x.itemHash, scorerHash: x.scorerHash },
    ]),
  );
});
afterEach(() => fsp.rm(root, { recursive: true, force: true }));

const reasons = (r: { unconverted: ReadonlyArray<{ item: string; reason: string }> }) =>
  r.unconverted.map((u) => [u.item, u.reason.split(":")[0]]);

describe("convertLegacy", () => {
  it("converts proven executions, carrying their recorded fields and source link", async () => {
    await attempt("att-1.jsonl", header("att-1"), [
      line("a", "4"),
      line("b", "9", { sample: 0, seed: 7 }),
    ]);
    await freeze();
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(2);
    expect(r.unconverted).toEqual([]);
    const b = await run(
      readBundle(path.join(opts.store, "bundles", `${r.bundles[0]?.digest}.jsonl`)),
    );
    expect(b.header.source).toEqual({
      file: "arch/att-1.jsonl",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(b.header.config).toMatchObject({
      artifact: "org/model",
      sampling: { topP: 0.9 },
      systemPrompt: SYSTEM,
      weightsDigest: null,
    });
    expect(b.header.env.hardwareId.slice(0, 12)).toBe(HW);
    expect(b.executions[0]).toMatchObject({
      item: "math/a",
      messagesDigest: MESSAGES_DIGEST["math/a"],
      output: "4",
      seed: null,
      stopReason: null,
      sourceLine: 2,
      measured: { wallTimeSec: 0.4, ttftMs: 120 },
    });
    expect(b.executions[1]).toMatchObject({ seed: 7, sourceLine: 3 });
  });

  it("re-converts to byte-identical bundles", async () => {
    await attempt("att-1.jsonl", header("att-1"), [line("a", "4")]);
    await freeze();
    const first = await run(convertLegacy(opts));
    const again = await run(convertLegacy({ ...opts, store: path.join(root, "store2") }));
    expect(again.bundles).toEqual(first.bundles);
    const d = first.bundles[0]?.digest;
    expect(await fsp.readFile(path.join(root, "store2/bundles", `${d}.jsonl`))).toEqual(
      await fsp.readFile(path.join(opts.store, "bundles", `${d}.jsonl`)),
    );
  });

  it("converts each attempt whole, a replayed line staying in the run that counted it", async () => {
    await attempt("att-1.jsonl", header("att-1"), [line("a", "4")]);
    await attempt("att-2.jsonl", header("att-2", { startedAt: "2026-01-02T00:00:00.000Z" }), [
      line("a", "4", {
        cachedFrom: { attemptId: "att-1", executedAt: "2026-01-01T00:01:00.000Z" },
      }),
      line("b", "9"),
    ]);
    await freeze();
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(3);
    const files = await Promise.all(
      r.bundles.map((b) => run(readBundle(path.join(opts.store, "bundles", `${b.digest}.jsonl`)))),
    );
    expect(files.map((f) => [f.header.source?.file, f.executions.map((e) => e.item)])).toEqual([
      ["arch/att-1.jsonl", ["math/a"]],
      ["arch/att-2.jsonl", ["math/a", "math/b"]],
    ]);
  });

  it("does not convert tampered attempt bytes", async () => {
    await attempt("att-1.jsonl", header("att-1"), [line("a", "4")]);
    await freeze();
    await attempt("att-1.jsonl", header("att-1"), [line("a", "5")]);
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(0);
    expect(reasons(r)).toEqual([["arch/att-1.jsonl", "source"]]);
  });

  it("does not convert an attempt whose header does not record its full config", async () => {
    const { topP: _, ...noKnobs } = KNOBS;
    await attempt(
      "att-1.jsonl",
      header("att-1", {
        schemaVersion: 2,
        topP: undefined,
        configHash: CFG,
        env: { platform: "p", runtimeVersion: "r", nodeVersion: "n", benchmarkGitSha: "g" },
      }),
      [line("a", "4")],
    );
    await freeze();
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(0);
    expect(r.unconverted[0]?.reason).toMatch(/does not record every configHash input/);
    expect(r.needsRerun).toEqual({
      [`cfg@${CFG}`]: { items: ["math/a"], reasons: { [r.unconverted[0]?.reason as string]: 1 } },
    });
    expect(noKnobs).not.toHaveProperty("topP");
  });

  it("does not convert an attempt whose recorded config does not reproduce its configHash", async () => {
    await attempt("att-1.jsonl", header("att-1", { maxTokens: 128 }), [line("a", "4")]);
    await freeze();
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(0);
    expect(r.unconverted[0]?.reason).toMatch(/^config: .*do not reproduce configHash/);
  });

  it("does not convert a line whose prompt is not the release's current one", async () => {
    await attempt("att-1.jsonl", header("att-1"), [
      line("a", "4", { promptHash: ids["b"]?.promptHash }),
      line("b", "9"),
    ]);
    await freeze();
    const r = await run(convertLegacy(opts));
    expect(r.executions).toBe(1);
    expect(r.unconverted.map((u) => [u.item, u.reason])).toEqual([
      ["math/a", "prompt: promptHash is not the release's current prompt"],
    ]);
  });
});
