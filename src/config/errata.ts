/**
 * Errata registry and release baseline.
 *
 * `errata.yaml` (repo root) documents every change to a released item: a wrong
 * answer key, a scorer patch, an ambiguous prompt, a retired or added item.
 * `release-baseline.json` (repo root) snapshots each item's `promptHash` and
 * `scorerHash` at the last prompt release. {@link coverageGaps} is the rule
 * `npm test` enforces: every item that differs from the baseline is named by an
 * erratum of the matching shape. `scripts/release-baseline.ts` refreshes the
 * baseline at release time.
 */
import { Schema } from "effect";
import { scorerHash } from "../archive/content-store.js";
import type { ResolvedChallenge } from "./challenges.js";

export const ErratumKind = Schema.Literal(
  "answer-key",
  "scorer",
  "prompt-ambiguity",
  "retired",
  "added",
);

/** Whether a prompt-text fix is owed, waiting for the next release, or shipped. */
export const PromptFix = Schema.Literal("none", "pending-next-release", "fixed-in-release");

export const Erratum = Schema.Struct({
  id: Schema.String,
  date: Schema.String,
  kind: ErratumKind,
  /** `challengeId/itemName` of every affected item. */
  items: Schema.Array(Schema.String),
  description: Schema.String,
  /** True when the erratum changed how stored outputs score. */
  scorerChange: Schema.Boolean,
  promptFix: PromptFix,
  /** Release label the prompt fix shipped in; set iff `promptFix` is `fixed-in-release`. */
  release: Schema.optional(Schema.String),
});
export type Erratum = typeof Erratum.Type;

export const ErrataFile = Schema.Struct({ errata: Schema.Array(Erratum) });

export const ItemIdentity = Schema.Struct({ promptHash: Schema.String, scorerHash: Schema.String });
export type ItemIdentity = typeof ItemIdentity.Type;

export const ReleaseBaseline = Schema.Struct({
  release: Schema.String,
  date: Schema.String,
  /** Keyed by `challengeId/itemName`. */
  items: Schema.Record({ key: Schema.String, value: ItemIdentity }),
});
export type ReleaseBaseline = typeof ReleaseBaseline.Type;

/** Per-item identity of resolved challenges, keyed `challengeId/itemName`, keys sorted. */
export const snapshotItems = (
  challenges: ReadonlyArray<ResolvedChallenge>,
): Record<string, ItemIdentity> =>
  Object.fromEntries(
    challenges
      .flatMap((c) =>
        c.items.map(
          (i) =>
            [
              `${c.id}/${i.itemId}`,
              { promptHash: i.promptHash, scorerHash: scorerHash(i.scorer) },
            ] as const,
        ),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/**
 * Every item that differs from `baseline` without an erratum to account for it,
 * plus duplicate ids and misplaced release labels, as human-readable lines. Empty means fully covered.
 *
 *   scorer changed → an erratum naming the item with `scorerChange: true`
 *   prompt changed → an erratum naming the item with `promptFix` other than `none`
 *   item removed   → an erratum naming the item of kind `retired`
 *   item added     → an erratum naming the item of kind `added`
 */
export const coverageGaps = (
  baseline: Readonly<Record<string, ItemIdentity>>,
  current: Readonly<Record<string, ItemIdentity>>,
  errata: ReadonlyArray<Erratum>,
): string[] => {
  const gaps: string[] = [];
  const byItem = new Map<string, Erratum[]>();
  const ids = new Set<string>();
  for (const e of errata) {
    if (ids.has(e.id)) gaps.push(`duplicate erratum id ${e.id}`);
    ids.add(e.id);
    if ((e.promptFix === "fixed-in-release") !== (e.release !== undefined)) {
      gaps.push(`${e.id}: release is set iff promptFix is fixed-in-release`);
    }
    // An item id matching nothing is not checked: errata outlive the items they
    // name (a retired item leaves both snapshots at the next release), and a
    // misspelled id leaves its real item uncovered, which is reported below.
    for (const k of e.items) byItem.set(k, [...(byItem.get(k) ?? []), e]);
  }
  const covered = (k: string, ok: (e: Erratum) => boolean) => (byItem.get(k) ?? []).some(ok);
  for (const k of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    const b = baseline[k];
    const c = current[k];
    if (b === undefined) {
      if (!covered(k, (e) => e.kind === "added")) gaps.push(`${k}: added without an erratum`);
    } else if (c === undefined) {
      if (!covered(k, (e) => e.kind === "retired")) gaps.push(`${k}: removed without an erratum`);
    } else {
      if (b.scorerHash !== c.scorerHash && !covered(k, (e) => e.scorerChange)) {
        gaps.push(`${k}: scorer changed without an erratum (scorerChange: true)`);
      }
      if (b.promptHash !== c.promptHash && !covered(k, (e) => e.promptFix !== "none")) {
        gaps.push(`${k}: prompt changed without an erratum (promptFix)`);
      }
    }
  }
  return gaps.sort();
};
