// The report's data: `snapshots/index.json` lists every dataset, and a dataset's
// snapshot (`snapshots/<digest>.json`) is fetched when it is selected.
// URLs are document-relative so the deploy base path is honored.
import { useEffect, useState } from "react";
import { compareReleases } from "../../../src/config/release-order";
import type { RowsDataset } from "./rows";

export const INDEX_URL = "./snapshots/index.json";
export const snapshotUrl = (digest: string) => `./snapshots/${digest}.json`;
export const detailUrl = (id: string) => `./snapshots/details/${id}.json`;
export const promptsUrl = (digest: string) => `./snapshots/prompts/${digest}.json`;

export interface IndexEntry {
  dataset: string;
  title: string;
  release: string | null;
  evalVersion: string | null;
  ranked: boolean;
  legacy: boolean;
  /** The snapshot's sha256 (64 hex). */
  digest: string;
  rows: number;
  challenges: number;
  /** Execution span `YYYY-MM-DD – YYYY-MM-DD`. */
  span: string | null;
}

const isEntry = (e: unknown): e is IndexEntry => {
  const o = e as Record<string, unknown> | null;
  return (
    typeof o === "object" &&
    o !== null &&
    typeof o.dataset === "string" &&
    typeof o.title === "string" &&
    typeof o.digest === "string" &&
    typeof o.rows === "number" &&
    typeof o.challenges === "number"
  );
};

/** The index's entries in file order (the report orders them); null when malformed or empty. */
export const parseIndex = (raw: unknown): IndexEntry[] | null => {
  const list = (raw as { snapshots?: unknown } | null)?.snapshots;
  return Array.isArray(list) && list.length > 0 && list.every(isEntry) ? list : null;
};

// A label may repeat (snapshots kept from earlier builds); the report lists the
// newest eval version first, so a label's first entry is its current snapshot.

/** The current snapshot of the newest release's dataset (first in index order on a tie); the draft counts as newest. */
export const defaultEntry = (entries: IndexEntry[]): IndexEntry | undefined =>
  entries
    .filter((e, i) => entries.findIndex((f) => f.dataset === e.dataset) === i)
    .reduce<IndexEntry | undefined>((best, e) => (best === undefined || compareReleases(e.release, best.release) > 0 ? e : best), undefined);

/** The preset's other dataset: the newest one of another release than the default's. */
export const altEntry = (index: IndexEntry[]): IndexEntry | undefined => {
  const d = defaultEntry(index);
  return defaultEntry(index.filter((e) => e.release !== d?.release));
};

/** A dataset's short name for a preset chip: `Alpha set`, `Draft set`, `Release 2027.1`. */
export const setChipName = (e: IndexEntry): string =>
  e.release === "0" ? "Alpha set" : e.release === "draft" ? "Draft set" : `Release ${e.release ?? e.dataset}`;

/** The current snapshot labelled `label`, else the default dataset. */
export const entryFor = (index: IndexEntry[], label: string): IndexEntry | undefined =>
  index.find((e) => e.dataset === label) ?? defaultEntry(index);

/** Each release's datasets (their current snapshots), both in index order. */
export const releaseGroups = (index: IndexEntry[]): { release: string | null; entries: IndexEntry[] }[] => {
  const groups = new Map<string | null, IndexEntry[]>();
  const seen = new Set<string>();
  for (const e of index) {
    if (seen.has(e.dataset)) continue;
    seen.add(e.dataset);
    groups.set(e.release, [...(groups.get(e.release) ?? []), e]);
  }
  return [...groups].map(([release, entries]) => ({ release, entries }));
};

/** A release's heading: `Alpha challenge set · release 0`, `Pre-release (draft)`, `Release 2027.1`. */
export const releaseHeading = (release: string | null): string =>
  release === "0" ? "Alpha challenge set · release 0" : release === "draft" ? "Pre-release (draft)" : release === null ? "No release" : `Release ${release}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `109 rows · 10 challenges · eval 0.6`; the eval version only when present. */
export const indexCounts = (e: IndexEntry): string =>
  [plural(e.rows, "row"), plural(e.challenges, "challenge"), ...(e.evalVersion === null ? [] : [`eval ${e.evalVersion}`])].join(" · ");

/** The first 12 hex of a digest, for citing a snapshot. */
export const shortDigest = (digest: string): string => digest.slice(0, 12);

export type Loaded<T> = { status: "loading" } | { status: "error"; message: string } | { status: "loaded"; value: T };

// Fetched once per page load: a promise cache keyed by URL.
const fetched = new Map<string, Promise<unknown>>();
const fetchJson = (url: string): Promise<unknown> => {
  const hit = fetched.get(url);
  if (hit !== undefined) return hit;
  const p = fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${url}: HTTP ${res.status}`))));
  p.catch(() => fetched.delete(url)); // a failure may be retried
  fetched.set(url, p);
  return p;
};

const useFetched = <T>(url: string | undefined, parse: (raw: unknown) => T | null): Loaded<T> => {
  const [state, setState] = useState<{ url: string | undefined; result: Loaded<T> }>({ url, result: { status: "loading" } });
  // biome-ignore lint/correctness/useExhaustiveDependencies: parse is a module-level function per call site
  useEffect(() => {
    if (url === undefined) return;
    let cancelled = false;
    setState({ url, result: { status: "loading" } });
    fetchJson(url)
      .then((raw) => {
        const value = parse(raw);
        return value === null ? Promise.reject(new Error(`${url}: unexpected shape`)) : value;
      })
      .then(
        (value) => !cancelled && setState({ url, result: { status: "loaded", value } }),
        (e: unknown) => !cancelled && setState({ url, result: { status: "error", message: e instanceof Error ? e.message : String(e) } }),
      );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state.url === url ? state.result : { status: "loading" };
};

export const useIndex = (): Loaded<IndexEntry[]> => useFetched(INDEX_URL, parseIndex);

const parseSnapshot = (raw: unknown) => (typeof raw === "object" && raw !== null ? (raw as RowsDataset) : null);

export const useSnapshot = (entry: IndexEntry | undefined): Loaded<RowsDataset> =>
  useFetched(entry === undefined ? undefined : snapshotUrl(entry.digest), parseSnapshot);
