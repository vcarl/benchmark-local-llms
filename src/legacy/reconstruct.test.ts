import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stableStringify } from "../config/hashing.js";
import { pinnedToDisk, putBlob } from "./__tests__/blobs.js";
import { computeConfigHash, computePromptHash, scorerHash } from "./identity.js";
import { loadAttemptReconstruction } from "./reconstruct.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

// Minimal v2 attempt jsonl (header + one item) written by hand into `dir`.
const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };
const PH = computePromptHash("What is 2+2?", "");
const CFG = computeConfigHash(
  { artifact: "a", runtime: "mlx", temperature: 0, maxTokens: 64 },
  "Be concise.",
);
const writeV2Attempt = async (dir: string) => {
  const sh = scorerHash(SCORER as never);
  const header = {
    schemaVersion: 2,
    attemptId: "att-x",
    startedAt: "t",
    finishedAt: "t",
    interrupted: false,
    configId: "c",
    configHash: CFG,
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
  const item = {
    itemId: "i",
    promptName: "i",
    promptHash: PH,
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
  await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        yield* putBlob(dir, "prompts", PH, "What is 2+2?");
        yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
        yield* putBlob(dir, "system", header, "Be concise.");
      }),
      NodeContext.layer,
    ),
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, "att-x.jsonl"), `${JSON.stringify(header)}\n${JSON.stringify(item)}\n`);
  return join(dir, "att-x.jsonl");
};

describe("loadAttemptReconstruction", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recon-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("rehydrates prompt/system/scorer purely from the archive + store", async () => {
    const file = await writeV2Attempt(dir);
    const exit = await run(loadAttemptReconstruction(file, pinnedToDisk));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.systemPromptText).toBe("Be concise.");
      expect(exit.value.items[0]?.promptText).toBe("What is 2+2?");
      expect(exit.value.items[0]?.scorer.type).toBe("exact_match");
      expect(exit.value.manifest.passThreshold).toBe(0.8);
    }
  });

  it("fails NotReconstructible when a blob does not hash to its key", async () => {
    const file = await writeV2Attempt(dir);
    await writeFile(join(dir, "content", "prompts", `${PH}.txt`), "What is 2+3?");
    const exit = await run(loadAttemptReconstruction(file, pinnedToDisk));
    expect(Exit.isFailure(exit) && exit.cause._tag === "Fail" && exit.cause.error).toMatchObject({
      _tag: "NotReconstructible",
      reason: expect.stringContaining(`content/prompts/${PH} hashes to`),
    });
  });

  it("fails NotReconstructible on a v1 archive (no store)", async () => {
    const { writeFile } = await import("node:fs/promises");
    const header = {
      schemaVersion: 1,
      attemptId: "a",
      startedAt: "t",
      finishedAt: "t",
      interrupted: false,
      configId: "c",
      configHash: CFG,
      artifact: "a",
      runtime: "mlx",
      temperature: 0,
      systemPrompt: "default",
      maxTokens: 64,
      challengeId: "ch",
      challengeVersion: 1,
      challengeHash: "chh",
      env: {
        hostname: "h",
        platform: "p",
        runtimeVersion: "r",
        nodeVersion: "n",
        benchmarkGitSha: "g",
      },
      aggregate: { score: 0, passed: false },
    };
    const f = join(dir, "v1.jsonl");
    await writeFile(f, `${JSON.stringify(header)}\n`);
    const exit = await run(loadAttemptReconstruction(f, pinnedToDisk));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
