// Repeated-game / reputation helpers. Trust as revealed over rounds of play:
// tit-for-tat behaviour, cooperation rates, and total payoff in a repeated game.
// Moves are "C" (cooperate) or "D" (defect).

export type Move = "C" | "D";

const EPS = 1e-9;
const round = (x: number): number => Math.round(x * 1e6) / 1e6;

/** A 2×2 payoff matrix: payoff[myMove][theirMove] = [myPayoff, theirPayoff]. */
export type PayoffMatrix = Record<Move, Record<Move, [number, number]>>;

/** The classic prisoner's-dilemma payoffs (higher = better). */
export const PRISONERS: PayoffMatrix = {
  C: { C: [3, 3], D: [0, 5] },
  D: { C: [5, 0], D: [1, 1] },
};

/**
 * Tit-for-tat's move in the round AFTER `oppMoves`: cooperate in round 1, then
 * copy the opponent's most recent move.
 */
export function titForTatNext(oppMoves: Move[], first: Move = "C"): Move {
  return oppMoves.length === 0 ? first : (oppMoves[oppMoves.length - 1] as Move);
}

export function cooperationCount(moves: Move[]): number {
  return moves.filter((m) => m === "C").length;
}

export interface PlayerRounds {
  name: string;
  moves: Move[];
}

export interface Ranked {
  answer: string;
  ranking: { name: string; value: number }[];
  tie: boolean;
}

/** Who cooperated most often across their rounds? (ties flagged) */
export function mostCooperative(players: PlayerRounds[]): Ranked {
  const ranking = players
    .map((p) => ({ name: p.name, value: cooperationCount(p.moves) }))
    .sort((a, b) => b.value - a.value);
  const top = ranking[0]?.value ?? 0;
  return { answer: ranking[0]?.name ?? "", ranking, tie: ranking.filter((r) => r.value === top).length > 1 };
}

/** Total payoff to each player over a repeated game (rounds = shorter sequence). */
export function repeatedPayoff(
  a: PlayerRounds,
  b: PlayerRounds,
  matrix: PayoffMatrix = PRISONERS,
): { a: number; b: number; winner: string; tie: boolean } {
  let pa = 0;
  let pb = 0;
  const n = Math.min(a.moves.length, b.moves.length);
  for (let i = 0; i < n; i++) {
    const [x, y] = matrix[a.moves[i] as Move][b.moves[i] as Move];
    pa += x;
    pb += y;
  }
  return { a: pa, b: pb, winner: pa >= pb ? a.name : b.name, tie: pa === pb };
}

// ── Folk-theorem cooperation threshold, grim trigger (scenario 2) ────────────────
// Symmetric stage prisoner's dilemma with payoffs T>R>P>S read off a PayoffMatrix:
//   R = mutual cooperation, P = mutual defection, T = temptation (defect vs C),
//   S = sucker (cooperate vs D). Under grim trigger (cooperate until any defection,
//   then defect forever) cooperating forever pays R/(1−δ) and the best one-shot
//   deviation pays T + δ·P/(1−δ). Cooperation is a subgame-perfect equilibrium iff
//   δ ≥ δ* where  δ* = (T − R)/(T − P).  This is the infinite geometric-discounting
//   threshold via the one-shot-deviation principle — distinct from repeatedPayoff,
//   which sums a finite table.

/** Read (T,R,P,S) from a symmetric payoff matrix using my-payoff entries. */
function trps(matrix: PayoffMatrix): { T: number; R: number; P: number; S: number } {
  return {
    R: matrix.C.C[0],
    P: matrix.D.D[0],
    T: matrix.D.C[0],
    S: matrix.C.D[0],
  };
}

/** Critical discount factor δ* = (T−R)/(T−P), rounded, plus the payoffs. */
export function folkThreshold(matrix: PayoffMatrix): {
  deltaStar: number;
  T: number;
  R: number;
  P: number;
  S: number;
} {
  const { T, R, P, S } = trps(matrix);
  return { deltaStar: round((T - R) / (T - P)), T, R, P, S };
}

/** Is cooperation sustainable under grim trigger at discount factor δ? (δ ≥ δ*). */
export function sustainableAt(matrix: PayoffMatrix, delta: number): boolean {
  return delta >= folkThreshold(matrix).deltaStar - EPS;
}

/** One-shot temptation gain T − R (defecting this round, before any punishment). */
export function temptationGain(matrix: PayoffMatrix): number {
  const { T, R } = trps(matrix);
  return T - R;
}

/** Per-period payoff when both cooperate every round (= R). */
export function perPeriodCoop(matrix: PayoffMatrix): number {
  return trps(matrix).R;
}

// ── Moral hazard / incentive design, principal-agent (scenario 3) ────────────────
// Risk-neutral agent chooses effort e ∈ {low, high}; high costs c_H, low costs
// c_L < c_H. Output is good with probability p_H (high) or p_L < p_H (low). The
// contract pays w_b on a bad outcome and w_b + Δ on good (bonus Δ). Agent maximizes
// E[wage] − cost. Incentive-compatibility for high effort holds iff Δ ≥ Δ* where
//   Δ* = (c_H − c_L)/(p_H − p_L).
// Under a flat wage (Δ = 0) the agent always shirks: U(low) − U(high) = c_H − c_L > 0.

/** Does the agent shirk under a flat (outcome-independent) wage? (c_H > c_L). */
export function shirksUnderFlat(c_H: number, c_L: number): boolean {
  return c_H > c_L;
}

/** Minimum good-outcome bonus Δ* making high effort incentive-compatible, rounded. */
export function minBonusIC(p_H: number, p_L: number, c_H: number, c_L: number): number {
  return round((c_H - c_L) / (p_H - p_L));
}

/**
 * Principal's expected profit under high effort with the participation (IR)
 * constraint binding at reservation utility 0: E[wage|high] = c_H exactly, so
 * profit = p_H·V_good + (1−p_H)·V_bad − c_H.
 */
export function principalProfitAtIC(
  p_H: number,
  vGood: number,
  vBad: number,
  c_H: number,
): number {
  return round(p_H * vGood + (1 - p_H) * vBad - c_H);
}

/**
 * Is the principal better off paying Δ* for high effort than paying a flat wage
 * and accepting low effort? Compares IR-binding profits:
 *   high:  p_H·V_good + (1−p_H)·V_bad − c_H
 *   low :  p_L·V_good + (1−p_L)·V_bad − c_L
 */
export function worthIncentivizing(
  p_H: number,
  p_L: number,
  vGood: number,
  vBad: number,
  c_H: number,
  c_L: number,
): boolean {
  const profitHigh = p_H * vGood + (1 - p_H) * vBad - c_H;
  const profitLow = p_L * vGood + (1 - p_L) * vBad - c_L;
  return profitHigh > profitLow + EPS;
}
