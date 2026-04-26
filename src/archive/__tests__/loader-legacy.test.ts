import * as fs from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadManifest } from "../loader.js";
import { makeTempDir, removeDir } from "./test-utils.js";

describe("loader: legacy archive translation", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("synthesizes archiveId and legacy runId for archives without archiveId", async () => {
    // A legacy manifest line: pre-rename, only `runId` (per-archive sense).
    const legacyManifest = {
      schemaVersion: 1,
      runId: "2025-12-01_qwen_q4_aa11bb",
      startedAt: "2025-12-01T00:00:00.000Z",
      finishedAt: "2025-12-01T01:00:00.000Z",
      interrupted: false,
      artifact: "qwen/qwen-7b",
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      env: {
        hostname: "host",
        platform: "darwin-arm64",
        runtimeVersion: "x",
        nodeVersion: "v22",
        benchmarkGitSha: "abc",
      },
      temperatures: [0.7],
      promptCorpus: {},
      scenarioCorpus: {},
      stats: {
        totalPrompts: 1,
        totalExecutions: 1,
        completed: 1,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 1,
      },
    };
    const legacyResult = {
      runId: "2025-12-01_qwen_q4_aa11bb",
      executedAt: "2025-12-01T00:30:00.000Z",
      promptName: "p",
      temperature: 0.7,
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 1,
      wallTimeSec: 1,
      output: "x",
      error: null,
      promptHash: "h",
      scenarioHash: null,
      scenarioName: null,
      terminationReason: null,
      toolCallCount: null,
      finalPlayerStats: null,
      events: null,
    };
    const file = path.join(dir, "legacy.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify(legacyManifest)}\n${JSON.stringify(legacyResult)}\n`,
    );

    const loaded = await Effect.runPromise(
      loadManifest(file).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(loaded.manifest.archiveId).toBe("2025-12-01_qwen_q4_aa11bb");
    expect(loaded.manifest.runId).toBe("legacy-2025-12-01_qwen_q4_aa11bb");
    expect(loaded.results).toHaveLength(1);
    expect(loaded.results[0]?.archiveId).toBe("2025-12-01_qwen_q4_aa11bb");
    expect(loaded.results[0]?.runId).toBe("legacy-2025-12-01_qwen_q4_aa11bb");
  });

  it("passes through new-shape archives unchanged", async () => {
    const file = path.join(dir, "new.jsonl");
    const manifest = {
      schemaVersion: 1,
      archiveId: "2026-04-25_qwen_q4_bb22cc",
      runId: "r-2026-04-25-bb22cc",
      startedAt: "2026-04-25T00:00:00.000Z",
      finishedAt: null,
      interrupted: false,
      artifact: "qwen/qwen-7b",
      model: "Qwen 7B",
      runtime: "llamacpp",
      quant: "Q4_K_M",
      env: {
        hostname: "host",
        platform: "darwin-arm64",
        runtimeVersion: "x",
        nodeVersion: "v22",
        benchmarkGitSha: "abc",
      },
      temperatures: [0.7],
      promptCorpus: {},
      scenarioCorpus: {},
      stats: {
        totalPrompts: 0,
        totalExecutions: 0,
        completed: 0,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 0,
      },
    };
    await fs.writeFile(file, `${JSON.stringify(manifest)}\n`);

    const loaded = await Effect.runPromise(
      loadManifest(file).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(loaded.manifest.archiveId).toBe("2026-04-25_qwen_q4_bb22cc");
    expect(loaded.manifest.runId).toBe("r-2026-04-25-bb22cc");
  });
});
