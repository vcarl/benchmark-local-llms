import { describe, expect, it } from "vitest";
import { groupRows, scopeRow, sortRows, withEfficiency } from "./model";
import type { RowsDataset } from "./rows";
import type { Cell, Row } from "./rows";
import { tCrit } from "./stats";

const cell = (o: Partial<Cell> & { items: number; passed: number }): Cell => ({
  status: "scored",
  nearMissCredit: 0,
  families: { [`f${o.items}`]: [o.items, o.passed] },
  scopes: { core: [o.items, o.passed] },
  scopeFamilies: { core: { [`f${o.items}`]: [o.items, o.passed] } },
  failureKinds: {},
  cost: { tokens: 100, wallSec: 10, peakMemoryGb: 8, genTps: 20 },
  samples: [1, 1],
  executedFrom: "2026-01-01T00:00:00Z",
  executedTo: "2026-01-02T00:00:00Z",
  runtimeVersions: [],
  gitShas: [],
  sourceAttempts: [],
  restamped: false,
  ...o,
});
const missing = (items: number): Cell =>
  cell({ items, passed: 0, status: "not_run", cost: null, executedTo: null });

const row = (rowId: string, cells: Record<string, Cell>, o: Partial<Row> = {}): Row => ({
  rowId,
  modelKey: rowId,
  modelName: rowId,
  configHash: rowId,
  configId: rowId,
  hardwareId: "hw",
  artifact: `org/${rowId}`,
  runtime: "mlx",
  quant: "4bit",
  temperature: 0,
  variant: {},
  variantLabel: "",
  cells,
  passRate: 0,
  completeness: { state: "complete", challenges: [0, 0], items: [0, 0] },
  freshness: { executedFrom: null, executedTo: null },
  provenance: { runtimeVersions: [], gitShas: [], submitters: ["local"], samples: null, restamped: 0, mixed: false },
  ...o,
});

const ALL = { items: "all" as const, challenges: [] };

describe("scopeRow", () => {
  it("an incomplete row shows its partial pass rate but ranks by the coverage-adjusted one", () => {
    // Complete: 70/100. Incomplete: 45/50 run (90%), the other 50 items missing → 45%.
    const complete = scopeRow(row("a", { c1: cell({ items: 50, passed: 35 }), c2: cell({ items: 50, passed: 35 }) }), ALL);
    const partial = scopeRow(row("b", { c1: cell({ items: 50, passed: 45 }), c2: missing(50) }), ALL);
    expect(complete).toMatchObject({ score: 0.7, running: 0.7, complete: true, challenges: [2, 2] });
    expect(partial).toMatchObject({ score: 0.45, running: 0.9, complete: false, challenges: [1, 2] });
    expect(sortRows([partial, complete], "score").map((r) => r.row.rowId)).toEqual(["a", "b"]);
  });

  it("a challenge subset recomputes score, completeness and cost from those cells", () => {
    const r = row("b", { c1: cell({ items: 50, passed: 45 }), c2: missing(50) });
    const s = scopeRow(r, { items: "all", challenges: ["c1"] });
    expect(s).toMatchObject({ score: 0.9, complete: true, challenges: [1, 1] });
    expect(s.cost?.tokens).toBe(100);
    expect(scopeRow(r, { items: "all", challenges: ["c2"] })).toMatchObject({ score: 0, running: null, cost: null });
  });

  it("core/stretch counts only that scope's items; a cell without them drops out", () => {
    const r = row("a", {
      c1: cell({ items: 10, passed: 6, scopes: { core: [4, 4], stretch: [6, 2] } }),
      c2: cell({ items: 5, passed: 5, scopes: { core: [5, 5] } }),
    });
    expect(scopeRow(r, { items: "stretch", challenges: [] })).toMatchObject({ passed: 2, items: 6, challenges: [1, 1] });
    expect(scopeRow(r, { items: "core", challenges: [] })).toMatchObject({ passed: 9, items: 9, challenges: [2, 2] });
  });

  it("the CI comes from the selected cells' family clusters (null below 5)", () => {
    const cells = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`c${i}`, cell({ items: 10 + i, passed: i })]));
    expect(scopeRow(row("a", cells), ALL).se).not.toBeNull();
    expect(scopeRow(row("a", cells), { items: "all", challenges: ["c1", "c2"] }).se).toBeNull();
  });

  it("the 95% CI half-width uses t with (families − 1) df", () => {
    const cells = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`c${i}`, cell({ items: 10 + i, passed: i })]));
    const r = scopeRow(row("a", cells), ALL);
    expect(r.ci).toBeCloseTo(tCrit(4) * r.se!, 12);
    expect(scopeRow(row("a", cells), { items: "all", challenges: ["c1", "c2"] }).ci).toBeNull();
  });
});

describe("sortRows / groupRows", () => {
  const a = scopeRow(row("a1", { c: cell({ items: 10, passed: 9, cost: { tokens: 1, wallSec: 1, peakMemoryGb: 40, genTps: 10 } }) }, { modelKey: "m", modelName: "M-GGUF-ish" }), ALL);
  const b = scopeRow(row("b1", { c: cell({ items: 10, passed: 8, cost: { tokens: 1, wallSec: 1, peakMemoryGb: 8, genTps: 90 } }) }, { modelKey: "n" }), ALL);
  const c = scopeRow(row("a2", { c: cell({ items: 10, passed: 7, cost: null, status: "not_run" }) }, { modelKey: "m", modelName: "M" }), ALL);

  it("sorts by each key's natural direction, missing values last", () => {
    expect(sortRows([a, b, c], "speed").map((r) => r.row.rowId)).toEqual(["b1", "a1", "a2"]);
    expect(sortRows([a, b, c], "memory").map((r) => r.row.rowId)).toEqual(["b1", "a1", "a2"]);
  });

  it("groups by modelKey in first-row order, named by the shortest model name", () => {
    const g = groupRows(sortRows([c, b, a], "score"), "model", "score");
    expect(g.map((x) => [x.name, x.rows.map((r) => r.row.rowId)])).toEqual([
      ["M", ["a1", "a2"]],
      ["b1", ["b1"]],
    ]);
    expect(groupRows(sortRows([a, b, c], "score"), "none", "score")).toHaveLength(3);
  });

  it("two config versions of one model are two rows in one group, ordered by score", () => {
    const old = { ...a, row: { ...a.row, rowId: "a0" } };
    const g = groupRows(sortRows([old, b, c], "score"), "model", "score");
    const m = g.find((x) => x.key === "m");
    expect(m?.rows.map((r) => r.row.rowId).sort()).toEqual(["a0", "a2"]);
    expect(m?.rows.map((r) => r.score)).toEqual([...(m?.rows.map((r) => r.score) ?? [])].sort((x, y) => y - x));
    expect(g.every((x) => x.tier !== undefined)).toBe(true);
  });

  it("an unranked dataset gets no tiers", () => {
    expect(groupRows(sortRows([a, b], "score"), "model", "score", false).map((x) => x.tier)).toEqual([undefined, undefined]);
  });
});

describe("efficiency", () => {
  // One cell of 100,000 items per row (the scores carry 5 decimals), so per-item inputs are the cost divided by 100,000.
  const mk = (id: string, score: number, wall: number, genTps: number, tokens: number, peakMemoryGb: number) =>
    scopeRow(row(id, { c: cell({ items: 100_000, passed: Math.round(score * 100_000), cost: { tokens: tokens * 100_000, wallSec: wall * 100_000, peakMemoryGb, genTps } }) }), ALL);
  // Inputs and expected values come from scripts/efficiency-lab/core.cjs (geometric family, log-min-max,
  // weights 1.70/0.50/0.60/0.70/0.10) run over exactly this pool of 8 rows of the main dataset.
  const pool = [
    mk("0.5b", 0.16484, 0.085, 381.21, 24.8, 0.77),
    mk("9b", 0.75275, 115.827, 90.19, 9793.1, 6.76),
    mk("hunyuan", 0.21978, 144.585, 23.05, 27.1, 42.29),
    mk("qwq", 0.67582, 117.461, 11.83, 771.7, 60.08),
    mk("ling", 0.86813, 34.425, 67.57, 1695.9, 78.97),
    mk("0.8b", 0.02747, 3.941, 358.08, 1705.6, 1.04),
    mk("cyber", 0.92198, 13.714, 89.68, 1165.4, 45.8),
    mk("devstral", 0.5989, 7.881, 21.66, 235.5, 15.25),
  ];
  const expected = [0.046666628949345264, 0.014799460348468999, 0.005908086916946936, 0.010823048666023348, 0.08791089050689921, 0.0007135982074997487, 0.16386830354137516, 0.0721426862590234];

  it("S^1.7 · g_wall^0.5 · g_tps^0.6 · g_tokens^0.7 · g_mem^0.1 with log-min-max g over the pool (matches the efficiency lab)", () => {
    expect(withEfficiency(pool).map((r) => r.efficiency!)).toEqual(expected.map((e) => expect.closeTo(e, 12)));
  });

  it("per-item inputs: wall and tokens divide by the scored cells' items; tok/s is the mean over cells; memory the max", () => {
    const r = scopeRow(row("a", { c1: cell({ items: 10, passed: 5, cost: { tokens: 100, wallSec: 20, peakMemoryGb: 4, genTps: 10 } }), c2: cell({ items: 30, passed: 5, cost: { tokens: 300, wallSec: 40, peakMemoryGb: 9, genTps: 30 } }) }), ALL);
    expect(r).toMatchObject({ tokensPerItem: 10, wallPerItem: 1.5 });
    expect(r.cost).toMatchObject({ genTps: 20, peakMemoryGb: 9 });
  });

  it("tok/s is total tokens over total decode time across cells; a cell without a measured speed drops out", () => {
    const cost = (tokens: number, genTps: number) => ({ tokens, wallSec: 1, peakMemoryGb: 1, genTps });
    const r = scopeRow(row("a", { c1: cell({ items: 1, passed: 1, cost: cost(100, 10) }), c2: cell({ items: 1, passed: 1, cost: cost(100, 30) }), c3: cell({ items: 1, passed: 1, cost: cost(50, 0) }) }), ALL);
    // 200 tokens over 10 s + 3.33 s; c3 has no decode measurement.
    expect(r.cost!.genTps).toBeCloseTo(15, 12);
  });

  it("a row at the pool's best on every input has g = 1 (S^1.7); the worst has g = 0.05 on each", () => {
    const best = mk("best", 0.5, 1, 100, 10, 1);
    const worst = mk("worst", 0.5, 100, 1, 1000, 100);
    const [b, w] = withEfficiency([best, worst]).map((r) => r.efficiency!);
    expect(b).toBeCloseTo(0.5 ** 1.7);
    expect(w).toBeCloseTo(0.5 ** 1.7 * 0.05 ** (0.5 + 0.6 + 0.7 + 0.1));
  });

  it("an input that doesn't vary across the pool is neutral (g = 1) in either direction", () => {
    const [a, b] = withEfficiency([mk("a", 0.5, 1, 10, 10, 1), mk("b", 0.5, 1, 10, 10, 1)]);
    const want = 0.5 ** 1.7;
    expect(a!.efficiency).toBeCloseTo(want);
    expect(b!.efficiency).toBeCloseTo(want);
  });

  it("rows missing a cost input get none and do not enter the pool; efficiency is in-pool only", () => {
    const none = scopeRow(row("z", { c: missing(10) }), ALL);
    const out = withEfficiency([...pool, none]);
    expect(out.at(-1)!.efficiency).toBeNull();
    expect(out.slice(0, 8).map((r) => r.efficiency!)).toEqual(expected.map((e) => expect.closeTo(e, 12)));
  });

  it("sorts descending, rows without efficiency last", () => {
    const none = scopeRow(row("none", { c: missing(10) }), ALL);
    const ranked = sortRows(withEfficiency([none, ...pool]), "efficiency").map((r) => r.row.rowId);
    expect(ranked.slice(0, 3)).toEqual(["cyber", "ling", "devstral"]);
    expect(ranked.at(-1)).toBe("none");
  });
});

describe("tiers", () => {
  // Five families of 10 items; each row passes `k[i]` of family i.
  const fam = (id: string, k: number[]) =>
    scopeRow(
      row(id, {
        c: cell({
          items: 50,
          passed: k.reduce((s, x) => s + x, 0),
          families: Object.fromEntries(k.map((x, i) => [`f${i}`, [10, x]])),
        }),
      }),
      ALL,
    );

  it("a tier runs until an entry is significantly below the tier's first entry (paired 95% CI excludes 0)", () => {
    const rows = [fam("a", [10, 10, 10, 10, 9]), fam("b", [10, 9, 10, 10, 9]), fam("c", [9, 10, 9, 10, 9]), fam("d", [2, 3, 1, 2, 3]), fam("e", [2, 2, 1, 3, 2])];
    const g = groupRows(sortRows(rows, "score"), "none", "score");
    expect(g.map((x) => x.tier?.n)).toEqual([1, 1, 1, 2, 2]);
    expect(g.map((x) => x.tier?.start)).toEqual([true, false, false, true, false]);
    expect(g[3]!.tier!.vsHead!.lo).toBeGreaterThan(0);
    expect(g[3]!.tier).toMatchObject({ head: 4, ref: 1 });
    expect(g[4]!.tier).toMatchObject({ head: 4, ref: 4 });
    expect(g[1]!.tier!.vsAbove).not.toBeNull();
  });

  it("paired tests use only families both rows scored: a missing challenge is not a deficit", () => {
    const f = (k: number[], fam = "f") => Object.fromEntries(k.map((x, i): [string, [number, number]] => [`${fam}${i}`, [10, x]]));
    const c = cell({ items: 50, passed: 49, families: f([10, 10, 10, 10, 9]) });
    const a = scopeRow(row("a", { c, c2: cell({ items: 50, passed: 50, families: f([10, 10, 10, 10, 10], "g") }) }), ALL);
    const b = scopeRow(row("b", { c, c2: { ...missing(50), families: f([0, 0, 0, 0, 0], "g") } }), ALL);
    const g = groupRows(sortRows([a, b], "score"), "none", "score");
    expect(g.map((x) => x.key)).toEqual(["a", "b"]);
    expect(g[1]!.tier).toMatchObject({ n: 1, start: false });
    expect(g[1]!.tier!.vsHead!.diff).toBe(0);
  });

  it("a family spanning challenges pairs only when both rows scored the same challenges in it", () => {
    const f = (k: number[]) => Object.fromEntries(k.map((x, i): [string, [number, number]] => [`f${i}`, [10, x]]));
    const c = cell({ items: 50, passed: 50, families: f([10, 10, 10, 10, 10]) });
    // Family x: 2 items in c1 and 2 different items in c2. a scored only c1, b only c2.
    const a = scopeRow(row("a", { c, c1: cell({ items: 2, passed: 2, families: { x: [2, 2] } }), c2: { ...missing(2), families: { x: [2, 0] } } }), ALL);
    const b = scopeRow(row("b", { c, c1: { ...missing(2), families: { x: [2, 0] } }, c2: cell({ items: 2, passed: 0, families: { x: [2, 0] } }) }), ALL);
    const g = groupRows(sortRows([a, b], "score"), "none", "score");
    expect(g[1]!.tier!.vsHead!.diff).toBe(0);
  });

  it("only the score sort has tiers", () => {
    const rows = [fam("a", [10, 10, 10, 10, 9]), fam("d", [2, 3, 1, 2, 3])];
    expect(groupRows(sortRows(withEfficiency(rows), "efficiency"), "none", "efficiency").every((x) => x.tier === undefined)).toBe(true);
  });
});
