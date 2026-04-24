import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadManifest } from "../archive/loader.js";
import { fixtureManifest, fixtureResult } from "../report/__fixtures__/archive-fixtures.js";
import { writeMigratedArchive } from "./write-migrated.js";

describe("writeMigratedArchive", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `write-mig-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a manifest + results and round-trips through the archive loader", async () => {
    const outputDir = path.join(dir, "migrated");
    const manifest = fixtureManifest({ runId: "roundtrip_run" });
    const results = [fixtureResult({ runId: "roundtrip_run", promptName: "p1" })];
    const outPath = await Effect.runPromise(
      writeMigratedArchive(outputDir, "roundtrip_run", manifest, results).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(outPath).toBe(path.join(outputDir, "roundtrip_run.jsonl"));
    expect(existsSync(outPath)).toBe(true);

    // Archive is valid and loadable
    const loaded = await Effect.runPromise(
      loadManifest(outPath).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(loaded.manifest.runId).toBe("roundtrip_run");
    expect(loaded.results).toHaveLength(1);
    expect(loaded.results[0]?.promptName).toBe("p1");

    // Each line is a valid JSON object (sanity: no trailing junk)
    const text = readFileSync(outPath, "utf-8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2); // 1 manifest header + 1 result
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("creates the output directory if missing", async () => {
    const outputDir = path.join(dir, "deeply", "nested", "out");
    const manifest = fixtureManifest({ runId: "r" });
    await Effect.runPromise(
      writeMigratedArchive(outputDir, "r", manifest, []).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(existsSync(path.join(outputDir, "r.jsonl"))).toBe(true);
  });
});
