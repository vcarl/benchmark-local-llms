/**
 * Errata registry and release file.
 *
 * Each release directory `releases/<release>/` holds `release.json`, the release
 * file (every item's prompt and scorer digest as committed), and `errata.yaml`,
 * which documents every change to a committed item: a wrong answer key, a
 * scorer patch, an ambiguous prompt, a retired or added item. A scorer-changing
 * erratum records the scorer digest it put in effect per item (`scorers`).
 * {@link coverageGaps} is the rule `npm test` enforces per release: every item
 * that differs from the release file is named by an erratum of the matching
 * shape, and the latest recorded scorer digest of an item is its current one.
 *
 * Versions: a release is `0` (alpha) or `YYYY.N` (N ≥ 1); errata are numbered
 * `<release>.<n>`, n = 1, 2, … in file order, and eval version `<release>.<n>`
 * is the release plus errata 1..n (`2027.1.0` before any erratum). Release 0's
 * digests are the legacy 12-hex `promptHash`/`scorerHash`; every later
 * release's are full SHA-256 (src/release/).
 */
import { Schema } from "effect";
import { legacyItemIdentity } from "../legacy/identity.js";
import { Scope } from "../schema/challenge.js";
import type { ResolvedChallenge } from "./challenges.js";
import { compareReleases } from "./release-order.js";

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
  /**
   * The scorer digest in effect after this erratum, per `challengeId/itemName`;
   * required when `scorerChange` is true.
   */
  scorers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  /**
   * Measured effect on the archive the report scores. `lines`: recorded
   * execution lines whose score differs between the eval version before this
   * erratum and after it; `configs`: distinct `configHash`es among them. For a
   * `retired` erratum, the lines it dropped from scoring and their configs.
   */
  scoresChanged: Schema.Struct({ lines: Schema.NonNegativeInt, configs: Schema.NonNegativeInt }),
  releaseStatus: ReleaseStatus,
  /** Release the change shipped in; set iff `releaseStatus` is `released`. */
  releasedIn: Schema.optional(Schema.String),
});
export type Erratum = typeof Erratum.Type;

export const ErrataFile = Schema.Struct({ errata: Schema.Array(Erratum) });

/** An item's identity in a release file: its digests, plus its report metadata. */
export const ReleaseItem = Schema.Struct({
  prompt: Schema.String,
  scorer: Schema.String,
  scope: Scope,
  family: Schema.String,
});
export type ReleaseItem = typeof ReleaseItem.Type;

export const ReleaseFile = Schema.Struct({
  /** `0` (alpha), `YYYY.N`, or `draft`. */
  release: Schema.String,
  /** Optional human label (the alpha challenge set names its commit). */
  label: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
  /** Last eval version: errata beyond it are rejected. */
  closed: Schema.optional(Schema.String),
  /** SHA-256 over the sorted `[key, prompt, scorer]` triples (src/release/). */
  commitment: Schema.optional(Schema.String),
  committedAt: Schema.optional(Schema.String),
  /** Keyed by `challengeId/itemName`. */
  items: Schema.Record({ key: Schema.String, value: ReleaseItem }),
});
export type ReleaseFile = typeof ReleaseFile.Type;

/** The digests the coverage check compares. */
export type ItemDigests = Pick<ReleaseItem, "prompt" | "scorer">;

/** Release-0 (legacy 12-hex) identity of resolved challenges, keyed `challengeId/itemName`, keys sorted. */
export const snapshotItems = (
  challenges: ReadonlyArray<ResolvedChallenge>,
): Record<string, ReleaseItem> =>
  Object.fromEntries(
    challenges
      .flatMap((c) => {
        const ids = legacyItemIdentity(c).items;
        return c.items.map(
          (i, k) =>
            [
              `${c.id}/${i.itemId}`,
              {
                prompt: ids[k]?.promptHash as string,
                scorer: ids[k]?.scorerHash as string,
                scope: i.scope,
                family: i.family,
              },
            ] as const,
        );
      })
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

const RELEASE = String.raw`0|\d{4}\.[1-9]\d*`;
const RELEASE_RE = new RegExp(`^(?:${RELEASE})$`);
const ID_RE = new RegExp(`^(${RELEASE})\\.([1-9]\\d*)$`);
const EVAL_RE = new RegExp(`^(${RELEASE})\\.(0|[1-9]\\d*)$`);

/** `<release>.<n>` → its parts; undefined for any other shape. */
export const parseErratumId = (id: string): { release: string; n: number } | undefined => {
  const m = ID_RE.exec(id);
  return m?.[1] === undefined ? undefined : { release: m[1], n: Number(m[2]) };
};

/** Eval version `<release>.<n>` (n ≥ 0) → its parts; undefined for any other shape. */
export const parseEvalVersion = (v: string): { release: string; n: number } | undefined => {
  const m = EVAL_RE.exec(v);
  return m?.[1] === undefined ? undefined : { release: m[1], n: Number(m[2]) };
};

/**
 * Id problems of a release's errata file: every id is `<release>.<n>` for this
 * release, numbered 1, 2, … in file order, and none is after `closed`.
 */
export const errataIdProblems = (
  release: string,
  errata: ReadonlyArray<Erratum>,
  closed?: string,
): string[] => {
  if (!RELEASE_RE.test(release)) return [`release ${release} is not 0 or YYYY.N`];
  const last = closed === undefined ? undefined : parseEvalVersion(closed);
  if (closed !== undefined && last?.release !== release) {
    return [`closed ${closed} is not an eval version of release ${release}`];
  }
  const problems: string[] = [];
  for (const [i, { id }] of errata.entries()) {
    const p = parseErratumId(id);
    if (p === undefined) problems.push(`${id}: id is not <release>.<n>`);
    else if (p.release !== release) problems.push(`${id}: not an erratum of release ${release}`);
    else if (p.n !== i + 1) problems.push(`${id}: expected id ${release}.${i + 1}`);
    else if (last !== undefined && p.n > last.n) {
      problems.push(`${id}: release ${release} closed at ${closed}`);
    }
  }
  return problems;
};

/** The eval version: `<release>.<n>` for the release's n errata (`2027.1.0`, `0.7`). */
export const evalVersion = (release: string, errata: ReadonlyArray<Erratum>): string =>
  `${release}.${errata.filter((e) => parseErratumId(e.id)?.release === release).length}`;

/** Why `next` cannot be cut after `prior` (the latest release), or undefined. */
export const releaseArgProblem = (next: string, prior: string | undefined): string | undefined => {
  if (next === "0" || !RELEASE_RE.test(next)) return `release ${next} is not YYYY.N (e.g. 2027.1)`;
  if (prior !== undefined && compareReleases(next, prior) <= 0) {
    return `release ${next} does not follow ${prior}`;
  }
  return undefined;
};

/**
 * Every item that differs from `baseline` without an erratum to account for it,
 * misplaced `releasedIn` fields, and recorded scorer digests out of step with
 * `current`, as human-readable lines. Empty means fully covered.
 *
 *   scorer changed → an erratum naming the item with `scorerChange: true`
 *   prompt changed → an erratum naming the item with `releaseStatus` other than `none`
 *   item removed   → an erratum naming the item of kind `retired`
 *   item added     → an erratum naming the item of kind `added`
 *   `scorerChange: true` → `scorers` recorded; an item's latest recorded scorer
 *                          digest equals its current one
 */
export const coverageGaps = (
  baseline: Readonly<Record<string, ItemDigests>>,
  current: Readonly<Record<string, ItemDigests>>,
  errata: ReadonlyArray<Erratum>,
): string[] => {
  const gaps: string[] = [];
  const byItem = new Map<string, Erratum[]>();
  const recorded = new Map<string, { id: string; scorer: string }>();
  for (const e of errata) {
    if ((e.releaseStatus === "released") !== (e.releasedIn !== undefined)) {
      gaps.push(`${e.id}: releasedIn is set iff releaseStatus is released`);
    }
    if (e.scorerChange && e.scorers === undefined) gaps.push(`${e.id}: scorers not recorded`);
    for (const [k, scorer] of Object.entries(e.scorers ?? {}))
      recorded.set(k, { id: e.id, scorer });
    // An item id matching nothing is not checked: errata outlive the items they
    // name (a retired item leaves both snapshots at the next release), and a
    // misspelled id leaves its real item uncovered, which is reported below.
    for (const k of e.items) byItem.set(k, [...(byItem.get(k) ?? []), e]);
  }
  for (const [k, r] of recorded) {
    const c = current[k];
    if (c !== undefined && c.scorer !== r.scorer) {
      gaps.push(`${k}: scorer is ${c.scorer}, erratum ${r.id} recorded ${r.scorer}`);
    }
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
      if (b.scorer !== c.scorer && !covered(k, (e) => e.scorerChange)) {
        gaps.push(`${k}: scorer changed without an erratum (scorerChange: true)`);
      }
      if (b.prompt !== c.prompt && !covered(k, (e) => e.releaseStatus !== "none")) {
        gaps.push(`${k}: prompt changed without an erratum (releaseStatus)`);
      }
    }
  }
  return gaps.sort();
};
