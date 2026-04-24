import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebappRecord } from "./webapp-contract.js";
import { formatDataJs, writeDataJs } from "./write-data-js.js";

const record = (overrides: Partial<WebappRecord> = {}): WebappRecord => ({
  model: "Test",
  runtime: "mlx",
  quant: "4bit",
  prompt_name: "p1",
  category: "math",
  tier: 1,
  temperature: 0.3,
  tags: [],
  is_scenario: false,
  score: 1,
  score_details: "ok",
  prompt_tokens: 10,
  generation_tokens: 5,
  prompt_tps: 100,
  generation_tps: 50,
  wall_time_sec: 1,
  peak_memory_gb: 3.14,
  output: "hello",
  prompt_text: "prompt",
  scenario_name: null,
  termination_reason: null,
  tool_call_count: null,
  final_player_stats: null,
  events: null,
  ...overrides,
});

describe("formatDataJs", () => {
  it("emits the exact webapp-loadable shape", () => {
    const out = formatDataJs([record()]);
    expect(out.startsWith("globalThis.__BENCHMARK_DATA = ")).toBe(true);
    expect(out.endsWith(";\n")).toBe(true);
    // parse the JSON portion to verify shape
    const jsonPart = out.slice("globalThis.__BENCHMARK_DATA = ".length, -2);
    const parsed = JSON.parse(jsonPart) as WebappRecord[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.model).toBe("Test");
  });

  it("produces an empty-array file for no records", () => {
    expect(formatDataJs([])).toBe("globalThis.__BENCHMARK_DATA = [];\n");
  });

  it("uses no indentation (single-line JSON)", () => {
    const out = formatDataJs([record(), record({ prompt_name: "p2" })]);
    // newlines only come from the trailing `\n`
    expect(out.split("\n").length).toBe(2);
  });
});

describe("writeDataJs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), `data-js-${randomUUID()}-`));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a parseable file to a nested path, creating parent dirs", async () => {
    const outputPath = path.join(tmpDir, "webapp", "src", "data", "data.js");
    const rec = record({ prompt_name: "hello" });
    const exit = await Effect.runPromiseExit(
      writeDataJs(outputPath, [rec]).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer))),
    );
    expect(exit._tag).toBe("Success");
    const written = readFileSync(outputPath, "utf-8");
    expect(written).toMatch(/^globalThis\.__BENCHMARK_DATA = \[/);
    expect(written.endsWith(";\n")).toBe(true);
    // round-trip parse
    const body = written.slice("globalThis.__BENCHMARK_DATA = ".length, -2);
    const parsed = JSON.parse(body) as WebappRecord[];
    expect(parsed[0]?.prompt_name).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    const outputPath = path.join(tmpDir, "data.js");
    const runIt = (recs: WebappRecord[]): Promise<Exit.Exit<void, unknown>> =>
      Effect.runPromiseExit(
        writeDataJs(outputPath, recs).pipe(Effect.provide(NodeFileSystem.layer)),
      );
    await runIt([record({ prompt_name: "first" })]);
    await runIt([record({ prompt_name: "second" })]);
    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("second");
    expect(content).not.toContain("first");
  });
});
