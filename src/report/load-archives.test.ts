import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureManifest, fixtureResult } from "./__fixtures__/archive-fixtures.js";
import { discoverArchives, loadAllArchives } from "./load-archives.js";

const FS = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const writeArchive = (filePath: string, manifestJson: object, resultsJson: object[]): void => {
  const lines = [JSON.stringify(manifestJson), ...resultsJson.map((r) => JSON.stringify(r))];
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
};

describe("discoverArchives", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `discover-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists .jsonl files in sorted order", async () => {
    writeFileSync(path.join(dir, "b.jsonl"), "");
    writeFileSync(path.join(dir, "a.jsonl"), "");
    writeFileSync(path.join(dir, "c.txt"), ""); // excluded

    const result = await Effect.runPromise(discoverArchives(dir).pipe(Effect.provide(FS)));
    expect(result.map((p) => path.basename(p))).toEqual(["a.jsonl", "b.jsonl"]);
  });

  it("fails loudly if the directory does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      discoverArchives(path.join(dir, "nonexistent")).pipe(Effect.provide(FS)),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("loadAllArchives", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `loadall-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads a valid archive and returns the manifest + results", async () => {
    const manifest = fixtureManifest({ runId: "run1" });
    const results = [fixtureResult({ runId: "run1", promptName: "p1" })];
    writeArchive(path.join(dir, "run1.jsonl"), manifest, results);

    const out = await Effect.runPromise(loadAllArchives(dir).pipe(Effect.provide(FS)));
    expect(out.archives).toHaveLength(1);
    expect(out.issues).toHaveLength(0);
    expect(out.archives[0]?.data.manifest.runId).toBe("run1");
    expect(out.archives[0]?.data.results).toHaveLength(1);
  });

  it("returns archive mtime alongside loaded data", async () => {
    const manifest = fixtureManifest({ runId: "mtime-run" });
    const results = [fixtureResult({ runId: "mtime-run", promptName: "p1" })];
    writeArchive(path.join(dir, "mtime-run.jsonl"), manifest, results);

    const out = await Effect.runPromise(loadAllArchives(dir).pipe(Effect.provide(FS)));
    expect(out.archives).toHaveLength(1);
    expect(out.archives[0]?.mtime).toBeInstanceOf(Date);
    expect(out.archives[0]?.mtime.getTime()).toBeGreaterThan(0);
  });

  it("collects corrupt files as issues rather than aborting", async () => {
    const manifest = fixtureManifest({ runId: "good" });
    const results = [fixtureResult({ runId: "good" })];
    writeArchive(path.join(dir, "good.jsonl"), manifest, results);
    writeFileSync(path.join(dir, "bad.jsonl"), "{not-json\n");

    const out = await Effect.runPromise(loadAllArchives(dir).pipe(Effect.provide(FS)));
    expect(out.archives).toHaveLength(1);
    expect(out.archives[0]?.data.manifest.runId).toBe("good");
    expect(out.issues).toHaveLength(1);
    expect(out.issues[0]?.path.endsWith("bad.jsonl")).toBe(true);
    expect(out.issues[0]?.reason).toContain("corrupt JSONL");
  });
});
