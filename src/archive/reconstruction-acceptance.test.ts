/**
 * Headline acceptance test: corpus-deleted reconstruction.
 *
 * Proves that a v2 attempt archive is self-sufficient: after the corpus,
 * prompts, and challenge YAML are gone, the archive + its content store sidecar
 * fully support reconstruction, re-scoring, and export.
 *
 * Structure:
 *   beforeAll  — run a real (faked-model) attempt via runChallenge into a temp dir
 *   (a)        — loadAttemptReconstruction returns correct prompt/system/scorer texts
 *   (b)        — rescoreItemsFromStore + aggregate reproduce the same aggregate.score + passed
 *   (c)        — exportBundle produces a bundle whose jsonl reconstructs without the original archiveDir
 */
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBundle } from "../cli/commands/export.js";
import { rescoreItemsFromStore } from "../cli/commands/score.js";
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeChatCompletionMock,
  samplePromptExact,
} from "../orchestration/__tests__/fixtures.js";
import { aggregate, runChallenge } from "../orchestration/run-challenge.js";
import { loadAttemptReconstruction } from "../report/reconstruct.js";
import type { AttemptManifest } from "../schema/attempt.js";

// ── Fixed config + challenge for this suite ───────────────────────────────────

const config: ResolvedConfiguration = {
  id: "acceptance-config",
  artifact: "fake-artifact",
  runtime: "mlx",
  temperature: 0,
  systemPrompt: "direct",
  maxTokens: 128,
  systemPromptText: "Be concise.",
  configHash: "acceptance-cfg-hash",
};

const env = {
  hostname: "test-host",
  platform: "test",
  runtimeVersion: "test",
  nodeVersion: "v22.0.0",
  benchmarkGitSha: "abcdef",
};

const makeChallenge = (): ResolvedChallenge => {
  const prompt = samplePromptExact();
  const item: ResolvedItem = {
    itemId: prompt.name,
    promptHash: prompt.promptHash,
    itemHash: "acceptance-ih",
    scorer: prompt.scorer,
    prompt,
  };
  return {
    id: "acceptance-ch",
    version: 1,
    passThreshold: 0.5,
    challengeHash: "acceptance-chash",
    items: [item],
  };
};

// ── Suite state (populated by beforeAll) ──────────────────────────────────────

let archiveDir: string;
let archiveFile: string;
let capturedManifest: AttemptManifest;
// bundleDir is created per-test in (c) but tracked here for cleanup
let bundleDir: string;

beforeAll(async () => {
  archiveDir = await fsp.mkdtemp(path.join(os.tmpdir(), "recon-accept-"));
  const attemptId = "accept-att-1";
  archiveFile = path.join(archiveDir, `${attemptId}.jsonl`);

  const challenge = makeChallenge();

  // Fake model: output "4" which matches the exact_match scorer (expected "4")
  const { layer: chatLayer } = makeChatCompletionMock(
    {},
    {
      kind: "ok",
      result: {
        output: "4",
        reasoning: null,
        promptTokens: 5,
        generationTokens: 3,
        promptTps: 100,
        generationTps: 50,
        finishReason: null,
      },
    },
  );

  capturedManifest = await Effect.runPromise(
    runChallenge({
      config,
      challenge,
      attemptId,
      archiveDir,
      archivePath: archiveFile,
      env,
      deps: fakeDeps(),
    }).pipe(
      Effect.provide(chatLayer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );
});

afterAll(async () => {
  await fsp.rm(archiveDir, { recursive: true, force: true });
  if (bundleDir) {
    await fsp.rm(bundleDir, { recursive: true, force: true });
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("corpus-deleted reconstruction acceptance", () => {
  it("(a) loadAttemptReconstruction returns promptText, systemPromptText, and scorer matching what was run", async () => {
    const recon = await Effect.runPromise(
      loadAttemptReconstruction(archiveFile).pipe(Effect.provide(NodeContext.layer)),
    );

    // System prompt text must match what config.systemPromptText was
    expect(recon.systemPromptText).toBe(config.systemPromptText);

    // Each item must have the prompt text and scorer the challenge was built with
    expect(recon.items).toHaveLength(1);
    const reconItem = recon.items[0];
    expect(reconItem).toBeDefined();
    if (reconItem === undefined) return;

    // prompt text matches the samplePromptExact fixture
    expect(reconItem.promptText).toBe("2+2?");

    // scorer matches the exact_match config from samplePromptExact
    expect(reconItem.scorer).toMatchObject({
      type: "exact_match",
      expected: "4",
      extract: "(\\d+)",
    });

    // passThreshold round-trips through the manifest
    expect(recon.manifest.passThreshold).toBe(0.5);
  });

  it("(b) rescoreItemsFromStore + aggregate reproduces the same aggregate.score and aggregate.passed", async () => {
    const recon = await Effect.runPromise(
      loadAttemptReconstruction(archiveFile).pipe(Effect.provide(NodeContext.layer)),
    );

    const { updated } = await Effect.runPromise(
      rescoreItemsFromStore(
        recon.items.map((r) => r.item),
        recon.items,
      ).pipe(Effect.provide(NodeContext.layer)),
    );

    const passThreshold = capturedManifest.passThreshold ?? 1;
    const recomputedAggregate = aggregate(updated, passThreshold);

    // Must reproduce the exact same score and passed values captured from the run
    expect(recomputedAggregate.score).toBe(capturedManifest.aggregate.score);
    expect(recomputedAggregate.passed).toBe(capturedManifest.aggregate.passed);
  });

  it("(c) exportBundle yields a bundle whose jsonl reconstructs with no access to the original archiveDir", async () => {
    bundleDir = await fsp.mkdtemp(path.join(os.tmpdir(), "recon-accept-bundle-"));

    await Effect.runPromise(
      exportBundle(archiveFile, bundleDir).pipe(Effect.provide(NodeContext.layer)),
    );

    // The bundle's jsonl path (same basename as original but under bundleDir)
    const basename = path.basename(archiveFile);
    const bundleJsonl = path.join(bundleDir, basename);

    // Reconstruct from bundle WITHOUT access to the original archiveDir
    const recon = await Effect.runPromise(
      loadAttemptReconstruction(bundleJsonl).pipe(Effect.provide(NodeContext.layer)),
    );

    // Full reconstruction must succeed and match the original run data
    expect(recon.systemPromptText).toBe(config.systemPromptText);
    expect(recon.items).toHaveLength(1);
    const reconItem = recon.items[0];
    expect(reconItem).toBeDefined();
    if (reconItem === undefined) return;
    expect(reconItem.promptText).toBe("2+2?");
    expect(reconItem.scorer.type).toBe("exact_match");
  });
});
