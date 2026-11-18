/**
 * Pure item-quality statistics over completed attempts. No I/O: the `audit`
 * command loads archives and feeds {@link latestPerConfig} output in here.
 *
 * A sample passes when its score is exactly 1 (same rule as `aggregate`); a
 * config's observation of an item is the pass fraction over its samples.
 */
import { currentItems, type LoadedAttempt } from "../report/load-attempts.js";
import { groupSamples, passFraction } from "../schema/attempt.js";

export interface Obs {
  readonly challengeId: string;
  readonly itemId: string;
  readonly configId: string;
  /** Pass fraction over the config's samples of the item (0/1 with one sample). */
  readonly pass: number;
  readonly samples: number;
  /** Outputs of the failed samples. */
  readonly wrong: ReadonlyArray<string>;
}

export interface WrongAnswer {
  readonly answer: string;
  readonly count: number;
}

export interface ItemAudit {
  readonly challengeId: string;
  readonly itemId: string;
  readonly n: number;
  /** Mean over configs of each config's pass fraction on the item. */
  readonly p: number;
  /** Sample lines across configs (= n when no config resampled the item). */
  readonly samples: number;
  /** pass^k: fraction of resampled configs (≥2 samples) that passed every sample; null when none. */
  readonly passAllK: number | null;
  /** Bernoulli variance p(1-p); 0.25 = maximally uncertain. */
  readonly spread: number;
  /** Point-biserial r between item pass and the config's pass rate on all OTHER items; null if undefined. */
  readonly discrimination: number | null;
  readonly modalWrong: ReadonlyArray<WrongAnswer>;
  readonly flags: ReadonlyArray<"suspect-key" | "saturated" | "edge" | "zero-failure">;
}

export interface AuditOptions {
  readonly minN: number;
  readonly suspectP: number;
  readonly saturatedP: number;
  /** Top-K items by discrimination get the `edge` flag. */
  readonly edgeTop: number;
  readonly modalTop: number;
}

export const defaultAuditOptions: AuditOptions = {
  minN: 8,
  suspectP: 0.05,
  saturatedP: 0.95,
  edgeTop: 20,
  modalTop: 3,
};

/** Completed attempts only; the newest (by startedAt) per (configId, challengeId). */
export const latestPerConfig = (attempts: ReadonlyArray<LoadedAttempt>): LoadedAttempt[] => {
  const best = new Map<string, LoadedAttempt>();
  for (const a of attempts) {
    if (a.manifest.finishedAt === null || a.manifest.interrupted) continue;
    const key = `${a.manifest.configId}\u0000${a.manifest.challengeId}`;
    const cur = best.get(key);
    if (cur === undefined || a.manifest.startedAt > cur.manifest.startedAt) best.set(key, a);
  }
  return [...best.values()];
};

export const toObservations = (attempts: ReadonlyArray<LoadedAttempt>): Obs[] =>
  attempts.flatMap((a) =>
    groupSamples(currentItems(a.manifest, a.items)).map((xs) => ({
      challengeId: a.manifest.challengeId,
      itemId: (xs[0] as (typeof xs)[number]).itemId,
      configId: a.manifest.configId,
      pass: passFraction(xs),
      samples: xs.length,
      wrong: xs.filter((x) => x.score !== 1).map((x) => x.output),
    })),
  );

/** Last number in the text (commas and `$` stripped), else the trimmed, lowercased first 40 chars (`(empty)` for no output). */
export const normalizeAnswer = (output: string): string => {
  const nums = output.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/g);
  if (nums !== null) {
    const last = nums[nums.length - 1] as string;
    return last.includes(".") ? last.replace(/0+$/, "").replace(/\.$/, "") : last;
  }
  return output.trim().toLowerCase().slice(0, 40) || "(empty)";
};

export const modalWrong = (wrong: ReadonlyArray<string>, top: number): WrongAnswer[] => {
  const counts = new Map<string, number>();
  for (const w of wrong) {
    const k = normalizeAnswer(w);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([answer, count]) => ({ answer, count }))
    .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
    .slice(0, top);
};

/**
 * Pearson correlation of item pass (0/1, or a pass fraction for resampled
 * items) with a continuous score; null when either has no variance.
 */
export const pointBiserial = (
  pass: ReadonlyArray<boolean | number>,
  score: ReadonlyArray<number>,
): number | null => {
  const n = pass.length;
  if (n < 2) return null;
  const x = pass.map((b) => Number(b));
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = score.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (score[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
};

export const median = (xs: ReadonlyArray<number>): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export const auditItems = (
  obs: ReadonlyArray<Obs>,
  opts: AuditOptions = defaultAuditOptions,
): ItemAudit[] => {
  // Per-config totals, for the leave-one-out overall pass rate.
  const total = new Map<string, { pass: number; n: number }>();
  for (const o of obs) {
    const t = total.get(o.configId) ?? { pass: 0, n: 0 };
    t.n++;
    t.pass += o.pass;
    total.set(o.configId, t);
  }
  const overall = new Map([...total].map(([k, t]) => [k, t.pass / t.n]));
  const med = median([...overall.values()]);

  const byItem = new Map<string, Obs[]>();
  for (const o of obs) {
    const k = `${o.challengeId}\u0000${o.itemId}`;
    byItem.set(k, [...(byItem.get(k) ?? []), o]);
  }

  const rows = [...byItem.values()].map((rs): Omit<ItemAudit, "flags"> => {
    const n = rs.length;
    const p = rs.reduce((s, r) => s + r.pass, 0) / n;
    const rest = rs.map((r) => {
      const t = total.get(r.configId) as { pass: number; n: number };
      return t.n > 1 ? (t.pass - r.pass) / (t.n - 1) : 0;
    });
    const resampled = rs.filter((r) => r.samples > 1);
    return {
      challengeId: (rs[0] as Obs).challengeId,
      itemId: (rs[0] as Obs).itemId,
      n,
      p,
      samples: rs.reduce((s, r) => s + r.samples, 0),
      passAllK:
        resampled.length === 0
          ? null
          : resampled.filter((r) => r.pass === 1).length / resampled.length,
      spread: p * (1 - p),
      discrimination: pointBiserial(
        rs.map((r) => r.pass),
        rest,
      ),
      modalWrong: modalWrong(
        rs.flatMap((r) => r.wrong),
        opts.modalTop,
      ),
    };
  });

  // Edge = top-K by discrimination (then spread), among items with enough observations.
  const edgeKeys = new Set(
    rows
      .filter((r) => r.n >= opts.minN && r.discrimination !== null)
      .sort(byDiscrimination)
      .slice(0, opts.edgeTop)
      .map((r) => `${r.challengeId}\u0000${r.itemId}`),
  );

  return rows.map((r) => {
    const flags: ItemAudit["flags"][number][] = [];
    if (r.n >= opts.minN && r.p <= opts.suspectP) flags.push("suspect-key");
    const strong = (byItem.get(`${r.challengeId}\u0000${r.itemId}`) as Obs[]).filter(
      (o) => (overall.get(o.configId) as number) > med,
    );
    if (
      strong.length >= Math.min(opts.minN, 2) &&
      strong.reduce((s, o) => s + o.pass, 0) / strong.length >= opts.saturatedP
    )
      flags.push("saturated");
    if (edgeKeys.has(`${r.challengeId}\u0000${r.itemId}`)) flags.push("edge");
    if (r.p === 1) flags.push("zero-failure");
    return { ...r, flags };
  });
};

export const byDiscrimination = (
  a: Pick<ItemAudit, "discrimination" | "spread">,
  b: Pick<ItemAudit, "discrimination" | "spread">,
): number =>
  (b.discrimination ?? Number.NEGATIVE_INFINITY) - (a.discrimination ?? Number.NEGATIVE_INFINITY) ||
  b.spread - a.spread;
