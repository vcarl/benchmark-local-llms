import { describe, expect, it } from "vitest";
import { scopeRow } from "./model";
import type { Cell, Row } from "./rows";
import { challengeBoxes, FAILURE_AXES, failureProfiles } from "./run-spread";

const cell = (items: number, passed: number, failureKinds: Record<string, number> = {}): Cell => ({
  status: "scored",
  items,
  passed,
  nearMissCredit: 0,
  families: { f: [items, passed] },
  scopes: { core: [items, passed] },
  scopeFamilies: { core: { f: [items, passed] } },
  failureKinds,
  cost: null,
  samples: [1, 1],
  executedFrom: null,
  executedTo: null,
  runtimeVersions: [],
  gitShas: [],
  sourceAttempts: [],
  restamped: false,
});

const row = (rowId: string, runtime: string, cells: Record<string, Cell>): Row => ({
  rowId,
  modelKey: "m",
  modelName: "m",
  configHash: rowId,
  configId: rowId,
  hardwareId: "hw",
  artifact: "org/m",
  runtime,
  quant: "4bit",
  temperature: 0,
  variant: {},
  variantLabel: "",
  cells,
  passRate: 0,
  completeness: { state: "complete", challenges: [2, 2], items: [0, 0] },
  freshness: { executedFrom: null, executedTo: null },
  provenance: { runtimeVersions: [], gitShas: [], submitters: [], samples: null, restamped: 0, mixed: false },
});

const scope = { items: "all", challenges: [] } as never;
const runs = [
  row("a", "mlx", { x: cell(4, 1, { wrong: 1 }), y: cell(2, 2) }),
  row("b", "mlx", { x: cell(4, 2, { wrong: 2 }), y: cell(2, 2) }),
  row("c", "omlx", { x: cell(4, 4), y: cell(2, 1, { loop: 1 }) }),
].map((r) => scopeRow(r, scope));

describe("challengeBoxes", () => {
  it("summarises each challenge's pass rate across runs", () => {
    const [x, y] = challengeBoxes(runs, scope);
    expect(x).toMatchObject({ id: "x", min: 0.25, median: 0.5, max: 1, values: [0.25, 0.5, 1] });
    expect(y).toMatchObject({ id: "y", min: 0.5, q1: 0.75, median: 1, max: 1 });
  });
});

describe("failureProfiles", () => {
  it("averages kinds per runtime and counts failures with no kind as untagged", () => {
    const [mlx, omlx] = failureProfiles(runs);
    const at = (k: (typeof FAILURE_AXES)[number]) => FAILURE_AXES.indexOf(k);
    expect(mlx?.runtime).toBe("mlx");
    expect(mlx?.mean[at("wrong")]).toBe(1.5);
    // run a: 3 failed, 1 tagged → 2 untagged; run b: 2 failed, 2 tagged → 0.
    expect(mlx?.mean[at("untagged")]).toBe(1);
    expect(omlx?.mean[at("loop")]).toBe(1);
    expect(omlx?.mean[at("untagged")]).toBe(0);
  });
});
