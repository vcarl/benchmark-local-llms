// Economics / game-theory helpers. The piece that genuinely needs code is the
// normal-form game solver (dominant strategies + pure-strategy Nash equilibria —
// easy to get wrong by hand). Simpler econ facts (opportunity cost, comparative
// advantage, Vickrey bids) are arithmetic and are computed inline where authored.

export interface Game {
  rowName: string;
  colName: string;
  rowStrategies: string[];
  colStrategies: string[];
  /** payoffs[i][j] = [rowPayoff, colPayoff] for (rowStrategy i, colStrategy j). */
  payoffs: [number, number][][];
}

/** A strictly dominant strategy for `player`, or null if none exists. */
export function dominantStrategy(game: Game, player: "row" | "col"): string | null {
  if (player === "row") {
    const m = game.rowStrategies.length;
    for (let i = 0; i < m; i++) {
      let dominant = true;
      for (let k = 0; k < m && dominant; k++) {
        if (k === i) continue;
        for (let j = 0; j < game.colStrategies.length; j++) {
          if (!(game.payoffs[i][j][0] > game.payoffs[k][j][0])) {
            dominant = false;
            break;
          }
        }
      }
      if (dominant) return game.rowStrategies[i];
    }
    return null;
  }
  const n = game.colStrategies.length;
  for (let j = 0; j < n; j++) {
    let dominant = true;
    for (let k = 0; k < n && dominant; k++) {
      if (k === j) continue;
      for (let i = 0; i < game.rowStrategies.length; i++) {
        if (!(game.payoffs[i][j][1] > game.payoffs[i][k][1])) {
          dominant = false;
          break;
        }
      }
    }
    if (dominant) return game.colStrategies[j];
  }
  return null;
}

/** All pure-strategy Nash equilibria (best response includes ties). */
export function pureNash(game: Game): { row: string; col: string }[] {
  const m = game.rowStrategies.length;
  const n = game.colStrategies.length;
  const out: { row: string; col: string }[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const bestRow = Math.max(...Array.from({ length: m }, (_, k) => game.payoffs[k][j][0]));
      const bestCol = Math.max(...Array.from({ length: n }, (_, k) => game.payoffs[i][k][1]));
      if (game.payoffs[i][j][0] >= bestRow && game.payoffs[i][j][1] >= bestCol) {
        out.push({ row: game.rowStrategies[i], col: game.colStrategies[j] });
      }
    }
  }
  return out;
}

/** Render a 2-strategy-per-player game as a readable payoff table for a prompt. */
export function describeGame(game: Game): string {
  const head = `(payoffs shown as ${game.rowName}, ${game.colName})`;
  const rows = game.rowStrategies.map((rs, i) => {
    const cells = game.colStrategies.map(
      (cs, j) => `${cs}: (${game.payoffs[i][j][0]}, ${game.payoffs[i][j][1]})`,
    );
    return `- If ${game.rowName} plays ${rs} — ${cells.join("; ")}`;
  });
  return [head, ...rows].join("\n");
}

/**
 * Opportunity cost of one unit of `good` for a producer who can make either
 * `goodPerDay` of it or `otherPerDay` of the other good — i.e. units of the
 * other good forgone per unit of `good`.
 */
export function opportunityCost(goodPerDay: number, otherPerDay: number): number {
  return otherPerDay / goodPerDay;
}

/**
 * Absolute price elasticity of demand by the simple percentage-change method
 * (changes taken relative to the initial values).
 */
export function priceElasticity(p1: number, q1: number, p2: number, q2: number): number {
  const pctQ = (q2 - q1) / q1;
  const pctP = (p2 - p1) / p1;
  return Math.abs(pctQ / pctP);
}

/**
 * Profit-maximising quantity given a constant marginal revenue and a list of
 * (increasing) marginal costs per unit: produce every unit whose marginal cost
 * does not exceed marginal revenue.
 */
export function profitMaxQuantity(mr: number, marginalCosts: number[]): number {
  let q = 0;
  for (const mc of marginalCosts) {
    if (mc <= mr) q++;
    else break;
  }
  return q;
}
