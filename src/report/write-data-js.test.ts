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
  config_id: "cfg-1",
  config_hash: "hash1",
  artifact: "test/model",
  runtime: "llamacpp",
  quant: "q4",
  temperature: 0,
  system_prompt: "concise",
  max_tokens: 512,
  challenge_id: "code",
  challenge_version: 1,
  attempt_id: "att-1",
  finished_at: "2026-01-01T00:01:00.000Z",
  score: 1,
  passed: true,
  generation_tokens: 50,
  wall_time_sec: 1,
  item_count: 1,
  passed_items: 1,
  peak_memory_gb: 1.5,
  generation_tps: 10,
  prompt_tps: 4,
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
    expect(parsed[0]?.config_hash).toBe("hash1");
  });

  it("produces an empty-array file for no records", () => {
    expect(formatDataJs([])).toBe("globalThis.__BENCHMARK_DATA = [];\n");
  });

  it("uses no indentation (single-line JSON)", () => {
    const out = formatDataJs([record(), record({ attempt_id: "att-2" })]);
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
    const rec = record({ attempt_id: "att-hello" });
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
    expect(parsed[0]?.attempt_id).toBe("att-hello");
  });

  it("overwrites an existing file", async () => {
    const outputPath = path.join(tmpDir, "data.js");
    const runIt = (recs: WebappRecord[]): Promise<Exit.Exit<void, unknown>> =>
      Effect.runPromiseExit(
        writeDataJs(outputPath, recs).pipe(Effect.provide(NodeFileSystem.layer)),
      );
    await runIt([record({ attempt_id: "att-first" })]);
    await runIt([record({ attempt_id: "att-second" })]);
    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("att-second");
    expect(content).not.toContain("att-first");
  });
});
