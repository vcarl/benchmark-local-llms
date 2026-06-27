// Scratch authoring space — edit the scenarios, run `npx tsx
// scripts/author/draft.ts`, read the computed answers + the paste-ready
// exact_match YAML. WE author the scenario; the helpers do the bookkeeping.
// Nothing here is written to challenges/ automatically.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decayedScore,
  describe as describeHistory,
  flatScore,
  type History,
  mostAligned,
  mostTrustworthy,
  mostTrustworthyDecayed,
  posteriorMean,
  type RepActor,
  signalsToReach,
  trusted,
} from "./alignment.js";
import {
  describeGame,
  dominantStrategy,
  type Game,
  opportunityCost,
  priceElasticity,
  profitMaxQuantity,
  pureNash,
} from "./econ.js";
import {
  type AuthoredItem,
  decimalPattern,
  exactItem,
  orderedItem,
  regexItem,
  wordItem,
  writeSuiteFile,
} from "./emit.js";
import {
  amortize,
  bestBailout,
  breakeven,
  classifyState,
  type ContagionModel,
  crossoverRate,
  defaultCascade,
  describe as describeFinancial,
  diffStream,
  dscrSeries,
  firstBreach,
  insolvency,
  isAcyclic,
  minBumpToHalt,
  minGrowthToAvoidBreach,
  type Model,
  minInjectionToSolvency,
  npv,
  paybackPeriod,
  signChanges,
  systemBreakeven,
  type Tranche,
  waterfall,
} from "./financial.js";
import {
  folkThreshold,
  minBonusIC,
  type Move,
  mostCooperative,
  type PayoffMatrix,
  perPeriodCoop,
  type PlayerRounds,
  principalProfitAtIC,
  repeatedPayoff,
  shirksUnderFlat,
  sustainableAt,
  temptationGain,
  titForTatNext,
  worthIncentivizing,
} from "./repeated.js";
import { bestPathTrust, type Edge, pathsAbove, reachableAbove } from "./webOfTrust.js";

const CHALLENGES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../challenges",
);

// ── Trust & alignment from a history of actions ──────────────────────────────
const town: History = {
  characters: ["Tarl", "Mira", "Bex", "Orin"],
  commitments: [
    { actor: "Tarl", kept: true, about: "to fund the village well" },
    { actor: "Tarl", kept: true, about: "to share the autumn harvest" },
    { actor: "Tarl", kept: false, about: "to repair the old mill" },
    { actor: "Mira", kept: true, about: "to deliver the grain on time" },
    { actor: "Mira", kept: false, about: "to vote for the levy" },
    { actor: "Bex", kept: false, about: "to repay the loan" },
    { actor: "Bex", kept: false, about: "to stand the night watch" },
    { actor: "Orin", kept: true, about: "to garrison the bridge" },
    { actor: "Orin", kept: true, about: "to ransom the captives" },
    { actor: "Orin", kept: true, about: "to escort the caravan" },
  ],
  stances: [
    { actor: "Tarl", subject: "the harbour levy", side: "for" },
    { actor: "Tarl", subject: "the trade pact", side: "for" },
    { actor: "Tarl", subject: "the standing militia", side: "against" },
    { actor: "Orin", subject: "the harbour levy", side: "for" },
    { actor: "Orin", subject: "the trade pact", side: "for" },
    { actor: "Orin", subject: "the standing militia", side: "against" },
    { actor: "Mira", subject: "the harbour levy", side: "for" },
    { actor: "Mira", subject: "the trade pact", side: "against" },
    { actor: "Mira", subject: "the standing militia", side: "against" },
    { actor: "Bex", subject: "the harbour levy", side: "against" },
    { actor: "Bex", subject: "the trade pact", side: "against" },
    { actor: "Bex", subject: "the standing militia", side: "for" },
  ],
};
const trustworthy = mostTrustworthy(town);
const bexTrusted = trusted(town, "Bex");
const tarlAlly = mostAligned(town, "Tarl");

const trustItems: AuthoredItem[] = [
  wordItem({
    name: "trust_most_reliable",
    category: "social",
    tier: 2,
    prompt:
      `${describeHistory(town)}\n\n` +
      `Based only on this history, which person has been the most reliable at keeping their word? ` +
      `Reply with just the name.`,
    value: trustworthy.answer,
    why: "Orin kept all 3 promises (3/3). Tarl 2/3, Mira 1/2, Bex 0/2 — only Orin has a perfect record.",
    tags: ["TODO", "trust", "reputation"],
  }),
  wordItem({
    name: "trust_can_bex_be_trusted",
    category: "social",
    tier: 1,
    prompt:
      `${describeHistory(town)}\n\n` +
      `Judging only by their track record, can Bex be trusted to keep a promise? Answer yes or no.`,
    value: bexTrusted ? "yes" : "no",
    why: "Bex broke both promises he made (0 of 2 kept) — a track record of zero reliability, so: no.",
    tags: ["TODO", "trust", "reputation"],
  }),
  wordItem({
    name: "alignment_tarl_closest",
    category: "social",
    tier: 3,
    prompt:
      `${describeHistory(town)}\n\n` +
      `Going only by the positions each person has taken, whose views are most aligned with Tarl's? ` +
      `Reply with just the name.`,
    value: tarlAlly.answer,
    why: "Tarl and Orin take the same side on all 3 issues (levy, pact, militia). Mira matches 2/3, Bex 0/3 (opposite on every one) — Orin is the exact match.",
    tags: ["TODO", "alignment", "revealed-preference"],
  }),
];

// ── Economics & game theory ──────────────────────────────────────────────────
const prisoners: Game = {
  rowName: "You",
  colName: "Them",
  rowStrategies: ["Stay silent", "Confess"],
  colStrategies: ["Stay silent", "Confess"],
  // payoffs as years SAVED (higher = better), so it's a maximisation.
  payoffs: [
    [
      [2, 2],
      [0, 3],
    ],
    [
      [3, 0],
      [1, 1],
    ],
  ],
};
const dom = dominantStrategy(prisoners, "row");
const nash = pureNash(prisoners);

const oppWineA = opportunityCost(10, 20); // Atland: 10 wine OR 20 cloth/day
const oppWineB = opportunityCost(6, 6); // Borland: 6 wine OR 6 cloth/day
const wineAdvantage = oppWineB < oppWineA ? "Borland" : "Atland";

const econItems: AuthoredItem[] = [
  wordItem({
    name: "econ_dominant_strategy",
    category: "economics",
    tier: 2,
    prompt:
      `Two suspects are interrogated separately. Payoffs are years of freedom gained (higher is better):\n` +
      `${describeGame(prisoners)}\n\n` +
      `What is your strictly dominant strategy — the choice that is better no matter what Them does? ` +
      `Reply with just that choice.`,
    value: dom ?? "",
    why: "Confess beats Stay silent in both columns (3>2 if they stay silent, 1>0 if they confess), so it strictly dominates whatever the other does.",
    tags: ["TODO", "game-theory", "dominant-strategy"],
  }),
  wordItem({
    name: "econ_nash_equilibrium",
    category: "economics",
    tier: 3,
    prompt:
      `Two suspects are interrogated separately. Payoffs are years of freedom gained (higher is better):\n` +
      `${describeGame(prisoners)}\n\n` +
      `In the game's only Nash equilibrium, what does each suspect do? Reply with just that one choice.`,
    value: nash[0]?.row ?? "",
    why: "Both Confess: given the other confesses, 1>0 makes confessing each player's best reply, so neither can profitably deviate. Mutual silence pays more jointly but is unstable.",
    tags: ["TODO", "game-theory", "nash-equilibrium"],
  }),
  wordItem({
    name: "econ_comparative_advantage",
    category: "economics",
    tier: 3,
    prompt:
      `In one day Atland can produce 10 barrels of wine OR 20 bolts of cloth. Borland can produce ` +
      `6 barrels of wine OR 6 bolts of cloth. Which country holds the comparative advantage in wine ` +
      `(gives up less cloth per barrel)? Reply with just the country name.`,
    value: wineAdvantage,
    why: "Opportunity cost of one barrel of wine: Borland 1 cloth (6/6) vs Atland 2 cloth (20/10). Lower cost ⇒ Borland — even though Atland is absolutely more productive.",
    tags: ["TODO", "economics", "comparative-advantage"],
  }),
  exactItem({
    name: "econ_vickrey_bid",
    category: "economics",
    tier: 2,
    prompt:
      `In a sealed-bid, second-price (Vickrey) auction the winner pays the second-highest bid. ` +
      `Your private value for the item is $80. What single bid is your weakly dominant strategy, in dollars? ` +
      `Reply with only that number and no other figures.`,
    expected: "80",
    extract: "(\\d+)",
    why: "Truthful bidding is weakly dominant in a second-price auction — bid your value, 80. Shading down only risks losing a profitable win; bidding up only risks overpaying.",
    tags: ["TODO", "economics", "auctions"],
  }),
  wordItem({
    name: "econ_price_ceiling",
    category: "economics",
    tier: 1,
    prompt:
      `A government sets a price ceiling BELOW the market equilibrium price for bread. In a competitive ` +
      `market, does this create a persistent shortage or a persistent surplus? Answer in one word.`,
    value: "shortage",
    why: "A binding ceiling (below equilibrium) raises quantity demanded and cuts quantity supplied, so demand outstrips supply ⇒ persistent shortage.",
    tags: ["TODO", "economics", "price-controls"],
  }),
];

// ── Financial (complex, exactly computable): a liquidity cascade ─────────────
const franchise: Model = {
  horizon: 24,
  priced: { entity: "Flagship", units: 50, price: 13 },
  entities: [
    { name: "Flagship", startingCash: 300, monthlyRevenue: 0, monthlyCost: 600 },
    { name: "Supply", startingCash: 100, monthlyRevenue: 30, monthlyCost: 50 },
    { name: "Brand", startingCash: 50, monthlyRevenue: 20, monthlyCost: 60 },
    { name: "Outlet", startingCash: 150, monthlyRevenue: 130, monthlyCost: 80 },
  ],
  transfers: [
    { from: "Outlet", to: "Flagship", amount: 35, bestEffort: true },
    { from: "Flagship", to: "Supply", amount: 75, bestEffort: true },
    { from: "Supply", to: "Brand", amount: 50, bestEffort: true },
  ],
};
const sysBreak = systemBreakeven(franchise);
const aloneBreak = breakeven(franchise);
const trap = insolvency({
  ...franchise,
  priced: { ...franchise.priced!, price: (sysBreak ?? 1) - 1 },
});

const financialItems: AuthoredItem[] = [
  exactItem({
    name: "financial_breakeven_liquidity_cascade",
    category: "financial",
    tier: 3,
    prompt:
      `A franchise group shares cash between four divisions each month.\n${describeFinancial(franchise)}\n\n` +
      `Resolve each month in this order: every division first books its other revenue and any sales ` +
      `income and pays its costs; then the transfers happen in the order listed above. A balance is ` +
      `checked at the end of the month.\n\n` +
      `Flagship sells 50 units/month; its price is yours to set. What is the lowest whole-dollar ` +
      `price at which NO division ends any of the 24 months with a negative balance? ` +
      `Reply with only that number and no other figures.`,
    expected: String(sysBreak),
    extract: "(\\d+)",
    why:
      `At $${(sysBreak ?? 1) - 1}, Flagship survives only by underpaying Supply (best-effort), so the ` +
      `shortfall cascades and ${trap.entity} goes negative by month ${trap.month}. $${sysBreak} funds the ` +
      `full chain — note the system breakeven ($${sysBreak}) exceeds Flagship's standalone breakeven ($${aloneBreak}).`,
    tags: ["TODO", "financial-model", "breakeven", "cascade"],
  }),
];

// ── Repeated games & cooperation (→ trust suite) ─────────────────────────────
const rell: PlayerRounds = { name: "Rell", moves: ["C", "C", "C", "C", "C"] };
const sten: PlayerRounds = { name: "Sten", moves: ["C", "D", "D", "D", "D"] };
const vane: PlayerRounds = { name: "Vane", moves: ["C", "C", "D", "C", "C"] };
const coop = mostCooperative([rell, sten, vane]);
const oppMoves: Move[] = ["C", "C", "D", "C", "D"];
const tftNext = titForTatNext(oppMoves) === "D" ? "defect" : "cooperate";
const pay = repeatedPayoff(rell, sten);
const moveLog = (p: PlayerRounds): string => `${p.name}: ${p.moves.join(" ")}`;

const repeatedItems: AuthoredItem[] = [
  wordItem({
    name: "repeated_most_cooperative",
    category: "social",
    tier: 2,
    prompt:
      `Three traders played five rounds each; C = cooperated, D = defected.\n` +
      `${[rell, sten, vane].map(moveLog).join("\n")}\n\n` +
      `Who cooperated most often across the five rounds? Reply with just the name.`,
    value: coop.answer,
    why: "Rell cooperated all 5 rounds; Vane 4, Sten 1 — Rell is most cooperative.",
    tags: ["TODO", "repeated-game", "reputation"],
  }),
  wordItem({
    name: "repeated_tit_for_tat_next",
    category: "social",
    tier: 2,
    prompt:
      `You are playing tit-for-tat: cooperate in round 1, then in each later round copy what your ` +
      `opponent did in the PREVIOUS round. Over rounds 1–5 your opponent played: ${oppMoves.join(", ")} ` +
      `(C = cooperate, D = defect). What do you play in round 6 — cooperate or defect?`,
    value: tftNext,
    why: "Tit-for-tat copies the opponent's last move; their round-5 move was D, so you defect in round 6.",
    tags: ["TODO", "repeated-game", "tit-for-tat"],
  }),
  wordItem({
    name: "repeated_payoff_winner",
    category: "social",
    tier: 3,
    prompt:
      `Repeated prisoner's dilemma; each round's payoff (you, them): both cooperate (3,3); ` +
      `you cooperate–they defect (0,5); you defect–they cooperate (5,0); both defect (1,1).\n` +
      `Over five rounds ${moveLog(rell)} and ${moveLog(sten)}.\n\n` +
      `Who ended with the higher TOTAL payoff — Rell or Sten? Reply with just the name.`,
    value: pay.winner,
    why: `Rell cooperated every round and was exploited: Rell ${pay.a} vs Sten ${pay.b}. Unconditional cooperation loses against a defector.`,
    tags: ["TODO", "repeated-game", "exploitation"],
  }),
];

// ── More economics (→ economics suite) ───────────────────────────────────────
const elasticity = priceElasticity(4, 200, 5, 190);
const marginalQty = profitMaxQuantity(10, [3, 5, 7, 9, 11, 13]);

const econMoreItems: AuthoredItem[] = [
  regexItem({
    name: "econ_elasticity_value",
    category: "economics",
    tier: 2,
    prompt:
      `When the price of coffee rises from $4 to $5, the quantity demanded falls from 200 to 190 cups/day. ` +
      `Using the simple percentage-change method (changes relative to the initial values), what is the price ` +
      `elasticity of demand, as a positive decimal? Reply with just the number (e.g. 0.5).`,
    // Accept e.g. 0.2 / .2 / 0.20 (equivalent forms); reject any other value.
    pattern: decimalPattern(elasticity),
    label: `equals ${elasticity}`,
    why: "%ΔQ = −10/200 = −5%; %ΔP = +1/4 = +25%; elasticity = |−5% / 25%| = 0.2.",
    tags: ["TODO", "economics", "elasticity"],
  }),
  wordItem({
    name: "econ_elasticity_classify",
    category: "economics",
    tier: 1,
    prompt:
      `When the price of coffee rises from $4 to $5, the quantity demanded falls from 200 to 190 cups/day. ` +
      `Over this range, is demand elastic or inelastic? Answer in one word.`,
    value: elasticity < 1 ? "inelastic" : "elastic",
    why: "Elasticity is 0.2 (< 1): quantity changes less than proportionally to price, so demand is inelastic.",
    tags: ["TODO", "economics", "elasticity"],
  }),
  exactItem({
    name: "econ_marginal_quantity",
    category: "economics",
    tier: 2,
    prompt:
      `A firm sells every unit for $10 (constant marginal revenue). The marginal cost of each successive ` +
      `unit is: unit 1 $3, unit 2 $5, unit 3 $7, unit 4 $9, unit 5 $11, unit 6 $13. How many units should ` +
      `it produce to maximise profit? Reply with only that number and no other figures.`,
    expected: String(marginalQty),
    extract: "(\\d+)",
    why: "Produce each unit whose marginal cost ≤ $10: units 1–4 ($3,5,7,9) qualify; unit 5 ($11) exceeds MR. Optimal quantity 4.",
    tags: ["TODO", "economics", "marginal-analysis"],
  }),
  wordItem({
    name: "econ_sunk_cost",
    category: "economics",
    tier: 1,
    prompt:
      `You have already spent $500 developing a product (non-refundable). Finishing it will cost another ` +
      `$200, and the finished product will then sell for $300. Should you finish it? Answer yes or no.`,
    value: "yes",
    why: "Sunk costs are irrelevant. Forward-looking: $300 revenue − $200 to finish = +$100, so finish. The $500 already spent does not enter the decision.",
    tags: ["TODO", "economics", "sunk-cost"],
  }),
  wordItem({
    name: "econ_public_good_freeride",
    category: "economics",
    tier: 2,
    prompt:
      `Ten villagers can fund a shared bridge. Every $1 anyone contributes creates $3 of total value, ` +
      `split equally among all ten — so you personally receive $0.30 back for every $1 you contribute. ` +
      `Acting purely in your own self-interest, do you contribute? Answer yes or no.`,
    value: "no",
    why: "Your private return is $0.30 per $1 contributed (< $1), so contributing is individually irrational — the free-rider problem — even though everyone contributing is collectively efficient.",
    tags: ["TODO", "economics", "public-goods"],
  }),
  wordItem({
    name: "econ_tragedy_commons",
    category: "economics",
    tier: 1,
    prompt:
      `Many herders graze animals on a shared, unregulated pasture. Each adds more animals because they ` +
      `capture the full gain from each animal but share the cost of depletion with everyone. Left ` +
      `unmanaged, does the pasture tend toward overgrazing or toward underuse? Answer in one word.`,
    value: "overgrazing",
    why: "Each herder internalises the gain but externalises the cost of depletion, so collectively they over-exploit — the tragedy of the commons.",
    tags: ["TODO", "economics", "externalities"],
  }),
];

// ── Harder cascade: who to bail out (→ financial suite) ──────────────────────
// Mandatory monthly obligations: Source pays even into the red, sinking itself,
// while Mid/Tail survive on those payments. Only a Source bailout saves the group.
const chain: Model = {
  horizon: 18,
  entities: [
    { name: "Source", startingCash: 50, monthlyRevenue: 60, monthlyCost: 70 },
    { name: "Mid", startingCash: 30, monthlyRevenue: 30, monthlyCost: 40 },
    { name: "Tail", startingCash: 20, monthlyRevenue: 20, monthlyCost: 35 },
  ],
  transfers: [
    { from: "Source", to: "Mid", amount: 30 },
    { from: "Mid", to: "Tail", amount: 20 },
  ],
};
const bailoutTarget = ["Source", "Mid", "Tail"].filter(
  (e) => minInjectionToSolvency(chain, e) !== null,
);
const bailoutAmount = minInjectionToSolvency(chain, "Source");

const financialMoreItems: AuthoredItem[] = [
  wordItem({
    name: "financial_bailout_target",
    category: "financial",
    tier: 3,
    prompt:
      `Three divisions are linked by FIXED monthly obligations each must pay every month:\n${describeFinancial(chain)}\n\n` +
      `You may give a one-time cash injection at the start to exactly ONE division. Which division must ` +
      `receive it so that no division ever ends a month with a negative balance over 18 months? ` +
      `Reply with just the division name.`,
    value: bailoutTarget.length === 1 ? (bailoutTarget[0] as string) : "AMBIGUOUS",
    why: "Source loses $10/month of its own and owes $30/month, draining itself; Mid and Tail survive only on the payments they receive. Bailing Mid or Tail leaves Source insolvent, so only a Source bailout works.",
    tags: ["TODO", "financial-model", "cascade", "bailout"],
  }),
  exactItem({
    name: "financial_bailout_amount",
    category: "financial",
    tier: 3,
    prompt:
      `Three divisions are linked by FIXED monthly obligations each must pay every month:\n${describeFinancial(chain)}\n\n` +
      `If the one-time injection at the start goes to Source, what is the smallest whole-dollar amount that ` +
      `keeps every division's balance non-negative for all 18 months? Reply with only that number and no other figures.`,
    expected: String(bailoutAmount),
    extract: "(\\d+)",
    why: `Source nets −$10/month and pays $30/month = −$40/month effective; over 18 months that is −$720 against a $50 start, so it needs $${bailoutAmount} more to never dip below zero.`,
    tags: ["TODO", "financial-model", "cascade", "bailout"],
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL SCENARIO BATTERIES (waterfall · contagion · covenant · NPV · amort)
// Five scenario worlds, each authored once and carrying 4–5 sibling dimensions
// that share the scenario prose. Every battery includes a wide-numeric capstone;
// narrow 1-of-k dimensions are kept to minority weight. Ground truth is the
// design doc docs/superpowers/specs/2026-06-26-financial-challenges-design.md;
// the console table below prints the computed answers + degeneracy status so a
// reviewer can eyeball non-degeneracy (no throwing in author code).
// ─────────────────────────────────────────────────────────────────────────────
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const round2v = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

// ── Battery 1 — Payment waterfall ────────────────────────────────────────────
const wfTranches: Tranche[] = [
  { name: "Senior", claim: 520 },
  { name: "Mezzanine", claim: 310 },
  { name: "Junior", claim: 185 },
];
const wfPool = 640;
const wf = waterfall(wfPool, wfTranches);
const waterfallScene =
  `A securitization distributes a $${wfPool} cash pool to its tranches in strict priority order. ` +
  `Each tranche is paid in full before the next receives anything, and no tranche is ever paid more ` +
  `than its claim. Claims, in priority order, are: Senior $520, Mezzanine $310, Junior $185. ` +
  `Whatever cash remains after all three are paid goes to the Equity tranche.`;

const waterfallItems: AuthoredItem[] = [
  exactItem({
    name: "financial_waterfall_senior_payout",
    category: "financial",
    tier: 2,
    prompt: `${waterfallScene}\n\nHow many dollars does the Senior tranche receive? Reply with only that number and no other figures.`,
    expected: String(wf.payouts.Senior),
    extract: "(\\d+)",
    why: `Senior is paid first and its $520 claim is fully covered by the $${wfPool} pool, so it receives $${wf.payouts.Senior}.`,
    tags: ["TODO", "financial-model", "waterfall", "tranche-priority"],
  }),
  exactItem({
    name: "financial_waterfall_mezz_payout",
    category: "financial",
    tier: 3,
    prompt: `${waterfallScene}\n\nHow many dollars does the Mezzanine tranche receive? Reply with only that number and no other figures.`,
    expected: String(wf.payouts.Mezzanine),
    extract: "(\\d+)",
    why: `After Senior takes $520, only $${wfPool - 520} of the pool remains, so Mezzanine is partially filled at $${wf.payouts.Mezzanine} against its $310 claim — the discriminating partial-fill figure.`,
    tags: ["TODO", "financial-model", "waterfall", "tranche-priority"],
  }),
  exactItem({
    name: "financial_waterfall_equity_residual",
    category: "financial",
    tier: 2,
    prompt: `${waterfallScene}\n\nHow many dollars are left for the Equity tranche? Reply with only that number and no other figures.`,
    expected: String(wf.payouts.Equity),
    extract: "(\\d+)",
    why: `The pool is exhausted partway through Mezzanine, so Junior and Equity both receive $0; Equity gets $${wf.payouts.Equity}.`,
    tags: ["TODO", "financial-model", "waterfall", "residual"],
  }),
  wordItem({
    name: "financial_waterfall_first_loss",
    category: "financial",
    tier: 3,
    prompt: `${waterfallScene}\n\nName the most senior tranche that is NOT paid in full. Reply with just that tranche's name.`,
    value: wf.firstLoss ?? "",
    why: `Senior is paid in full; Mezzanine is the first tranche underpaid ($${wf.payouts.Mezzanine} of $310), so ${wf.firstLoss} is the first to take a loss.`,
    tags: ["TODO", "financial-model", "waterfall", "first-loss"],
  }),
  exactItem({
    name: "financial_waterfall_pool_equity_zero",
    category: "financial",
    tier: 4,
    prompt:
      `${waterfallScene}\n\nIgnore the specific $${wfPool} figure for this part. At or below what total cash ` +
      `pool size (in dollars) do the Equity holders receive nothing? Reply with only that number and no other figures.`,
    expected: String(wf.equityZeroThreshold),
    extract: "(\\d+)",
    why: `Equity gets a positive residual only once every senior claim is fully paid, i.e. above the sum of all non-equity claims 520+310+185 = $${wf.equityZeroThreshold}. At or below $${wf.equityZeroThreshold}, equity gets $0.`,
    tags: ["TODO", "financial-model", "waterfall", "capstone", "breakpoint"],
  }),
];

// ── Battery 2 — Counterparty contagion (acyclic threshold cascade) ───────────
const contagion: ContagionModel = {
  firms: ["A", "B", "C", "D", "E"],
  buffers: { A: 50, B: 80, C: 60, D: 300, E: 45 },
  liabilities: [
    { from: "A", to: "B", amount: 100 },
    { from: "B", to: "C", amount: 120 },
    { from: "C", to: "E", amount: 70 },
    { from: "D", to: "E", amount: 55 },
    { from: "B", to: "D", amount: 40 },
  ],
  shock: { node: "A", loss: 120 },
};
const cascade = defaultCascade(contagion);
const contagionAcyclic = isAcyclic(contagion.firms, contagion.liabilities);
const bumpB = minBumpToHalt(contagion, "B");
const bailout = bestBailout(contagion);
const contagionScene =
  `Five banks A, B, C, D and E are linked by interbank loans. Each holds a capital buffer that absorbs ` +
  `losses: A=$50, B=$80, C=$60, D=$300, E=$45. A bank defaults when its total incoming losses exceed ` +
  `its buffer; on default it passes the full face value of every loan it owes to its creditor ` +
  `(loss given default = 100%). The loans (debtor → creditor: amount) are: A owes B $100; B owes C $120; ` +
  `C owes E $70; D owes E $55; B owes D $40. An external shock hits bank A with a $120 loss. Resolve the ` +
  `cascade until no further bank defaults; if two banks would default at the same time, the one earlier ` +
  `in the order A, B, C, D, E is taken first.`;

const contagionItems: AuthoredItem[] = [
  wordItem({
    name: "financial_contagion_firm_c_survives",
    category: "financial",
    tier: 3,
    prompt: `${contagionScene}\n\nDoes bank C survive the shock? Answer yes or no.`,
    value: cascade.survives("C") ? "yes" : "no",
    why: `B defaults and passes $120 to C, exceeding C's $60 buffer, so C defaults — answer: ${cascade.survives("C") ? "yes" : "no"}.`,
    tags: ["TODO", "financial-model", "contagion", "default-cascade"],
  }),
  orderedItem({
    name: "financial_contagion_default_order",
    category: "financial",
    tier: 4,
    prompt:
      `${contagionScene}\n\nList every bank that defaults, in the order they fail, from first to last. ` +
      `Give the bank letters in order.`,
    vocabulary: contagion.firms,
    expected: cascade.order,
    why: `Strict chain: A (120>50) → B (100>80) → C (120>60) → E (70>45); D's incoming $40 < $300 survives. Order ${cascade.order.join(", ")}.`,
    tags: ["TODO", "financial-model", "contagion", "ordered", "default-order"],
  }),
  exactItem({
    name: "financial_contagion_total_failed",
    category: "financial",
    tier: 3,
    prompt: `${contagionScene}\n\nHow many banks fail in total? Reply with only that number and no other figures.`,
    expected: String(cascade.failedCount),
    extract: "(\\d+)",
    why: `A, B, C and E default; D survives — ${cascade.failedCount} failures.`,
    tags: ["TODO", "financial-model", "contagion", "count"],
  }),
  exactItem({
    name: "financial_contagion_buffer_bump_halts",
    category: "financial",
    tier: 4,
    prompt:
      `${contagionScene}\n\nWhat is the smallest whole-dollar increase to bank B's buffer alone that ` +
      `reduces the total number of banks that fail? Reply with only that number and no other figures.`,
    expected: String(bumpB ?? 0),
    extract: "(\\d+)",
    why: `B's incoming loss is exactly $100; raising its buffer from $80 to $100 (a +$${bumpB} bump) stops B defaulting, so the cascade halts after A — only 1 failure instead of 4.`,
    tags: ["TODO", "financial-model", "contagion", "capstone", "buffer"],
  }),
  wordItem({
    name: "financial_contagion_best_bailout",
    category: "financial",
    tier: 4,
    prompt:
      `${contagionScene}\n\nA one-time buffer top-up to which single bank prevents the most failures ` +
      `overall? Reply with just that bank's letter.`,
    value: bailout.firm,
    why: `Shoring up bank ${bailout.firm} (the shock's entry point) absorbs the original loss and stops the cascade entirely (0 failures); any other single top-up leaves more banks failing.`,
    tags: ["TODO", "financial-model", "contagion", "bailout"],
  }),
];

// ── Battery 3 — Covenant breach timing (DSCR) ────────────────────────────────
const covNoi0 = 130;
const covGrowth = 0.02;
const covHorizon = 12;
const covThreshold = 1.25;
const covDebtService = (m: number): number => (m <= 3 ? 80 : m <= 6 ? 110 : 140);
const covSeries = dscrSeries(covNoi0, covGrowth, covDebtService, covHorizon);
const covMonth1 = round4(covSeries[0] ?? 0); // 1.625 (exact; do not round to cents)
const covBreachMonth = firstBreach(covSeries, covThreshold, "below");
const covState = classifyState(covSeries, covThreshold);
const covMinGrowthRaw = minGrowthToAvoidBreach(covNoi0, covDebtService, covHorizon, covThreshold);
const covMinGrowth = round4(covMinGrowthRaw); // 0.0508
const covenantScene =
  `A property loan carries a covenant requiring its Debt Service Coverage Ratio (DSCR = net operating ` +
  `income ÷ debt service) to stay at or above 1.25 every month; the covenant is breached only when the ` +
  `DSCR falls strictly below 1.25 (a DSCR of exactly 1.25 passes). Net operating income (NOI) is $130 in ` +
  `month 1 and grows 2% each month thereafter, so NOI in month t = 130 × 1.02^(t−1). Scheduled debt ` +
  `service steps up over time: $80/month in months 1–3, $110/month in months 4–6, and $140/month in ` +
  `months 7–12. Consider the 12-month horizon.`;

const covenantItems: AuthoredItem[] = [
  regexItem({
    name: "financial_covenant_dscr_month_1",
    category: "financial",
    tier: 2,
    prompt: `${covenantScene}\n\nWhat is the DSCR in month 1? Give your answer as a decimal.`,
    pattern: decimalPattern(covMonth1),
    label: `equals ${covMonth1}`,
    why: `Month 1: NOI $130 ÷ debt service $80 = ${covMonth1}.`,
    tags: ["TODO", "financial-model", "covenant", "dscr"],
  }),
  exactItem({
    name: "financial_covenant_first_breach_month",
    category: "financial",
    tier: 4,
    prompt: `${covenantScene}\n\nIn which month does the DSCR first fall below 1.25? Reply with only the month number.`,
    expected: String(covBreachMonth),
    extract: "(\\d+)",
    why: `Months 1–6 clear their tiers (month 4: 130·1.02³/110 ≈ 1.25+); the month-7 step-up to $140 binds: NOI₇ = 130·1.02⁶ ≈ 146.4, /140 ≈ 1.046 < 1.25. First breach = month ${covBreachMonth}.`,
    tags: ["TODO", "financial-model", "covenant", "capstone", "breach-timing"],
  }),
  wordItem({
    name: "financial_covenant_state",
    category: "financial",
    tier: 3,
    prompt:
      `${covenantScene}\n\nBy the end of the 12 months, is the borrower insolvent (DSCR ever below 1.0) ` +
      `or merely in breach of the covenant (DSCR below 1.25 but never below 1.0)? Answer "insolvent" or "in breach".`,
    value: covState,
    why: `The DSCR dips below 1.25 from month 7 but its minimum over the horizon stays above 1.0, so the borrower is ${covState}, not insolvent.`,
    tags: ["TODO", "financial-model", "covenant", "classification"],
  }),
  regexItem({
    name: "financial_covenant_min_growth_no_breach",
    category: "financial",
    tier: 4,
    prompt:
      `${covenantScene}\n\nHolding everything else fixed, what is the minimum constant monthly NOI growth ` +
      `rate that would avoid any covenant breach across all 12 months? Give your answer as a decimal to 4 places.`,
    pattern: decimalPattern(covMinGrowth),
    label: `equals ${covMinGrowth}`,
    why: `The month-7 step-up binds: 130·(1+g)⁶ ≥ 1.25·140 ⇒ g ≥ (175/130)^(1/6) − 1 ≈ ${covMinGrowth}.`,
    tags: ["TODO", "financial-model", "covenant", "min-growth"],
  }),
];

// ── Battery 4 — NPV / project choice ─────────────────────────────────────────
const projA = [-1000, 600, 500, 200];
const projB = [-1000, 200, 400, 800];
const npvRate = 0.08;
const npvA = round2v(npv(npvRate, projA)); // 142.99
const npvB = round2v(npv(npvRate, projB)); // 163.19
const whichProject = npvB > npvA ? "B" : "A";
const crossover = round4(crossoverRate(projA, projB)); // 0.1061
const npvDiff = diffStream(projA, projB);
const npvSignChanges = signChanges(npvDiff);
const totalA = projA.reduce((s, x) => s + x, 0);
const totalB = projB.reduce((s, x) => s + x, 0);
const paybackA = round4(paybackPeriod(projA, true)); // 1.8
const npvScene =
  `You must choose between two mutually exclusive three-year projects. All cash flows occur at year-end. ` +
  `Project A: invest $1,000 now (year 0), then receive $600 in year 1, $500 in year 2, and $200 in year 3. ` +
  `Project B: invest $1,000 now, then receive $200 in year 1, $400 in year 2, and $800 in year 3. Unless ` +
  `a part states otherwise, discount at ${npvRate * 100}% per year.`;

const npvItems: AuthoredItem[] = [
  regexItem({
    name: "financial_npv_project_a",
    category: "financial",
    tier: 3,
    prompt: `${npvScene}\n\nWhat is the net present value of Project A at the ${npvRate * 100}% discount rate? Give your answer in dollars to the nearest cent.`,
    pattern: decimalPattern(npvA),
    label: `equals ${npvA}`,
    why: `NPV(A) = −1000 + 600/1.08 + 500/1.08² + 200/1.08³ = ${npvA}.`,
    tags: ["TODO", "financial-model", "npv", "discounting"],
  }),
  regexItem({
    name: "financial_npv_project_b",
    category: "financial",
    tier: 3,
    prompt: `${npvScene}\n\nWhat is the net present value of Project B at the ${npvRate * 100}% discount rate? Give your answer in dollars to the nearest cent.`,
    pattern: decimalPattern(npvB),
    label: `equals ${npvB}`,
    why: `NPV(B) = −1000 + 200/1.08 + 400/1.08² + 800/1.08³ = ${npvB}.`,
    tags: ["TODO", "financial-model", "npv", "discounting"],
  }),
  wordItem({
    name: "financial_npv_which_project",
    category: "financial",
    tier: 2,
    prompt: `${npvScene}\n\nAt the ${npvRate * 100}% discount rate, which project has the higher NPV — A or B? Reply with just the letter.`,
    value: whichProject,
    why: `At 8% (below the crossover rate), NPV(B) ${npvB} > NPV(A) ${npvA}, so pick ${whichProject}.`,
    tags: ["TODO", "financial-model", "npv", "project-choice"],
  }),
  regexItem({
    name: "financial_npv_crossover_rate",
    category: "financial",
    tier: 4,
    prompt:
      `${npvScene}\n\nAt what single discount rate do the two projects have equal NPV (the crossover rate)? ` +
      `Give your answer as a decimal to 4 places.`,
    pattern: decimalPattern(crossover),
    label: `equals ${crossover}`,
    why: `The difference stream A−B = [0, 400, 100, −600] has one sign change, so a unique crossover exists where NPV(A)=NPV(B): r ≈ ${crossover} (both ≈ $98.90).`,
    tags: ["TODO", "financial-model", "npv", "capstone", "crossover"],
  }),
  regexItem({
    name: "financial_npv_payback_a",
    category: "financial",
    tier: 3,
    prompt:
      `${npvScene}\n\nWhat is the payback period of Project A, in years, interpolating fractionally within ` +
      `the year the outlay is recovered? Give your answer as a decimal.`,
    pattern: decimalPattern(paybackA),
    label: `equals ${paybackA}`,
    why: `Project A recovers $600 by end of year 1, needing $400 more of year 2's $500 inflow: 1 + 400/500 = ${paybackA} years.`,
    tags: ["TODO", "financial-model", "npv", "payback"],
  }),
];

// ── Battery 5 — Loan amortization with extra principal ───────────────────────
const amort = amortize(20000, 0.005, 60, 100);
const amortPayment = amort.payment; // 386.66
const amortBal12 = amort.schedule[11]?.balance ?? 0; // 15230.38
const amortTotalInterest = amort.totalInterest; // 2444.38
const amortPayoff = amort.payoffMonth; // 47
const amortScene =
  `A borrower takes a $20,000 loan at 6% annual interest compounded monthly (a 0.5% monthly rate) on a ` +
  `60-month level-payment schedule. On top of the scheduled payment, the borrower pays an extra $100 of ` +
  `principal every month starting in month 1. Each month interest accrues on the outstanding balance ` +
  `first, then the scheduled payment and the extra $100 are applied to principal. Work to exact cents; ` +
  `the final payment is whatever amount clears the remaining balance.`;

const amortItems: AuthoredItem[] = [
  regexItem({
    name: "financial_amort_monthly_payment",
    category: "financial",
    tier: 3,
    prompt: `${amortScene}\n\nWhat is the scheduled monthly payment (ignoring the extra principal)? Give your answer in dollars to the nearest cent.`,
    pattern: decimalPattern(amortPayment),
    label: `equals ${amortPayment}`,
    why: `A = P·i / (1 − (1+i)^−N) = 20000·0.005 / (1 − 1.005^−60) = $${amortPayment}.`,
    tags: ["TODO", "financial-model", "amortization", "payment"],
  }),
  regexItem({
    name: "financial_amort_balance_after_12",
    category: "financial",
    tier: 4,
    prompt:
      `${amortScene}\n\nWhat is the outstanding balance immediately after the 12th monthly payment ` +
      `(including the $100 extra each month)? Give your answer in dollars to the nearest cent.`,
    pattern: decimalPattern(amortBal12),
    label: `equals ${amortBal12}`,
    why: `Simulating 12 months with the $100 extra principal each month leaves a balance of $${amortBal12} (vs $16,463.94 with no extra).`,
    tags: ["TODO", "financial-model", "amortization", "balance"],
  }),
  regexItem({
    name: "financial_amort_total_interest",
    category: "financial",
    tier: 4,
    prompt: `${amortScene}\n\nWhat is the total interest paid over the life of the loan, given the $100 extra principal each month? Give your answer in dollars to the nearest cent.`,
    pattern: decimalPattern(amortTotalInterest),
    label: `equals ${amortTotalInterest}`,
    why: `Summing the interest portion of every payment until the balance clears gives $${amortTotalInterest} (vs $3,199.36 on the scheduled 60-month plan).`,
    tags: ["TODO", "financial-model", "amortization", "interest"],
  }),
  exactItem({
    name: "financial_amort_payoff_month",
    category: "financial",
    tier: 4,
    prompt:
      `${amortScene}\n\nIn which month is the loan fully paid off, given the $100 extra principal each ` +
      `month? Reply with only the month number.`,
    expected: String(amortPayoff),
    extract: "(\\d+)",
    why: `The extra principal accelerates payoff: the balance reaches zero in month ${amortPayoff} (vs the scheduled 60).`,
    tags: ["TODO", "financial-model", "amortization", "capstone", "payoff"],
  }),
];

const financialBatteryItems: AuthoredItem[] = [
  ...waterfallItems,
  ...contagionItems,
  ...covenantItems,
  ...npvItems,
  ...amortItems,
];

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST BATTERIES — deeper-reasoning scenarios (Bayesian, folk theorem, moral
// hazard, web-of-trust, decayed reputation). Each scenario world is authored once
// and exposes 4 sibling dimensions; every battery carries a wide-numeric capstone.
// Ground truth comes from the solvers (alignment.ts / repeated.ts / webOfTrust.ts);
// see docs/superpowers/specs/2026-06-26-trust-challenges-design.md.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Battery 1 — Bayesian trust calibration ───────────────────────────────────
const B1 = { pi: 0.4, s: 0.8, t: 0.7, g: 4, b: 2 } as const;
const b1Scenario =
  `An informant, Sable, is either Honest or Dishonest. Before any dealings you judge the prior ` +
  `probability that Sable is Honest to be ${B1.pi}. Each report Sable files is independently rated ` +
  `"corroborated" (a good signal) or "contradicted" (a bad signal). An Honest informant's report is ` +
  `corroborated with probability ${B1.s}; a Dishonest informant's report is corroborated with ` +
  `probability ${1 - B1.t} (so contradicted with probability ${B1.t}). Reports are conditionally ` +
  `independent given Sable's type. So far Sable has filed ${B1.g} corroborated and ${B1.b} contradicted reports.`;
const b1Posterior = posteriorMean(B1.pi, B1.s, B1.t, B1.g, B1.b); // 0.733475
const b1PostExtraBad = posteriorMean(B1.pi, B1.s, B1.t, B1.g, B1.b + 1); // 0.440179
const b1Crosses = b1PostExtraBad < 0.5; // yes
const b1ToNinety = signalsToReach(B1.pi, B1.s, B1.t, B1.g, B1.b, 0.9); // 2

const bayesItems: AuthoredItem[] = [
  regexItem({
    name: "trust_bayes_posterior",
    category: "social",
    tier: 3,
    prompt:
      `${b1Scenario}\n\n` +
      `Using Bayes' rule, what is the probability that Sable is Honest given this history? ` +
      `Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b1Posterior),
    label: `equals ${b1Posterior}`,
    why:
      `Posterior odds = (0.4/0.6)·(0.8/0.3)^4·(0.2/0.7)^2 = 32768/11907 ≈ 2.751994; ` +
      `P(H|data) = 32768/44675 ≈ ${b1Posterior}.`,
    tags: ["TODO", "trust", "bayesian"],
  }),
  regexItem({
    name: "trust_bayes_after_extra_bad",
    category: "social",
    tier: 2,
    prompt:
      `${b1Scenario}\n\n` +
      `One further contradicted (bad) report now arrives. What is the new probability that Sable is ` +
      `Honest? Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b1PostExtraBad),
    label: `equals ${b1PostExtraBad}`,
    why: `Multiply the odds by the bad-signal factor (1−s)/t = 2/7: P = 65536/148885 ≈ ${b1PostExtraBad}.`,
    tags: ["TODO", "trust", "bayesian"],
  }),
  wordItem({
    name: "trust_bayes_crosses_half",
    category: "social",
    tier: 1,
    prompt:
      `${b1Scenario}\n\n` +
      `After that one extra contradicted report, has the probability that Sable is Honest fallen below ` +
      `one-half? Answer yes or no.`,
    value: b1Crosses ? "yes" : "no",
    why: `${b1Posterior} falls to ${b1PostExtraBad} after the extra bad signal, crossing below 0.5 — yes.`,
    tags: ["TODO", "trust", "bayesian"],
  }),
  exactItem({
    name: "trust_bayes_signals_to_ninety",
    category: "social",
    tier: 3,
    prompt:
      `${b1Scenario}\n\n` +
      `Starting from this same history, how many consecutive corroborated (good) reports are needed for ` +
      `the probability that Sable is Honest to reach 90%? Reply with only that whole number.`,
    expected: String(b1ToNinety),
    extract: "(\\d+)",
    why:
      `Each good report multiplies the odds by s/(1−t) = 8/3. From 2.751994: ` +
      `1 → 7.339 (P 0.880); 2 → 19.570 (P 0.951 ≥ 0.9). Answer ${b1ToNinety}.`,
    tags: ["TODO", "trust", "bayesian"],
  }),
];

// ── Battery 2 — Folk-theorem cooperation threshold (grim trigger) ────────────
const cartel: PayoffMatrix = {
  C: { C: [5, 5], D: [0, 9] },
  D: { C: [9, 0], D: [2, 2] },
};
const b2DeltaAt = 0.6;
const b2Scenario =
  `Two rival shippers repeatedly decide each season whether to Honour a price agreement (cooperate) ` +
  `or Undercut it (defect). In a single season the payoffs are: both Honour → 5 each; if you Undercut ` +
  `while the rival Honours you earn 9 and the rival earns 0; if you Honour while the rival Undercuts ` +
  `you earn 0 and the rival earns 9; both Undercut → 2 each. The game repeats indefinitely and each ` +
  `shipper discounts the next season's payoff by a factor δ. Both follow a grim-trigger strategy: ` +
  `Honour every season until the first Undercut, then Undercut forever.`;
const b2 = folkThreshold(cartel); // deltaStar 0.571429
const b2Temptation = temptationGain(cartel); // 4
const b2Sustainable = sustainableAt(cartel, b2DeltaAt); // yes
const b2Coop = perPeriodCoop(cartel); // 5

const folkItems: AuthoredItem[] = [
  exactItem({
    name: "trust_folk_temptation_gain",
    category: "social",
    tier: 2,
    prompt:
      `${b2Scenario}\n\n` +
      `In a single season, by how much does Undercutting beat Honouring when the rival Honours, before ` +
      `any future punishment is considered? Reply with only that whole number.`,
    expected: String(b2Temptation),
    extract: "(\\d+)",
    why: `Temptation minus reward, T − R = 9 − 5 = ${b2Temptation}.`,
    tags: ["TODO", "trust", "folk-theorem"],
  }),
  regexItem({
    name: "trust_folk_delta_star",
    category: "social",
    tier: 3,
    prompt:
      `${b2Scenario}\n\n` +
      `What is the minimum discount factor δ at which Honouring forever is sustainable as a subgame-perfect ` +
      `equilibrium under grim trigger? Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b2.deltaStar),
    label: `equals ${b2.deltaStar}`,
    why: `δ* = (T − R)/(T − P) = (9 − 5)/(9 − 2) = 4/7 ≈ ${b2.deltaStar}.`,
    tags: ["TODO", "trust", "folk-theorem"],
  }),
  wordItem({
    name: "trust_folk_sustainable_at_delta",
    category: "social",
    tier: 1,
    prompt:
      `${b2Scenario}\n\n` +
      `If the discount factor is δ = ${b2DeltaAt}, is Honouring forever sustainable under grim trigger? ` +
      `Answer yes or no.`,
    value: b2Sustainable ? "yes" : "no",
    why: `${b2DeltaAt} ≥ δ* = ${b2.deltaStar}, so cooperation is sustainable — yes.`,
    tags: ["TODO", "trust", "folk-theorem"],
  }),
  exactItem({
    name: "trust_folk_coop_payoff",
    category: "social",
    tier: 2,
    prompt:
      `${b2Scenario}\n\n` +
      `If both shippers Honour every season, what does each earn per season? Reply with only that whole number.`,
    expected: String(b2Coop),
    extract: "(\\d+)",
    why: `Mutual cooperation pays the reward R = ${b2Coop} each per season.`,
    tags: ["TODO", "trust", "folk-theorem"],
  }),
];

// ── Battery 3 — Moral hazard / incentive design ──────────────────────────────
const B3 = { pH: 0.8, pL: 0.5, cH: 10, cL: 2, vGood: 100, vBad: 0 } as const;
const b3Scenario =
  `A workshop hires a risk-neutral artisan who privately chooses high or low effort. High effort costs ` +
  `the artisan ${B3.cH} in disutility, low effort costs ${B3.cL}. The commission turns out good with ` +
  `probability ${B3.pH} under high effort and ${B3.pL} under low effort; a good piece is worth ` +
  `${B3.vGood} to the workshop and a bad piece ${B3.vBad}. The contract pays a base wage on a bad ` +
  `outcome and the base wage plus a bonus Δ on a good outcome. The artisan maximises expected wage ` +
  `minus effort cost, and the workshop sets the base so the artisan's participation constraint binds ` +
  `at a reservation utility of 0.`;
const b3Shirks = shirksUnderFlat(B3.cH, B3.cL); // yes
const b3Bonus = minBonusIC(B3.pH, B3.pL, B3.cH, B3.cL); // 26.666667
const b3Profit = principalProfitAtIC(B3.pH, B3.vGood, B3.vBad, B3.cH); // 70
const b3Worth = worthIncentivizing(B3.pH, B3.pL, B3.vGood, B3.vBad, B3.cH, B3.cL); // yes

const moralHazardItems: AuthoredItem[] = [
  wordItem({
    name: "trust_hazard_shirk_flat_wage",
    category: "social",
    tier: 1,
    prompt:
      `${b3Scenario}\n\n` +
      `Under a flat wage that pays the same regardless of outcome (bonus Δ = 0), does the artisan choose ` +
      `low effort (shirk)? Answer yes or no.`,
    value: b3Shirks ? "yes" : "no",
    why: `With Δ = 0, U(low) − U(high) = c_H − c_L = 10 − 2 = 8 > 0, so the artisan shirks — yes.`,
    tags: ["TODO", "trust", "moral-hazard"],
  }),
  regexItem({
    name: "trust_hazard_min_bonus",
    category: "social",
    tier: 3,
    prompt:
      `${b3Scenario}\n\n` +
      `What is the smallest good-outcome bonus Δ that makes high effort incentive-compatible? ` +
      `Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b3Bonus),
    label: `equals ${b3Bonus}`,
    why: `Δ* = (c_H − c_L)/(p_H − p_L) = (10 − 2)/(0.8 − 0.5) = 8/0.3 ≈ ${b3Bonus}.`,
    tags: ["TODO", "trust", "moral-hazard"],
  }),
  exactItem({
    name: "trust_hazard_principal_profit",
    category: "social",
    tier: 3,
    prompt:
      `${b3Scenario}\n\n` +
      `Setting the bonus to that minimum Δ with the participation constraint binding, what is the ` +
      `workshop's expected profit? Reply with only that whole number.`,
    expected: String(b3Profit),
    extract: "(-?\\d+)",
    why:
      `With participation binding the expected wage equals c_H = 10, so profit = ` +
      `p_H·V_good + (1−p_H)·V_bad − c_H = 0.8·100 − 10 = ${b3Profit}.`,
    tags: ["TODO", "trust", "moral-hazard"],
  }),
  wordItem({
    name: "trust_hazard_worth_incentivizing",
    category: "social",
    tier: 2,
    prompt:
      `${b3Scenario}\n\n` +
      `Compared with paying a flat wage and accepting low effort, is the workshop better off paying the ` +
      `minimum bonus Δ for high effort? Answer yes or no.`,
    value: b3Worth ? "yes" : "no",
    why:
      `Profit under high effort = 0.8·100 − 10 = 70; under low effort with a flat wage = 0.5·100 − 2 = 48. ` +
      `70 > 48 — yes.`,
    tags: ["TODO", "trust", "moral-hazard"],
  }),
];

// ── Battery 4 — Web of trust / transitive trust ──────────────────────────────
const trustEdges: Edge[] = [
  { from: "S", to: "A", w: 0.9 },
  { from: "S", to: "B", w: 0.5 },
  { from: "A", to: "T", w: 0.7 },
  { from: "A", to: "C", w: 0.8 },
  { from: "C", to: "T", w: 0.9 },
  { from: "B", to: "T", w: 0.95 },
  { from: "B", to: "C", w: 0.6 },
];
const edgeLine = (e: Edge): string => `${e.from}→${e.to} ${e.w}`;
const b4Scenario =
  `In a trust network each directed link u→v carries a direct-trust weight between 0 and 1. Trust along ` +
  `a chain is the PRODUCT of its link weights; where several chains connect two parties, their effective ` +
  `trust is the strongest chain (the maximum product) — do not add chains together. The links are: ` +
  `${trustEdges.map(edgeLine).join(", ")}.`;
const b4Best = bestPathTrust(trustEdges, "S", "T"); // value 0.648, path S A C T, tie false
const b4ReachAbove = reachableAbove(trustEdges, "S", "T", 0.6); // yes
const b4PathsAbove = pathsAbove(trustEdges, "S", "T", 0.4); // 3

const webOfTrustItems: AuthoredItem[] = [
  regexItem({
    name: "trust_web_best_path_value",
    category: "social",
    tier: 3,
    prompt:
      `${b4Scenario}\n\n` +
      `What is the strongest-chain (maximum-product) trust from S to T? Answer as a decimal.`,
    pattern: decimalPattern(b4Best.value),
    label: `equals ${b4Best.value}`,
    why:
      `Chains S→T: S→A→T = 0.63, S→A→C→T = 0.648, S→B→T = 0.475, S→B→C→T = 0.27. ` +
      `Strongest = ${b4Best.value} via S→A→C→T.`,
    tags: ["TODO", "trust", "web-of-trust"],
  }),
  orderedItem({
    name: "trust_web_best_path_sequence",
    category: "social",
    tier: 3,
    prompt:
      `${b4Scenario}\n\n` +
      `List the nodes of that strongest chain, in order from S to T.`,
    vocabulary: ["S", "A", "B", "C", "T"],
    expected: b4Best.path,
    why: `Strongest chain is S → A → C → T (product 0.648), strictly unique (no tie at the max).`,
    tags: ["TODO", "trust", "web-of-trust"],
  }),
  wordItem({
    name: "trust_web_reachable_above",
    category: "social",
    tier: 1,
    prompt:
      `${b4Scenario}\n\n` +
      `Is T reachable from S with strongest-chain trust above 0.6? Answer yes or no.`,
    value: b4ReachAbove ? "yes" : "no",
    why: `Strongest-chain trust 0.648 > 0.6 — yes.`,
    tags: ["TODO", "trust", "web-of-trust"],
  }),
  exactItem({
    name: "trust_web_paths_above",
    category: "social",
    tier: 2,
    prompt:
      `${b4Scenario}\n\n` +
      `How many distinct directed chains from S to T have a product strictly above 0.4? ` +
      `Reply with only that whole number.`,
    expected: String(b4PathsAbove),
    extract: "(\\d+)",
    why: `Products 0.648, 0.63, 0.475 exceed 0.4; 0.27 does not — ${b4PathsAbove} chains.`,
    tags: ["TODO", "trust", "web-of-trust"],
  }),
];

// ── Battery 5 — Decayed reputation with late reversal ────────────────────────
const B5_LAMBDA = 0.6;
const vale: RepActor = {
  name: "Vale",
  events: [
    { age: 0, good: false },
    { age: 1, good: false },
    { age: 2, good: true },
    { age: 3, good: true },
    { age: 4, good: true },
    { age: 5, good: true },
  ],
};
const pell: RepActor = {
  name: "Pell",
  events: [
    { age: 0, good: true },
    { age: 1, good: true },
    { age: 2, good: true },
    { age: 3, good: false },
    { age: 4, good: false },
    { age: 5, good: false },
  ],
};
const markLine = (a: RepActor): string =>
  `${a.name}, newest to oldest: ${a.events.map((e) => (e.good ? "kept" : "broken")).join(", ")}`;
const b5Scenario =
  `Two brokers, Vale and Pell, each carry six chronological feedback marks, listed from most recent ` +
  `(0 rounds ago) to oldest (5 rounds ago); each mark is either kept (good) or broken (bad). A ` +
  `recency-weighted reputation discounts each mark by λ raised to its age in rounds, with λ = ${B5_LAMBDA}, ` +
  `then applies Laplace smoothing: with decayed kept-mass P and broken-mass N, reputation = (P + 1)/(P + N + 2).\n` +
  `${markLine(vale)}.\n${markLine(pell)}.`;
const b5ValeFlat = flatScore(vale); // 0.666667
const b5ValeDecayed = decayedScore(vale, B5_LAMBDA); // 0.406848
const b5PellDecayed = decayedScore(pell, B5_LAMBDA); // 0.675281
const b5Top = mostTrustworthyDecayed([vale, pell], B5_LAMBDA); // Pell, tie false
const b5Gap = Math.round((b5ValeFlat - b5ValeDecayed) * 1e6) / 1e6; // 0.259819

const decayedItems: AuthoredItem[] = [
  regexItem({
    name: "trust_decay_flat_vale",
    category: "social",
    tier: 1,
    prompt:
      `${b5Scenario}\n\n` +
      `Ignoring timing entirely, what fraction of Vale's marks were kept? Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b5ValeFlat),
    label: `equals ${b5ValeFlat}`,
    why: `Vale kept 4 of 6 marks: 4/6 ≈ ${b5ValeFlat}.`,
    tags: ["TODO", "trust", "decayed-reputation"],
  }),
  regexItem({
    name: "trust_decay_vale_score",
    category: "social",
    tier: 3,
    prompt:
      `${b5Scenario}\n\n` +
      `What is Vale's recency-weighted reputation? Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b5ValeDecayed),
    label: `equals ${b5ValeDecayed}`,
    why:
      `P = λ²+λ³+λ⁴+λ⁵ = 0.78336, N = λ⁰+λ¹ = 1.6; reputation = 1.78336/4.38336 ≈ ${b5ValeDecayed}.`,
    tags: ["TODO", "trust", "decayed-reputation"],
  }),
  wordItem({
    name: "trust_decay_most_trustworthy",
    category: "social",
    tier: 3,
    prompt:
      `${b5Scenario}\n\n` +
      `Under this recency-weighted scoring, which broker is more trustworthy? Reply with just the name.`,
    value: b5Top.answer,
    why:
      `Decayed reputations: Vale ${b5ValeDecayed}, Pell ${b5PellDecayed}. Pell's recent record wins, ` +
      `reversing the flat ranking (Vale leads on raw counts).`,
    tags: ["TODO", "trust", "decayed-reputation"],
  }),
  regexItem({
    name: "trust_decay_flat_vs_decay_gap",
    category: "social",
    tier: 2,
    prompt:
      `${b5Scenario}\n\n` +
      `By how much does Vale's flat (untimed) kept-fraction exceed her recency-weighted reputation? ` +
      `Answer as a decimal to 6 places.`,
    pattern: decimalPattern(b5Gap),
    label: `equals ${b5Gap}`,
    why: `${b5ValeFlat} − ${b5ValeDecayed} = ${b5Gap}.`,
    tags: ["TODO", "trust", "decayed-reputation"],
  }),
];

const trustBatteryItems: AuthoredItem[] = [
  ...bayesItems,
  ...folkItems,
  ...moralHazardItems,
  ...webOfTrustItems,
  ...decayedItems,
];

// ── Report ───────────────────────────────────────────────────────────────────
console.log("=== TRUST & ALIGNMENT ===");
console.log("reliability:", trustworthy.ranking.map((r) => `${r.name}=${r.score}`).join("  "));
console.log("most trustworthy:", trustworthy.answer, trustworthy.tie ? "⚠️ TIE" : "");
console.log("Bex trusted?:", bexTrusted ? "yes" : "no");
console.log(
  "Tarl most aligned with:",
  tarlAlly.answer,
  "ranking:",
  tarlAlly.ranking.map((r) => `${r.name}=${r.score}`).join("  "),
);

console.log("\n=== ECONOMICS & GAME THEORY ===");
console.log(
  "dominant strategy:",
  dom,
  "| pure Nash:",
  nash.map((n) => `(${n.row},${n.col})`).join(" "),
);
console.log(
  "comparative advantage in wine:",
  wineAdvantage,
  `(opp cost A=${oppWineA} B=${oppWineB})`,
);

console.log("\n=== FINANCIAL: liquidity cascade ===");
console.log("breakeven (Flagship alone):", aloneBreak, " systemBreakeven (all):", sysBreak);
console.log(`one dollar low: first to fail =`, trap.entity, "month", trap.month);

console.log("\n=== REPEATED GAMES ===");
console.log("most cooperative:", coop.answer, coop.tie ? "⚠️ TIE" : "");
console.log("tit-for-tat round 6:", tftNext);
console.log(
  "repeated payoff: Rell",
  pay.a,
  "Sten",
  pay.b,
  "-> winner",
  pay.winner,
  pay.tie ? "⚠️ TIE" : "",
);

console.log("\n=== MORE ECON ===");
console.log("elasticity:", elasticity, "| marginal qty:", marginalQty);

console.log("\n=== BAILOUT CASCADE ===");
console.log(
  "bailout works for:",
  bailoutTarget.join(", ") || "none",
  "| min into Source:",
  bailoutAmount,
);

console.log("\n=== FINANCIAL BATTERIES (scenario worlds) ===");
console.log(
  "1 waterfall:",
  `payouts Senior=${wf.payouts.Senior} Mezz=${wf.payouts.Mezzanine} Junior=${wf.payouts.Junior} Equity=${wf.payouts.Equity}`,
  `| firstLoss=${wf.firstLoss} | equity-zero threshold=${wf.equityZeroThreshold}`,
);
console.log(
  "2 contagion:",
  `order=[${cascade.order.join(",")}] failed=${cascade.failedCount} C-survives=${cascade.survives("C")}`,
  `| acyclic=${contagionAcyclic ? "yes ✓" : "NO ⚠️ cyclic — single-scan invalid"}`,
  `| no same-round tie=${new Set(cascade.order).size === cascade.order.length ? "✓" : "⚠️"}`,
  `| minBump(B)=${bumpB} | bestBailout=${bailout.firm}(→${bailout.failedCount} fail)`,
);
console.log(
  "3 covenant:",
  `DSCR₁=${covMonth1} firstBreach=month ${covBreachMonth} state=${covState} minGrowth=${covMinGrowth}`,
  `| min DSCR over horizon=${round4(Math.min(...covSeries))} (>1.0 ⇒ in-breach not insolvent)`,
);
console.log(
  "4 npv:",
  `NPV(A)=${npvA} NPV(B)=${npvB} pick=${whichProject} crossover=${crossover} payback(A)=${paybackA}`,
  `| diff sign-changes=${npvSignChanges}${npvSignChanges === 1 ? " ✓ (unique crossover)" : " ⚠️ multi-root"}`,
  `| totals A=${totalA} B=${totalB}${totalA !== totalB ? " ✓ differ (r≠0)" : " ⚠️ equal — degenerate r=0"}`,
);
console.log(
  "5 amortization:",
  `payment=${amortPayment} bal@12=${amortBal12} totalInterest=${amortTotalInterest} payoff=month ${amortPayoff}`,
  `| final balance=${amort.schedule[amort.schedule.length - 1]?.balance} (cleared to 0 ✓)`,
);

console.log("\n=== TRUST BATTERIES (deeper reasoning) ===");
console.log("[1] Bayesian: P(H|hist) =", b1Posterior, "| +bad =", b1PostExtraBad, "| crosses<0.5 =", b1Crosses, "| to90% =", b1ToNinety);
console.log("[2] Folk:     δ* =", b2.deltaStar, "| temptation =", b2Temptation, `| sustainable@${b2DeltaAt} =`, b2Sustainable, "| coop/period =", b2Coop);
console.log("[3] Hazard:   Δ* =", b3Bonus, "| shirk(flat) =", b3Shirks, "| profit =", b3Profit, "| worth =", b3Worth);
console.log("[4] Web:      best =", b4Best.value, "path", b4Best.path.join("→"), b4Best.tie ? "⚠️ TIE" : "(unique)", "| reach>0.6 =", b4ReachAbove, "| paths>0.4 =", b4PathsAbove);
console.log("[5] Decay:    Vale flat =", b5ValeFlat, "decayed =", b5ValeDecayed, "| Pell decayed =", b5PellDecayed, "| top =", b5Top.answer, b5Top.tie ? "⚠️ TIE" : "(unique)", "| gap =", b5Gap);
if (b4Best.tie) console.log("⚠️ web-of-trust strongest PATH is NOT unique — fix edge weights");
if (b5Top.tie) console.log("⚠️ decayed argmax is NOT unique — widen the score gap");

console.log("\n=== writing suites ===");
for (const [id, items] of [
  ["trust", [...trustItems, ...repeatedItems, ...trustBatteryItems]],
  ["economics", [...econItems, ...econMoreItems]],
  ["financial", [...financialItems, ...financialMoreItems, ...financialBatteryItems]],
] as const) {
  console.log("wrote", writeSuiteFile(CHALLENGES_DIR, id, items));
}
