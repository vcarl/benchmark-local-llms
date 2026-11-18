import styles from "./ControlColumn.module.css";
import { hardwareLabel, type RowsDataset } from "../lib/rows";
import type { GroupBy, ItemScope, ScopedRow, SortKey } from "../lib/model";
import {
  activePreset,
  applyPreset,
  defaultView,
  type Facet,
  FACETS,
  facetCounts,
  type Funnel,
  funnelText,
  MEM_CAPS,
  PILOT_SET,
  PRESETS,
  type ViewState,
} from "../lib/view-state";

interface Props {
  view: ViewState;
  defaultSet: string;
  datasets: RowsDataset[];
  dataset: RowsDataset;
  /** The set's rows in scope, before filters (facet counts). */
  scoped: ScopedRow[];
  funnel: Funnel;
  onChange: (v: ViewState) => void;
}

const FACET_LABEL: Record<Facet, string> = {
  runtime: "Runtime",
  quant: "Quant",
  family: "Family",
  hw: "Hardware",
  sub: "Submitter",
};
const SORT_LABEL: Record<SortKey, string> = {
  score: "score",
  efficiency: "efficiency",
  speed: "speed",
  memory: "memory",
  recent: "recent",
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            className={styles.seg}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The column's title, identical collapsed and expanded (only rotated): a
 * non-default item scope or challenge subset, then the row funnel.
 */
export const columnTitle = (v: ViewState, f: Funnel): string =>
  [
    ...(v.scope.items === "all" ? [] : [v.scope.items]),
    ...(v.scope.challenges.length === 0 ? [] : [`${v.scope.challenges.length} challenges`]),
    funnelText(f),
  ].join(" · ");

/** Quick-access presets: a chip row above the list, outside the column. */
export function PresetChips({
  view,
  defaultSet,
  datasets,
  onChange,
}: {
  view: ViewState;
  defaultSet: string;
  datasets: RowsDataset[];
  onChange: (v: ViewState) => void;
}) {
  const active = activePreset(view, defaultSet);
  const hasPilot = datasets.some((d) => d.dataset.label === PILOT_SET);
  return (
    <div className={styles.chips} role="toolbar" aria-label="Presets">
      {PRESETS.filter((p) => p.id !== "pilot" || hasPilot).map((p) => (
        <button
          type="button"
          key={p.id}
          className={styles.preset}
          aria-pressed={active?.id === p.id}
          onClick={() => onChange(applyPreset(p, view, defaultSet))}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function ControlColumn({ view, defaultSet, datasets, dataset, scoped, funnel, onChange }: Props) {
  const set = (edit: (v: ViewState) => void) => {
    const next = structuredClone(view);
    edit(next);
    onChange(next);
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const title = columnTitle(view, funnel);

  return (
    <aside className={styles.column} data-open={view.open} aria-label="Filters">
      <button
        type="button"
        className={styles.head}
        onClick={() => set((v) => (v.open = !v.open))}
        aria-expanded={view.open}
        title={view.open ? "Hide filters" : "Show filters"}
      >
        <span className={styles.icon} aria-hidden="true">
          ⧩
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.close} aria-hidden={!view.open}>
          <span className={styles.closeWide}>«</span>
          <span className={styles.closeNarrow}>Done</span>
        </span>
      </button>
      {view.open && (
        <div className={styles.body}>
      <fieldset className={styles.scope}>
        <legend>Scoring</legend>
        <p className={styles.hint}>Changes every row's score.</p>
        {datasets.length > 1 && (
          <Segmented
            label="Set"
            value={view.set}
            options={datasets.map((d) => ({ value: d.dataset.label, label: d.dataset.label }))}
            onPick={(s) =>
              set((v) => {
                v.set = s;
                v.scope.challenges = [];
              })
            }
          />
        )}
        {dataset.challengeSet.some((c) => Object.keys(c.scopes).length > 0) && (
          <Segmented<ItemScope>
            label="Items"
            value={view.scope.items}
            options={[
              { value: "all", label: "all" },
              { value: "core", label: "core" },
              { value: "stretch", label: "stretch" },
            ]}
            onPick={(i) => set((v) => (v.scope.items = i))}
          />
        )}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Challenges</span>
          <div className={styles.checks}>
            {dataset.challengeSet.map((c) => {
              const n = view.scope.items === "all" ? c.items : (c.scopes[view.scope.items] ?? 0);
              return (
                <label key={c.id} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={view.scope.challenges.includes(c.id)}
                    onChange={() => set((v) => (v.scope.challenges = toggle(v.scope.challenges, c.id)))}
                  />
                  <span>{c.id}</span>
                  <span className={styles.count}>{n}</span>
                </label>
              );
            })}
          </div>
        </div>
      </fieldset>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Filter rows</div>
        {FACETS.map((f) => {
          const counts = facetCounts(scoped, view.filters, f);
          if (counts.size < 2 && view.filters[f].length === 0) return null;
          return (
            <div key={f} className={styles.field}>
              <span className={styles.fieldLabel}>{FACET_LABEL[f]}</span>
              <div className={styles.checks}>
                {[...counts].map(([value, n]) => (
                  <label key={value} className={styles.check} data-empty={n === 0}>
                    <input
                      type="checkbox"
                      checked={view.filters[f].includes(value)}
                      onChange={() => set((v) => (v.filters[f] = toggle(v.filters[f], value)))}
                    />
                    <span>{f === "hw" ? hardwareLabel(dataset, value) : value}</span>
                    <span className={styles.count}>{n}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={view.filters.complete}
            onChange={() => set((v) => (v.filters.complete = !v.filters.complete))}
          />
          <span>Complete only</span>
        </label>
        <Segmented
          label="Fits in"
          value={String(view.filters.mem ?? "any")}
          options={[{ value: "any", label: "any" }, ...MEM_CAPS.map((m) => ({ value: String(m), label: `${m} GB` }))]}
          onPick={(m) => set((v) => (v.filters.mem = m === "any" ? null : Number(m)))}
        />
      </div>

      <div className={styles.section}>
        <Segmented<GroupBy>
          label="Group"
          value={view.group}
          options={[
            { value: "model", label: "model" },
            { value: "none", label: "none" },
          ]}
          onPick={(g) => set((v) => (v.group = g))}
        />
        <Segmented<SortKey>
          label="Sort"
          value={view.sort}
          options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))}
          onPick={(k) => set((v) => (v.sort = k))}
        />
      </div>

      <div className={styles.footer}>
        <span>
          Showing {funnel.match} of {funnel.inScope} rows in scope
        </span>
        <button type="button" className={styles.reset} onClick={() => onChange({ ...view, ...defaultView(defaultSet), open: true })}>
          Reset
        </button>
      </div>
        </div>
      )}
    </aside>
  );
}
