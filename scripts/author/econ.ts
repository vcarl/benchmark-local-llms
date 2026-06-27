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

/**
 * Fully-mixed Nash equilibrium of a 2×2 game (strategies indexed 0/1), via the
 * indifference principle: each player mixes to make the OTHER player indifferent.
 * With row payoffs `r[i][j] = payoffs[i][j][0]` and col payoffs
 * `c[i][j] = payoffs[i][j][1]`:
 *   p = P(row plays strategy 0) = (c11 − c10) / (c00 − c10 − c01 + c11)
 *   q = P(col plays strategy 0) = (r11 − r01) / (r00 − r01 − r10 + r11)
 *   value to row = q·r00 + (1 − q)·r01
 * Returns `null` (no interior fully-mixed equilibrium) when the game is not 2×2,
 * when either denominator is 0, or when `p`/`q` falls outside the open interval
 * (0,1) — the latter signalling a (weakly) dominant strategy. Callers screening
 * for a genuinely-mixed scenario should also require `pureNash(game).length===0`.
 */
export function mixedNash2x2(game: Game): { p: number; q: number; value: number } | null {
  if (game.rowStrategies.length !== 2 || game.colStrategies.length !== 2) return null;
  const r = (i: number, j: number): number => game.payoffs[i][j][0];
  const c = (i: number, j: number): number => game.payoffs[i][j][1];
  const denomP = c(0, 0) - c(1, 0) - c(0, 1) + c(1, 1);
  const denomQ = r(0, 0) - r(0, 1) - r(1, 0) + r(1, 1);
  if (denomP === 0 || denomQ === 0) return null;
  const p = (c(1, 1) - c(1, 0)) / denomP;
  const q = (r(1, 1) - r(0, 1)) / denomQ;
  if (!(p > 0 && p < 1 && q > 0 && q < 1)) return null;
  const value = q * r(0, 0) + (1 - q) * r(0, 1);
  return { p, q, value };
}

/**
 * A finite perfect-information game tree: a decision node owned by `player`
 * (a 0-based index into each leaf's payoff vector) with parallel `actions` and
 * `children`, or a leaf carrying a `payoffs` vector indexed by player.
 */
export type GameNode =
  | { player: number; actions: string[]; children: GameNode[] }
  | { payoffs: number[] };

function isLeaf(node: GameNode): node is { payoffs: number[] } {
  return "payoffs" in node;
}

/**
 * Subgame-perfect equilibrium by backward induction: fold the tree from the
 * leaves, and at each decision node pick the child that maximises the mover's
 * own payoff component. Returns the chosen action sequence (`path`), the action
 * taken at the root (`firstAction`, "" for a bare leaf), and the equilibrium
 * `payoffs` vector. Assumes strictly-unique optima at every decision node (see
 * {@link uniqueOptima}); on a tie it deterministically keeps the first-listed
 * maximiser, but the scored ground truth should never depend on that tie-break.
 */
export function backwardInduct(node: GameNode): {
  path: string[];
  firstAction: string;
  payoffs: number[];
} {
  if (isLeaf(node)) return { path: [], firstAction: "", payoffs: node.payoffs };
  const k = node.player;
  let bestIdx = 0;
  let best = backwardInduct(node.children[0]);
  for (let i = 1; i < node.children.length; i++) {
    const r = backwardInduct(node.children[i]);
    if (r.payoffs[k] > best.payoffs[k]) {
      best = r;
      bestIdx = i;
    }
  }
  const action = node.actions[bestIdx];
  return { path: [action, ...best.path], firstAction: action, payoffs: best.payoffs };
}

/**
 * True iff every decision node has a STRICTLY unique optimum for its mover (no
 * two children tie on the mover's payoff component). A false result means the
 * tree admits multiple subgame-perfect equilibria, so its scored tokens are not
 * deterministic — the author script screens scenarios with this.
 */
export function uniqueOptima(node: GameNode): boolean {
  if (isLeaf(node)) return true;
  const k = node.player;
  const vals = node.children.map((child) => backwardInduct(child).payoffs[k]);
  const max = Math.max(...vals);
  if (vals.filter((v) => v === max).length !== 1) return false;
  return node.children.every((child) => uniqueOptima(child));
}

/**
 * Cournot (simultaneous-quantity) equilibrium for `n` firms under linear inverse
 * demand `P = a − b·Q` with constant per-firm marginal `costs[i]`. Each firm's
 * naive interior quantity is `q_i = (a − (n+1)·c_i + Σc) / (b·(n+1))`, the
 * solution of the simultaneous reaction functions; for an asymmetric duopoly
 * this reduces to `q1 = (a − 2c1 + c2)/(3b)`, `q2 = (a − 2c2 + c1)/(3b)`. Returns
 * the per-firm `quantities`, the market `price`, and per-firm `profits`
 * `(P − c_i)·q_i`. A firm so high-cost that its `q_i ≤ 0` indicates a CORNER
 * solution (it should exit and the rest re-solve as a smaller oligopoly); the
 * author script screens costs so every quantity is strictly positive.
 */
export function cournot(params: { a: number; b: number; costs: number[] }): {
  quantities: number[];
  price: number;
  profits: number[];
} {
  const { a, b, costs } = params;
  const n = costs.length;
  const sum = costs.reduce((s, ci) => s + ci, 0);
  const denom = b * (n + 1);
  const quantities = costs.map((ci) => (a - (n + 1) * ci + sum) / denom);
  const Q = quantities.reduce((s, qi) => s + qi, 0);
  const price = a - b * Q;
  const profits = quantities.map((qi, i) => (price - costs[i]) * qi);
  return { quantities, price, profits };
}

/**
 * Per-unit tax incidence and deadweight loss for linear demand `Qd = α − β·P`
 * and linear supply `Qs = γ + δ·P` (β, δ > 0) with a per-unit tax `t`. Incidence
 * is independent of which side is taxed. Convention: slopes are given directly;
 * if a variant supplies elasticities instead, anchor them at the no-tax (P*,Q*)
 * to recover β,δ first (elasticity varies along a linear curve). Returns:
 *   Pstar/Qstar  no-tax equilibrium  P*=(α−γ)/(β+δ),  Q*=α−β·P*
 *   buyerShare/sellerShare  δ/(β+δ)  and  β/(β+δ)  (the more inelastic side bears more)
 *   Pb/Ps  prices paid by buyers / received by sellers (Pb − Ps = t)
 *   deltaQ  quantity drop βδt/(β+δ);  Qtax = Q* − deltaQ
 *   dwl  Harberger triangle ½·t²·βδ/(β+δ);  revenue = t·Qtax
 */
export function taxIncidence(params: {
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  t: number;
}): {
  Pstar: number;
  Qstar: number;
  Pb: number;
  Ps: number;
  buyerShare: number;
  sellerShare: number;
  deltaQ: number;
  Qtax: number;
  dwl: number;
  revenue: number;
} {
  const { alpha, beta, gamma, delta, t } = params;
  const Pstar = (alpha - gamma) / (beta + delta);
  const Qstar = alpha - beta * Pstar;
  const buyerShare = delta / (beta + delta);
  const sellerShare = beta / (beta + delta);
  const Pb = Pstar + t * buyerShare;
  const Ps = Pstar - t * sellerShare;
  const deltaQ = (beta * delta * t) / (beta + delta);
  const Qtax = Qstar - deltaQ;
  const dwl = (0.5 * t * t * beta * delta) / (beta + delta);
  const revenue = t * Qtax;
  return { Pstar, Qstar, Pb, Ps, buyerShare, sellerShare, deltaQ, Qtax, dwl, revenue };
}

/**
 * Single-price monopoly under linear inverse demand `P = a − b·Q` (so
 * `MR = a − 2b·Q`), with marginal cost either constant `{c}` or rising linear
 * `{e,f}` (MC = e + f·Q). The continuous analogue of the discrete
 * {@link profitMaxQuantity}. Sets MR = MC:
 *   constant MC:  Q = (a−c)/(2b),       P = (a+c)/2,   profit = (P−c)·Q
 *   rising  MC:   Q = (a−e)/(2b+f),     P = a−b·Q,     profit = P·Q − (e·Q + ½f·Q²)
 * Also reports the competitive benchmark where price equals marginal cost
 * (`Qc`, `Pc`) and the monopoly deadweight loss `dwl = ½·(Qc−Q)·(P − MC(Q))` —
 * the welfare triangle between demand and MC over [Q, Qc]. Assumes `a > c` (or
 * `a > e`); otherwise the firm would shut down.
 */
export function monopolyLinear(params: {
  a: number;
  b: number;
  mc: { c: number } | { e: number; f: number };
}): { Q: number; P: number; profit: number; Qc: number; Pc: number; dwl: number } {
  const { a, b, mc } = params;
  if ("c" in mc) {
    const c = mc.c;
    const Q = (a - c) / (2 * b);
    const P = a - b * Q;
    const profit = (P - c) * Q;
    const Qc = (a - c) / b;
    const Pc = c;
    const dwl = 0.5 * (Qc - Q) * (P - c);
    return { Q, P, profit, Qc, Pc, dwl };
  }
  const { e, f } = mc;
  const Q = (a - e) / (2 * b + f);
  const P = a - b * Q;
  const profit = P * Q - (e * Q + 0.5 * f * Q * Q);
  const Qc = (a - e) / (b + f);
  const Pc = a - b * Qc;
  const dwl = 0.5 * (Qc - Q) * (P - (e + f * Q));
  return { Q, P, profit, Qc, Pc, dwl };
}
