import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { runMigrate } from "./index.js";

const mkPromptEntry = (name: string, promptHash = "h"): PromptCorpusEntry => ({
  name,
  category: "code",
  tier: 1,
  system: { key: "direct", text: "Be concise." },
  promptText: `prompt text for ${name}`,
  scorer: { type: "exact_match", expected: "4183", extract: "(\\d+)" },
  promptHash,
});

const mkScenarioEntry = (name: string): ScenarioCorpusEntry => ({
  name,
  fixture: "fixture.json",
  players: [{ id: "p", controlledBy: "llm" }],
  scorer: "generic",
  scorerParams: {},
  cutoffs: { wallClockSec: 600, totalTokens: 100000, toolCalls: 50 },
  tier: 2,
  scenarioMd: "# directive",
  scenarioHash: "shash",
});

const writeProto = (dir: string, filename: string, records: object[]): string => {
  const filePath = path.join(dir, filename);
  writeFileSync(filePath, `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
  return filePath;
};

describe("runMigrate (integration)", () => {
  let tmp: string;
  let sourceDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), `mig-${randomUUID()}-`));
    sourceDir = path.join(tmp, "benchmark-execution");
    outputDir = path.join(tmp, "benchmark-execution", "migrated");
    mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("migrates prototype records into new-format RunManifest archives", async () => {
    const proto = writeProto(sourceDir, "model-x__mlx.jsonl", [
      {
        model: "Model X",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "code_fibonacci__t1_direct",
        prompt_tokens: 10,
        generation_tokens: 5,
        prompt_tps: 100,
        generation_tps: 50,
        peak_memory_gb: 4,
        wall_time_sec: 1,
        output: "4183",
        error: null,
        prompt_hash: "stored_h",
      },
      {
        model: "Model X",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "bootstrap_grind",
        scenario_name: "bootstrap_grind",
        scenario_hash: "stored_sh",
        termination_reason: "completed",
        tool_call_count: 2,
        final_state_summary: { stats: {} },
        events: [],
        output: "",
      },
    ]);
    const stamp = new Date("2026-02-15T00:00:00.000Z");
    utimesSync(proto, stamp, stamp);

    const promptCorpus = [mkPromptEntry("code_fibonacci_direct")];
    const scenarioCorpus = [mkScenarioEntry("bootstrap_grind")];

    const summary = await Effect.runPromise(
      runMigrate({
        sourceDir,
        outputDir,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    expect(summary.filesRead).toBe(1);
    expect(summary.archives).toHaveLength(1);
    const arch = summary.archives[0];
    if (arch === undefined) return;
    expect(arch.runId).toContain("migrated");
    expect(arch.sourceRecords).toBe(2);
    expect(arch.migratedResults).toBe(2);
    expect(arch.unmatched).toHaveLength(0);
    expect(arch.outputPath).not.toBeNull();
    expect(arch.validation).not.toBeNull();
    expect(arch.validation?.webappRecords).toBe(2);

    // Output directory actually contains the new archive file
    const outputFiles = readdirSync(outputDir);
    expect(outputFiles).toHaveLength(1);
    expect(outputFiles[0]?.endsWith(".jsonl")).toBe(true);
  });

  it("splits records from one prototype file into multiple archives when quant differs", async () => {
    writeProto(sourceDir, "mixed.jsonl", [
      {
        model: "Model X",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "code_fibonacci__t1_direct",
      },
      {
        model: "Model X",
        runtime: "mlx",
        quant: "8bit",
        prompt_name: "code_fibonacci__t1_direct",
      },
    ]);

    const summary = await Effect.runPromise(
      runMigrate({
        sourceDir,
        outputDir,
        currentPromptCorpus: [mkPromptEntry("code_fibonacci_direct")],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.archives).toHaveLength(2);
    const quants = summary.archives.map((a) => a.groupKey.quant).sort();
    expect(quants).toEqual(["4bit", "8bit"]);
  });

  it("never modifies the source directory (destructive-safe guarantee)", async () => {
    const proto = writeProto(sourceDir, "protected.jsonl", [
      { model: "M", runtime: "mlx", quant: "", prompt_name: "code_fibonacci__t1_direct" },
    ]);
    const originalContents = readFileSync(proto, "utf-8");
    const originalStat = statSync(proto);

    await Effect.runPromise(
      runMigrate({
        sourceDir,
        outputDir,
        currentPromptCorpus: [mkPromptEntry("code_fibonacci_direct")],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    // Source file identical
    expect(readFileSync(proto, "utf-8")).toBe(originalContents);
    // mtime preserved
    expect(statSync(proto).mtimeMs).toBe(originalStat.mtimeMs);
    // Source dir unchanged — only the original file + the migrated subdirectory
    const entries = readdirSync(sourceDir).sort();
    expect(entries).toEqual(["migrated", "protected.jsonl"]);
  });

  it("reports unmatched prompts without failing the migration", async () => {
    writeProto(sourceDir, "partial.jsonl", [
      { model: "M", runtime: "mlx", quant: "4bit", prompt_name: "known__t1_direct" },
      { model: "M", runtime: "mlx", quant: "4bit", prompt_name: "deleted_prompt" },
    ]);
    const summary = await Effect.runPromise(
      runMigrate({
        sourceDir,
        outputDir,
        currentPromptCorpus: [mkPromptEntry("known_direct")],
        currentScenarioCorpus: [],
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.archives).toHaveLength(1);
    expect(summary.archives[0]?.migratedResults).toBe(1);
    expect(summary.archives[0]?.unmatched).toHaveLength(1);
    expect(summary.archives[0]?.unmatched[0]?.promptName).toBe("deleted_prompt");
  });

  it("dryRun skips writing archives", async () => {
    writeProto(sourceDir, "a.jsonl", [
      { model: "M", runtime: "mlx", quant: "4bit", prompt_name: "known__t1_direct" },
    ]);
    const summary = await Effect.runPromise(
      runMigrate({
        sourceDir,
        outputDir,
        currentPromptCorpus: [mkPromptEntry("known_direct")],
        currentScenarioCorpus: [],
        dryRun: true,
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(summary.dryRun).toBe(true);
    expect(summary.archives[0]?.outputPath).toBeNull();
    expect(existsSync(outputDir)).toBe(false);
  });
});
