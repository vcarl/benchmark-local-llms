// Trust & alignment from a history of ACTIONS (not declared relationships). WE
// author a chronological record of what characters did — promises kept or
// broken, and positions taken on shared subjects — and the helpers derive:
//   • trust:     can a character be relied on? (their track record of keeping word)
//   • alignment: how aligned are two characters? (do their revealed positions track?)
// Everything is exact: counts over the log, so the ground truth is defensible.

export interface Commitment {
  actor: string;
  /** Did they honour it? */
  kept: boolean;
  /** What the commitment was about (prose colour). */
  about: string;
}

export interface Stance {
  actor: string;
  /** A shared subject characters can agree or disagree on (an issue, a faction…). */
  subject: string;
  side: "for" | "against";
}

export interface History {
  characters: string[];
  /** In authored order = chronological. */
  commitments: Commitment[];
  stances: Stance[];
}

const EPS = 1e-9;
const round = (x: number): number => Math.round(x * 1e6) / 1e6;

// ── trust ─────────────────────────────────────────────────────────────────────

export interface Reliability {
  actor: string;
  kept: number;
  broke: number;
  /** kept / (kept + broke), in [0, 1]; 0 when there is no track record. */
  score: number;
}

export function reliability(history: History, actor: string): Reliability {
  let kept = 0;
  let broke = 0;
  for (const c of history.commitments) {
    if (c.actor !== actor) continue;
    if (c.kept) kept++;
    else broke++;
  }
  const total = kept + broke;
  return { actor, kept, broke, score: total === 0 ? 0 : round(kept / total) };
}

/** Can this character be trusted? True when they kept more than they broke. */
export function trusted(history: History, actor: string, threshold = 0.5): boolean {
  const r = reliability(history, actor);
  return r.kept + r.broke > 0 && r.score > threshold;
}

export interface Ranked {
  answer: string;
  ranking: { name: string; score: number }[];
  tie: boolean;
}

export function mostTrustworthy(history: History): Ranked {
  const ranking = history.characters
    .map((c) => ({ name: c, score: reliability(history, c).score }))
    .sort((p, q) => q.score - p.score);
  const top = ranking[0]?.score ?? 0;
  const tie = ranking.filter((r) => Math.abs(r.score - top) <= EPS).length > 1;
  return { answer: ranking[0]?.name ?? "", ranking, tie };
}

// ── alignment ─────────────────────────────────────────────────────────────────

export interface Alignment {
  a: string;
  b: string;
  agree: number;
  disagree: number;
  shared: number;
  /** (agree − disagree) / shared, in [-1, 1]; 0 when they share no subjects. */
  score: number;
}

export function alignment(history: History, a: string, b: string): Alignment {
  const sideOf = (actor: string, subject: string): "for" | "against" | null =>
    history.stances.find((s) => s.actor === actor && s.subject === subject)?.side ?? null;
  const subjects = [...new Set(history.stances.map((s) => s.subject))];
  let agree = 0;
  let disagree = 0;
  for (const subj of subjects) {
    const sa = sideOf(a, subj);
    const sb = sideOf(b, subj);
    if (sa === null || sb === null) continue;
    if (sa === sb) agree++;
    else disagree++;
  }
  const shared = agree + disagree;
  return { a, b, agree, disagree, shared, score: shared === 0 ? 0 : round((agree - disagree) / shared) };
}

/** Which character is `x` most aligned with, by revealed positions? */
export function mostAligned(history: History, x: string): Ranked {
  const ranking = history.characters
    .filter((c) => c !== x)
    .map((c) => ({ name: c, score: alignment(history, x, c).score }))
    .sort((p, q) => q.score - p.score);
  const top = ranking[0]?.score ?? 0;
  const tie = ranking.filter((r) => Math.abs(r.score - top) <= EPS).length > 1;
  return { answer: ranking[0]?.name ?? "", ranking, tie };
}

// ── prose ─────────────────────────────────────────────────────────────────────

export function describe(history: History): string {
  const record = history.commitments.map((c) =>
    c.kept
      ? `- ${c.actor} promised ${c.about}, and kept their word.`
      : `- ${c.actor} promised ${c.about}, then went back on it.`,
  );
  const positions = history.stances.map(
    (s) => `- ${s.actor} came out ${s.side === "for" ? "in favour of" : "against"} ${s.subject}.`,
  );
  return ["Track record:", ...record, "", "Public positions:", ...positions].join("\n");
}
