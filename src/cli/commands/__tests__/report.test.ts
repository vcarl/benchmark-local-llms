import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, LogLevel } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIOError } from "../../../errors/index.js";
import { runReport } from "../../../report/index.js";
import { captureLogs } from "../../__tests__/log-capture.js";
import { isMissingArchiveDirError, logAuditBlock, missingArchiveDirHint } from "../report.js";

const makeAttemptArchive = (overrides: {
  attemptId: string;
  configId?: string;
  configHash?: string;
  artifact?: string;
  runtime?: "llamacpp" | "mlx";
  challengeId?: string;
  score?: number;
  passed?: boolean;
  interrupted?: boolean;
  finishedAt?: string | null;
}): string => {
  const manifest = JSON.stringify({
    schemaVersion: 1,
    attemptId: overrides.attemptId,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt:
      overrides.finishedAt !== undefined ? overrides.finishedAt : "2026-01-01T00:01:00.000Z",
    interrupted: overrides.interrupted ?? false,
    configId: overrides.configId ?? "cfg-1",
    configHash: overrides.configHash ?? "hash1",
    artifact: overrides.artifact ?? "test/model",
    runtime: overrides.runtime ?? "llamacpp",
    quant: "q4",
    temperature: 0,
    systemPrompt: "concise",
    maxTokens: 512,
    challengeId: overrides.challengeId ?? "code",
    challengeVersion: 1,
    challengeHash: "ch1",
    env: {
      hostname: "h",
      platform: "p",
      runtimeVersion: "1",
      nodeVersion: "1",
      benchmarkGitSha: "s",
    },
    aggregate: { score: overrides.score ?? 1, passed: overrides.passed ?? true },
  });
  const item = JSON.stringify({
    itemId: "i1",
    promptName: "p1",
    promptHash: "ph1",
    executedAt: "2026-01-01T00:00:30.000Z",
    promptTokens: 10,
    generationTokens: 50,
    promptTps: 100,
    generationTps: 50,
    peakMemoryGb: 3.14,
    wallTimeSec: 1,
    output: "result",
    reasoning: null,
    rawOutput: "result",
    error: null,
    score: overrides.score ?? 1,
  });
  return `${manifest}\n${item}\n`;
};

describe("isMissingArchiveDirError", () => {
  it("matches ENOENT from readDirectory", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "readDirectory",
      cause:
        "SystemError: NotFound: FileSystem.readDirectory (./benchmark-archive): ENOENT: no such file or directory",
    });
    expect(isMissingArchiveDirError(err)).toBe(true);
  });

  it("does not match other readDirectory failures", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "readDirectory",
      cause: "EACCES: permission denied",
    });
    expect(isMissingArchiveDirError(err)).toBe(false);
  });

  it("does not match ENOENT from other operations", () => {
    const err = new FileIOError({
      path: "./webapp/src/data/data.js",
      operation: "write",
      cause: "ENOENT: no such file or directory",
    });
    expect(isMissingArchiveDirError(err)).toBe(false);
  });
});

describe("missingArchiveDirHint", () => {
  it("embeds the archive directory path and names ./bench migrate", () => {
    const hint = missingArchiveDirHint("./benchmark-archive");
    expect(hint).toContain("./benchmark-archive");
    expect(hint).toContain("./bench migrate");
    expect(hint).toContain("--archive-dir");
  });
});

describe("logAuditBlock", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `report-audit-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints a drop-reason summary block", async () => {
    const archiveDir = path.join(dir, "archives");
    mkdirSync(archiveDir, { recursive: true });

    // One completed attempt — should survive
    writeFileSync(
      path.join(archiveDir, "att-1.jsonl"),
      makeAttemptArchive({ attemptId: "att-1" }),
      "utf-8",
    );
    // One interrupted attempt — should be dropped as incomplete
    writeFileSync(
      path.join(archiveDir, "att-2.jsonl"),
      makeAttemptArchive({ attemptId: "att-2", interrupted: true }),
      "utf-8",
    );

    const summary = await Effect.runPromise(
      runReport({
        archiveDir,
        outputPath: path.join(dir, "data.js"),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const sink: string[] = [];
    await Effect.runPromise(
      logAuditBlock(summary).pipe(Effect.provide(captureLogs(sink, LogLevel.Info))),
    );

    expect(sink.some((l) => l.includes("loaded 2 attempts"))).toBe(true);
    expect(sink.some((l) => l.includes("dropped 1 (incomplete), 0 (duplicate)"))).toBe(true);
    expect(sink.some((l) => l.includes("wrote 1 cells"))).toBe(true);
  });
});
