// Stretch scenarios: Stackelberg leadership, grim trigger with a detection lag,
// Bayesian trust with decay, adjustable-rate amortization, and a two-period
// waterfall with OC diversion. Per scenario: two single-shot seeds plus one
// 3–4 turn chain.

import { cournot } from "../econ.js";
import { type AuthoredItem, chainItem, exactItem, INT_EXTRACT } from "../emit.js";
import { amortize } from "../financial.js";
import {
  answerScreenOk,
  type Generated,
  int,
  redraw,
  rngFor,
  seedName,
  withMeta,
} from "./common.js";
import { armAmort, grimLag, ocWaterfall, stackelberg, trustDecay } from "./stretch-solvers.js";

const DEC_EXTRACT = "(-?\\d*\\.?\\d+)";
const ONLY = "Reply with only the number.";
const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;

/** x to `dp` places, or null on a rounding tie or a trailing zero (12.30 vs 12.3). */
function fixedDp(x: number, dp = 4): string | null {
  const s = x * 10 ** dp;
  if (Math.abs(s - Math.floor(s) - 0.5) < 1e-6) return null;
  const k = (Math.round(s) / 10 ** dp).toFixed(dp);
  return k.endsWith("0") ? null : k;
}
const truncDp = (x: number, dp = 4) => (Math.trunc(x * 10 ** dp) / 10 ** dp).toFixed(dp);

// ── Stackelberg ─────────────────────────────────────────────────────────────

function drawStackelberg(rng: () => number) {
  const p = { a: int(rng, 60, 200), b: int(rng, 1, 2), c1: int(rng, 2, 30), c2: int(rng, 2, 30) };
  const s = stackelberg(p);
  const vals = [s.q1, s.q2, s.price, s.profit1, s.profit2, s.cournotProfit1];
  if (!vals.every(isInt) || s.q2 <= 0 || p.c1 === p.c2) return null;
  return { p, s };
}

const stackScenario = (p: { a: number; b: number; c1: number; c2: number }) =>
  `Two firms sell an identical product. Inverse demand is P = ${p.a} − ${p.b === 1 ? "" : p.b}Q, where Q is total output. Firm L has a constant marginal cost of ${p.c1} and firm F has a constant marginal cost of ${p.c2}; neither has fixed costs. Firm L chooses its quantity first; firm F observes it and then chooses its own quantity to maximize profit.`;

function stackelbergSingle(seed: number): Generated {
  const family = "stackelberg";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const d = drawStackelberg(rng);
    if (d === null) return null;
    const { p, s } = d;
    const key = String(s.profit1);
    const prompt = `${stackScenario(p)} In the subgame-perfect equilibrium, what is firm L's profit? ${ONLY}`;
    if (!answerScreenOk(prompt, key, [String(s.cournotProfit1)])) return null;
    return {
      authored: exactItem({
        name: seedName("stackelberg_leader_profit", seed),
        category: "economics",
        tier: 4,
        prompt,
        expected: key,
        extract: INT_EXTRACT,
        tags: ["economics", "stackelberg"],
        why: `q1=(a−2c1+c2)/(2b)=${s.q1}, q2=(a+2c1−3c2)/(4b)=${s.q2}, P=${s.price}, π_L=(P−c1)·q1=${key}. Cournot π_L=${s.cournotProfit1}. gold: ${key}`,
      }),
      units: [{ gold: key, wrong: [String(s.cournotProfit1), String(s.profit2)] }],
    };
  });
}

function stackelbergChain(seed: number): Generated {
  const family = "stackelberg";
  const rng = rngFor(`${family}_chain`, seed);
  return redraw(family, () => {
    const d = drawStackelberg(rng);
    if (d === null) return null;
    const { p, s } = d;
    // t1 probe: a leader output other than the equilibrium one, with an integer reply.
    const x = int(rng, 1, Math.floor((p.a - p.c2) / p.b) - 1);
    const br = (p.a - p.c2 - p.b * x) / (2 * p.b);
    if (!isInt(br) || br <= 0 || x === s.q1) return null;
    const cq1 = cournot({ a: p.a, b: p.b, costs: [p.c1, p.c2] }).quantities[0] ?? Number.NaN;
    const gain = s.profit1 - s.cournotProfit1;
    const t1 = `${stackScenario(p)} First: if firm L produced ${x} units, how many units would firm F produce? ${ONLY}`;
    const keys = [br, s.q1, s.price, gain].map(String);
    if (!answerScreenOk(t1, keys[0] ?? "") || new Set(keys).size !== 4) return null;
    const turn = (prompt: string, k: number, why: string): AuthoredItem =>
      exactItem({
        name: "t",
        category: "economics",
        tier: 4,
        prompt,
        expected: String(k),
        extract: INT_EXTRACT,
        why,
      });
    return {
      authored: chainItem({
        name: seedName("stackelberg_chain", seed),
        category: "economics",
        tier: 4,
        tags: ["economics", "stackelberg", "chain"],
        why: `Stackelberg decomposed: follower reaction, leader quantity, price, first-mover gain over Cournot.`,
        turns: [
          { turn: turn(t1, br, `q2(x)=(a−c2−b·x)/(2b)=${br}`), answer: String(br) },
          {
            turn: turn(
              `Now anticipating firm F's reaction, how many units does firm L produce in equilibrium? ${ONLY}`,
              s.q1,
              `q1=${s.q1} (Cournot would be ${cq1})`,
            ),
            answer: String(s.q1),
          },
          {
            turn: turn(`What is the resulting market price? ${ONLY}`, s.price, `P=${s.price}`),
            answer: String(s.price),
          },
          {
            turn: turn(
              `How much more profit does firm L earn as the leader than it would if both firms chose quantities simultaneously (Cournot)? ${ONLY}`,
              gain,
              `π_L ${s.profit1} − Cournot π_L ${s.cournotProfit1} = ${gain}`,
            ),
            answer: String(gain),
          },
        ],
      }),
      units: [
        { gold: String(br), wrong: [String(br * 2)] },
        { gold: String(s.q1), wrong: [String(cq1)] },
        { gold: String(s.price), wrong: [String(s.price + 1)] },
        { gold: String(gain), wrong: [String(s.profit1)] },
      ],
    };
  });
}

// ── Grim trigger with detection lag ─────────────────────────────────────────

function drawGrim(rng: () => number) {
  const T = int(rng, 6, 12);
  const R = int(rng, 3, T - 1);
  const P = int(rng, 1, R - 1);
  const S = int(rng, 0, P - 1);
  const lag = int(rng, 1, 3);
  // 2R > T + S: mutual cooperation beats taking turns exploiting each other.
  return 2 * R > T + S ? { T, R, P, S, lag } : null;
}

const grimScenario = (g: { T: number; R: number; P: number; S: number }) =>
  `Two players play a prisoner's dilemma every period forever, discounting future payoffs by δ per period. Per-period payoffs: both cooperate ${g.R} each; both defect ${g.P} each; a defector facing a cooperator gets ${g.T} and the cooperator gets ${g.S}. Both players use grim trigger: cooperate until a defection is discovered, then defect forever.`;
const lagRule = (lag: number) =>
  `Monitoring is imperfect: a defection in period t is only discovered at the end of period t + ${lag}, and punishment (mutual defection forever) starts in period t + ${lag + 1}. Until it is discovered, the deviator keeps defecting and the other player keeps cooperating.`;

function grimSingle(seed: number): Generated {
  const family = "grim_lag";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const g = drawGrim(rng);
    if (g === null) return null;
    const sol = grimLag(g);
    const key = fixedDp(sol.deltaStar);
    if (key === null) return null;
    const tr = truncDp(sol.deltaStar);
    const nearMisses = tr === key ? [] : [{ slip: "truncated", credit: 0.5, expected: tr }];
    const noLag = (Math.round(sol.ratio * 1e4) / 1e4).toFixed(4);
    const offByOne = (Math.round(sol.ratio ** (1 / g.lag) * 1e4) / 1e4).toFixed(4);
    const prompt = `${grimScenario(g)} ${lagRule(g.lag)} What is the smallest discount factor δ at which no player gains by deviating from cooperation? Give δ rounded to 4 decimal places. ${ONLY}`;
    if (
      !answerScreenOk(
        prompt,
        key,
        nearMisses.map((n) => n.expected),
      )
    )
      return null;
    if ([noLag, offByOne].some((w) => w === key || w === tr)) return null;
    const base = exactItem({
      name: seedName("grim_lag_threshold", seed),
      category: "trust",
      tier: 4,
      prompt,
      expected: key,
      extract: DEC_EXTRACT,
      tags: ["trust", "grim-trigger"],
      why: `δ^(L+1) ≥ (T−R)/(T−P) = ${sol.ratio} → δ* = ratio^(1/${g.lag + 1}) = ${sol.deltaStar}. Ignoring the lag gives ${noLag}. gold: ${key}`,
    });
    return {
      authored: {
        ...base,
        item: { ...base.item, ...(nearMisses.length > 0 ? { nearMisses } : {}) },
      },
      units: [
        {
          gold: key,
          wrong: [noLag, offByOne],
          nearMiss: nearMisses.map((n) => ({ answer: n.expected, credit: 0.5 })),
        },
      ],
    };
  });
}

function grimChain(seed: number): Generated {
  const family = "grim_lag";
  const rng = rngFor(`${family}_chain`, seed);
  return redraw(family, () => {
    const g = drawGrim(rng);
    if (g === null) return null;
    const sol = grimLag(g);
    const k0 = fixedDp(sol.ratio);
    const k1 = fixedDp(sol.deltaStar);
    const delta = int(rng, 85, 97) / 100;
    const maxLag = sol.maxLagAt(delta);
    // Exclude near-ties where δ^(L+1) sits on the ratio.
    const margin = Math.min(
      ...[maxLag + 1, maxLag + 2].map((n) => Math.abs(delta ** n - sol.ratio)),
    );
    if (k0 === null || k1 === null || k0 === k1 || maxLag < 1 || margin < 1e-4 || maxLag === g.lag)
      return null;
    const t1 = `${grimScenario(g)} With perfect monitoring (a defection is seen immediately and punished from the next period), what is the smallest δ that sustains cooperation? Give δ rounded to 4 decimal places. ${ONLY}`;
    const t2 = `${lagRule(g.lag)} Now what is the smallest δ that sustains cooperation? Give δ rounded to 4 decimal places. ${ONLY}`;
    const t3 = `Suppose δ = ${delta}. What is the longest detection lag (in whole periods, with the same timing as above) for which grim trigger still sustains cooperation? ${ONLY}`;
    if (!answerScreenOk(t1, k0) || !answerScreenOk(t2, k1) || !answerScreenOk(t3, String(maxLag)))
      return null;
    const dec = (prompt: string, k: string, why: string) =>
      exactItem({
        name: "t",
        category: "trust",
        tier: 4,
        prompt,
        expected: k,
        extract: DEC_EXTRACT,
        why,
      });
    const nm = (k: string, x: number) => {
      const tr = truncDp(x);
      return tr === k ? [] : [{ slip: "truncated", credit: 0.5, expected: tr }];
    };
    const withNm = (a: AuthoredItem, k: string, x: number): AuthoredItem => {
      const n = nm(k, x);
      return n.length === 0 ? a : { ...a, item: { ...a.item, nearMisses: n } };
    };
    return {
      authored: chainItem({
        name: seedName("grim_lag_chain", seed),
        category: "trust",
        tier: 4,
        tags: ["trust", "grim-trigger", "chain"],
        why: `Grim trigger decomposed: textbook threshold, lagged threshold, longest sustainable lag at a given δ.`,
        turns: [
          { turn: withNm(dec(t1, k0, `(T−R)/(T−P) = ${sol.ratio}`), k0, sol.ratio), answer: k0 },
          {
            turn: withNm(
              dec(t2, k1, `ratio^(1/${g.lag + 1}) = ${sol.deltaStar}`),
              k1,
              sol.deltaStar,
            ),
            answer: k1,
          },
          {
            turn: exactItem({
              name: "t",
              category: "trust",
              tier: 4,
              prompt: t3,
              expected: String(maxLag),
              extract: INT_EXTRACT,
              why: `largest L with ${delta}^(L+1) ≥ ${sol.ratio}: floor(ln ratio/ln δ) − 1 = ${maxLag}`,
            }),
            answer: String(maxLag),
          },
        ],
      }),
      units: [
        {
          gold: k0,
          wrong: [k1],
          nearMiss: nm(k0, sol.ratio).map((n) => ({ answer: n.expected, credit: 0.5 })),
        },
        {
          gold: k1,
          wrong: [k0],
          nearMiss: nm(k1, sol.deltaStar).map((n) => ({ answer: n.expected, credit: 0.5 })),
        },
        { gold: String(maxLag), wrong: [String(maxLag + 1)] },
      ],
    };
  });
}

// ── Bayesian trust with decay ───────────────────────────────────────────────

const dp4 = (x: number) => (Math.round(x * 1e4) / 1e4).toFixed(4);
const truncNm = (k: string, x: number) => {
  const tr = truncDp(x);
  return tr === k ? [] : [{ slip: "truncated", credit: 0.5, expected: tr }];
};
const withTruncNm = (a: AuthoredItem, k: string, x: number): AuthoredItem => {
  const n = truncNm(k, x);
  return n.length === 0 ? a : { ...a, item: { ...a.item, nearMisses: n } };
};
/** Conceptual slips at 4 dp, rejected unless each differs from the key and its near miss. */
const slipsOk = (k: string, x: number, slips: number[]) =>
  slips.map(dp4).every((w) => w !== k && w !== truncDp(x));

/** A mostly-good record whose last 2–4 rounds are bad, decayed enough to flip below 0.5. */
function drawTrust(rng: () => number) {
  const lambda = [0.8, 0.85, 0.9][int(rng, 0, 2)] ?? 0.8;
  const n = int(rng, 8, 11);
  const late = int(rng, 2, 4);
  const history = Array.from({ length: n }, (_, i) => i < n - late && rng() < 0.8);
  const t = trustDecay(history, lambda);
  // Interior: undecayed trusts (> 0.5), decayed distrusts (< 0.5), materially apart.
  if (!(t.laplace > 0.5 && t.decayed < 0.5 && t.laplace - t.decayed >= 0.01)) return null;
  return { lambda, history, t };
}

const trustScenario = (lambda: number, history: boolean[]) =>
  `You track an agent's reliability θ (the probability that an interaction with it goes well) with a Beta(1, 1) prior, one interaction per round. Its record, oldest first:\n${history.map((g, i) => `Round ${i + 1}: ${g ? "good" : "bad"}`).join("\n")}\nYou use exponential forgetting with λ = ${lambda}: an interaction k rounds before the most recent one carries weight λ^k, so the most recent interaction has weight 1. With P the total weight of good interactions and N the total weight of bad ones, the posterior mean of θ is (P + 1)/(P + N + 2); the prior's pseudo-counts do not decay.`;

const trustWrongs = (t: ReturnType<typeof trustDecay>) => [
  t.laplace,
  t.offByOne,
  t.decayedPrior,
  t.unsmoothed,
];

function trustSingle(seed: number): Generated {
  const family = "trust_decay";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const d = drawTrust(rng);
    if (d === null) return null;
    const { lambda, history, t } = d;
    const key = fixedDp(t.decayed);
    if (key === null || !slipsOk(key, t.decayed, trustWrongs(t))) return null;
    const nearMisses = truncNm(key, t.decayed);
    const prompt = `${trustScenario(lambda, history)} What is the posterior mean of θ after round ${history.length}? Give it rounded to 4 decimal places. ${ONLY}`;
    if (
      !answerScreenOk(
        prompt,
        key,
        nearMisses.map((m) => m.expected),
      )
    )
      return null;
    const [laplace, offByOne, decayedPrior, unsmoothed] = trustWrongs(t).map(dp4);
    const base = exactItem({
      name: seedName("trust_decay_posterior", seed),
      category: "trust",
      tier: 4,
      prompt,
      expected: key,
      extract: DEC_EXTRACT,
      tags: ["trust", "bayesian-trust"],
      why: `P = Σ_good λ^age, N = Σ_bad λ^age (age 0 = round ${history.length}); (P+1)/(P+N+2) = ${t.decayed}. Slips: no decay ${laplace}, most recent weighted λ ${offByOne}, prior decayed ${decayedPrior}, no prior ${unsmoothed}. gold: ${key}`,
    });
    return {
      authored: withTruncNm(base, key, t.decayed),
      units: [
        {
          gold: key,
          wrong: [laplace, offByOne, decayedPrior, unsmoothed].filter((w) => w !== undefined),
          nearMiss: nearMisses.map((m) => ({ answer: m.expected, credit: 0.5 })),
        },
      ],
    };
  });
}

function trustChain(seed: number): Generated {
  const family = "trust_decay";
  const rng = rngFor(`${family}_chain`, seed);
  return redraw(family, () => {
    const d = drawTrust(rng);
    if (d === null) return null;
    const { lambda, history, t } = d;
    const nextGood = rng() < 0.5;
    const h3 = [...history, nextGood];
    const t3 = trustDecay(h3, lambda);
    const thr = [0.7, 0.75, 0.8][int(rng, 0, 2)] ?? 0.75;
    const need = t3.goodsToReach(thr);
    // Exclude near-ties at the threshold for the last two run lengths.
    const at = (k: number) => trustDecay([...h3, ...Array<boolean>(k).fill(true)], lambda).decayed;
    if (
      need < 2 ||
      need > 30 ||
      Math.min(...[need - 1, need].map((k) => Math.abs(at(k) - thr))) < 1e-4
    )
      return null;
    const k1 = fixedDp(t.laplace);
    const k2 = fixedDp(t.decayed);
    const k3 = fixedDp(t3.decayed);
    if (k1 === null || k2 === null || k3 === null || new Set([k1, k2, k3]).size !== 3) return null;
    // Conceptual slips per turn: decayed↔undecayed swap; t3 forgetting to age (= t2 key) or off-by-one.
    const w1 = [t.decayed, t.unsmoothed];
    const w2 = trustWrongs(t);
    const w3 = [t.decayed, ...trustWrongs(t3)];
    if (!slipsOk(k1, t.laplace, w1) || !slipsOk(k2, t.decayed, w2) || !slipsOk(k3, t3.decayed, w3))
      return null;
    const n = history.length;
    const p1 = `${trustScenario(lambda, history)} First, ignoring forgetting (every interaction weight 1, i.e. λ = 1), what is the posterior mean of θ after round ${n}? Give it rounded to 4 decimal places. ${ONLY}`;
    const p2 = `Now with forgetting at λ = ${lambda}, what is the posterior mean of θ after round ${n}? Give it rounded to 4 decimal places. ${ONLY}`;
    const p3 = `In round ${n + 1} the interaction is ${nextGood ? "good" : "bad"}. With forgetting at λ = ${lambda} (round ${n + 1} is now the most recent), what is the posterior mean of θ after round ${n + 1}? Give it rounded to 4 decimal places. ${ONLY}`;
    const p4 = `Starting after round ${n + 1}, what is the minimum number of consecutive good interactions needed for the posterior mean of θ (with forgetting at λ = ${lambda}) to reach at least ${thr}? ${ONLY}`;
    const nms = [
      [k1, t.laplace],
      [k2, t.decayed],
      [k3, t3.decayed],
    ] as const;
    if (
      !nms.every(([k, x], i) =>
        answerScreenOk(
          [p1, p2, p3][i] ?? "",
          k,
          truncNm(k, x).map((m) => m.expected),
        ),
      ) ||
      !answerScreenOk(p4, String(need))
    )
      return null;
    const dec = (prompt: string, k: string, x: number, why: string) =>
      withTruncNm(
        exactItem({
          name: "t",
          category: "trust",
          tier: 4,
          prompt,
          expected: k,
          extract: DEC_EXTRACT,
          why,
        }),
        k,
        x,
      );
    const unit = (k: string, x: number, wrong: number[]) => ({
      gold: k,
      wrong: wrong.map(dp4),
      nearMiss: truncNm(k, x).map((m) => ({ answer: m.expected, credit: 0.5 })),
    });
    return {
      authored: chainItem({
        name: seedName("trust_decay_chain", seed),
        category: "trust",
        tier: 4,
        tags: ["trust", "bayesian-trust", "chain"],
        why: `Bayesian trust with forgetting decomposed: undecayed posterior, decayed posterior, one more round (everything ages), good run needed to recover.`,
        turns: [
          { turn: dec(p1, k1, t.laplace, `(good+1)/(n+2) = ${t.laplace}`), answer: k1 },
          { turn: dec(p2, k2, t.decayed, `(P+1)/(P+N+2) = ${t.decayed}`), answer: k2 },
          {
            turn: dec(
              p3,
              k3,
              t3.decayed,
              `all ages +1, new round weight 1: (P+1)/(P+N+2) = ${t3.decayed}`,
            ),
            answer: k3,
          },
          {
            turn: exactItem({
              name: "t",
              category: "trust",
              tier: 4,
              prompt: p4,
              expected: String(need),
              extract: INT_EXTRACT,
              why: `${need - 1} goods → ${at(need - 1)} < ${thr}; ${need} goods → ${at(need)} ≥ ${thr}`,
            }),
            answer: String(need),
          },
        ],
      }),
      units: [
        unit(k1, t.laplace, w1),
        unit(k2, t.decayed, w2),
        unit(k3, t3.decayed, w3),
        { gold: String(need), wrong: [String(need - 1)] },
      ],
    };
  });
}

// ── Adjustable-rate amortization ────────────────────────────────────────────

/** Dollar amounts may carry thousands separators ("$12,345.67"); commas are stripped after capture. */
const MONEY_EXTRACT = "(-?\\d[\\d,]*(?:\\.\\d+)?)";
const CENTS = "Give your answer in dollars to the nearest cent.";
type Arm = { P: number; i1: number; i2: number; N: number; k: number };

function drawArm(rng: () => number) {
  // Monthly rates in 0.05% steps (0.25%–0.85%), so annual = 12× is a clean 3%–10.2%.
  const m1 = int(rng, 5, 17);
  const m2 = int(rng, 5, 17);
  const N = [60, 84, 120, 180, 240][int(rng, 0, 4)] ?? 120;
  const p: Arm = {
    P: int(rng, 10, 60) * 1000,
    i1: m1 / 2000,
    i2: m2 / 2000,
    N,
    k: 12 * int(rng, 1, N / 12 - 1),
  };
  const r = armAmort(p);
  // Interior: a real reset (rate and payment move), at least a year on each side.
  if (Math.abs(m1 - m2) < 2 || Math.abs(r.payment2 - r.payment1) < 5) return null;
  return { p, r, ex: armAmort(p, false), m1, m2 };
}

const pct = (x: number) => String(Number(x.toFixed(2)));
/** k is a multiple of 12, so only the -2 endings (72nd, 132nd) need care. */
const nth = (k: number) => `${k}${k % 10 === 2 && k % 100 !== 12 ? "nd" : "th"}`;
const armScenario = ({ p, m1, m2 }: { p: Arm; m1: number; m2: number }) =>
  `A borrower takes a $${p.P.toLocaleString("en-US")} adjustable-rate loan on a ${p.N}-month level-payment schedule at ${pct(m1 * 0.6)}% annual interest compounded monthly (a ${pct(m1 * 0.05)}% monthly rate). Immediately after the ${nth(p.k)} monthly payment, the rate resets to ${pct(m2 * 0.6)}% annual (a ${pct(m2 * 0.05)}% monthly rate), and the remaining balance is re-amortized over the remaining ${p.N - p.k} months with a new level payment starting in month ${p.k + 1}. Each month interest accrues on the outstanding balance first, then the payment is applied to principal. Work to exact cents: round each level payment and each month's interest to the nearest cent; the final payment is whatever amount clears the remaining balance.`;

/** Round-at-end and truncated near misses (0.5 each), kept only when distinct from the key and each other. */
function armNearMisses(key: string, exact: number) {
  const out: { slip: string; credit: number; expected: string }[] = [];
  for (const [slip, v] of [
    ["round-at-end", fixedDp(exact, 2)],
    ["truncated", truncDp(exact, 2)],
  ] as const)
    if (v !== null && !v.endsWith("0") && v !== key && !out.some((n) => n.expected === v))
      out.push({ slip, credit: 0.5, expected: v });
  return out;
}
const withNearMisses = (a: AuthoredItem, nm: { expected: string }[]): AuthoredItem =>
  nm.length === 0 ? a : { ...a, item: { ...a.item, nearMisses: nm } };
const nmUnits = (nm: { expected: string }[]) =>
  nm.map((n) => ({ answer: n.expected, credit: 0.5 }));

/** Conceptual slips (score 0): no re-amortization, or the new rate applied from the wrong start/term. */
function armSlips(p: Arm, r: ReturnType<typeof armAmort>) {
  const fromStart = amortize(p.P, p.i2, p.N);
  return {
    newPayment: [
      r.payment1, // keeps the old payment after the reset
      amortize(r.balanceK, p.i2, p.N).payment, // re-amortizes over the full original term
      fromStart.payment, // new rate from month 1
    ],
    balance: [
      fromStart.schedule[p.k - 1]?.balance ?? 0,
      amortize(p.P, p.i1, p.N).schedule[p.k]?.balance ?? 0,
    ],
    totalInterest: [amortize(p.P, p.i1, p.N).totalInterest, fromStart.totalInterest],
  };
}
const slipKeys = (xs: number[], key: string, nm: { expected: string }[]) => {
  const ws = xs.map((x) => x.toFixed(2));
  return ws.every((w) => w !== key && !nm.some((n) => n.expected === w)) ? ws : null;
};

function armSingle(seed: number): Generated {
  const family = "arm_amort";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const d = drawArm(rng);
    if (d === null) return null;
    const { p, r, ex } = d;
    const key = fixedDp(r.payment2, 2);
    if (key === null) return null;
    const nm = armNearMisses(key, ex.payment2);
    const wrong = slipKeys(armSlips(p, r).newPayment, key, nm);
    const prompt = `${armScenario(d)} What is the new monthly payment after the reset? ${CENTS} ${ONLY}`;
    if (
      wrong === null ||
      !answerScreenOk(
        prompt,
        key,
        nm.map((n) => n.expected),
      )
    )
      return null;
    return {
      authored: withNearMisses(
        exactItem({
          name: seedName("arm_amort_new_payment", seed),
          category: "financial",
          tier: 4,
          prompt,
          expected: key,
          extract: MONEY_EXTRACT,
          tags: ["financial", "amortization"],
          why: `A1 = ${r.payment1}; balance after payment ${p.k} = ${r.balanceK}; A2 = B·i2/(1 − (1+i2)^−${p.N - p.k}) = ${key}. Keeping A1 or using term ${p.N} or i2 from month 1 gives ${wrong.join(" / ")}. gold: ${key}`,
        }),
        nm,
      ),
      units: [{ gold: key, wrong, nearMiss: nmUnits(nm) }],
    };
  });
}

function armChain(seed: number): Generated {
  const family = "arm_amort";
  const rng = rngFor(`${family}_chain`, seed);
  return redraw(family, () => {
    const d = drawArm(rng);
    if (d === null) return null;
    const { p, r, ex } = d;
    const vals = [r.payment1, r.balanceK, r.payment2, r.totalInterest];
    const exact = [ex.payment1, ex.balanceK, ex.payment2, ex.totalInterest];
    const keys = vals.map((v) => fixedDp(v, 2));
    if (keys.some((k) => k === null) || new Set(keys).size !== 4) return null;
    const k = keys as string[];
    const s = armSlips(p, r);
    const t1Wrong = [amortize(p.P, p.i2, p.N).payment];
    const prompts = [
      `${armScenario(d)} First: what is the original monthly payment, before the reset? ${CENTS} ${ONLY}`,
      `What is the outstanding balance immediately after the ${nth(p.k)} payment, when the rate resets? ${CENTS} ${ONLY}`,
      `What is the new monthly payment after the reset? ${CENTS} ${ONLY}`,
      `What is the total interest paid over the life of the loan? ${CENTS} ${ONLY}`,
    ];
    const whys = [
      `A1 = P·i1/(1 − (1+i1)^−${p.N}) = ${k[0]}`,
      `B = P(1+i1)^${p.k} − A1((1+i1)^${p.k} − 1)/i1, simulated to the cent = ${k[1]}`,
      `A2 = B·i2/(1 − (1+i2)^−${p.N - p.k}) = ${k[2]}`,
      `${p.k}·A1 − (P − B) + leg-2 interest = ${k[3]}`,
    ];
    const units: Generated["units"] = [];
    const turns: { turn: AuthoredItem; answer: string }[] = [];
    for (const [j, slips] of [t1Wrong, s.balance, s.newPayment, s.totalInterest].entries()) {
      const key = k[j] ?? "";
      const nm = armNearMisses(key, exact[j] ?? 0);
      const wrong = slipKeys(slips, key, nm);
      const prompt = prompts[j] ?? "";
      if (
        wrong === null ||
        !answerScreenOk(
          prompt,
          key,
          nm.map((n) => n.expected),
        )
      )
        return null;
      // Keys must not echo a number from the scenario either (it sits in turn 1).
      if (j > 0 && !answerScreenOk(`${prompts[0]} ${prompt}`, key)) return null;
      turns.push({
        turn: withNearMisses(
          exactItem({
            name: "t",
            category: "financial",
            tier: 4,
            prompt,
            expected: key,
            extract: MONEY_EXTRACT,
            why: whys[j] ?? "",
          }),
          nm,
        ),
        answer: key,
      });
      units.push({ gold: key, wrong, nearMiss: nmUnits(nm) });
    }
    return {
      authored: chainItem({
        name: seedName("arm_amort_chain", seed),
        category: "financial",
        tier: 4,
        tags: ["financial", "amortization", "chain"],
        why: `Adjustable-rate loan decomposed: original payment, balance at the reset, re-amortized payment, lifetime interest.`,
        turns,
      }),
      units,
    };
  });
}

// ── Two-period waterfall with OC diversion ──────────────────────────────────

type OcParams = Parameters<typeof ocWaterfall>[0];

function drawOc(rng: () => number) {
  const M = 100_000;
  const C0 = M * int(rng, 300, 800);
  const A0 = M * int(rng, Math.ceil((0.66 * C0) / M), (0.8 * C0) / M); // starts passing 125%
  const p: OcParams = {
    C0,
    A0,
    B0: M * int(rng, 20, 100),
    rc: int(rng, 6, 9),
    rA: int(rng, 2, 4),
    rB: int(rng, 5, 9),
    trigger: 125,
    sched: M * int(rng, 2, 30),
    defaults: [M * int(rng, 5, 80), M * int(rng, 1, 60)],
  };
  if (p.A0 + p.B0 >= C0) return null;
  const s = ocWaterfall(p);
  const [p1, p2] = s.periods;
  if (p1 === undefined || p2 === undefined) return null;
  const jr = (p.rB * p.B0) / 100;
  const avail1 = p1.collections - p1.seniorInterest;
  // Interior: P1 fails the test; the cure is paid in full but eats part (not
  // all) of junior interest; P2 senior interest is covered.
  if (p1.ratio >= 1.25 || p1.diverted <= 0 || p1.diverted >= avail1) return null;
  if (p1.junior <= 0 || p1.junior >= jr || p2.collections < p2.seniorInterest) return null;
  if (s.equityTotal <= 0) return null;
  const ignore = ocWaterfall({ ...p, modes: ["none", "cure"] });
  const noOc = ocWaterfall({ ...p, modes: ["none", "none"] });
  const all = ocWaterfall({ ...p, modes: ["all", "all"] });
  // Two periods matter: P2 junior receipts depend on the P1 diversion.
  if (ignore.periods[1]?.junior === p2.junior) return null;
  const amounts = [s.juniorTotal, s.equityTotal, p1.diverted, p2.junior, p2.seniorInterest];
  if (!amounts.every(isInt)) return null;
  return { p, s, p1, p2, avail1, ignore, noOc, all };
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const ocScenario = (p: OcParams) =>
  `A securitisation holds a collateral pool with par balance ${usd(p.C0)}. It has issued a senior tranche A of ${usd(p.A0)} paying ${p.rA}% interest per period on its outstanding balance, and a junior tranche B of ${usd(p.B0)} paying ${p.rB}% interest per period (B's principal is not repaid during the two periods). Equity receives whatever is left. In each of two periods, the pool collects interest of ${p.rc}% of its par balance at the start of the period plus scheduled principal of ${usd(p.sched)}. At the end of each period, par falls by the scheduled principal and by that period's defaults (period 1: ${usd(p.defaults[0] ?? 0)}; period 2: ${usd(p.defaults[1] ?? 0)}), with no recoveries. Each period's collections are paid in this order: (1) senior interest on tranche A's balance at the start of the period; (2) the overcollateralisation (OC) test: if end-of-period par divided by tranche A's balance is below ${p.trigger}%, cash is diverted to repay tranche A principal, exactly the amount that brings the ratio back to ${p.trigger}% (or all remaining cash if that is less); (3) junior interest on tranche B, where any shortfall is lost, not carried forward; (4) everything left goes to equity. Tranche A's balance falls only through OC diversions.`;
const DOLLARS = "Give the amount in whole dollars. Reply with only the number.";

function ocSingle(seed: number): Generated {
  const family = "oc_waterfall";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const d = drawOc(rng);
    if (d === null) return null;
    const key = String(d.s.juniorTotal);
    const wrong = [d.noOc.juniorTotal, d.all.juniorTotal, d.ignore.juniorTotal].map(String);
    const prompt = `${ocScenario(d.p)} What is the total cash received by junior tranche B over both periods? ${DOLLARS}`;
    if (!answerScreenOk(prompt, key) || wrong.includes(key)) return null;
    return {
      authored: exactItem({
        name: seedName("oc_waterfall_junior_total", seed),
        category: "financial",
        tier: 4,
        prompt,
        expected: key,
        extract: INT_EXTRACT,
        tags: ["financial", "waterfall"],
        why: `P1: collect ${d.p1.collections}, senior int ${d.p1.seniorInterest}, par ${d.p1.cEnd}/A ${d.p.A0} < 125% → cure ${d.p1.diverted}, junior ${d.p1.junior}. P2: A ${d.p2.aStart}, collect ${d.p2.collections}, senior int ${d.p2.seniorInterest}, divert ${d.p2.diverted}, junior ${d.p2.junior}. No OC test gives ${d.noOc.juniorTotal}; diverting all junior cash gives ${d.all.juniorTotal}. gold: ${key}`,
      }),
      units: [{ gold: key, wrong }],
    };
  });
}

function ocChain(seed: number): Generated {
  const family = "oc_waterfall";
  const rng = rngFor(`${family}_chain`, seed);
  return redraw(family, () => {
    const d = drawOc(rng);
    if (d === null) return null;
    const pct = (100 * d.p1.cEnd) / d.p.A0;
    const k0 = fixedDp(pct, 2);
    if (k0 === null) return null;
    const tr = truncDp(pct, 2);
    const nearMisses = tr === k0 ? [] : [{ slip: "truncated", credit: 0.5, expected: tr }];
    const preSched = ((100 * (d.p.C0 - (d.p.defaults[0] ?? 0))) / d.p.A0).toFixed(2);
    const keys = [k0, String(d.p1.diverted), String(d.p2.junior), String(d.s.equityTotal)];
    const t1 = `${ocScenario(d.p)} First: what is the OC ratio at the end of period 1, before any diversion (end-of-period par as a percentage of tranche A's balance)? Give the percentage rounded to 2 decimal places, without the % sign. Reply with only the number.`;
    const t2 = `How much cash is diverted to repay tranche A principal in period 1? ${DOLLARS}`;
    const t3 = `How much cash does junior tranche B receive in period 2? ${DOLLARS}`;
    const t4 = `What is the total cash received by equity over both periods? ${DOLLARS}`;
    if (new Set(keys.map(Number)).size !== 4) return null;
    if (
      !answerScreenOk(
        t1,
        k0,
        nearMisses.map((n) => n.expected),
      )
    )
      return null;
    if (!keys.slice(1).every((k) => answerScreenOk(t1, k))) return null;
    const wrongs = [
      [preSched],
      [d.avail1, 0].map(String),
      [d.ignore.periods[1]?.junior ?? 0, d.noOc.periods[1]?.junior ?? 0].map(String),
      [d.noOc.equityTotal, d.all.equityTotal].map(String),
    ].map((ws, i) => ws.filter((w) => w !== keys[i]));
    if (wrongs.some((ws) => ws.length === 0) || wrongs[0]?.includes(tr)) return null;
    const turn = (prompt: string, k: string, extract: string, why: string): AuthoredItem =>
      exactItem({ name: "t", category: "financial", tier: 4, prompt, expected: k, extract, why });
    const first = turn(t1, k0, DEC_EXTRACT, `par ${d.p1.cEnd} / A ${d.p.A0} = ${pct}%`);
    return {
      authored: chainItem({
        name: seedName("oc_waterfall_chain", seed),
        category: "financial",
        tier: 4,
        tags: ["financial", "waterfall", "chain"],
        why: `OC waterfall decomposed: period-1 test ratio, cure amount, period-2 junior receipts (after the period-1 paydown), equity total.`,
        turns: [
          {
            turn:
              nearMisses.length === 0 ? first : { ...first, item: { ...first.item, nearMisses } },
            answer: k0,
          },
          {
            turn: turn(
              t2,
              keys[1] ?? "",
              INT_EXTRACT,
              `cure = A − par/1.25 = ${d.p.A0} − ${d.p1.cEnd * 0.8} = ${d.p1.diverted} (cash after senior interest ${d.avail1})`,
            ),
            answer: keys[1] ?? "",
          },
          {
            turn: turn(
              t3,
              keys[2] ?? "",
              INT_EXTRACT,
              `A ${d.p2.aStart}: collect ${d.p2.collections} − senior int ${d.p2.seniorInterest} − divert ${d.p2.diverted} → junior ${d.p2.junior}`,
            ),
            answer: keys[2] ?? "",
          },
          {
            turn: turn(
              t4,
              keys[3] ?? "",
              INT_EXTRACT,
              `equity ${d.p1.equity} + ${d.p2.equity} = ${d.s.equityTotal}`,
            ),
            answer: keys[3] ?? "",
          },
        ],
      }),
      units: keys.map((k, i) => ({
        gold: k,
        wrong: wrongs[i] ?? [],
        ...(i === 0
          ? { nearMiss: nearMisses.map((n) => ({ answer: n.expected, credit: 0.5 })) }
          : {}),
      })),
    };
  });
}

export function stretchItems(): Generated[] {
  const fam =
    (family: string, seed: number) =>
    (g: Generated): Generated => ({
      ...g,
      authored: withMeta({ ...g.authored, item: { ...g.authored.item, family } }, seed, "stretch"),
    });
  return [
    ...[0, 1].map((s) => fam("stackelberg", s)(stackelbergSingle(s))),
    fam("stackelberg", 0)(stackelbergChain(0)),
    ...[0, 1].map((s) => fam("grim_lag", s)(grimSingle(s))),
    fam("grim_lag", 0)(grimChain(0)),
    ...[0, 1].map((s) => fam("trust_decay", s)(trustSingle(s))),
    fam("trust_decay", 0)(trustChain(0)),
    ...[0, 1].map((s) => fam("arm_amort", s)(armSingle(s))),
    fam("arm_amort", 0)(armChain(0)),
    ...[0, 1].map((s) => fam("oc_waterfall", s)(ocSingle(s))),
    fam("oc_waterfall", 0)(ocChain(0)),
  ];
}
