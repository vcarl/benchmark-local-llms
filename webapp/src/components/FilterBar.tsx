import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import type { Filters, GroupBy, Sort } from "../lib/pipeline";
import {
  loadPresets, upsertPreset, deletePreset, renamePreset,
  resetPresets, seedIfEmpty,
} from "../lib/presets";

type SearchState = {
  tags?: string;
  tier?: string;
  runtime?: string;
  family?: string;
  sizeRange?: string;
  quant?: string;
  category?: string;
  temperature?: string;
  isScenario?: string;
  groupBy?: GroupBy;
  sort?: string;
  preset?: string;
  model?: string;
};

const csv = (s: string | undefined): string[] =>
  s === undefined || s === "" ? [] : s.split(",");

export const parseFilters = (search: SearchState): Filters => ({
  tags: csv(search.tags),
  category: csv(search.category),
  tier: csv(search.tier).map(Number).filter((n) => !Number.isNaN(n)),
  runtime: csv(search.runtime),
  family: csv(search.family),
  sizeRange: csv(search.sizeRange),
  quant: csv(search.quant),
  temperature: csv(search.temperature).map(Number).filter((n) => !Number.isNaN(n)),
  isScenario: search.isScenario === "true" ? true : search.isScenario === "false" ? false : undefined,
});

export const parseSort = (s: string | undefined): Sort => {
  if (!s) return { field: "meanScore", dir: "desc" };
  const dir = s.startsWith("-") ? "desc" : "asc";
  const field = s.replace(/^-/, "") as Sort["field"];
  return { field, dir };
};

const sortString = (s: Sort): string => (s.dir === "desc" ? `-${s.field}` : s.field);

interface Props {
  allValues: {
    tags: string[];
    categories: string[];
    tiers: number[];
    runtimes: string[];
    families: string[];
    sizeRanges: string[];
    quants: string[];
    temperatures: number[];
  };
}

export function FilterBar({ allValues }: Props) {
  const search = useSearch({ strict: false }) as SearchState;
  const navigate = useNavigate();
  const [presetName, setPresetName] = useState(search.preset ?? "");

  useEffect(() => { seedIfEmpty(); }, []);
  useEffect(() => { setPresetName(search.preset ?? ""); }, [search.preset]);

  const setSearch = useCallback((patch: Partial<SearchState>) => {
    navigate({ to: "/", search: (prev) => ({ ...prev, ...patch }) as never });
  }, [navigate]);

  const updateMulti = (key: keyof SearchState) => (values: string[]) =>
    setSearch({ [key]: values.length === 0 ? undefined : values.join(",") } as Partial<SearchState>);

  const currentSort = parseSort(search.sort);
  const presets = loadPresets();

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <Chip label="Tags" all={allValues.tags} selected={csv(search.tags)} onChange={updateMulti("tags")} />
        <Chip label="Category" all={allValues.categories} selected={csv(search.category)} onChange={updateMulti("category")} />
        <Chip label="Tier" all={allValues.tiers.map(String)} selected={csv(search.tier)} onChange={updateMulti("tier")} />
        <Chip label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
        <Chip label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
        <Chip label="Size" all={allValues.sizeRanges} selected={csv(search.sizeRange)} onChange={updateMulti("sizeRange")} />
        <Chip label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
        <Chip label="Temp" all={allValues.temperatures.map(String)} selected={csv(search.temperature)} onChange={updateMulti("temperature")} />
      </div>

      <div className="filter-row">
        <label>Group by{" "}
          <select value={search.groupBy ?? "model"} onChange={(e) => setSearch({ groupBy: e.target.value as GroupBy })}>
            <option value="model">model · runtime · quant</option>
            <option value="modelOnly">model</option>
            <option value="tag">tag</option>
            <option value="category">category</option>
            <option value="prompt">prompt/scenario</option>
            <option value="runtime">runtime</option>
            <option value="family">family</option>
          </select>
        </label>

        <label>Sort by{" "}
          <select value={currentSort.field} onChange={(e) =>
            setSearch({ sort: sortString({ ...currentSort, field: e.target.value as Sort["field"] }) })
          }>
            <option value="meanScore">mean score</option>
            <option value="passRate">pass rate</option>
            <option value="generation_tps">gen tps</option>
            <option value="peak_memory_gb">peak mem</option>
            <option value="wall_time_sec">wall time</option>
            <option value="name">name</option>
            <option value="tier">tier</option>
          </select>
        </label>
        <button onClick={() =>
          setSearch({ sort: sortString({ ...currentSort, dir: currentSort.dir === "asc" ? "desc" : "asc" }) })
        }>
          {currentSort.dir === "asc" ? "↑" : "↓"}
        </button>

        <div className="preset-menu">
          <select value={search.preset ?? ""} onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const body = presets[name];
            if (!body) return;
            const parsed = Object.fromEntries(new URLSearchParams(body));
            navigate({ to: "/", search: { ...parsed, preset: name } as never });
          }}>
            <option value="">— preset —</option>
            {Object.keys(presets).sort().map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button onClick={() => {
            const name = prompt("Save current filters as preset:");
            if (!name) return;
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(search)) {
              if (k === "preset" || k === "model") continue;
              if (v !== undefined && v !== "") params.set(k, String(v));
            }
            upsertPreset(name, params.toString());
            setSearch({ preset: name });
          }}>Save as…</button>
          {search.preset && (
            <>
              <button onClick={() => {
                const name = prompt("Rename preset:", search.preset);
                if (!name || name === search.preset) return;
                renamePreset(search.preset!, name);
                setSearch({ preset: name });
              }}>Rename</button>
              <button onClick={() => {
                if (!confirm(`Delete preset "${search.preset}"?`)) return;
                deletePreset(search.preset!);
                setSearch({ preset: undefined });
              }}>Delete</button>
            </>
          )}
          <button onClick={() => {
            if (!confirm("Reset all presets to defaults?")) return;
            resetPresets();
            setSearch({ preset: undefined });
          }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

// Minimal multi-select chip — click the label to open a popover of checkboxes.
function Chip({ label, all, selected, onChange }: {
  label: string; all: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="chip">
      <button onClick={() => setOpen((o) => !o)}>
        {label}{selected.length > 0 ? ` · ${selected.length}` : ""}
      </button>
      {open && (
        <div className="chip-popover" onMouseLeave={() => setOpen(false)}>
          {all.map((v) => (
            <label key={v}>
              <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
              {v}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
