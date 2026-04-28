import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, LogLevel } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIOError } from "../../../errors/index.js";
import {
  fixtureManifest,
  fixturePrompt,
  fixtureResult,
} from "../../../report/__fixtures__/archive-fixtures.js";
import { runReport } from "../../../report/index.js";
import { captureLogs } from "../../__tests__/log-capture.js";
import { isMissingArchiveDirError, logAuditBlock, missingArchiveDirHint } from "../report.js";

describe("isMissingArchiveDirError", () => {
  it("matches ENOENT from read-archive-dir", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "read-archive-dir",
      cause:
        "SystemError: NotFound: FileSystem.readDirectory (./benchmark-archive): ENOENT: no such file or directory",
    });
    expect(isMissingArchiveDirError(err)).toBe(true);
  });

  it("does not match other read-archive-dir failures", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "read-archive-dir",
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

    const writeArchive = (filePath: string, manifest: object, results: object[]): void => {
      const lines = [JSON.stringify(manifest), ...results.map((r) => JSON.stringify(r))];
      writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
    };

    // Archive 1: 1 result with unknown promptName -> promptAbsent
    //             1 result with stale promptHash -> promptDrifted
    //             1 result that matches current corpus -> survives
    const manifest = fixtureManifest({
      runId: "r1",
      prompts: [fixturePrompt({ name: "p1", promptHash: "new" })],
    });
    writeArchive(path.join(archiveDir, "r1.jsonl"), manifest, [
      fixtureResult({ runId: "r1", promptName: "ghost" }), // promptAbsent
      fixtureResult({ runId: "r1", promptName: "p1", promptHash: "old" }), // promptDrifted
      fixtureResult({ runId: "r1", promptName: "p1", promptHash: "new" }), // survives
    ]);

    const currentPrompt = fixturePrompt({ name: "p1", promptHash: "new" });
    const summary = await Effect.runPromise(
      runReport({
        archiveDir,
        outputPath: path.join(dir, "data.js"),
        currentPromptCorpus: [currentPrompt],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    const sink: string[] = [];
    await Effect.runPromise(
      logAuditBlock(summary).pipe(Effect.provide(captureLogs(sink, LogLevel.Info))),
    );

    expect(sink.some((l) => l.includes("loaded 1 archives"))).toBe(true);
    expect(sink.some((l) => l.includes("dropped 1 (prompt absent), 1 (prompt drifted)"))).toBe(
      true,
    );
    expect(sink.some((l) => l.includes("wrote 1 cells"))).toBe(true);
  });
});
