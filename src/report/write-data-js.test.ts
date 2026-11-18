import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RowsDataset } from "./rows.js";
import { formatDataJs, writeDataJs } from "./write-data-js.js";

const dataset = (label: string) =>
  ({ dataset: { label }, challengeSet: [], hardware: {}, rows: [] }) as unknown as RowsDataset;

describe("formatDataJs", () => {
  it("assigns every dataset to __BENCHMARK_ROWS on one line", () => {
    expect(formatDataJs([dataset("main"), dataset("pilot1")])).toBe(
      'globalThis.__BENCHMARK_ROWS = [{"dataset":{"label":"main"},"challengeSet":[],"hardware":{},"rows":[]},{"dataset":{"label":"pilot1"},"challengeSet":[],"hardware":{},"rows":[]}];\n',
    );
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

  it("writes a parseable file to a nested path, creating parent dirs, overwriting", async () => {
    const outputPath = path.join(tmpDir, "webapp", "src", "data", "data.js");
    const write = (label: string) =>
      Effect.runPromise(
        writeDataJs(outputPath, [dataset(label)]).pipe(Effect.provide(NodeFileSystem.layer)),
      );
    await write("first");
    await write("second");
    const written = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(
      written.slice("globalThis.__BENCHMARK_ROWS = ".length, -2),
    ) as RowsDataset[];
    expect(parsed.map((d) => d.dataset.label)).toEqual(["second"]);
  });
});
