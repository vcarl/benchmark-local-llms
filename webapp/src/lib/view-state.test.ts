import { describe, expect, it } from "vitest";
import { scopeRow } from "./model";
import type { Cell, Row } from "./rows";
import {
  activePreset,
  applyFilters,
  applyPreset,
  defaultView,
  facetCounts,
  funnel,
  funnelText,
  inScope,
  parseView,
  PRESETS,
  toSearch,
  type ViewState,
} from "./view-state";

describe("URL state", () => {
  it("round-trips every field, omitting defaults", () => {
    const v: ViewState = {
      set: "pilot1",
      scope: { items: "core", challenges: ["math", "logic"] },
      filters: { runtime: ["mlx", "omlx"], quant: ["—"], family: ["Qwen"], hw: ["abc"], sub: ["local"], complete: true, mem: 32 },
      group: "none",
      sort: "speed",
      open: true,
      row: "cfg@hw",
      attempt: "att-1",
      sel: "cfg@hw",
      vp: { x0: 12000, x1: 450000, y0: 0.55, y1: 0.95 },
    };
    expect(parseView(toSearch(v, "main"), "main")).toEqual(v);
    expect(toSearch(defaultView("main"), "main")).toEqual({});
    expect(parseView({}, "main")).toEqual(defaultView("main"));
  });

  it("coerces the router's JSON-parsed values and rejects unknown ones", () => {
    const v = parseView({ mem: 32, complete: 1, sort: "bogus", items: "x" }, "main");
    expect(v.filters).toMatchObject({ mem: 32, complete: true });
    expect(v.sort).toBe("score");
    expect(v.scope.items).toBe("all");
    expect(parseView({ vp: "5,1,0,1" }, "main").vp).toBeUndefined();
    expect(parseView({ sort: "efficiency" }, "main").sort).toBe("efficiency");
  });
});

describe("presets", () => {
  it("the active preset is the one whose settings equal the state; open/selection ignored", () => {
    expect(activePreset(defaultView("main"), "main")?.name).toBe("Leaderboard");
    const fits = PRESETS.find((p) => p.id === "fits32")!.view("main");
    expect(activePreset({ ...fits, open: true, row: "r" }, "main")?.id).toBe("fits32");
    expect(activePreset({ ...fits, sort: "recent" }, "main")).toBeUndefined();
    expect(activePreset(PRESETS.find((p) => p.id === "pilot")!.view("main"), "main")?.id).toBe("pilot");
    const vp = { x0: 1, x1: 10, y0: 0, y1: 1 };
    expect(activePreset({ ...defaultView("main"), sel: "r", vp }, "main")?.id).toBe("leaderboard");
  });

  it("choosing a preset replaces the settings and keeps the column, selection and zoom", () => {
    const vp = { x0: 1, x1: 10, y0: 0, y1: 1 };
    const cur: ViewState = { ...defaultView("main"), sort: "recent", open: true, row: "r", attempt: "a", sel: "r", vp };
    const eff = PRESETS.find((p) => p.id === "efficient")!;
    expect(applyPreset(eff, cur, "main")).toEqual({ ...eff.view("main"), open: true, row: "r", attempt: "a", sel: "r", vp });
    expect(eff.view("main").sort).toBe("efficiency");
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
  const f = { ...defaultView("main").filters, quant: ["4bit"] };

  it("counts each value with every other active filter applied, its own facet ignored", () => {
    expect(facetCounts(rows, f, "runtime")).toEqual(new Map([["llamacpp", 1], ["mlx", 1]]));
    expect(facetCounts(rows, f, "quant")).toEqual(new Map([["4bit", 2], ["8bit", 1]]));
  });

  it("filters hide rows by facet, completeness and memory cap", () => {
    expect(applyFilters(rows, f).map((r) => r.row.rowId)).toEqual(["a", "c"]);
    expect(applyFilters(rows, { ...defaultView("main").filters, mem: 32 }).map((r) => r.row.rowId)).toEqual(["a", "c"]);
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
    const f = { ...defaultView("main").filters, runtime: ["mlx"] };
    expect(core.filter(inScope).map((r) => r.row.rowId)).toEqual(["a", "c"]);
    const shown = applyFilters(core.filter(inScope), f);
    expect(funnel(5, core, shown)).toEqual({ total: 5, inScope: 2, match: 1, models: 1 });
    expect(funnel(3, sameModel, sameModel.filter(inScope))).toEqual({ total: 3, inScope: 2, match: 2, models: 1 });
  });

  it("reads the same horizontal or rotated", () => {
    expect(funnelText({ total: 109, inScope: 108, match: 87, models: 38 })).toBe("109 rows · 108 in scope · 87 match · 38 models");
    expect(funnelText({ total: 1, inScope: 1, match: 1, models: 1 })).toBe("1 row · 1 in scope · 1 match · 1 model");
  });
});
