import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import styles from "./FilterPanel.module.css";
import { csv, type SearchState } from "../lib/filter-state";

interface Props {
  allValues: {
    families: string[];
    runtimes: string[];
    quants: string[];       // null already mapped to "—"
    temperatures: string[]; // String(temperature)
    challenges: string[];   // `${challenge_id}@${challenge_version}`
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

  return (
    <div className={styles.panel}>
      <div className={styles.chipRow}>
        <Chip label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
        <Chip label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
        <Chip label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
        <Chip label="Temperature" all={allValues.temperatures} selected={csv(search.temperature)} onChange={updateMulti("temperature")} />
        <Chip label="Challenge" all={allValues.challenges} selected={csv(search.challenge)} onChange={updateMulti("challenge")} />
      </div>
    </div>
  );
}

function Chip({ label, all, selected, onChange }: {
  label: string; all: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className={styles.chip}>
      <button type="button" onClick={() => setOpen((o) => !o)}>
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
