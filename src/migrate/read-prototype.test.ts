import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverPrototypeFiles, readPrototypeFile } from "./read-prototype.js";

const FS = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe("readPrototypeFile", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `proto-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses valid prototype records", async () => {
    const filePath = path.join(dir, "a.jsonl");
    writeFileSync(
      filePath,
      `${JSON.stringify({
        model: "M",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "code_x__t1_direct",
        prompt_tokens: 10,
        generation_tokens: 5,
        prompt_tps: 100,
        generation_tps: 50,
        peak_memory_gb: 4,
        wall_time_sec: 1,
        output: "out",
        error: null,
        prompt_hash: "h1",
      })}\n`,
    );

    const f = await Effect.runPromise(readPrototypeFile(filePath).pipe(Effect.provide(FS)));
    expect(f.records).toHaveLength(1);
    expect(f.issues).toHaveLength(0);
    expect(f.records[0]?.prompt_name).toBe("code_x__t1_direct");
    expect(f.records[0]?.runtime).toBe("mlx");
  });

  it("reports corrupt lines without aborting the file", async () => {
    const filePath = path.join(dir, "b.jsonl");
    const lines = [
      JSON.stringify({ model: "M", runtime: "mlx", prompt_name: "p1" }),
      "{ not json",
      JSON.stringify({ model: "M", runtime: "mlx", prompt_name: "p2" }),
    ].join("\n");
    writeFileSync(filePath, `${lines}\n`);

    const f = await Effect.runPromise(readPrototypeFile(filePath).pipe(Effect.provide(FS)));
    expect(f.records).toHaveLength(2);
    expect(f.issues).toHaveLength(1);
    expect(f.issues[0]?.lineNumber).toBe(2);
  });

  it("captures the file mtime as ms since epoch", async () => {
    const filePath = path.join(dir, "c.jsonl");
    writeFileSync(filePath, "");
    const t = new Date("2025-06-01T00:00:00.000Z");
    utimesSync(filePath, t, t);
    const f = await Effect.runPromise(readPrototypeFile(filePath).pipe(Effect.provide(FS)));
    expect(f.mtimeMs).toBe(t.getTime());
  });

  it("accepts records with legacy runtime 'llama.cpp' (normalization is not this module's job)", async () => {
    const filePath = path.join(dir, "d.jsonl");
    writeFileSync(
      filePath,
      `${JSON.stringify({ model: "M", runtime: "llama.cpp", prompt_name: "p" })}\n`,
    );
    const f = await Effect.runPromise(readPrototypeFile(filePath).pipe(Effect.provide(FS)));
    expect(f.records[0]?.runtime).toBe("llama.cpp");
  });
});

describe("discoverPrototypeFiles", () => {
  it("returns sorted .jsonl files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), `disc-${randomUUID()}-`));
    writeFileSync(path.join(dir, "b.jsonl"), "");
    writeFileSync(path.join(dir, "a.jsonl"), "");
    writeFileSync(path.join(dir, "skip.txt"), "");
    const result = await Effect.runPromise(discoverPrototypeFiles(dir).pipe(Effect.provide(FS)));
    expect(result.map((p) => path.basename(p))).toEqual(["a.jsonl", "b.jsonl"]);
    rmSync(dir, { recursive: true, force: true });
  });
});
