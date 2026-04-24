import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureManifest, fixtureResult } from "./__fixtures__/archive-fixtures.js";
import { runReport } from "./index.js";
import type { WebappRecord } from "./webapp-contract.js";

const writeArchive = (filePath: string, manifest: object, results: object[]): void => {
  const lines = [JSON.stringify(manifest), ...results.map((r) => JSON.stringify(r))];
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
};

describe("runReport (integration)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `report-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers, loads, scores, and writes a valid data.js", async () => {
    const archiveDir = path.join(dir, "archives");
    const mkArchive = (runId: string, output: string, modelName: string) => {
      const manifest = fixtureManifest({ runId, model: modelName });
      const results = [fixtureResult({ runId, output, model: modelName })];
      writeArchive(path.join(archiveDir, `${runId}.jsonl`), manifest, results);
    };

    mkdirSync(archiveDir, { recursive: true });
    mkArchive("r1", "the answer is 4183", "Model A");
    mkArchive("r2", "the answer is 42", "Model B");

    const outputPath = path.join(dir, "webapp", "src", "data", "data.js");

    const summary = await Effect.runPromise(
      runReport({ archiveDir, outputPath }).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(summary.archivesLoaded).toBe(2);
    expect(summary.recordCount).toBe(2);
    expect(summary.loadIssues).toHaveLength(0);
    expect(summary.unmatched).toHaveLength(0);

    // Read the written file and verify shape
    const written = readFileSync(outputPath, "utf-8");
    expect(written.startsWith("globalThis.__BENCHMARK_DATA = ")).toBe(true);
    expect(written.endsWith(";\n")).toBe(true);
    const body = written.slice("globalThis.__BENCHMARK_DATA = ".length, -2);
    const parsed = JSON.parse(body) as WebappRecord[];
    expect(parsed).toHaveLength(2);

    // All records have the snake_case keys expected by the webapp
    for (const rec of parsed) {
      expect(rec).toHaveProperty("prompt_name");
      expect(rec).toHaveProperty("prompt_tokens");
      expect(rec).toHaveProperty("wall_time_sec");
      expect(rec).toHaveProperty("peak_memory_gb");
      expect(rec).toHaveProperty("score_details");
      expect(typeof rec.score).toBe("number");
    }
    // Scores are 1 for the exact-match and 0 for the wrong answer
    const byModel = Object.fromEntries(parsed.map((r) => [r.model, r.score]));
    expect(byModel["Model A"]).toBe(1);
    expect(byModel["Model B"]).toBe(0);
  });

  it("dryRun skips the write step", async () => {
    const archiveDir = path.join(dir, "archives");
    mkdirSync(archiveDir, { recursive: true });
    const manifest = fixtureManifest({ runId: "r1" });
    const results = [fixtureResult({ runId: "r1" })];
    writeArchive(path.join(archiveDir, "r1.jsonl"), manifest, results);

    const outputPath = path.join(dir, "webapp", "src", "data", "data.js");
    const summary = await Effect.runPromise(
      runReport({ archiveDir, outputPath, dryRun: true }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.dryRun).toBe(true);
    expect(summary.recordCount).toBe(1);
    // no file should exist
    expect(existsSync(outputPath)).toBe(false);
  });
});
