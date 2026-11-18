// The list's whole state — scope, row filters, view, open column, selection —
// and its URL form. A default is omitted from the URL; a preset is a full
// setting of the controls, and the active preset is derived, never stored.
import { modelFamily } from "./artifact";
import type { GroupBy, ItemScope, Scope, ScopedRow, SortKey } from "./model";
import { formatViewport, parseViewport, type Viewport } from "./viewport";

export const FACETS = ["runtime", "quant", "family", "hw", "sub"] as const;
export type Facet = (typeof FACETS)[number];

export interface Filters {
  runtime: string[];
  quant: string[];
  family: string[];
  hw: string[];
  sub: string[];
  complete: boolean;
  /** Peak-memory cap in GB; null = any. */
  mem: number | null;
}

export interface ViewState {
  set: string;
  scope: Scope;
  filters: Filters;
  group: GroupBy;
  sort: SortKey;
  open: boolean;
  /** Drilldown: the open row and attempt. */
  row?: string;
  attempt?: string;
  /** Highlighted row in the list and the scatter; kept when the drilldown closes. */
  sel?: string;
  /** Scatter zoom; none = the full extent. */
  vp?: Viewport;
}

export const MEM_CAPS = [16, 32, 64, 128];
const ITEM_SCOPES: ItemScope[] = ["all", "core", "stretch"];
const SORTS: SortKey[] = ["score", "efficiency", "speed", "memory", "recent"];

export const defaultView = (set: string): ViewState => ({
  set,
  scope: { items: "all", challenges: [] },
  filters: { runtime: [], quant: [], family: [], hw: [], sub: [], complete: false, mem: null },
  group: "model",
  sort: "score",
  open: false,
});

const csv = (v: unknown): string[] => (v === undefined || v === "" ? [] : String(v).split(","));
const str = (v: unknown): string | undefined => (v === undefined ? undefined : String(v));

/** URL search → state. Unknown values fall back to the default. */
export const parseView = (s: Record<string, unknown>, defaultSet: string): ViewState => {
  const d = defaultView(defaultSet);
  const items = str(s.items) as ItemScope;
  const sort = str(s.sort) as SortKey;
  const mem = Number(s.mem);
  const row = str(s.row);
  const attempt = str(s.attempt);
  const sel = str(s.sel);
  const vp = parseViewport(s.vp);
  return {
    set: str(s.set) ?? d.set,
    scope: { items: ITEM_SCOPES.includes(items) ? items : "all", challenges: csv(s.ch) },
    filters: {
      runtime: csv(s.runtime),
      quant: csv(s.quant),
      family: csv(s.family),
      hw: csv(s.hw),
      sub: csv(s.sub),
      complete: str(s.complete) === "1",
      mem: MEM_CAPS.includes(mem) ? mem : null,
    },
    group: str(s.group) === "none" ? "none" : "model",
    sort: SORTS.includes(sort) ? sort : "score",
    open: str(s.filters) === "open",
    ...(row === undefined ? {} : { row }),
    ...(attempt === undefined ? {} : { attempt }),
    ...(sel === undefined ? {} : { sel }),
    ...(vp === undefined ? {} : { vp }),
  };
};

/** State → URL search, defaults omitted. */
export const toSearch = (v: ViewState, defaultSet: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const put = (k: string, val: string | undefined) => {
    if (val !== undefined && val !== "") out[k] = val;
  };
  put("set", v.set === defaultSet ? undefined : v.set);
  put("items", v.scope.items === "all" ? undefined : v.scope.items);
  put("ch", v.scope.challenges.join(","));
  for (const f of FACETS) put(f, v.filters[f].join(","));
  put("complete", v.filters.complete ? "1" : undefined);
  put("mem", v.filters.mem === null ? undefined : String(v.filters.mem));
  put("group", v.group === "model" ? undefined : v.group);
  put("sort", v.sort === "score" ? undefined : v.sort);
  put("filters", v.open ? "open" : undefined);
  put("row", v.row);
  put("attempt", v.attempt);
  put("sel", v.sel);
  put("vp", v.vp === undefined ? undefined : formatViewport(v.vp));
  return out;
};

// ─── Presets ────────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  view: (defaultSet: string) => ViewState;
}

const preset = (id: string, name: string, edit: (v: ViewState) => void): Preset => ({
  id,
  name,
  view: (set) => {
    const v = defaultView(set);
    edit(v);
    return v;
  },
});

export const PILOT_SET = "pilot1";

export const PRESETS: Preset[] = [
  preset("leaderboard", "Leaderboard", () => {}),
  preset("complete", "Top complete", (v) => {
    v.filters.complete = true;
  }),
  preset("fits32", "Fits 32 GB", (v) => {
    v.filters.mem = 32;
  }),
  preset("fast", "Fast", (v) => {
    v.filters.complete = true;
    v.group = "none";
    v.sort = "speed";
  }),
  preset("efficient", "Efficient", (v) => {
    v.sort = "efficiency";
  }),
  preset("pilot", "Pilot set", (v) => {
    v.set = PILOT_SET;
  }),
];

/** Settings only: the column's open state, the selection and the zoom are not part of a preset. */
const settings = (v: ViewState, defaultSet: string) => {
  const { filters: _open, row: _row, attempt: _attempt, sel: _sel, vp: _vp, ...rest } = toSearch(v, defaultSet);
  return JSON.stringify(Object.entries(rest).sort());
};

/** The preset's settings; the column, selection, drilldown and zoom stay as they are. */
export const applyPreset = (p: Preset, v: ViewState, defaultSet: string): ViewState => {
  const { open, row, attempt, sel, vp } = v;
  return { ...p.view(defaultSet), open, row, attempt, sel, vp };
};

export const activePreset = (v: ViewState, defaultSet: string): Preset | undefined =>
  PRESETS.find((p) => settings(p.view(defaultSet), defaultSet) === settings(v, defaultSet));

// ─── Filters and facet counts ──────────────────────────────────────────────

const facetValues = (r: ScopedRow, f: Facet): string[] => {
  switch (f) {
    case "runtime":
      return [r.row.runtime];
    case "quant":
      return [r.row.quant ?? "—"];
    case "family":
      return [modelFamily(r.row.artifact)];
    case "hw":
      return [r.row.hardwareId];
    case "sub":
      return r.row.provenance.submitters;
  }
};

const passes = (r: ScopedRow, f: Filters, skip?: Facet): boolean =>
  FACETS.every(
    (k) => k === skip || f[k].length === 0 || facetValues(r, k).some((v) => f[k].includes(v)),
  ) &&
  (!f.complete || r.complete) &&
  (f.mem === null || (r.cost !== null && r.cost.peakMemoryGb <= f.mem));

export const applyFilters = (rows: ScopedRow[], f: Filters): ScopedRow[] =>
  rows.filter((r) => passes(r, f));

/** Per value of `facet`: rows that would show with that value selected alongside every other active filter. */
export const facetCounts = (rows: ScopedRow[], f: Filters, facet: Facet): Map<string, number> => {
  const out = new Map<string, number>();
  for (const r of rows) {
    const ok = passes(r, f, facet);
    for (const v of facetValues(r, facet)) out.set(v, (out.get(v) ?? 0) + (ok ? 1 : 0));
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
};

/** Active row filters, for the collapsed summary. */
export const activeFilterCount = (f: Filters): number =>
  FACETS.filter((k) => f[k].length > 0).length + (f.complete ? 1 : 0) + (f.mem === null ? 0 : 1);

// ─── Funnel ─────────────────────────────────────────────────────────────────

/** A row is in scope when at least one of its selected cells is scored with items in scope. */
export const inScope = (r: ScopedRow): boolean => r.challenges[0] > 0;

export interface Funnel {
  /** Rows of the set. */
  total: number;
  /** Rows in scope; the list never shows another. */
  inScope: number;
  /** In-scope rows passing the filters: the list's rows. */
  match: number;
  /** Distinct models (modelKey) among them, whatever the grouping. */
  models: number;
}

export const funnel = (total: number, scoped: ScopedRow[], shown: ScopedRow[]): Funnel => ({
  total,
  inScope: scoped.filter(inScope).length,
  match: shown.length,
  models: new Set(shown.map((r) => r.row.modelKey)).size,
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const funnelText = (f: Funnel): string =>
  `${plural(f.total, "row")} · ${f.inScope} in scope · ${f.match} match · ${plural(f.models, "model")}`;
