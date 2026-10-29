import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import styles from "./FilterPanel.module.css";
import { csv, DEFAULT_TOP, parseTop, TOP_OPTIONS, type SearchState } from "../lib/filter-state";

interface Props {
  allValues: {
    families: string[];
    runtimes: string[];
    quants: string[];       // null already mapped to "—"
    temperatures: string[]; // String(temperature)
    challenges: string[];   // base challenge_id (version stripped/deduped)
  };
}

export function FilterPanel({ allValues }: Props) {
  const search = useSearch({ strict: false }) as SearchState;
  const navigate = useNavigate();

  const setSearch = useCallback((patch: Partial<SearchState>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch }) as never });
  }, [navigate]);

  const updateMulti = (key: keyof SearchState) => (values: string[]) =>
    setSearch({ [key]: values.length === 0 ? undefined : values.join(",") } as Partial<SearchState>);

  const topLabel = search.top === "all" ? "All" : String(parseTop(search.top));

  return (
    <div className={styles.panel}>
      <PillRow
        label="Top"
        all={TOP_OPTIONS}
        selected={[search.top === "all" ? "All" : String(parseTop(search.top))]}
        onChange={(v) => {
          // Single-select: the newly clicked pill; 30 (default) is left out of the URL.
          const next = v.find((x) => x !== topLabel);
          setSearch({ top: next === undefined || next === String(DEFAULT_TOP) ? undefined : next.toLowerCase() });
        }}
      />
      <PillRow label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
      <PillRow label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
      <PillRow label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
      <PillRow label="Temp" all={allValues.temperatures} selected={csv(search.temperature)} onChange={updateMulti("temperature")} />
      <PillRow label="Challenge" all={allValues.challenges} selected={csv(search.challenge)} onChange={updateMulti("challenge")} twoCol />
    </div>
  );
}

function PillRow({ label, all, selected, onChange, twoCol = false }: {
  label: string; all: string[]; selected: string[]; onChange: (v: string[]) => void; twoCol?: boolean;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className={styles.pillRow}>
      <span className={styles.pillLabel}>{label}</span>
      <div className={`${styles.pillGroup}${twoCol ? ` ${styles.pillGroupTwoCol}` : ""}`}>
        {all.map((v) => {
          const active = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              className={styles.pill}
              data-active={active}
              aria-pressed={active}
              onClick={() => toggle(v)}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
