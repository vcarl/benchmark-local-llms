// Closed-form and exact solvers for the stretch scenarios.

import { decayedScore, type RepActor } from "../alignment.js";
import { cournot } from "../econ.js";
import { amortize, waterfall } from "../financial.js";

/**
 * Stackelberg duopoly, inverse demand P = a − b·(q1 + q2), constant marginal
 * costs c1 (leader) and c2 (follower).
 *   Follower best response: q2(q1) = (a − c2 − b·q1)/(2b).
 *   Leader maximizes (a − b·q1 − b·q2(q1) − c1)·q1 = ((a − 2c1 + c2)/2 − (b/2)·q1)·q1
 *     → q1 = (a − 2c1 + c2)/(2b),  q2 = (a + 2c1 − 3c2)/(4b),  P = (a + 2c1 + c2)/4.
 * `cournotProfit1` is the leader's profit had both moved simultaneously
 * (econ.ts `cournot`), for the first-mover-advantage question.
 * Interior iff q2 > 0, i.e. a + 2c1 > 3c2; the author screens for that.
 */
export function stackelberg(p: { a: number; b: number; c1: number; c2: number }): {
  q1: number;
  q2: number;
  price: number;
  profit1: number;
  profit2: number;
  cournotProfit1: number;
} {
  const { a, b, c1, c2 } = p;
  const q1 = (a - 2 * c1 + c2) / (2 * b);
  const q2 = (a + 2 * c1 - 3 * c2) / (4 * b);
  const price = a - b * (q1 + q2);
  const cournotProfit1 = cournot({ a, b, costs: [c1, c2] }).profits[0] ?? Number.NaN;
  return { q1, q2, price, profit1: (price - c1) * q1, profit2: (price - c2) * q2, cournotProfit1 };
}

/**
 * Grim trigger in an infinitely repeated prisoner's dilemma (T > R > P) where a
 * defection is only detected after `lag` periods: a defection in period t is
 * seen at the end of period t + lag, and mutual defection (P forever) starts at
 * t + lag + 1. The deviator keeps defecting while undetected, earning T for
 * lag + 1 periods. Cooperation is sustainable iff
 *   R/(1−δ) ≥ T·(1 − δ^(L+1))/(1−δ) + P·δ^(L+1)/(1−δ)
 *   ⇔ δ^(L+1) ≥ (T − R)/(T − P)
 *   ⇔ δ ≥ δ*(L) = ((T − R)/(T − P))^(1/(L+1)).
 * `maxLagAt(δ)` is the largest L with δ^(L+1) ≥ ratio, i.e.
 * floor(ln ratio / ln δ) − 1 (−1 when even L = 0 fails).
 */
export function grimLag(p: { T: number; R: number; P: number; lag: number }): {
  ratio: number;
  deltaStar: number;
  maxLagAt: (delta: number) => number;
} {
  const ratio = (p.T - p.R) / (p.T - p.P);
  return {
    ratio,
    deltaStar: ratio ** (1 / (p.lag + 1)),
    // ponytail: +1e-12 guards float noise when δ^(L+1) lands exactly on the ratio; author screens such ties anyway.
    maxLagAt: (delta) => Math.floor(Math.log(ratio) / Math.log(delta) + 1e-12) - 1,
  };
}

/**
 * Bayesian trust with exponential forgetting. `history` is chronological
 * (oldest first, one interaction per round, true = good); the most recent has
 * age 0 and weight 1, an interaction k rounds ago weight λ^k. Beta(1,1) prior,
 * whose pseudo-counts do not decay:
 *   P = Σ_good λ^age,  N = Σ_bad λ^age,  mean = (P+1)/(P+N+2)  (alignment.ts `decayedScore`).
 * Slips for the wrong lists: `laplace` (no decay, λ = 1), `offByOne` (most recent
 * weight λ), `decayedPrior` (prior treated as older than the oldest observation,
 * weight λ^n), `unsmoothed` (P/(P+N), no prior).
 * `goodsToReach(t)`: fewest further consecutive good rounds for mean ≥ t.
 */
export function trustDecay(history: boolean[], lambda: number) {
  const id = (x: number) => x;
  const actor = (h: boolean[], shift = 0): RepActor => ({
    name: "A",
    events: h.map((good, i) => ({ good, age: h.length - 1 - i + shift })),
  });
  let p = 0;
  let n = 0;
  history.forEach((g, i) => {
    const w = lambda ** (history.length - 1 - i);
    if (g) p += w;
    else n += w;
  });
  const prior = lambda ** history.length;
  return {
    decayed: decayedScore(actor(history), lambda, id),
    laplace: decayedScore(actor(history), 1, id),
    offByOne: decayedScore(actor(history, 1), lambda, id),
    decayedPrior: (p + prior) / (p + n + 2 * prior),
    unsmoothed: p / (p + n),
    goodsToReach: (target: number, cap = 1000) => {
      for (let k = 0; k < cap; k++) {
        const more = [...history, ...Array<boolean>(k).fill(true)];
        if (decayedScore(actor(more), lambda, id) >= target) return k;
      }
      return cap;
    },
  };
}

/**
 * Adjustable-rate loan: level payment on P at monthly rate i1 over N months;
 * after the k-th payment the rate resets to i2 and the remaining balance B_k is
 * re-amortized over the remaining N − k months (new level payment). Both legs
 * use release-0's `amortize` convention (payment and each month's interest
 * rounded half-up to the cent; the final payment clears the balance). Months
 * 1..k never hit the final stub, so leg-1 interest = k·A1 − (P − B_k).
 *
 * `roundPerStep = false` is the round-at-end slip: full precision throughout
 * (closed forms — B_k = P(1+i)^k − A((1+i)^k − 1)/i, and each leg's interest =
 * payments − principal), results left unrounded for the caller to round.
 */
export function armAmort(
  p: { P: number; i1: number; i2: number; N: number; k: number },
  roundPerStep = true,
): { payment1: number; balanceK: number; payment2: number; totalInterest: number } {
  const { P, i1, i2, N, k } = p;
  if (!roundPerStep) {
    const level = (B: number, i: number, n: number) => (B * i) / (1 - (1 + i) ** -n);
    const A1 = level(P, i1, N);
    const g = (1 + i1) ** k;
    const balanceK = P * g - (A1 * (g - 1)) / i1;
    const A2 = level(balanceK, i2, N - k);
    return { payment1: A1, balanceK, payment2: A2, totalInterest: k * A1 + (N - k) * A2 - P };
  }
  const leg1 = amortize(P, i1, N);
  const balanceK = leg1.schedule[k - 1]?.balance ?? Number.NaN;
  const leg2 = amortize(balanceK, i2, N - k);
  const totalInterest =
    Math.round((k * leg1.payment - (P - balanceK) + leg2.totalInterest) * 100) / 100;
  return { payment1: leg1.payment, balanceK, payment2: leg2.payment, totalInterest };
}

/**
 * Two-period (or n-period) CLO-style waterfall with an overcollateralisation
 * (OC) test. Each period, collections = rc% × start-of-period par + `sched`
 * scheduled principal. Par then falls by `sched` and that period's default
 * (no recovery). Collections pay, in order (via financial.ts `waterfall`):
 *   1. senior interest rA% × A (start-of-period balance);
 *   2. OC diversion to senior principal: if par·100 < trigger·A, the cure
 *      A − par·100/trigger (the closed form that makes par/(A − x) = trigger%),
 *      capped by cash left;
 *   3. junior interest rB% × B0 (B never amortizes; a shortfall is lost);
 *   4. residual to equity.
 * `modes` models misreadings per period: "none" skips the test, "all" diverts
 * every post-senior dollar (up to A) whenever the test fails.
 */
export function ocWaterfall(p: {
  C0: number;
  A0: number;
  B0: number;
  rc: number;
  rA: number;
  rB: number;
  trigger: number;
  sched: number;
  defaults: number[];
  modes?: ("cure" | "none" | "all")[];
}) {
  let C = p.C0;
  let A = p.A0;
  const periods = p.defaults.map((d, i) => {
    const collections = (p.rc * C) / 100 + p.sched;
    const cEnd = C - p.sched - d;
    const seniorInterest = (p.rA * A) / 100;
    const mode = p.modes?.[i] ?? "cure";
    const fails = cEnd * 100 < p.trigger * A;
    const cure = !fails || mode === "none" ? 0 : mode === "all" ? A : A - (cEnd * 100) / p.trigger;
    const w = waterfall(collections, [
      { name: "Senior", claim: seniorInterest },
      { name: "Cure", claim: cure },
      { name: "Junior", claim: (p.rB * p.B0) / 100 },
    ]).payouts;
    const out = {
      collections,
      cEnd,
      aStart: A,
      ratio: cEnd / A,
      seniorInterest: w["Senior"] ?? 0,
      diverted: w["Cure"] ?? 0,
      junior: w["Junior"] ?? 0,
      equity: w["Equity"] ?? 0,
    };
    C = cEnd;
    A -= out.diverted;
    return out;
  });
  const sum = (k: "junior" | "equity" | "diverted") => periods.reduce((s, x) => s + x[k], 0);
  return {
    periods,
    juniorTotal: sum("junior"),
    equityTotal: sum("equity"),
    divertedTotal: sum("diverted"),
    seniorEnd: A,
  };
}
