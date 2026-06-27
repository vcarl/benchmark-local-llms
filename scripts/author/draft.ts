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
  backwardInduct,
  cournot,
  describeGame,
  dominantStrategy,
  type Game,
  type GameNode,
  mixedNash2x2,
  monopolyLinear,
  opportunityCost,
  priceElasticity,
  profitMaxQuantity,
  pureNash,
  taxIncidence,
  uniqueOptima,
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

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ECONOMICS CHALLENGE BATTERIES (→ economics suite)                          ║
// ║ Five scenario worlds, each authored once with 4–6 sibling items sharing    ║
// ║ that scenario's prose; every battery centres a wide-numeric capstone and    ║
// ║ carries ≤1 narrow (1-of-2/1-of-3) dimension. Ground truth comes from the    ║
// ║ econ.ts solvers; degeneracy screening is asserted in econ.test.ts and       ║
// ║ printed in the verification table below.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── Battery 1: mixed-strategy game (no pure Nash) ────────────────────────────
const tennis: Game = {
  rowName: "Server",
  colName: "Receiver",
  rowStrategies: ["Aim Left", "Aim Right"],
  colStrategies: ["Anticipate Left", "Anticipate Right"],
  // payoffs[i][j] = [server points, receiver points] per 10 rallies.
  payoffs: [
    [
      [10, 2],
      [4, 8],
    ],
    [
      [6, 6],
      [10, 2],
    ],
  ],
};
const tennisMix = mixedNash2x2(tennis);
const tennisPure = pureNash(tennis);
// Screening (interior fully-mixed AND no pure NE) — see verification table.
const tennisInterior = tennisMix !== null;
const tennisNoPure = tennisPure.length === 0;
const serverProbL = tennisMix?.p ?? 0; // 0.4
const receiverProbL = tennisMix?.q ?? 0; // 0.6
const serverValue = tennisMix?.value ?? 0; // 7.6
const tennisScenario =
  `Tennis serve, played as a one-shot simultaneous game. The Server chooses where to aim and the ` +
  `Receiver chooses where to anticipate; both decide at the same instant. The table shows points won ` +
  `per 10 rallies (Server points, Receiver points):\n${describeGame(tennis)}`;

const mixedItems: AuthoredItem[] = [
  wordItem({
    name: "econ_mixed_has_pure_ne",
    category: "economics",
    tier: 2,
    prompt:
      `${tennisScenario}\n\n` +
      `Does this game have any pure-strategy Nash equilibrium — a single (aim, anticipate) cell that ` +
      `neither player would unilaterally deviate from? Answer yes or no.`,
    value: tennisNoPure ? "no" : "yes",
    why: "Every cell has a profitable unilateral deviation (it cycles like matching pennies), so there is no pure-strategy Nash equilibrium — both players must randomise.",
    tags: ["TODO", "game-theory", "mixed-strategy"],
  }),
  regexItem({
    name: "econ_mixed_server_prob_left",
    category: "economics",
    tier: 3,
    prompt:
      `${tennisScenario}\n\n` +
      `In the mixed-strategy Nash equilibrium, with what probability does the SERVER aim Left? ` +
      `Reply with just the probability as a decimal between 0 and 1 (e.g. 0.5).`,
    pattern: decimalPattern(serverProbL),
    label: `equals ${serverProbL}`,
    why: "The Server mixes to make the Receiver indifferent, so it is pinned by the RECEIVER's payoffs: p = (c11−c10)/(c00−c10−c01+c11) = (2−6)/(2−6−8+2) = −4/−10 = 0.4.",
    tags: ["TODO", "game-theory", "mixed-strategy"],
  }),
  regexItem({
    name: "econ_mixed_receiver_prob_left",
    category: "economics",
    tier: 3,
    prompt:
      `${tennisScenario}\n\n` +
      `In the mixed-strategy Nash equilibrium, with what probability does the RECEIVER anticipate Left? ` +
      `Reply with just the probability as a decimal between 0 and 1 (e.g. 0.5).`,
    pattern: decimalPattern(receiverProbL),
    label: `equals ${receiverProbL}`,
    why: "The Receiver mixes to make the Server indifferent, pinned by the SERVER's payoffs: q = (r11−r01)/(r00−r01−r10+r11) = (10−4)/(10−4−6+10) = 6/10 = 0.6.",
    tags: ["TODO", "game-theory", "mixed-strategy"],
  }),
  regexItem({
    name: "econ_mixed_server_value",
    category: "economics",
    tier: 3,
    prompt:
      `${tennisScenario}\n\n` +
      `At the mixed-strategy equilibrium, how many points per 10 rallies does the Server expect to win? ` +
      `Reply with just the number as a decimal (e.g. 7.5).`,
    pattern: decimalPattern(serverValue),
    label: `equals ${serverValue}`,
    why: "Value to Server = q·r00 + (1−q)·r01 = 0.6·10 + 0.4·4 = 7.6 (cross-checks against the Aim-Right row: 0.6·6 + 0.4·10 = 7.6).",
    tags: ["TODO", "game-theory", "mixed-strategy"],
  }),
];

// ── Battery 2: sequential entry / backward induction (non-credible threat) ───
const entryTree: GameNode = {
  player: 0, // Entrant moves first
  actions: ["Enter", "Stay Out"],
  children: [
    {
      player: 1, // Incumbent responds only if entry happened
      actions: ["Accommodate", "Fight"],
      children: [{ payoffs: [40, 50] }, { payoffs: [-30, 25] }],
    },
    { payoffs: [0, 120] },
  ],
};
const entrySpe = backwardInduct(entryTree);
const entryUnique = uniqueOptima(entryTree); // strictly-unique optima → single SPE
const entrantSpePayoff = entrySpe.payoffs[0]; // 40
const incumbentSpePayoff = entrySpe.payoffs[1]; // 50
const incumbentStayOutPayoff = 120; // off-path Stay-Out leaf, authored directly
const threatGap = incumbentStayOutPayoff - incumbentSpePayoff; // 70
const threatCredible = entrySpe.path.includes("Fight"); // false
const entryScenario =
  `An Entrant decides whether to Enter a market or Stay Out. If it enters, the Incumbent then chooses ` +
  `to Accommodate (share the market) or Fight (a price war). Payoffs are annual profits in $ thousands, ` +
  `written [Entrant, Incumbent]:\n` +
  `- Entrant stays out → [0, 120]\n` +
  `- Entrant enters, Incumbent accommodates → [40, 50]\n` +
  `- Entrant enters, Incumbent fights → [-30, 25]\n\n` +
  `Before play, the Incumbent announces it will Fight any entry. The Entrant moves first; the Incumbent ` +
  `observes entry before responding.`;

const entryItems: AuthoredItem[] = [
  wordItem({
    name: "econ_entry_threat_credible",
    category: "economics",
    tier: 2,
    prompt:
      `${entryScenario}\n\n` +
      `Is the Incumbent's threat to Fight credible — would the Incumbent actually carry it out once the ` +
      `Entrant has entered? Answer yes or no.`,
    value: threatCredible ? "yes" : "no",
    why: "Once entry has happened, Accommodate (50) beats Fight (25), so fighting is never the Incumbent's best response. The threat is off-equilibrium and not credible: no.",
    tags: ["TODO", "game-theory", "backward-induction"],
  }),
  exactItem({
    name: "econ_entry_entrant_payoff",
    category: "economics",
    tier: 3,
    prompt:
      `${entryScenario}\n\n` +
      `Solving by backward induction, what profit (in $ thousands) does the ENTRANT earn at the ` +
      `subgame-perfect equilibrium? Reply with only that number and no other figures.`,
    expected: String(entrantSpePayoff),
    extract: "(-?\\d+)",
    why: "Anticipating Accommodate, the Entrant compares Enter (40) vs Stay Out (0) and enters. SPE = (Enter, Accommodate), so the Entrant earns 40.",
    tags: ["TODO", "game-theory", "backward-induction"],
  }),
  exactItem({
    name: "econ_entry_incumbent_payoff",
    category: "economics",
    tier: 3,
    prompt:
      `${entryScenario}\n\n` +
      `At the subgame-perfect equilibrium, what profit (in $ thousands) does the INCUMBENT earn? ` +
      `Reply with only that number and no other figures.`,
    expected: String(incumbentSpePayoff),
    extract: "(-?\\d+)",
    why: "At the SPE (Enter, Accommodate) the Incumbent accommodates and earns 50 — not the 120 it would keep if its non-credible Fight threat actually deterred entry.",
    tags: ["TODO", "game-theory", "backward-induction"],
  }),
  exactItem({
    name: "econ_entry_threat_gap",
    category: "economics",
    tier: 3,
    prompt:
      `${entryScenario}\n\n` +
      `By how much (in $ thousands) would the Incumbent's profit be HIGHER in the outcome its threat is ` +
      `meant to produce (the Entrant stays out) than in the subgame-perfect equilibrium it actually gets? ` +
      `Reply with only that number and no other figures.`,
    expected: String(threatGap),
    extract: "(\\d+)",
    why: "Stay-Out leaves the Incumbent 120; the SPE leaves it 50. The commitment value of a CREDIBLE deterrent would be 120 − 50 = 70.",
    tags: ["TODO", "game-theory", "backward-induction"],
  }),
];

// ── Battery 3: Cournot duopoly with asymmetric marginal costs ────────────────
const cournotParams = { a: 120, b: 1, costs: [20, 40] };
const duopoly = cournot(cournotParams);
const cournotAllPositive = duopoly.quantities.every((q) => q > 0); // corner-solution screen
const cq1 = duopoly.quantities[0]; // 40
const cq2 = duopoly.quantities[1]; // 20
const cPrice = duopoly.price; // 60
const cProfit1 = duopoly.profits[0]; // 1600
const moreFirm = cq1 > cq2 ? "firm 1" : "firm 2";
const cournotScenario =
  `Two firms compete by simultaneously choosing how much to produce (Cournot competition). Market ` +
  `inverse demand is P = 120 − Q, where Q = q1 + q2 is total output. Firm 1's constant marginal cost ` +
  `is $20 per unit; firm 2's is $40 per unit. There are no fixed costs.`;

const cournotItems: AuthoredItem[] = [
  exactItem({
    name: "econ_cournot_q1",
    category: "economics",
    tier: 3,
    prompt:
      `${cournotScenario}\n\n` +
      `In the Cournot–Nash equilibrium, how many units does FIRM 1 produce? ` +
      `Reply with only that number and no other figures.`,
    expected: String(cq1),
    extract: "(\\d+)",
    why: "q1 = (a − 2c1 + c2)/(3b) = (120 − 40 + 40)/3 = 40 (reaction functions q1=(100−q2)/2, q2=(80−q1)/2 give q1=40, q2=20).",
    tags: ["TODO", "economics", "cournot", "oligopoly"],
  }),
  exactItem({
    name: "econ_cournot_q2",
    category: "economics",
    tier: 3,
    prompt:
      `${cournotScenario}\n\n` +
      `In the Cournot–Nash equilibrium, how many units does FIRM 2 produce? ` +
      `Reply with only that number and no other figures.`,
    expected: String(cq2),
    extract: "(\\d+)",
    why: "q2 = (a − 2c2 + c1)/(3b) = (120 − 80 + 20)/3 = 20 — the higher-cost firm produces less.",
    tags: ["TODO", "economics", "cournot", "oligopoly"],
  }),
  exactItem({
    name: "econ_cournot_price",
    category: "economics",
    tier: 2,
    prompt:
      `${cournotScenario}\n\n` +
      `What is the equilibrium market price? Reply with only that number and no other figures.`,
    expected: String(cPrice),
    extract: "(\\d+)",
    why: "Q = q1 + q2 = 40 + 20 = 60, so P = 120 − 60 = 60.",
    tags: ["TODO", "economics", "cournot", "oligopoly"],
  }),
  exactItem({
    name: "econ_cournot_profit1",
    category: "economics",
    tier: 3,
    prompt:
      `${cournotScenario}\n\n` +
      `What is FIRM 1's equilibrium profit? Reply with only that number and no other figures.`,
    expected: String(cProfit1),
    extract: "(\\d+)",
    why: "Profit1 = (P − c1)·q1 = (60 − 20)·40 = 1600.",
    tags: ["TODO", "economics", "cournot", "oligopoly"],
  }),
  wordItem({
    name: "econ_cournot_which_firm",
    category: "economics",
    tier: 1,
    prompt:
      `${cournotScenario}\n\n` +
      `Which firm produces more in equilibrium, firm 1 or firm 2? Reply with just "firm 1" or "firm 2".`,
    value: moreFirm,
    why: "The lower-cost firm (firm 1, c=$20) produces more: 40 vs 20.",
    tags: ["TODO", "economics", "cournot", "oligopoly"],
  }),
];

// ── Battery 4: tax incidence & deadweight loss ───────────────────────────────
const taxParams = { alpha: 100, beta: 1, gamma: 20, delta: 3, t: 8 };
const tax = taxIncidence(taxParams);
const taxQt = tax.Qtax; // 74
const taxPb = tax.Pb; // 26
const taxPs = tax.Ps; // 18
const taxBuyerShare = tax.buyerShare; // 0.75
const taxDwl = tax.dwl; // 24
const taxRevenue = tax.revenue; // 592
const taxScenario =
  `A competitive market has demand Qd = 100 − P and supply Qs = 20 + 3P (P in dollars). The government ` +
  `imposes a per-unit tax of $8.`;

const taxItems: AuthoredItem[] = [
  exactItem({
    name: "econ_tax_quantity",
    category: "economics",
    tier: 2,
    prompt:
      `${taxScenario}\n\n` +
      `What is the quantity traded after the tax is imposed? Reply with only that number and no other figures.`,
    expected: String(taxQt),
    extract: "(\\d+)",
    why: "Pre-tax P*=(100−20)/4=20, Q*=80. The tax cuts quantity by ΔQ=βδt/(β+δ)=3·8/4=6, so Q_t=74 (Qd(26)=Qs(18)=74).",
    tags: ["TODO", "economics", "tax-incidence"],
  }),
  exactItem({
    name: "econ_tax_buyer_price",
    category: "economics",
    tier: 2,
    prompt:
      `${taxScenario}\n\n` +
      `What price do buyers pay after the tax? Reply with only that number and no other figures.`,
    expected: String(taxPb),
    extract: "(\\d+)",
    why: "Pb = P* + t·δ/(β+δ) = 20 + 8·0.75 = 26.",
    tags: ["TODO", "economics", "tax-incidence"],
  }),
  exactItem({
    name: "econ_tax_seller_price",
    category: "economics",
    tier: 2,
    prompt:
      `${taxScenario}\n\n` +
      `What price do sellers receive (net of the tax)? Reply with only that number and no other figures.`,
    expected: String(taxPs),
    extract: "(\\d+)",
    why: "Ps = P* − t·β/(β+δ) = 20 − 8·0.25 = 18 (check Pb − Ps = 26 − 18 = 8 = t).",
    tags: ["TODO", "economics", "tax-incidence"],
  }),
  regexItem({
    name: "econ_tax_buyer_share",
    category: "economics",
    tier: 3,
    prompt:
      `${taxScenario}\n\n` +
      `What fraction of the per-unit tax is borne by buyers? Reply with just the share as a decimal ` +
      `between 0 and 1 (e.g. 0.5).`,
    pattern: decimalPattern(taxBuyerShare),
    label: `equals ${taxBuyerShare}`,
    why: "Buyers' share = δ/(β+δ) = 3/(1+3) = 0.75. Demand is the more inelastic side (slope 1 vs 3), so buyers bear more.",
    tags: ["TODO", "economics", "tax-incidence"],
  }),
  exactItem({
    name: "econ_tax_dwl",
    category: "economics",
    tier: 3,
    prompt:
      `${taxScenario}\n\n` +
      `What is the deadweight loss caused by the tax, in dollars? Reply with only that number and no other figures.`,
    expected: String(taxDwl),
    extract: "(\\d+)",
    why: "DWL = ½·t²·βδ/(β+δ) = ½·64·(3/4) = 24 (the Harberger triangle ½·t·ΔQ = ½·8·6).",
    tags: ["TODO", "economics", "tax-incidence", "deadweight-loss"],
  }),
  exactItem({
    name: "econ_tax_revenue",
    category: "economics",
    tier: 3,
    prompt:
      `${taxScenario}\n\n` +
      `How much tax revenue does the government collect, in dollars? Reply with only that number and no other figures.`,
    expected: String(taxRevenue),
    extract: "(\\d+)",
    why: "Revenue = t·Q_t = 8·74 = 592.",
    tags: ["TODO", "economics", "tax-incidence"],
  }),
];

// ── Battery 5: monopoly with rising marginal cost ────────────────────────────
const monopolyParams = { a: 100, b: 1, mc: { e: 10, f: 1 } };
const monopoly = monopolyLinear(monopolyParams);
const mQ = monopoly.Q; // 30
const mP = monopoly.P; // 70
const mProfit = monopoly.profit; // 1350
const mQc = monopoly.Qc; // 45
const mDwl = monopoly.dwl; // 225
const monopolyScenario =
  `A monopolist faces inverse demand P = 100 − Q. Its marginal cost RISES with output: MC = 10 + Q. ` +
  `There are no fixed costs. (Recall that with demand P = a − bQ, marginal revenue is MR = a − 2bQ.)`;

const monopolyItems: AuthoredItem[] = [
  exactItem({
    name: "econ_monopoly_quantity",
    category: "economics",
    tier: 3,
    prompt:
      `${monopolyScenario}\n\n` +
      `What output maximises the monopolist's profit? Reply with only that number and no other figures.`,
    expected: String(mQ),
    extract: "(\\d+)",
    why: "Set MR = MC: 100 − 2Q = 10 + Q ⇒ Q* = (a−e)/(2b+f) = 90/3 = 30. (Setting P=MC instead gives the wrong 45.)",
    tags: ["TODO", "economics", "monopoly"],
  }),
  exactItem({
    name: "econ_monopoly_price",
    category: "economics",
    tier: 2,
    prompt:
      `${monopolyScenario}\n\n` +
      `What price does the monopolist charge? Reply with only that number and no other figures.`,
    expected: String(mP),
    extract: "(\\d+)",
    why: "P* = 100 − Q* = 100 − 30 = 70 (read off the demand curve, not MR).",
    tags: ["TODO", "economics", "monopoly"],
  }),
  exactItem({
    name: "econ_monopoly_profit",
    category: "economics",
    tier: 3,
    prompt:
      `${monopolyScenario}\n\n` +
      `What is the monopolist's profit? Reply with only that number and no other figures.`,
    expected: String(mProfit),
    extract: "(\\d+)",
    why: "Profit = P·Q − (eQ + ½fQ²) = 70·30 − (10·30 + ½·900) = 2100 − 750 = 1350.",
    tags: ["TODO", "economics", "monopoly"],
  }),
  exactItem({
    name: "econ_monopoly_competitive_quantity",
    category: "economics",
    tier: 3,
    prompt:
      `${monopolyScenario}\n\n` +
      `If this market were perfectly competitive instead (price equal to marginal cost), what quantity ` +
      `would be produced? Reply with only that number and no other figures.`,
    expected: String(mQc),
    extract: "(\\d+)",
    why: "P = MC: 100 − Q = 10 + Q ⇒ Qc = (a−e)/(b+f) = 90/2 = 45 (more than the monopoly's 30).",
    tags: ["TODO", "economics", "monopoly", "welfare"],
  }),
  exactItem({
    name: "econ_monopoly_dwl",
    category: "economics",
    tier: 3,
    prompt:
      `${monopolyScenario}\n\n` +
      `What is the deadweight loss of the monopoly relative to perfect competition, in dollars? ` +
      `Reply with only that number and no other figures.`,
    expected: String(mDwl),
    extract: "(\\d+)",
    why: "Triangle between demand and MC over [30, 45]: ½·(45−30)·(P(30)−MC(30)) = ½·15·(70−40) = 225.",
    tags: ["TODO", "economics", "monopoly", "deadweight-loss"],
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

console.log("\n=== ECONOMICS BATTERIES (answers + screening) ===");
console.log(
  "1 mixed Nash | serverProbL:",
  serverProbL,
  "receiverProbL:",
  receiverProbL,
  "serverValue:",
  serverValue,
  `| interior? ${tennisInterior}  noPureNE? ${tennisNoPure}`,
  tennisInterior && tennisNoPure ? "✅" : "⚠️ DEGENERATE",
);
console.log(
  "2 backward induction | SPE path:",
  entrySpe.path.join(" → "),
  "payoffs",
  `[${entrySpe.payoffs.join(",")}]`,
  "| entrant:",
  entrantSpePayoff,
  "incumbent:",
  incumbentSpePayoff,
  "threatGap:",
  threatGap,
  "credible?",
  threatCredible,
  `| uniqueSPE? ${entryUnique}`,
  entryUnique ? "✅" : "⚠️ TIE → MULTIPLE SPE",
);
console.log(
  "3 Cournot | q1:",
  cq1,
  "q2:",
  cq2,
  "P:",
  cPrice,
  "profit1:",
  cProfit1,
  "more:",
  moreFirm,
  `| allPositive? ${cournotAllPositive}`,
  cournotAllPositive ? "✅" : "⚠️ CORNER SOLUTION",
);
console.log(
  "4 tax incidence | Qt:",
  taxQt,
  "Pb:",
  taxPb,
  "Ps:",
  taxPs,
  "buyerShare:",
  taxBuyerShare,
  "DWL:",
  taxDwl,
  "revenue:",
  taxRevenue,
  `| wedge=t? ${taxPb - taxPs === taxParams.t}`,
);
console.log(
  "5 monopoly (rising MC) | Q:",
  mQ,
  "P:",
  mP,
  "profit:",
  mProfit,
  "Qc:",
  mQc,
  "DWL:",
  mDwl,
  `| Q<Qc? ${mQ < mQc}`,
);

console.log("\n=== writing suites ===");
for (const [id, items] of [
  ["trust", [...trustItems, ...repeatedItems]],
  [
    "economics",
    [
      ...econItems,
      ...econMoreItems,
      ...mixedItems,
      ...entryItems,
      ...cournotItems,
      ...taxItems,
      ...monopolyItems,
    ],
  ],
  ["financial", [...financialItems, ...financialMoreItems]],
] as const) {
  console.log("wrote", writeSuiteFile(CHALLENGES_DIR, id, items));
}
