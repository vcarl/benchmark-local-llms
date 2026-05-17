import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fixtureManifest,
  fixturePrompt,
  fixtureResult,
  fixtureScenario,
} from "./__fixtures__/archive-fixtures.js";
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
      // archiveId must be distinct per archive (the report's dup check now
      // partitions on archiveId, not runId; runId can legitimately repeat
      // across the per-model archives of one ./bench run invocation).
      const archiveId = `archive-${runId}`;
      const manifest = fixtureManifest({ runId, archiveId, model: modelName });
      const results = [fixtureResult({ runId, archiveId, output, model: modelName })];
      writeArchive(path.join(archiveDir, `${archiveId}.jsonl`), manifest, results);
    };

    mkdirSync(archiveDir, { recursive: true });
    mkArchive("r1", "the answer is 4183", "Model A");
    mkArchive("r2", "the answer is 42", "Model B");

    const outputPath = path.join(dir, "webapp", "src", "data", "data.js");

    // Supply the current corpus (matches the fixture's embedded promptHash "hashP")
    const currentPrompt = fixturePrompt();
    const summary = await Effect.runPromise(
      runReport({
        archiveDir,
        outputPath,
        currentPromptCorpus: [currentPrompt],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(summary.archivesLoaded).toBe(2);
    expect(summary.recordCount).toBe(2);
    expect(summary.loadIssues).toHaveLength(0);
    expect(summary.dropped.promptAbsent).toBe(0);
    expect(summary.dropped.promptDrifted).toBe(0);
    expect(summary.duplicateArchiveIds).toHaveLength(0);

    // Read the written file and verify shape
    const written = readFileSync(outputPath, "utf-8");
    expect(written.startsWith("globalThis.__BENCHMARK_DATA = ")).toBe(true);
    expect(written.endsWith(";\n")).toBe(true);
    const body = written.slice("globalThis.__BENCHMARK_DATA = ".length, -2);
    const parsed = JSON.parse(body) as WebappRecord[];
    expect(parsed).toHaveLength(2);

    // All records have the snake_case keys expected by the webapp.
    // This integration test uses only the prompt corpus, so every record is
    // a PromptWebappRecord; narrow on `kind` before reading `.score`.
    for (const rec of parsed) {
      expect(rec).toHaveProperty("prompt_name");
      expect(rec).toHaveProperty("prompt_tokens");
      expect(rec).toHaveProperty("wall_time_sec");
      expect(rec).toHaveProperty("peak_memory_gb");
      expect(rec).toHaveProperty("score_details");
      expect(rec.kind).toBe("prompt");
      if (rec.kind !== "prompt") continue;
      expect(typeof rec.score).toBe("number");
    }
    // Scores are 1 for the exact-match and 0 for the wrong answer
    const byModel = Object.fromEntries(
      parsed.map((r) => [r.model, r.kind === "prompt" ? r.score : null]),
    );
    expect(byModel["Model A"]).toBe(1);
    expect(byModel["Model B"]).toBe(0);
  });

  it("writes per-scenario events side files alongside data.js", async () => {
    const archiveDir = path.join(dir, "archives");
    mkdirSync(archiveDir, { recursive: true });

    const archiveId = "archive-scn-1";
    const runId = "run-scn-1";
    const scenarioName = "scn_demo";
    const events = [
      { event: "tool_call", tick: 1, ts: "1700000000", data: { tool: "noop" } },
      { event: "turn_end", tick: 2, ts: "1700000001", data: {} },
    ];
    const scenarioEntry = fixtureScenario({ name: scenarioName });
    const manifest = fixtureManifest({
      archiveId,
      runId,
      prompts: [],
      scenarios: [scenarioEntry],
    });
    const result = {
      ...fixtureResult({ archiveId, runId, promptName: scenarioName }),
      scenarioName,
      scenarioHash: scenarioEntry.scenarioHash,
      // For scenario runs, promptHash mirrors scenarioHash (see ExecutionResult docstring).
      promptHash: scenarioEntry.scenarioHash,
      events,
      terminationReason: "completed" as const,
      toolCallCount: 1,
      finalPlayerStats: { credits: 0 },
    };
    writeArchive(path.join(archiveDir, `${archiveId}.jsonl`), manifest, [result]);

    const outputPath = path.join(dir, "webapp", "src", "data", "data.js");
    const summary = await Effect.runPromise(
      runReport({
        archiveDir,
        outputPath,
        currentPromptCorpus: [],
        currentScenarioCorpus: [scenarioEntry],
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(summary.recordCount).toBe(1);

    // Side file at <data dir>/events/<archive_id>__<prompt_name>.json
    const eventsPath = path.join(
      path.dirname(outputPath),
      "events",
      `${archiveId}__${scenarioName}.json`,
    );
    expect(existsSync(eventsPath)).toBe(true);
    const sideFile = JSON.parse(readFileSync(eventsPath, "utf-8"));
    expect(sideFile.events).toHaveLength(2);
    expect(sideFile.events[0].event).toBe("tool_call");
    // Sidecar always carries a blobPool (possibly empty `{}`).
    expect(typeof sideFile.blobPool).toBe("object");

    // data.js does NOT contain the events payload but DOES contain has_events: true
    const dataJs = readFileSync(outputPath, "utf-8");
    const body = dataJs.slice("globalThis.__BENCHMARK_DATA = ".length, -2);
    const parsed = JSON.parse(body) as WebappRecord[];
    const first = parsed[0];
    if (first === undefined) throw new Error("expected one record in data.js");
    expect(first.kind).toBe("scenario");
    if (first.kind === "scenario") {
      expect(first.events).toBeNull();
      expect(first.has_events).toBe(true);
    }
  });

  it("dryRun skips the write step", async () => {
    const archiveDir = path.join(dir, "archives");
    mkdirSync(archiveDir, { recursive: true });
    const manifest = fixtureManifest({ runId: "r1" });
    const results = [fixtureResult({ runId: "r1" })];
    writeArchive(path.join(archiveDir, "r1.jsonl"), manifest, results);

    const outputPath = path.join(dir, "webapp", "src", "data", "data.js");
    const currentPrompt = fixturePrompt();
    const summary = await Effect.runPromise(
      runReport({
        archiveDir,
        outputPath,
        dryRun: true,
        currentPromptCorpus: [currentPrompt],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.dryRun).toBe(true);
    expect(summary.recordCount).toBe(1);
    // no file should exist — neither data.js nor the events side-files dir
    expect(existsSync(outputPath)).toBe(false);
    expect(existsSync(path.join(path.dirname(outputPath), "events"))).toBe(false);
  });
});
