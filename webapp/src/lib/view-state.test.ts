import { describe, expect, it } from "vitest";
import { groupRows, scopeRow, type ScopedRow } from "./model";
import type { Cell, Row } from "./rows";
import {
  activePreset,
  applyFilters,
  applyPreset,
  applyView,
  defaultView,
  facetCounts,
  funnel,
  funnelText,
  inScope,
  parseView,
  PRESETS,
  presetsFor,
  toSearch,
  type ViewState,
} from "./view-state";

describe("URL state", () => {
  it("round-trips every field, omitting defaults", () => {
    const v: ViewState = {
      set: "draft",
      scope: { items: "core", challenges: ["math", "logic"] },
      filters: { runtime: ["mlx", "omlx"], quant: ["—"], family: ["Qwen"], hw: ["abc"], sub: ["local"], complete: true, mem: 32 },
      group: "none",
      sort: "speed",
      row: "cfg@hw",
      attempt: "att-1",
      sel: "cfg@hw",
      vp: { x0: 12000, x1: 450000, y0: 0.55, y1: 0.95 },
      layout: "8c4",
    };
    expect(parseView(toSearch(v, "alpha"), "alpha")).toEqual(v);
    expect(toSearch(defaultView("alpha"), "alpha")).toEqual({});
    expect(parseView({}, "alpha")).toEqual(defaultView("alpha"));
    expect(toSearch({ ...defaultView("alpha"), layout: "6c1" }, "alpha")).toEqual({ p: "6c1" });
  });

  it("coerces the router's JSON-parsed values and rejects unknown ones", () => {
    const v = parseView({ mem: 32, complete: 1, sort: "bogus", items: "x" }, "alpha");
    expect(v.filters).toMatchObject({ mem: 32, complete: true });
    expect(v.sort).toBe("score");
    expect(v.scope.items).toBe("all");
    expect(parseView({ vp: "5,1,0,1" }, "alpha").vp).toBeUndefined();
    expect(parseView({ sort: "efficiency" }, "alpha").sort).toBe("efficiency");
  });
});

describe("presets", () => {
  it("the active preset is the one whose settings equal the state; layout/selection ignored", () => {
    expect(activePreset(defaultView("alpha"), "alpha")?.name).toBe("Leaderboard");
    const fits = PRESETS.find((p) => p.id === "fits32")!.view("alpha");
    expect(activePreset({ ...fits, layout: "6c1", row: "r" }, "alpha")?.id).toBe("fits32");
    expect(activePreset({ ...fits, sort: "recent" }, "alpha")).toBeUndefined();
    const alt = PRESETS.find((p) => p.id === "alt")!;
    expect(alt.view("draft", "alpha").set).toBe("alpha");
    expect(activePreset(alt.view("draft", "alpha"), "draft", "alpha")?.id).toBe("alt");
    expect(presetsFor(undefined).some((p) => p.id === "alt")).toBe(false);
    const vp = { x0: 1, x1: 10, y0: 0, y1: 1 };
    expect(activePreset({ ...defaultView("alpha"), sel: "r", vp }, "alpha")?.id).toBe("leaderboard");
  });

  it("choosing a preset replaces the settings and keeps the layout, selection and zoom", () => {
    const vp = { x0: 1, x1: 10, y0: 0, y1: 1 };
    const cur: ViewState = { ...defaultView("alpha"), sort: "recent", layout: "6c1", row: "r", attempt: "a", sel: "r", vp };
    const eff = PRESETS.find((p) => p.id === "efficient")!;
    expect(applyPreset(eff, cur, "alpha")).toEqual({ ...eff.view("alpha"), layout: "6c1", row: "r", attempt: "a", sel: "r", vp });
    expect(eff.view("alpha").sort).toBe("efficiency");
  });
});

const cell: Cell = {
  status: "scored", items: 1, passed: 1, nearMissCredit: 0, families: {}, scopes: {}, scopeFamilies: {},
  failureKinds: {}, cost: { tokens: 1, wallSec: 1, peakMemoryGb: 20, genTps: 1 }, samples: null,
  executedFrom: null, executedTo: null, runtimeVersions: [], gitShas: [], sourceAttempts: [], restamped: false,
};
const row = (rowId: string, runtime: string, quant: string, mem: number): Row => ({
  rowId, modelKey: rowId, modelName: rowId, configHash: rowId, configId: rowId, hardwareId: "hw",
  artifact: "org/qwen", runtime, quant, temperature: 0, variant: {}, variantLabel: "",
  cells: { c: { ...cell, cost: { ...cell.cost!, peakMemoryGb: mem } } }, passRate: 1,
  completeness: { state: "complete", challenges: [1, 1], items: [1, 1] },
  freshness: { executedFrom: null, executedTo: null },
  provenance: { runtimeVersions: [], gitShas: [], submitters: ["local"], samples: null, restamped: 0, mixed: false },
});

describe("filters and facet counts", () => {
  const rows = [row("a", "mlx", "4bit", 20), row("b", "mlx", "8bit", 40), row("c", "llamacpp", "4bit", 20)].map(
    (r) => scopeRow(r, { items: "all", challenges: [] }),
  );
  const f = { ...defaultView("alpha").filters, quant: ["4bit"] };

  it("counts each value with every other active filter applied, its own facet ignored", () => {
    expect(facetCounts(rows, f, "runtime")).toEqual(new Map([["llamacpp", 1], ["mlx", 1]]));
    expect(facetCounts(rows, f, "quant")).toEqual(new Map([["4bit", 2], ["8bit", 1]]));
  });

  it("filters hide rows by facet, completeness and memory cap", () => {
    expect(applyFilters(rows, f).map((r) => r.row.rowId)).toEqual(["a", "c"]);
    expect(applyFilters(rows, { ...defaultView("alpha").filters, mem: 32 }).map((r) => r.row.rowId)).toEqual(["a", "c"]);
  });
});

describe("funnel", () => {
  const scoped = [row("a", "mlx", "4bit", 20), row("b", "mlx", "8bit", 40), row("c", "llamacpp", "4bit", 20)].map((r) =>
    scopeRow(r, { items: "all", challenges: [] }),
  );
  // b's only cell has no core items: nothing of it is scored under items=core.
  const core = scoped.map((r, i) => (i === 1 ? { ...r, challenges: [0, 0] as [number, number] } : r));

  it("set rows → rows with a scored cell in scope → rows passing the filters → their distinct models", () => {
    const sameModel = core.map((r) => ({ ...r, row: { ...r.row, modelKey: "m" } }));
    const f = { ...defaultView("alpha").filters, runtime: ["mlx"] };
    expect(core.filter(inScope).map((r) => r.row.rowId)).toEqual(["a", "c"]);
    const shown = applyFilters(core.filter(inScope), f);
    expect(funnel(5, core, shown)).toEqual({ total: 5, inScope: 2, match: 1, models: 1 });
    expect(funnel(3, sameModel, sameModel.filter(inScope))).toEqual({ total: 3, inScope: 2, match: 2, models: 1 });
  });

  it("reads the same horizontal or rotated", () => {
    expect(funnelText({ total: 109, inScope: 108, match: 87, models: 38 })).toBe("109 rows · 108 in scope · 87 match · 38 models");
    expect(funnelText({ total: 1, inScope: 1, match: 1, models: 1 })).toBe("1 row · 1 in scope · 1 match · 1 model");
  });

  it("adds the in-view stage only while zoomed; models count the rows in view", () => {
    const f = funnel(3, scoped, scoped, scoped.slice(0, 1));
    expect(f).toEqual({ total: 3, inScope: 3, match: 3, view: 1, models: 1 });
    expect(funnelText(f)).toBe("3 rows · 3 in scope · 3 match · 1 in view · 1 model");
  });
});

describe("zoomed view", () => {
  // x = cost.tokens, y = score.
  const at = (id: string, model: string, tokens: number | null, passed: number): ScopedRow => {
    const r = scopeRow(row(id, "mlx", "4bit", 20), { items: "all", challenges: [] });
    return {
      ...r,
      row: { ...r.row, modelKey: model },
      score: passed,
      cost: tokens === null ? null : { ...r.cost!, tokens },
    };
  };
  const vp = { x0: 10_000, x1: 100_000, y0: 0.5, y1: 0.8 };
  const rows = [
    at("m-in", "m", 30_000, 0.7),
    at("m-right", "m", 200_000, 0.75),
    at("n-low", "n", 30_000, 0.4),
    at("n-nocost", "n", null, 0.6),
    at("o-edge", "o", 100_000, 0.5),
  ];

  it("keeps rows whose point is inside the view, edges included; a row without a point is out", () => {
    expect(applyView(rows, vp).map((r) => r.row.rowId)).toEqual(["m-in", "o-edge"]);
    expect(applyView(rows, undefined)).toBe(rows);
  });

  it("filters before grouping: a model keeps only its in-view rows, one with none disappears", () => {
    const g = groupRows(applyView(rows, vp), "model", "score");
    expect(g.map((x) => [x.key, x.rows.map((r) => r.row.rowId)])).toEqual([
      ["m", ["m-in"]],
      ["o", ["o-edge"]],
    ]);
  });
});
