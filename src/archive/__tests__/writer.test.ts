import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIOError } from "../../errors/index.js";
import { appendResult, writeManifestHeader, writeManifestTrailer } from "../writer.js";
import { openManifest, sampleResult } from "./fixtures.js";
import { makeTempDir, readFile, removeDir } from "./test-utils.js";

describe("writeManifestHeader", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("writes the manifest as the first line, newline-terminated", async () => {
    const path = `${dir}/run.jsonl`;
    const manifest = openManifest();
    await Effect.runPromise(
      writeManifestHeader(path, manifest).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const contents = await readFile(path);
    expect(contents.endsWith("\n")).toBe(true);
    const line = contents.split("\n")[0];
    const parsed = JSON.parse(line ?? "");
    expect(parsed.runId).toBe(manifest.runId);
    expect(parsed.finishedAt).toBeNull();
    expect(parsed.schemaVersion).toBe(1);
  });

  it("overwrites an existing file (open state, fresh run)", async () => {
    const path = `${dir}/run.jsonl`;
    const first = openManifest({ runId: "first" });
    const second = openManifest({ runId: "second" });
    await Effect.runPromise(
      writeManifestHeader(path, first).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    await Effect.runPromise(
      writeManifestHeader(path, second).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const contents = await readFile(path);
    expect(contents.split("\n").filter((l) => l.length > 0).length).toBe(1);
    const line = contents.split("\n")[0] ?? "";
    expect(JSON.parse(line).runId).toBe("second");
  });

  it("surfaces FileIOError when the directory does not exist", async () => {
    const result = await Effect.runPromiseExit(
      writeManifestHeader(`${dir}/nope/run.jsonl`, openManifest()).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const err = result.cause;
      // Cause should be a FileIOError
      const str = JSON.stringify(err);
      expect(str).toContain("FileIOError");
    }
  });
});

describe("appendResult", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("appends one line per call, preserving prior content", async () => {
    const path = `${dir}/run.jsonl`;
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, openManifest());
      yield* appendResult(path, sampleResult({ promptName: "p1" }));
      yield* appendResult(path, sampleResult({ promptName: "p2" }));
    }).pipe(Effect.provide(NodeFileSystem.layer));
    await Effect.runPromise(program);

    const contents = await readFile(path);
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[1] ?? "").promptName).toBe("p1");
    expect(JSON.parse(lines[2] ?? "").promptName).toBe("p2");
  });

  it("each appended line ends with a newline", async () => {
    const path = `${dir}/run.jsonl`;
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, openManifest());
      yield* appendResult(path, sampleResult());
    }).pipe(Effect.provide(NodeFileSystem.layer));
    await Effect.runPromise(program);
    const contents = await readFile(path);
    expect(contents.endsWith("\n")).toBe(true);
  });

  it("FileIOError if target directory missing", async () => {
    const exit = await Effect.runPromiseExit(
      appendResult(`${dir}/missing/x.jsonl`, sampleResult()).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("FileIOError");
    }
  });
});

describe("writeManifestTrailer", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("rewrites the first line with updated stats + finishedAt, preserving result lines", async () => {
    const path = `${dir}/run.jsonl`;
    const stats = {
      totalPrompts: 2,
      totalExecutions: 2,
      completed: 2,
      skippedCached: 0,
      errors: 0,
      totalWallTimeSec: 17.5,
    };
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, openManifest());
      yield* appendResult(path, sampleResult({ promptName: "p1" }));
      yield* appendResult(path, sampleResult({ promptName: "p2" }));
      yield* writeManifestTrailer(path, "2026-04-14T13:00:00.000Z", stats);
    }).pipe(Effect.provide(NodeFileSystem.layer));
    await Effect.runPromise(program);

    const contents = await readFile(path);
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    const header = JSON.parse(lines[0] ?? "");
    expect(header.finishedAt).toBe("2026-04-14T13:00:00.000Z");
    expect(header.stats.completed).toBe(2);
    expect(header.stats.totalWallTimeSec).toBe(17.5);
    // Results untouched
    expect(JSON.parse(lines[1] ?? "").promptName).toBe("p1");
    expect(JSON.parse(lines[2] ?? "").promptName).toBe("p2");
  });

  it("works on a header-only file (zero results)", async () => {
    const path = `${dir}/run.jsonl`;
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, openManifest());
      yield* writeManifestTrailer(path, "2026-04-14T13:00:00.000Z", {
        totalPrompts: 0,
        totalExecutions: 0,
        completed: 0,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 0,
      });
    }).pipe(Effect.provide(NodeFileSystem.layer));
    await Effect.runPromise(program);

    const contents = await readFile(path);
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0] ?? "").finishedAt).toBe("2026-04-14T13:00:00.000Z");
  });

  it("FileIOError when file does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      writeManifestTrailer(`${dir}/nope.jsonl`, "2026-04-14T13:00:00.000Z", {
        totalPrompts: 0,
        totalExecutions: 0,
        completed: 0,
        skippedCached: 0,
        errors: 0,
        totalWallTimeSec: 0,
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("FileIOError");
    }
  });
});

// Silence unused import warning for FileIOError — the tests check JSON-serialized tag strings.
void FileIOError;
