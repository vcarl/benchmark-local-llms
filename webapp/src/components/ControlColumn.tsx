import { Link } from "@tanstack/react-router";
import styles from "./ControlColumn.module.css";
import {
  altEntry,
  setChipName,
  type IndexEntry,
  indexCounts,
  releaseGroups,
  releaseHeading,
  shortDigest,
} from "../lib/snapshots";
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
  presetsFor,
  type ViewState,
} from "../lib/view-state";

interface Props {
  view: ViewState;
  defaultSet: string;
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
  sub: "Contributor",
};
const SORT_LABEL: Record<SortKey, string> = {
  score: "pass rate",
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

/** The filters' summary line: a non-default item scope or challenge subset, then the row funnel. */
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
  datasets: IndexEntry[];
  onChange: (v: ViewState) => void;
}) {
  const alt = altEntry(datasets);
  const draftSet = alt?.dataset;
  const active = activePreset(view, defaultSet, draftSet);
  return (
    <div className={styles.chips} role="toolbar" aria-label="Presets">
      {presetsFor(draftSet).map((p) => (
        <button
          type="button"
          key={p.id}
          className={styles.preset}
          aria-pressed={active?.id === p.id}
          onClick={() => onChange(applyPreset(p, view, defaultSet, draftSet))}
        >
          {p.id === "alt" && alt !== undefined ? setChipName(alt) : p.name}
        </button>
      ))}
    </div>
  );
}

/** `alpha`, `legacy`, `unranked`: what a reader must know before comparing a dataset's numbers. */
export const datasetTags = (e: { release: string | null; legacy: boolean; ranked: boolean }): string[] => [
  ...(e.legacy && e.release === "0" ? ["alpha"] : []),
  ...(e.legacy ? ["legacy"] : []),
  ...(e.ranked ? [] : ["unranked"]),
];

/**
 * Dataset drawer: the datasets under their releases, one radio each with its
 * facts. Choosing a dataset
 * clears the challenge subset, which names its challenges.
 */
export function DatasetColumn({
  view,
  datasets,
  dataset,
  onChange,
}: {
  view: ViewState;
  datasets: IndexEntry[];
  /** The selected dataset's current snapshot. */
  dataset: IndexEntry;
  onChange: (v: ViewState) => void;
}) {
  return (
    <div className={styles.body} role="radiogroup" aria-label="Dataset">
      {releaseGroups(datasets).map(({ release, entries }) => (
        <section key={release ?? ""} className={styles.release}>
          {release === null ? (
            <span className={styles.releaseHeading}>{releaseHeading(release)}</span>
          ) : (
            <Link to="/release/$release" params={{ release }} className={styles.releaseHeading}>
              {releaseHeading(release)} · notes
            </Link>
          )}
          {entries.map((d) => {
            const chosen = d.dataset === dataset.dataset;
            return (
              <div key={d.dataset}>
                <label className={styles.option}>
                  <input
                    type="radio"
                    name="dataset"
                    checked={chosen}
                    onChange={() =>
                      onChange({ ...view, set: d.dataset, scope: { ...view.scope, challenges: [] } })
                    }
                  />
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>
                      {d.title}
                      {datasetTags(d).map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </span>
                    {d.span !== null && <span className={styles.optionMeta}>{d.span}</span>}
                    <span className={styles.optionMeta}>{indexCounts(d)}</span>
                    <span className={styles.optionMeta} title={d.digest}>
                      snapshot {shortDigest(d.digest)}…
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Filter drawer: scoring scope, row filters, grouping and sort. */
export function ControlColumn({ view, defaultSet, dataset, scoped, funnel, onChange }: Props) {
  const set = (edit: (v: ViewState) => void) => {
    const next = structuredClone(view);
    edit(next);
    onChange(next);
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className={styles.body}>
      <p className={styles.summary}>{columnTitle(view, funnel)}</p>
      <fieldset className={styles.scope}>
        <legend>Scoring</legend>
        <p className={styles.hint}>Changes every row's pass rate.</p>
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
          Showing {funnel.view ?? funnel.match} of {funnel.inScope} rows in scope
        </span>
        <button type="button" className={styles.reset} onClick={() => onChange({ ...view, ...defaultView(defaultSet) })}>
          Reset
        </button>
      </div>
    </div>
  );
}
