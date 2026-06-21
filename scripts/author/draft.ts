// Scratch authoring space — edit the scenarios, run `npx tsx
// scripts/author/draft.ts`, read the computed answers + the paste-ready
// exact_match YAML. WE author the scenario; the helpers do the bookkeeping.
// Nothing here is written to challenges/ automatically.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describe as describeHistory,
  type History,
  mostAligned,
  mostTrustworthy,
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
  regexItem,
  wordItem,
  writeSuiteFile,
} from "./emit.js";
import {
  breakeven,
  describe as describeFinancial,
  insolvency,
  type Model,
  minInjectionToSolvency,
  systemBreakeven,
} from "./financial.js";
import {
  type Move,
  mostCooperative,
  type PlayerRounds,
  repeatedPayoff,
  titForTatNext,
} from "./repeated.js";

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

console.log("\n=== writing suites ===");
for (const [id, items] of [
  ["trust", [...trustItems, ...repeatedItems]],
  ["economics", [...econItems, ...econMoreItems]],
  ["financial", [...financialItems, ...financialMoreItems]],
] as const) {
  console.log("wrote", writeSuiteFile(CHALLENGES_DIR, id, items));
}
