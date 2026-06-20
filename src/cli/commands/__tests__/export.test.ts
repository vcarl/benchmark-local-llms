import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scorerHash, writeBlob } from "../../../archive/content-store.js";
import { loadAttemptReconstruction } from "../../../report/reconstruct.js";
import { exportBundle } from "../export.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

// Minimal v2 attempt — same shape as reconstruct.test.ts helper.
const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };

const writeV2Attempt = async (dir: string) => {
  const sh = scorerHash(SCORER as never);
  const header = {
    schemaVersion: 2,
    attemptId: "att-x",
    startedAt: "t",
    finishedAt: "t",
    interrupted: false,
    configId: "c",
    configHash: "cfg",
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
    promptHash: "ph",
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
        yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
        yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
        yield* writeBlob(dir, "system", "cfg", "Be concise.");
      }),
      NodeContext.layer,
    ),
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, "att-x.jsonl"), `${JSON.stringify(header)}\n${JSON.stringify(item)}\n`);
  return join(dir, "att-x.jsonl");
};

const writeV1Attempt = async (dir: string) => {
  const header = {
    schemaVersion: 1,
    attemptId: "v1-att",
    startedAt: "t",
    finishedAt: "t",
    interrupted: false,
    configId: "c",
    configHash: "cfg",
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
  const { writeFile } = await import("node:fs/promises");
  const filePath = join(dir, "v1-att.jsonl");
  await writeFile(filePath, `${JSON.stringify(header)}\n`);
  return filePath;
};

describe("exportBundle", () => {
  let srcDir: string;
  let bundleDir: string;

  beforeEach(async () => {
    srcDir = await mkdtemp(join(tmpdir(), "export-src-"));
    bundleDir = await mkdtemp(join(tmpdir(), "export-bundle-"));
  });

  afterEach(async () => {
    await rm(srcDir, { recursive: true, force: true });
    await rm(bundleDir, { recursive: true, force: true });
  });

  it("copies the jsonl and exactly the referenced content blobs into bundleDir", async () => {
    const srcJsonl = await writeV2Attempt(srcDir);
    const sh = scorerHash(SCORER as never);

    const exit = await run(exportBundle(srcJsonl, bundleDir));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;

    const writtenPaths = exit.value;

    // Should contain the jsonl
    const jsonlDest = join(bundleDir, basename(srcJsonl));
    expect(writtenPaths).toContain(jsonlDest);

    // Should contain EXACTLY the referenced blobs: prompts/ph.txt, scorers/<sh>.json, system/cfg.txt
    const expectedBlobs = [
      join(bundleDir, "content", "prompts", "ph.txt"),
      join(bundleDir, "content", "scorers", `${sh}.json`),
      join(bundleDir, "content", "system", "cfg.txt"),
    ];
    for (const blob of expectedBlobs) {
      expect(writtenPaths).toContain(blob);
    }

    // EXACTLY the referenced keys — no extras
    expect(writtenPaths).toHaveLength(1 + expectedBlobs.length);
  });

  it("the bundle is self-sufficient: loadAttemptReconstruction works from bundleDir alone", async () => {
    const srcJsonl = await writeV2Attempt(srcDir);

    const exportExit = await run(exportBundle(srcJsonl, bundleDir));
    expect(Exit.isSuccess(exportExit)).toBe(true);

    // Verify reconstruction works from the bundle dir WITHOUT access to srcDir
    const bundleJsonl = join(bundleDir, basename(srcJsonl));
    const reconExit = await run(loadAttemptReconstruction(bundleJsonl));
    expect(Exit.isSuccess(reconExit)).toBe(true);
    if (Exit.isSuccess(reconExit)) {
      expect(reconExit.value.systemPromptText).toBe("Be concise.");
      expect(reconExit.value.items[0]?.promptText).toBe("What is 2+2?");
      expect(reconExit.value.items[0]?.scorer.type).toBe("exact_match");
    }
  });

  it("fails with a clear error message for a v1 archive", async () => {
    const v1Jsonl = await writeV1Attempt(srcDir);

    const exit = await run(exportBundle(v1Jsonl, bundleDir));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const err = exit.cause;
      // The error message should mention v1 and explain it has no content store
      const errStr = String(err);
      expect(errStr).toContain("v1 archive has no content store");
      expect(errStr).toContain("export requires a v2 archive");
    }
  });
});
