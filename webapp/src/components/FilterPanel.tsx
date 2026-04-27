import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import styles from "./FilterPanel.module.css";
import type { GroupBy } from "../lib/pipeline";
import { csv, type SearchState } from "../lib/filter-state";
import {
  loadPresets, upsertPreset, deletePreset, renamePreset,
  resetPresets, seedIfEmpty,
} from "../lib/presets";

interface Props {
  allValues: {
    tags: string[];
    categories: string[];
    runtimes: string[];
    families: string[];
    paramSizes: number[];                        // observed model param counts (B), sorted asc
    quants: string[];
    temperatures: number[];                      // observed temps, sorted asc
    durationDomain: { min: number; max: number }; // wall_time_sec range across data
  };
}

const formatDuration = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
};

// Helper to clamp a number into [lo, hi].
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export function FilterPanel({ allValues }: Props) {
  const search = useSearch({ strict: false }) as SearchState;
  const navigate = useNavigate();
  const [presetName, setPresetName] = useState(search.preset ?? "");

  useEffect(() => { seedIfEmpty(); }, []);
  useEffect(() => { setPresetName(search.preset ?? ""); }, [search.preset]);
  // presetName is read by the menu's controlled select via search.preset; keep
  // the local state for future inline rename UI without re-introducing a stale
  // controlled input. Suppress unused-warning below by referencing it.
  void presetName;

  const setSearch = useCallback((patch: Partial<SearchState>) => {
    navigate({ to: "/", search: (prev) => ({ ...prev, ...patch }) as never });
  }, [navigate]);

  const updateMulti = (key: keyof SearchState) => (values: string[]) =>
    setSearch({ [key]: values.length === 0 ? undefined : values.join(",") } as Partial<SearchState>);

  const presets = loadPresets();

  // Param-count slider domain — observed sizes only.
  const paramMin = allValues.paramSizes[0] ?? 0;
  const paramMax = allValues.paramSizes[allValues.paramSizes.length - 1] ?? paramMin;
  const curParamMin = search.paramMin !== undefined ? Number(search.paramMin) : paramMin;
  const curParamMax = search.paramMax !== undefined ? Number(search.paramMax) : paramMax;

  // Duration — wall_time_sec range slider over the observed domain.
  const durMin = allValues.durationDomain.min;
  const durMax = allValues.durationDomain.max;
  const curDurMin = search.durationMin !== undefined ? Number(search.durationMin) : durMin;
  const curDurMax = search.durationMax !== undefined ? Number(search.durationMax) : durMax;

  // Temperature — discrete observed values; slider snaps to them.
  const temps = allValues.temperatures;
  const tMin = temps[0] ?? 0;
  const tMax = temps[temps.length - 1] ?? tMin;
  const curTempMin = search.tempMin !== undefined ? Number(search.tempMin) : tMin;
  const curTempMax = search.tempMax !== undefined ? Number(search.tempMax) : tMax;

  // Snap a continuous slider value to the nearest observed discrete value.
  const snapTemp = (v: number): number => {
    if (temps.length === 0) return v;
    let best = temps[0]!;
    let bestDist = Math.abs(v - best);
    for (const t of temps) {
      const d = Math.abs(v - t);
      if (d < bestDist) { best = t; bestDist = d; }
    }
    return best;
  };

  // Slider step for temperatures: smallest gap between adjacent observed temps,
  // or 0.1 fallback. Keeps the thumb fluid without jumping past the next stop.
  const tempStep = (() => {
    if (temps.length < 2) return 0.1;
    let g = Infinity;
    for (let i = 1; i < temps.length; i++) {
      g = Math.min(g, temps[i]! - temps[i - 1]!);
    }
    return g > 0 && Number.isFinite(g) ? g : 0.1;
  })();

  // Apply a range patch; if the chosen [min,max] equals the full domain, drop
  // the URL keys so it doesn't pollute the URL with default values.
  const setRange = (
    minKey: keyof SearchState,
    maxKey: keyof SearchState,
    min: number, max: number,
    domainMin: number, domainMax: number,
  ) => {
    const isFull = min <= domainMin && max >= domainMax;
    setSearch({
      [minKey]: isFull ? undefined : String(min),
      [maxKey]: isFull ? undefined : String(max),
    } as Partial<SearchState>);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.topStrip}>
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

        <div className={styles.presetMenu}>
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
          {search.preset !== undefined && search.preset !== "" && (
            <>
              <button onClick={() => {
                const name = prompt("Rename preset:", search.preset);
                if (name === null || name === "" || name === search.preset) return;
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

      <div className={styles.chipRow}>
        <Chip label="Tags" all={allValues.tags} selected={csv(search.tags)} onChange={updateMulti("tags")} />
        <Chip label="Category" all={allValues.categories} selected={csv(search.category)} onChange={updateMulti("category")} />
        <Chip label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
        <Chip label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
        <Chip label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
      </div>

      <div className={styles.sliderGrid}>
        <RangeSlider
          label="Parameters"
          unit="B"
          domainMin={paramMin}
          domainMax={paramMax}
          step={1}
          curMin={clamp(curParamMin, paramMin, paramMax)}
          curMax={clamp(curParamMax, paramMin, paramMax)}
          onChange={(min, max) => setRange("paramMin", "paramMax", min, max, paramMin, paramMax)}
          isActive={search.paramMin !== undefined || search.paramMax !== undefined}
          onReset={() => setSearch({ paramMin: undefined, paramMax: undefined })}
        />

        <RangeSlider
          label="Duration"
          unit=""
          domainMin={durMin}
          domainMax={durMax}
          step={1}
          curMin={clamp(curDurMin, durMin, durMax)}
          curMax={clamp(curDurMax, durMin, durMax)}
          formatValue={formatDuration}
          onChange={(min, max) => setRange("durationMin", "durationMax", min, max, durMin, durMax)}
          isActive={search.durationMin !== undefined || search.durationMax !== undefined}
          onReset={() => setSearch({ durationMin: undefined, durationMax: undefined })}
        />

        <RangeSlider
          label="Temperature"
          unit=""
          domainMin={tMin}
          domainMax={tMax}
          step={tempStep}
          curMin={clamp(curTempMin, tMin, tMax)}
          curMax={clamp(curTempMax, tMin, tMax)}
          formatValue={(v) => v.toFixed(2)}
          snap={snapTemp}
          onChange={(min, max) => setRange("tempMin", "tempMax", min, max, tMin, tMax)}
          isActive={search.tempMin !== undefined || search.tempMax !== undefined}
          onReset={() => setSearch({ tempMin: undefined, tempMax: undefined })}
        />
      </div>
    </div>
  );
}

// Dual-thumb range slider implemented with two overlaid native range inputs.
// Both thumbs share the same track; we enforce min <= max in the change handler.
function RangeSlider({
  label, unit, domainMin, domainMax, step, curMin, curMax,
  formatValue, snap, onChange, isActive, onReset,
}: {
  label: string;
  unit: string;
  domainMin: number;
  domainMax: number;
  step: number;
  curMin: number;
  curMax: number;
  formatValue?: (v: number) => string;
  snap?: (v: number) => number;
  onChange: (min: number, max: number) => void;
  isActive: boolean;
  onReset: () => void;
}) {
  const fmt = formatValue ?? ((v: number) => String(v));
  if (!(domainMax > domainMin)) {
    return (
      <div className={styles.sliderGroup}>
        <div className={styles.sliderLabel}>
          <strong>{label}</strong>
          <span className={styles.sliderValue}>{fmt(domainMin)}{unit}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderLabel}>
        <strong>{label}</strong>
        <span className={styles.sliderValue}>
          {fmt(curMin)}{unit} — {fmt(curMax)}{unit}
          {isActive && (
            <>
              {" "}
              <button type="button" className={styles.resetButton} onClick={onReset}>reset</button>
            </>
          )}
        </span>
      </div>
      <div className={styles.dualRange}>
        <input
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={curMin}
          onChange={(e) => {
            const raw = Number(e.target.value);
            const v = snap ? snap(raw) : raw;
            onChange(Math.min(v, curMax), curMax);
          }}
          aria-label={`${label} minimum`}
        />
        <input
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={curMax}
          onChange={(e) => {
            const raw = Number(e.target.value);
            const v = snap ? snap(raw) : raw;
            onChange(curMin, Math.max(v, curMin));
          }}
          aria-label={`${label} maximum`}
        />
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
    <div className={styles.chip}>
      <button onClick={() => setOpen((o) => !o)}>
        {label}{selected.length > 0 ? ` · ${selected.length}` : ""}
      </button>
      {open && (
        <div className={styles.chipPopover} onMouseLeave={() => setOpen(false)}>
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
