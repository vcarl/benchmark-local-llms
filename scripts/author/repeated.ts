// Repeated-game / reputation helpers. Trust as revealed over rounds of play:
// tit-for-tat behaviour, cooperation rates, and total payoff in a repeated game.
// Moves are "C" (cooperate) or "D" (defect).

export type Move = "C" | "D";

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
