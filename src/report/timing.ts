/**
 * Evaluation timing (docs/EVAL-TIMING.md): per (item, bundle), whether the
 * weights the bundle loaded were published before the item was.
 *
 * - An item is published at the `committedAt` of the earliest frozen release
 *   whose `release.json` holds its prompt digest.
 * - Weights are published at the hub revision's time the run recorded in the
 *   bundle header's `env.weightsSource`.
 *
 * A label is disclosure: it never changes a score or a rank. It sits beside
 * the rows, never in them, so an archival dataset's `rowsDigest` holds.
 */
import type { ResolvedChallenge } from "../config/challenges.js";
import { promptContent } from "../config/challenges.js";
import type { Row } from "../legacy/rows.js";
import type { WeightsSource } from "../store/bundle.js";
import { sha256Hex } from "../store/digest.js";

export const TIMING_LABELS = ["predates", "exposable", "unknown"] as const;
export type TimingLabel = (typeof TIMING_LABELS)[number];

/**
 * By UTC day: `predates` when the weights were published before the item,
 * `exposable` after, `unknown` on the same day or without a weights date.
 */
export const timingLabel = (itemAt: string, weightsAt: string | null | undefined): TimingLabel => {
  if (weightsAt === null || weightsAt === undefined) return "unknown";
  const [w, i] = [weightsAt.slice(0, 10), itemAt.slice(0, 10)];
  return w < i ? "predates" : w > i ? "exposable" : "unknown";
};

/** A snapshot's timing block. */
export interface Timing {
  /** `<challenge>/<item>` → its publication date; an item in no frozen release is absent and unlabelled. */
  readonly items: Record<string, string>;
  /** rowId → scored challenge → the weights its bundle loaded and its items per label (a row's share sums these). */
  readonly rows: Record<
    string,
    Record<
      string,
      { readonly weights: WeightsSource | null; readonly labels: Record<TimingLabel, number> }
    >
  >;
}

/** Whether a dataset's release carries timing labels: only a frozen `YYYY.N` release does, never `0` (alpha) or `draft`. */
export const hasTiming = (release: string): boolean => release !== "0" && release !== "draft";

/**
 * Prompt digest → `committedAt` of the earliest frozen release holding it.
 * Release `0` and `draft` are not frozen releases here.
 */
export const frozenAt = (
  releases: ReadonlyArray<{
    readonly release: string;
    readonly committedAt?: string | undefined;
    readonly items: Readonly<Record<string, { readonly prompt: string }>>;
  }>,
): Map<string, string> => {
  const at = new Map<string, string>();
  for (const r of releases) {
    if (!hasTiming(r.release) || r.committedAt === undefined) continue;
    for (const { prompt } of Object.values(r.items)) {
      const prior = at.get(prompt);
      if (prior === undefined || r.committedAt < prior) at.set(prompt, r.committedAt);
    }
  }
  return at;
};

/**
 * The timing block of `rows` over the challenge set. A cell's items are
 * labelled against the one bundle it counts (`sourceAttempts`); `weightsOf`
 * maps a bundle digest to its header's `env.weightsSource`.
 */
export const timingOf = (
  rows: ReadonlyArray<Row>,
  challenges: ReadonlyArray<ResolvedChallenge>,
  frozen: ReadonlyMap<string, string>,
  weightsOf: ReadonlyMap<string, WeightsSource>,
): Timing => {
  const items: Record<string, string> = {};
  for (const c of challenges)
    for (const i of c.items) {
      const at = frozen.get(sha256Hex(promptContent(i.prompt)));
      if (at !== undefined) items[`${c.id}/${i.itemId}`] = at;
    }
  const counts: Timing["rows"] = {};
  for (const row of rows) {
    const byChallenge: Timing["rows"][string] = {};
    for (const c of challenges) {
      const cell = row.cells[c.id];
      if (cell?.status !== "scored") continue;
      // A cell never pools bundles; were it to, no single weights date applies.
      const [only, ...more] = cell.sourceAttempts;
      const weights = only === undefined || more.length > 0 ? null : (weightsOf.get(only) ?? null);
      const labels = { predates: 0, exposable: 0, unknown: 0 };
      for (const i of c.items) {
        const at = items[`${c.id}/${i.itemId}`];
        if (at !== undefined) labels[timingLabel(at, weights?.publishedAt)]++;
      }
      byChallenge[c.id] = { weights, labels };
    }
    counts[row.rowId] = byChallenge;
  }
  return { items, rows: counts };
};
