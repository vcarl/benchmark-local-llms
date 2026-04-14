import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadManifest } from "../loader.js";
import { appendResult, writeManifestHeader } from "../writer.js";
import { openManifest, sampleResult } from "./fixtures.js";
import { makeTempDir, readFile, removeDir, writeFile } from "./test-utils.js";

describe("loadManifest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("round-trips a manifest and results written by the writer", async () => {
    const path = `${dir}/run.jsonl`;
    const manifest = openManifest();
    const r1 = sampleResult({ promptName: "p1" });
    const r2 = sampleResult({ promptName: "p2", temperature: 0.2 });
    const r3 = sampleResult({ promptName: "p3", temperature: 0.9 });
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, manifest);
      yield* appendResult(path, r1);
      yield* appendResult(path, r2);
      yield* appendResult(path, r3);
      return yield* loadManifest(path);
    }).pipe(Effect.provide(NodeFileSystem.layer));
    const loaded = await Effect.runPromise(program);

    expect(loaded.manifest.runId).toBe(manifest.runId);
    expect(loaded.manifest.artifact).toBe(manifest.artifact);
    expect(loaded.manifest.schemaVersion).toBe(1);
    expect(loaded.manifest.finishedAt).toBeNull();
    expect(loaded.results.length).toBe(3);
    expect(loaded.results[0]?.promptName).toBe("p1");
    expect(loaded.results[1]?.promptName).toBe("p2");
    expect(loaded.results[1]?.temperature).toBe(0.2);
    expect(loaded.results[2]?.promptName).toBe("p3");
  });

  it("returns an empty results array for a header-only archive", async () => {
    const path = `${dir}/run.jsonl`;
    const program = Effect.gen(function* () {
      yield* writeManifestHeader(path, openManifest());
      return yield* loadManifest(path);
    }).pipe(Effect.provide(NodeFileSystem.layer));
    const loaded = await Effect.runPromise(program);
    expect(loaded.results.length).toBe(0);
  });

  it("raises JsonlCorruptLine with the correct 1-based line number on malformed JSON", async () => {
    const path = `${dir}/run.jsonl`;
    // Write a valid header, a malformed middle line, and a valid trailing
    // result. Parsing should short-circuit at the malformed line.
    await Effect.runPromise(
      writeManifestHeader(path, openManifest()).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const existing = await readFile(path);
    await writeFile(path, `${existing}{not valid json\n${JSON.stringify({ nope: true })}\n`);

    const exit = await Effect.runPromiseExit(
      loadManifest(path).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const str = JSON.stringify(exit.cause);
      expect(str).toContain("JsonlCorruptLine");
      expect(str).toContain('"lineNumber":2');
      expect(str).toContain(path);
    }
  });

  it("raises JsonlCorruptLine when a line is valid JSON but violates the ExecutionResult schema", async () => {
    const path = `${dir}/run.jsonl`;
    await Effect.runPromise(
      writeManifestHeader(path, openManifest()).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const existing = await readFile(path);
    // Append a line that parses as JSON but is missing all ExecutionResult fields.
    await writeFile(path, `${existing}${JSON.stringify({ unrelated: "object" })}\n`);

    const exit = await Effect.runPromiseExit(
      loadManifest(path).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const str = JSON.stringify(exit.cause);
      expect(str).toContain("JsonlCorruptLine");
      expect(str).toContain('"lineNumber":2');
    }
  });

  it("raises JsonlCorruptLine on line 1 when the header is malformed", async () => {
    const path = `${dir}/run.jsonl`;
    await writeFile(path, "{not valid json\n");

    const exit = await Effect.runPromiseExit(
      loadManifest(path).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const str = JSON.stringify(exit.cause);
      expect(str).toContain("JsonlCorruptLine");
      expect(str).toContain('"lineNumber":1');
    }
  });

  it("raises JsonlCorruptLine on line 1 when the header parses but violates RunManifest schema", async () => {
    const path = `${dir}/run.jsonl`;
    await writeFile(path, `${JSON.stringify({ schemaVersion: 999 })}\n`);

    const exit = await Effect.runPromiseExit(
      loadManifest(path).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const str = JSON.stringify(exit.cause);
      expect(str).toContain("JsonlCorruptLine");
      expect(str).toContain('"lineNumber":1');
    }
  });

  it("raises FileIOError when the file does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      loadManifest(`${dir}/nope.jsonl`).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("FileIOError");
    }
  });
});
