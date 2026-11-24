// The list's whole state — scope, row filters, view, pane layout, selection —
// and its URL form. A default is omitted from the URL; a preset is a full
// setting of the controls, and the active preset is derived, never stored.
import { modelFamily } from "./artifact";
import type { GroupBy, ItemScope, Scope, ScopedRow, SortKey } from "./model";
import { formatViewport, inView, parseViewport, type Viewport } from "./viewport";

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
  /** Pane layout: a @vcarl/sashay layout code; none = the default layout. */
  layout?: string;
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
  const layout = str(s.p);
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
    ...(row === undefined ? {} : { row }),
    ...(attempt === undefined ? {} : { attempt }),
    ...(sel === undefined ? {} : { sel }),
    ...(vp === undefined ? {} : { vp }),
    ...(layout === undefined ? {} : { layout }),
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
  put("row", v.row);
  put("attempt", v.attempt);
  put("sel", v.sel);
  put("vp", v.vp === undefined ? undefined : formatViewport(v.vp));
  put("p", v.layout);
  return out;
};

// ─── Presets ────────────────────────────────────────────────────────────────

/** `altSet`: the label of the dataset the `alt` preset switches to, when the index has one. */
export interface Preset {
  id: string;
  name: string;
  view: (defaultSet: string, altSet?: string) => ViewState;
}

const preset = (id: string, name: string, edit: (v: ViewState, altSet?: string) => void): Preset => ({
  id,
  name,
  view: (set, altSet) => {
    const v = defaultView(set);
    edit(v, altSet);
    return v;
  },
});

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
  // Named after its dataset by the chip (`setChipName`).
  preset("alt", "Other set", (v, altSet) => {
    v.set = altSet ?? v.set;
  }),
];

/** The presets on offer: `alt` only when another release's dataset exists. */
export const presetsFor = (altSet: string | undefined): Preset[] =>
  PRESETS.filter((p) => p.id !== "alt" || altSet !== undefined);

/** Settings only: the pane layout, the selection and the zoom are not part of a preset. */
const settings = (v: ViewState, defaultSet: string) => {
  const { p: _p, row: _row, attempt: _attempt, sel: _sel, vp: _vp, ...rest } = toSearch(v, defaultSet);
  return JSON.stringify(Object.entries(rest).sort());
};

/** The preset's settings; the layout, selection, drilldown and zoom stay as they are. */
export const applyPreset = (p: Preset, v: ViewState, defaultSet: string, altSet?: string): ViewState => {
  const { layout, row, attempt, sel, vp } = v;
  return { ...p.view(defaultSet, altSet), layout, row, attempt, sel, vp };
};

export const activePreset = (v: ViewState, defaultSet: string, altSet?: string): Preset | undefined =>
  presetsFor(altSet).find((p) => settings(p.view(defaultSet, altSet), defaultSet) === settings(v, defaultSet));

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

/**
 * The scatter's zoom as one more row filter, after the facet filters: rows whose
 * point (tokens, adjusted score) is inside `vp`. A row without a point is out.
 * No view = every row.
 */
export const applyView = (rows: ScopedRow[], vp: Viewport | undefined): ScopedRow[] =>
  vp === undefined ? rows : rows.filter((r) => r.cost !== null && inView(vp, r.cost.tokens, r.score));

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
  /** In-scope rows passing the filters. */
  match: number;
  /** Of those, rows whose point is inside the scatter's zoom; only while zoomed. */
  view?: number;
  /** Distinct models (modelKey) among the list's rows, whatever the grouping. */
  models: number;
}

/** `inView` is the rows left by the zoom, when zoomed; the list shows it, else `shown`. */
export const funnel = (total: number, scoped: ScopedRow[], shown: ScopedRow[], inView?: ScopedRow[]): Funnel => ({
  total,
  inScope: scoped.filter(inScope).length,
  match: shown.length,
  ...(inView === undefined ? {} : { view: inView.length }),
  models: new Set((inView ?? shown).map((r) => r.row.modelKey)).size,
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const funnelText = (f: Funnel): string =>
  `${plural(f.total, "row")} · ${f.inScope} in scope · ${f.match} match · ${f.view === undefined ? "" : `${f.view} in view · `}${plural(f.models, "model")}`;
