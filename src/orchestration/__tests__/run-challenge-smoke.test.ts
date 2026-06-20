/**
 * End-to-end smoke test for the runChallenge slice.
 *
 * Proves that runChallenge runs a configuration against a 1-item challenge
 * and writes a correctly-finalized, scored archive — using fakes only (no
 * live model, no live server).
 *
 * Placed in src/orchestration/__tests__/ so it can import ./fixtures.js
 * directly (deliberate deviation from the brief's src/__tests__/ path, which
 * would require a longer relative import and separation from its fixture file).
 */
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedChallenge, ResolvedItem } from "../../config/challenges.js";
import type { ResolvedConfiguration } from "../../config/configurations.js";
import { AttemptManifest, ItemResult } from "../../schema/attempt.js";
import type { RunEnv } from "../../schema/run-manifest.js";
import { runChallenge } from "../run-challenge.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  readArchiveLines,
  removeDir,
  samplePromptExact,
} from "./fixtures.js";

// The samplePromptExact scorer is:
//   { type: "exact_match", expected: "4", extract: "(\\d+)" }
// The extract pattern captures a digit group; the last match's first capture
// group is compared (case-sensitive) to "4". So any output whose last digit
// run is "4" scores 1. The simplest choice: "4".
const SCORE_1_ANSWER = "4";

describe("runChallenge smoke", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("runs a 1-item challenge and writes a finalized, passing archive", async () => {
    const prompt = samplePromptExact();

    const resolvedItem: ResolvedItem = {
      itemId: prompt.name,
      promptHash: prompt.promptHash,
      itemHash: "smoke-item-hash",
      scorer: prompt.scorer,
      prompt,
    };

    const challenge: ResolvedChallenge = {
      id: "smoke",
      version: 1,
      passThreshold: 0.5,
      challengeHash: "smoke-hash",
      items: [resolvedItem],
    };

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

    const env: RunEnv = {
      hostname: "test",
      platform: "test",
      runtimeVersion: "test",
      nodeVersion: "test",
      benchmarkGitSha: "test",
    };

    const { layer: chatLayer } = makeChatCompletionMock(
      {},
      {
        kind: "ok",
        result: {
          output: SCORE_1_ANSWER,
          reasoning: null,
          promptTokens: 5,
          generationTokens: 5,
          promptTps: 0,
          generationTps: 0,
        },
      },
    );

    const archivePath = `${dir}/smoke.jsonl`;

    const manifest = await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId: "att-smoke",
        archiveDir: dir,
        archivePath,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(chatLayer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    // Assert on the returned manifest
    expect(manifest.interrupted).toBe(false);
    expect(manifest.aggregate.passed).toBe(true);
    expect(manifest.aggregate.score).toBe(1);

    // Assert on the on-disk archive
    const lines = await readArchiveLines(archivePath);
    // Header line + 1 item line = 2 lines
    expect(lines.length).toBe(2);

    const headerJson = JSON.parse(lines[0] as string);
    const decodedManifest = Schema.decodeUnknownSync(AttemptManifest)(headerJson);
    expect(decodedManifest.interrupted).toBe(false);
    expect(decodedManifest.aggregate.passed).toBe(true);
    expect(decodedManifest.finishedAt).not.toBeNull();

    const itemJson = JSON.parse(lines[1] as string);
    const decodedItem = Schema.decodeUnknownSync(ItemResult)(itemJson);
    expect(decodedItem.score).toBe(1);
    expect(decodedItem.itemId).toBe(prompt.name);
  });
});
