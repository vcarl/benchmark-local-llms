import { describe, expect, it } from "vitest";
import { scopeRow } from "../lib/model";
import type { Cell, Row, RowsDataset } from "../lib/rows";
import type { IndexEntry } from "../lib/snapshots";
import { renderLlms } from "./render";

const cell = (items: number, passed: number): Cell => ({
  status: "scored",
  items,
  passed,
  nearMissCredit: 0,
  // Six one-item families per cell, so the interval exists (MIN_CLUSTERS 5).
  families: Object.fromEntries(Array.from({ length: items }, (_, i) => [`f${i}`, [1, i < passed ? 1 : 0]])),
  scopes: { core: [items, passed] },
  scopeFamilies: {},
  failureKinds: { wrong: items - passed },
  cost: { tokens: 100, wallSec: 10, peakMemoryGb: 8, genTps: 20 },
  samples: [1, 1],
  executedFrom: null,
  executedTo: null,
  runtimeVersions: [],
  gitShas: [],
  sourceAttempts: [],
  restamped: false,
});

const row = (id: string, passed: number, o: Partial<Row> = {}): Row => ({
  rowId: `${id}@hw`,
  modelKey: id,
  modelName: id,
  configHash: `${id}hash0000`,
  configId: id,
  hardwareId: "hw",
  artifact: `org/${id}`,
  runtime: "llamacpp",
  quant: "Q4_K_M",
  temperature: 0,
  variant: {},
  variantLabel: "",
  cells: { c1: cell(6, passed) },
  passRate: passed / 6,
  completeness: { state: "complete", challenges: [1, 1], items: [6, 6] },
  freshness: { executedFrom: null, executedTo: null },
  provenance: { runtimeVersions: ["b1"], gitShas: [], submitters: ["local"], samples: [1, 1], restamped: 0, mixed: false },
  ...o,
});

const ds: RowsDataset = {
  dataset: { label: "draft", title: "Pre-release (draft)", archiveDir: "", challengesDir: "", release: "draft", version: null, errata: [], ranked: true, legacy: false },
  releaseFile: { release: "draft" },
  schemaVersion: 4,
  challengeSet: [{ id: "c1", version: 1, hash: "h", items: 6, scopes: { core: 6 } }],
  hardware: {},
  // Two rows of one configId: their pages get the config hash appended.
  rows: [row("a", 5), row("b", 3), row("b", 6, { rowId: "b2@hw", configHash: "b2hash0000", variantLabel: "weights x" })],
};
const entry: IndexEntry = { dataset: "draft", title: ds.dataset.title, release: "draft", evalVersion: null, ranked: true, legacy: false, digest: "d1", rows: 3, challenges: 1, span: null };
const input = { index: [entry], snapshots: new Map([["d1", ds]]), siteUrl: "https://example.test/evals/", dataOrigin: "https://data.test/" };

describe("renderLlms", () => {
  const out = renderLlms(input);

  it("is deterministic and writes the expected pages", () => {
    expect(renderLlms(input)).toEqual(out);
    expect([...out.keys()].sort()).toEqual([
      "llms.txt",
      "llms/draft/challenges/c1.md",
      "llms/draft/configs/a.md",
      "llms/draft/configs/b-b2hash00.md",
      "llms/draft/configs/b-bhash000.md",
      "llms/draft/leaderboard.md",
      "llms/draft/release.md",
      "llms/methodology.md",
    ]);
  });

  it("ranks with the webapp's numbers and links absolutely", () => {
    const board = out.get("llms/draft/leaderboard.md") ?? "";
    const lines = board.split("\n").filter((l) => /^\| \d/.test(l));
    expect(lines.map((l) => /\[([^\]]+)\]/.exec(l)?.[1])).toEqual(["b", "a", "b"]);
    const a = scopeRow(ds.rows[0] as Row, { items: "all", challenges: [] });
    expect(lines[1]).toContain(`${((a.score) * 100).toFixed(1)}% ± ${((a.ci ?? 0) * 100).toFixed(1)}`);
    expect(lines[0]).toContain("(https://example.test/evals/llms/draft/configs/b-b2hash00.md) (weights x)");
    expect(out.get("llms.txt")).toContain("](https://example.test/evals/llms/draft/leaderboard.md)");
    expect(out.get("llms/methodology.md")).toContain("https://data.test/snapshots/");
  });
});
