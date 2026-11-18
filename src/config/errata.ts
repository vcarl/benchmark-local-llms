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
 *
 * Versions: a release is `0` (pre-release) or CalVer `YYYY.M`; errata are its
 * sub-releases `<release>.<n>`, n = 1, 2, … in file order, so eval
 * `<release>.<n>` is the release baseline plus errata 1..n.
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

/**
 * Whether the change waits on a release: `none` (complete now), `next-release`
 * (prompt text or the item set changes at the next release), `released`.
 */
export const ReleaseStatus = Schema.Literal("none", "next-release", "released");

export const Erratum = Schema.Struct({
  id: Schema.String,
  date: Schema.String,
  kind: ErratumKind,
  /** `challengeId/itemName` of every affected item. */
  items: Schema.Array(Schema.String),
  /** Public, plain-language: what was wrong and what changed. */
  description: Schema.String,
  /** Internal technical detail; never emitted to the report. */
  notes: Schema.optional(Schema.String),
  /** True when the erratum changed how stored outputs score. */
  scorerChange: Schema.Boolean,
  releaseStatus: ReleaseStatus,
  /** Release the change shipped in; set iff `releaseStatus` is `released`. */
  releasedIn: Schema.optional(Schema.String),
});
export type Erratum = typeof Erratum.Type;

export const ErrataFile = Schema.Struct({ errata: Schema.Array(Erratum) });

export const ItemIdentity = Schema.Struct({ promptHash: Schema.String, scorerHash: Schema.String });
export type ItemIdentity = typeof ItemIdentity.Type;

export const ReleaseBaseline = Schema.Struct({
  /** Release version: `0` (pre-release) or `YYYY.M`. */
  release: Schema.String,
  /** Optional human label for the snapshot (the pre-release names its commit). */
  label: Schema.optional(Schema.String),
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

const RELEASE = String.raw`0|\d{4}\.(?:[1-9]|1[0-2])`;
const RELEASE_RE = new RegExp(`^(?:${RELEASE})$`);
const ID_RE = new RegExp(`^(${RELEASE})\\.([1-9]\\d*)$`);

/** `<release>.<n>` → its parts; undefined for any other shape. */
export const parseErratumId = (id: string): { release: string; n: number } | undefined => {
  const m = ID_RE.exec(id);
  return m?.[1] === undefined ? undefined : { release: m[1], n: Number(m[2]) };
};

const compareReleases = (a: string, b: string): number => {
  const [ay = 0, am = 0] = a.split(".").map(Number);
  const [by = 0, bm = 0] = b.split(".").map(Number);
  return ay - by || am - bm;
};

/**
 * Id problems: every id is `<release>.<n>` for the baseline release or an
 * earlier one, numbered 1, 2, … within its release in file order.
 */
export const errataIdProblems = (
  baselineRelease: string,
  errata: ReadonlyArray<Erratum>,
): string[] => {
  if (!RELEASE_RE.test(baselineRelease)) {
    return [`baseline release ${baselineRelease} is not 0 or YYYY.M`];
  }
  const problems: string[] = [];
  const count = new Map<string, number>();
  for (const { id } of errata) {
    const p = parseErratumId(id);
    if (p === undefined) {
      problems.push(`${id}: id is not <release>.<n>`);
      continue;
    }
    if (compareReleases(p.release, baselineRelease) > 0) {
      problems.push(
        `${id}: release ${p.release} is newer than the baseline release ${baselineRelease}`,
      );
      continue;
    }
    const n = (count.get(p.release) ?? 0) + 1;
    count.set(p.release, n);
    if (p.n !== n) problems.push(`${id}: expected id ${p.release}.${n}`);
  }
  return problems;
};

/** The eval version: `<release>.<n>` for n errata on the baseline release, or the release alone. */
export const evalVersion = (baselineRelease: string, errata: ReadonlyArray<Erratum>): string => {
  const n = errata.filter((e) => parseErratumId(e.id)?.release === baselineRelease).length;
  return n === 0 ? baselineRelease : `${baselineRelease}.${n}`;
};

/** Why `next` cannot be cut after `prior` (the current baseline release), or undefined. */
export const releaseArgProblem = (next: string, prior: string | undefined): string | undefined => {
  if (next === "0" || !RELEASE_RE.test(next)) return `release ${next} is not YYYY.M (e.g. 2027.1)`;
  if (prior !== undefined && compareReleases(next, prior) <= 0) {
    return `release ${next} does not follow ${prior}`;
  }
  return undefined;
};

/**
 * Every item that differs from `baseline` without an erratum to account for it,
 * plus misplaced `releasedIn` fields, as human-readable lines. Empty means fully covered.
 *
 *   scorer changed → an erratum naming the item with `scorerChange: true`
 *   prompt changed → an erratum naming the item with `releaseStatus` other than `none`
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
  for (const e of errata) {
    if ((e.releaseStatus === "released") !== (e.releasedIn !== undefined)) {
      gaps.push(`${e.id}: releasedIn is set iff releaseStatus is released`);
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
      if (b.promptHash !== c.promptHash && !covered(k, (e) => e.releaseStatus !== "none")) {
        gaps.push(`${k}: prompt changed without an erratum (releaseStatus)`);
      }
    }
  }
  return gaps.sort();
};
