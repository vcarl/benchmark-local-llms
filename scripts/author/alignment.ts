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

// ── Bayesian trust calibration (scenario 1) ─────────────────────────────────────
// An actor is Honest (H) or Dishonest (D). Prior P(H)=π. A signal is "good" with
// probability s (sensitivity) when the actor is honest, and with probability 1−t
// when dishonest (t = specificity = P(bad | D)). Signals are conditionally
// independent. After g good and b bad signals (likelihood-ratio / diagnostic Bayes):
//   posterior_odds = (π/(1−π)) · (s/(1−t))^g · ((1−s)/t)^b
//   P(H | data)    = posterior_odds / (1 + posterior_odds)
// All arithmetic is exact in floating point, then round() to 6 dp. Boundary
// parameters (π, s, t ∈ {0,1}) are forbidden by the authoring instances.

/** Posterior odds P(H)/P(D) after g good and b bad signals (unrounded). */
export function posteriorOdds(pi: number, s: number, t: number, g: number, b: number): number {
  const priorOdds = pi / (1 - pi);
  const goodFactor = s / (1 - t);
  const badFactor = (1 - s) / t;
  return priorOdds * goodFactor ** g * badFactor ** b;
}

/** Posterior probability of honesty P(H | data), rounded to 6 dp. */
export function posteriorMean(pi: number, s: number, t: number, g: number, b: number): number {
  const odds = posteriorOdds(pi, s, t, g, b);
  return round(odds / (1 + odds));
}

/**
 * Minimum number of further consecutive GOOD signals (added to the history of g
 * good / b bad) for honesty to reach `target`. Bounded loop multiplying the
 * running odds by the good-factor s/(1−t); returns the smallest such count.
 */
export function signalsToReach(
  pi: number,
  s: number,
  t: number,
  g: number,
  b: number,
  target: number,
  cap = 1000,
): number {
  const goodFactor = s / (1 - t);
  let odds = posteriorOdds(pi, s, t, g, b);
  for (let n = 0; n <= cap; n++) {
    if (odds / (1 + odds) >= target - EPS) return n;
    odds *= goodFactor;
  }
  return cap;
}

// ── Decayed reputation with late reversal (scenario 5) ──────────────────────────
// A chronological feedback history of good/bad events, each with an integer age
// (0 = most recent). Flat reliability ignores timing; the recency-weighted score
// applies an exponential forgetting factor λ ∈ (0,1] by age, then a Beta(1,1)
// (Laplace) smoothed posterior mean:
//   P = Σ_good λ^age   N = Σ_bad λ^age   reputation = (P+1)/(P+N+2)  ∈ (0,1)

export interface RepEvent {
  /** Integer rounds-ago; 0 = most recent. */
  age: number;
  good: boolean;
}

export interface RepActor {
  name: string;
  events: RepEvent[];
}

/** Flat (undecayed) reliability good/(good+bad), rounded; 0 with no history. */
export function flatScore(actor: RepActor): number {
  let good = 0;
  let bad = 0;
  for (const e of actor.events) {
    if (e.good) good++;
    else bad++;
  }
  const total = good + bad;
  return total === 0 ? 0 : round(good / total);
}

/** Recency-weighted, Laplace-smoothed reputation (P+1)/(P+N+2), rounded. */
export function decayedScore(actor: RepActor, lambda: number): number {
  let p = 0;
  let n = 0;
  for (const e of actor.events) {
    const w = lambda ** e.age;
    if (e.good) p += w;
    else n += w;
  }
  return round((p + 1) / (p + n + 2));
}

/** Argmax actor by decayed reputation; ties flagged like mostTrustworthy. */
export function mostTrustworthyDecayed(actors: RepActor[], lambda: number): Ranked {
  const ranking = actors
    .map((a) => ({ name: a.name, score: decayedScore(a, lambda) }))
    .sort((p, q) => q.score - p.score);
  const top = ranking[0]?.score ?? 0;
  const tie = ranking.filter((r) => Math.abs(r.score - top) <= EPS).length > 1;
  return { answer: ranking[0]?.name ?? "", ranking, tie };
}

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
