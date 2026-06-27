# Economics challenge battery — design plan

Five new economics challenges, each a **scenario battery**: one scenario world,
authored once, with 4–6 sibling sub-question **items**, each its own scored
dimension. Partial credit emerges from the siblings — pass 4 of 5 items and the
suite scores 0.8 (mirrors the existing `bailout_target` / `bailout_amount` pair
sharing one cascade scenario). Because the suite scores items **equally** (the
lever is item *count*, not per-item weight), every battery must center a **wide
numeric capstone** — an open number, not a 1-of-2/1-of-3 guess — and may carry at
most **one** narrow (direction / name / yes-no) dimension so the narrow stuff
stays minority weight beside the wide factors that drive it. All five use only
`exact_match` (integers) and `constraint` regex (`decimalPattern` decimals,
`wholeWordPattern` words) — no set/ordered scorers.

**Formula source of truth:**
`/private/tmp/claude-501/-Users-vcarl-workspace-testbench-llms/5b29f6fb-cee3-475b-8ca1-f2c540a48381/scratchpad/resources-economics.md`
(every solver, citation, edge case, and flagged hazard below is drawn from it).

**Where code lands:** all five need NEW pure helpers in `scripts/author/econ.ts`
(none of these exist today — the file currently has only `dominantStrategy`,
`pureNash`, `describeGame`, `opportunityCost`, `priceElasticity`,
`profitMaxQuantity`). Scenario data + prompts are authored in
`scripts/author/draft.ts`; items are emitted with `exactItem` / `regexItem` /
`wordItem` from `scripts/author/emit.ts`. Helpers return ground truth only; the
draft script holds the scenario numbers and prose, exactly as the existing econ
block does. Match the file's idioms: pure exported functions, JSDoc stating the
exact convention, payoffs as `[rowPayoff, colPayoff]` tuples, matrices `[i][j]`.

---

## Scenario 1 — Mixed-strategy game (no pure equilibrium)

**Concept.** A 2×2 strictly-competitive (zero-sum-shaped) game with **no pure
Nash equilibrium**, so each player must randomize. The indifference principle:
*my* mixing probability is pinned by the *opponent's* payoffs, not my own — the
conceptual inversion this scenario tests. Asymmetric payoffs push the answer off
the guessable 0.5 focal point.

**Worked example.** Tennis serve. Row = Server `{Aim L, Aim R}`, Col = Receiver
`{Anticipate L, Anticipate R}`. Payoff tuple `[server points, receiver points]`
per 10 rallies:

```
                  Receiver L     Receiver R
Server L           [10, 2]        [ 4, 8]
Server R           [ 6, 6]        [10, 2]
```

Using `r[i][j]`, `c[i][j]` with strategies indexed 0 (L) / 1 (R):
- `p` = row plays strat-0 prob = `(c11−c10)/(c00−c10−c01+c11)` = `(2−6)/(2−6−8+2)` = `−4/−10` = **0.4**
- `q` = col plays strat-0 prob = `(r11−r01)/(r00−r01−r10+r11)` = `(10−4)/(10−4−6+10)` = `6/10` = **0.6**
- value to row = `q·r00 + (1−q)·r01` = `0.6·10 + 0.4·4` = **7.6** (cross-checks: `q·r10+(1−q)·r11 = 0.6·6+0.4·10 = 7.6`)
- pure equilibria: **none** (every cell has a profitable unilateral deviation)

**Dimensions.**

| # | Question framing | Answer | Format / scorer | Tier | Weight |
|---|---|---|---|---|---|
| 1 | Does this game have any pure-strategy Nash equilibrium? (yes/no) | `no` | `wordItem` yes/no | 2 | narrow (the one allowed 1-of-2) |
| 2 | **Server's equilibrium probability of Aim L** (decimal) | `0.4` | `regexItem` + `decimalPattern(0.4)` | 3 | **capstone** |
| 3 | Receiver's equilibrium probability of Anticipate L (decimal) | `0.6` | `regexItem` + `decimalPattern(0.6)` | 3 | wide |
| 4 | Server's expected points per 10 rallies at equilibrium | `7.6` | `regexItem` + `decimalPattern(7.6)` | 3 | wide |

**Solver.** `mixedNash2x2(game: Game): { p: number; q: number; value: number } | null`
— reuses the existing `Game` interface directly. Algorithm: compute the two
indifference quotients above; return `null` if either denominator is 0 or if
`p`/`q` falls outside `(0,1)`. **Flagged risk (resource pack §1):** the fully
mixed equilibrium fails to exist when a player has a (weakly) dominant strategy
or the denominator is zero. The author script MUST screen the scenario —
`mixedNash2x2(game)` non-null AND `pureNash(game).length === 0` — to guarantee an
interior `0<p,q<1` solution. Use a classic matching-pennies / competitive payoff
shape so a pure equilibrium can't sneak in (the non-zero-sum coordination shapes
introduce pure equilibria; avoid them here). `pureNash` already exists and powers
dimension 1.

**Variation axes.** Payoff magnitudes; how far asymmetry pushes `p`,`q` off 0.5
(the highest-value lever — 0.5 is a guessable focal answer, so author the points
matrix asymmetric in both rows and columns). Tune integer payoffs so `p`,`q`, and
the value land on clean decimals for `decimalPattern`. Difficulty scales with how
non-obvious the indifference inversion is (payoffs where the naive "match my own
best cell" intuition is wrong).

**Citations.** Varian ch. 29 (mixed strategies & indifference); MWG ch. 8 §8.D
(existence & computation of mixed Nash); matching-pennies derivations cross-check.

---

## Scenario 2 — Sequential entry / backward induction (non-credible threat)

**Concept.** Sequential rationality: fold the game tree back from the leaves. An
incumbent threatens to "fight" entry, but fighting is off-equilibrium — not its
best response once entry has happened — so the threat is **non-credible**. Tests
multi-step lookahead and resisting the non-credible-threat trap (the backward-
induction outcome contradicts the naive forward guess).

**Worked example.** Entrant moves first (`Enter` / `Stay Out`); if `Enter`, the
Incumbent moves (`Fight` / `Accommodate`). Leaf payoffs `[entrant, incumbent]`:

```
Stay Out            → [ 0, 120]
Enter, Accommodate  → [40,  50]
Enter, Fight        → [-30, 25]
```

Backward induction:
- At the incumbent node: `Accommodate (50)` > `Fight (25)` → incumbent **accommodates**.
- At the entrant node, anticipating accommodation: `Enter (40)` > `Stay Out (0)` → entrant **enters**.
- **SPE = (Enter, Accommodate)**, payoffs `[40, 50]`.
- The "fight" threat is **not credible** (25 < 50, so fighting is never the incumbent's best response).
- Naive / threat-supported Nash = `(Stay Out, Fight)`, payoffs `[0, 120]` — sustained only by the empty threat.
- **Capstone — incumbent's payoff gap, naive-Nash minus SPE = `120 − 50` = 70**: the commitment value the incumbent would capture *if* the threat were credible.

All decision-node payoffs are strictly unique (50≠25, 40≠0) → single SPE, no ties.

**Dimensions.**

| # | Question framing | Answer | Format / scorer | Tier | Weight |
|---|---|---|---|---|---|
| 1 | The entrant's SPE action | `Enter` | `wordItem("Enter")` | 2 | narrow |
| 2 | The incumbent's SPE response | `Accommodate` | `wordItem("Accommodate")` | 2 | narrow* |
| 3 | Is the incumbent's "fight" threat credible? (yes/no) | `no` | `wordItem` yes/no | 2 | narrow* |
| 4 | **By how much higher is the incumbent's payoff in the threat-supported (Stay-Out) outcome than in the SPE?** | `70` | `exactItem` extract `(\d+)` | 3 | **capstone** |

\* This battery is action-heavy by nature; keep the capstone (4) the anchor and
consider promoting payoffs so a second wide item (e.g. "the entrant's SPE
payoff" = 40) replaces one narrow item if the 3 narrow dims feel too guessable.
The resource pack prefers the **payoff number** over the action name precisely
because a 2-action name is ~1-of-2 guessable.

**Solver.** A small tree type plus a fold:

```ts
type GameNode =
  | { player: number; actions: string[]; children: GameNode[] }  // decision node
  | { payoffs: number[] };                                        // leaf
function backwardInduct(node: GameNode):
  { path: string[]; firstAction: string; payoffs: number[] };
```

Recurse: leaf → return its payoff vector, empty path. Decision node for player
`k` → evaluate each child, pick the child maximizing component `k`, propagate
that payoff vector up and record the chosen action. Independent of the normal-
form `Game` interface. **Flagged risk (resource pack §2):** ties (two children
equal for player `k`) produce multiple SPE. The author script MUST assert
strictly unique optima at every decision node during generation, so the scored
tokens are deterministic. The naive-Nash leaf is authored directly (the
off-path `(Stay Out, Fight)` payoffs); dimension 4 is `naiveIncumbent −
backwardInduct(root).payoffs[1]`.

**Variation axes.** Tree depth (2 → 4 stages; difficulty scales steeply); whether
the myopic first-glance payoff differs from the SPE payoff (the "trap" instances
are hardest and most diagnostic — keep the threat off-equilibrium). Scale leaf
payoffs to make the capstone a distinctive multi-digit number, not a small
1-digit gap.

**Citations.** Varian ch. 29 (sequential games / entry); MWG ch. 9 §9.B (subgame
perfection & backward induction); Hamilton College sequential-duopoly notes:
https://academics.hamilton.edu/economics/cgeorges/game-theory-files/duopoly.pdf

---

## Scenario 3 — Cournot duopoly with asymmetric marginal costs

**Concept.** Two firms choose quantities simultaneously under linear inverse
demand; asymmetric marginal costs force the full asymmetric reaction-function
algebra (not a memorized `/3` symmetric template) and yield distinct per-firm
answers — the lower-cost firm produces more and earns more.

**Worked example.** Inverse demand `P = 120 − Q`, `Q = q1 + q2`, `b = 1`. Costs
`c1 = 20`, `c2 = 40`.
- `q1 = (a − 2c1 + c2)/(3b)` = `(120 − 40 + 40)/3` = **40**
- `q2 = (a − 2c2 + c1)/(3b)` = `(120 − 80 + 20)/3` = **20**
- `Q = 60`, `P = 120 − 60` = **60**
- firm-1 profit = `(P − c1)·q1` = `(60 − 20)·40` = **1600**
- firm-2 profit = `(60 − 40)·20` = 400
- which firm produces more → **firm 1** (the low-cost firm)

(Reaction-function cross-check: `q1 = (100 − q2)/2`, `q2 = (80 − q1)/2` → `q1 =
40`, `q2 = 20`.) Both quantities positive, `P > c2` → no corner solution.

**Dimensions.**

| # | Question framing | Answer | Format / scorer | Tier | Weight |
|---|---|---|---|---|---|
| 1 | **Firm 1's equilibrium quantity** | `40` | `exactItem` extract `(\d+)` | 3 | **capstone** |
| 2 | Firm 2's equilibrium quantity | `20` | `exactItem` extract `(\d+)` | 3 | wide |
| 3 | Market price | `60` | `exactItem` extract `(\d+)` | 2 | wide |
| 4 | Firm 1's profit | `1600` | `exactItem` extract `(\d+)` | 3 | wide (widest token) |
| 5 | Which firm produces more, firm 1 or firm 2? | `firm 1` | `wordItem("firm 1")` | 1 | narrow (the one allowed 1-of-2) |

**Solver.** `cournot({ a, b, costs }: { a: number; b: number; costs: number[] }):
{ quantities: number[]; price: number; profits: number[] }`. For `n` firms,
`q_i = (a − n·c_i + Σ_{j≠i} c_j)/(b(n+1))`; duopoly reduces to the formulas above.
**Flagged risk (resource pack §3): corner solutions** — if a firm's cost is so
high its `q_i < 0`, it should exit and the rest re-solve as a smaller oligopoly.
The author script MUST screen costs so every firm produces a positive quantity
(assert all `quantities[i] > 0`). Also note `(a−c)/(3b)` is generally non-integer
— tune `a`, `b`, `costs` to clean integers (as above) so `exact_match` works, or
fall back to `decimalPattern`. **Bertrand is explicitly excluded** (epsilon-
undercutting has no clean closed-form price under asymmetric costs); `cournot` is
the only oligopoly helper this battery needs. `profitMaxQuantity` is unrelated
(discrete MR/MC list) and must not be reused here.

**Variation axes.** Cost asymmetry (the highest-value lever — drives the distinct
per-firm answers and defeats the symmetric template); demand intercept/slope; `n`
firms (the helper generalizes). Difficulty scales with the cost gap and with
asking profit (which compounds quantity × price − cost) over a bare quantity.

**Citations.** Varian ch. 28 (Oligopoly — Cournot reaction functions); MWG ch. 12
§12.C (quantity vs price competition); worked formulas:
https://policonomics.com/stackelberg-duopoly-model/ and
https://en.wikipedia.org/wiki/Stackelberg_competition

---

## Scenario 4 — Tax incidence & deadweight loss

**Concept.** Relative elasticities (slopes) determine who bears a per-unit tax —
the inelastic side bears more — plus the Harberger welfare triangle. Varying the
slope ratio makes the incidence split the crux and defeats a "50/50" guess.

**Worked example.** Demand `Qd = 100 − P` (`α=100, β=1`), supply `Qs = 20 + 3P`
(`γ=20, δ=3`), per-unit tax `t = 8`.
- No-tax: `P* = (α−γ)/(β+δ)` = `80/4` = **20**, `Q* = α − P*` = **80**
- buyer share = `δ/(β+δ)` = `3/4` = **0.75**; seller share = `β/(β+δ)` = 0.25 (demand is the more inelastic side, so buyers bear more)
- `Pb = P* + t·δ/(β+δ)` = `20 + 8·0.75` = **26**; `Ps = P* − t·β/(β+δ)` = `20 − 8·0.25` = **18** (check `Pb − Ps = 8 = t`)
- `ΔQ = βδt/(β+δ)` = `1·3·8/4` = 6 → post-tax quantity `Q_t = 80 − 6` = **74** (check: `Qd(26)=74`, `Qs(18)=74`)
- DWL = `½·t²·βδ/(β+δ)` = `½·64·0.75` = **24**
- tax revenue = `t·Q_t` = `8·74` = **592**

**Dimensions.**

| # | Question framing | Answer | Format / scorer | Tier | Weight |
|---|---|---|---|---|---|
| 1 | Post-tax equilibrium quantity | `74` | `exactItem` extract `(\d+)` | 2 | wide |
| 2 | Price paid by buyers | `26` | `exactItem` extract `(\d+)` | 2 | wide |
| 3 | Price received by sellers | `18` | `exactItem` extract `(\d+)` | 2 | wide |
| 4 | **Buyers' share of the tax burden** (decimal) | `0.75` | `regexItem` + `decimalPattern(0.75)` | 3 | **capstone** |
| 5 | Deadweight loss (dollars) | `24` | `exactItem` extract `(\d+)` | 3 | wide |
| 6 | Tax revenue (dollars) | `592` | `exactItem` extract `(\d+)` | 3 | wide (widest, least-guessable token) |

No narrow 1-of-2 item here — every dimension is an open number. The capstone is
the incidence share because it is the conceptual crux; note that DWL (24) and
revenue (592) are the widest tokens and anchor the battery against any focal-
value guess at 0.75.

**Solver.** `taxIncidence({ alpha, beta, gamma, delta, t }): { Pstar, Qstar, Pb,
Ps, buyerShare, sellerShare, deltaQ, Qtax, dwl, revenue }`. Pure arithmetic from
the formulas above. **Flagged risk (resource pack §4):** if a future variant
gives **elasticities** instead of slopes, they must be anchored at a stated
`(P*,Q*)` to recover `β,δ` — elasticity varies along a linear curve, so document
the convention in JSDoc (mirror `priceElasticity`'s "relative to initial values"
precision). Keep `t` and the slopes so DWL and revenue are clean integers; the
incidence share lands on a clean decimal for `decimalPattern`.

**Variation axes.** The elasticity / slope ratio `δ:β` is the highest-value lever
— it drives the incidence split (here 3:1 → buyers 0.75) and is the crux that
defeats 50/50; vary it (e.g. `β=1,δ=4` → 0.8; `β=2,δ=3` → 0.6) to move the share
off round values. Tax size drives DWL via `t²` (doubling `t` quadruples DWL).
Difficulty scales when the share is non-round and when DWL/revenue must be
composed rather than read off.

**Citations.** Varian ch. 16 (taxes, pass-through, deadweight loss); LibreTexts
*Intermediate Microeconomics with Excel* §17.3:
https://socialsci.libretexts.org/Bookshelves/Economics/Microeconomics/Intermediate_Microeconomics_with_Excel_(Barreto)/17:_Partial_Equilibrium/17.03:_Tax_Incidence_and_Deadweight_Loss ;
burden-share = PES/(PES+PED):
http://www.econport.org/content/handbook/Elasticity/elasticitydeadweightloss.html

---

## Scenario 5 — Monopoly with rising marginal cost

**Concept.** MR = MC optimization with the `MR = a − 2bQ` "twice-the-slope"
insight, and a **rising** linear MC that forces solving `a − 2bQ = e + fQ`
instead of plugging into the constant-MC `/2b` template. Contrasts the monopoly
restriction against the competitive `P = MC` benchmark and prices the welfare
loss.

**Worked example.** Inverse demand `P = 100 − Q` (`a=100, b=1`), so `MR = 100 −
2Q`. Marginal cost `MC = 10 + Q` (`e=10, f=1`), no fixed cost.
- `Q* = (a−e)/(2b+f)` = `90/3` = **30**; `P* = a − bQ*` = `100 − 30` = **70**
- monopoly profit = `P*·Q* − (e·Q* + ½f·Q*²)` = `2100 − (300 + 450)` = **1350**
- competitive benchmark `P = MC`: `Qc = (a−e)/(b+f)` = `90/2` = **45**, `Pc = 55` (= `MC(45) = 10+45`)
- DWL vs competition = triangle between demand and MC over `[Q*, Qc]` = `½·(45−30)·(demand−MC at Q*)` = `½·15·30` = **225** (∫₃₀⁴⁵ (90−2Q) dQ = 225)

**Dimensions.**

| # | Question framing | Answer | Format / scorer | Tier | Weight |
|---|---|---|---|---|---|
| 1 | **Profit-maximizing quantity** | `30` | `exactItem` extract `(\d+)` | 3 | **capstone** |
| 2 | Monopoly price | `70` | `exactItem` extract `(\d+)` | 2 | wide |
| 3 | Monopoly profit | `1350` | `exactItem` extract `(\d+)` | 3 | wide (widest token) |
| 4 | Competitive-quantity benchmark (`P = MC`) | `45` | `exactItem` extract `(\d+)` | 3 | wide |
| 5 | Deadweight loss vs perfect competition (dollars) | `225` | `exactItem` extract `(\d+)` | 3 | wide |

All-numeric, no narrow item. The capstone is the profit-maximizing quantity (the
core MR=MC skill); profit (1350) and DWL (225) are the most distinctive tokens.
The `Qc` item is the diagnostic distractor-defeater — a solver who sets `P = MC`
instead of `MR = MC` produces 45 for the monopoly quantity and is caught by the
gap between items 1 and 4.

**Solver.** `monopolyLinear({ a, b, mc }: { a: number; b: number; mc: { c:
number } | { e: number; f: number } }): { Q, P, profit, Qc, Pc, dwl }`. Constant
MC branch: `Q=(a−c)/(2b)`, `P=(a+c)/2`. Rising MC branch: `Q=(a−e)/(2b+f)`,
`P=a−bQ`, total cost `eQ+½fQ²`. Competitive: `Qc=(a−e)/(b+f)`; `dwl = ½·(Qc−Q)·
(P_demand(Q) − MC(Q))`. **Flagged risk (resource pack §5):** `(a−e)/(2b+f)` is
rarely integer — tune parameters to clean integers (as above) or accept
`decimalPattern`. Ensure `a > e` (else shutdown) and that MC doesn't cross demand
left of 0. This is the **continuous** analogue of the existing discrete
`profitMaxQuantity` — keep both; do not reuse the discrete helper.

**Variation axes.** Constant vs **rising** MC (rising is the highest-value lever —
forces the simultaneous solve); a fixed cost `F` shifts profit but not `Q*`/`P*`
(a good distractor — author one variant with `F` to test whether the solver keeps
it out of the quantity decision); what is asked (Q, P, profit, Lerner index,
consumer surplus, DWL). Difficulty scales with rising-MC slope and with composing
profit and DWL.

**Citations.** Varian ch. 25 (Monopoly — MR=MC, markup); MWG ch. 12 §12.B
(monopoly pricing).

---

## Build summary — new helpers for `scripts/author/econ.ts`

| Scenario | New helper(s) | Reuses |
|---|---|---|
| 1 | `mixedNash2x2(game: Game): { p, q, value } \| null` | existing `Game`, `pureNash` (for "any pure NE?") |
| 2 | `GameNode` type + `backwardInduct(node): { path, firstAction, payoffs }` | none (independent of `Game`) |
| 3 | `cournot({ a, b, costs }): { quantities, price, profits }` | none |
| 4 | `taxIncidence({ alpha, beta, gamma, delta, t }): { Pstar, Qstar, Pb, Ps, buyerShare, sellerShare, deltaQ, Qtax, dwl, revenue }` | none |
| 5 | `monopolyLinear({ a, b, mc }): { Q, P, profit, Qc, Pc, dwl }` | none (keep alongside discrete `profitMaxQuantity`) |

Each helper returns ground truth; the draft script asserts the screening
conditions (interior mixed Nash + no pure NE; strictly-unique SPE optima;
all-positive Cournot quantities) before emitting items, then writes the
`economics` suite via `writeSuiteFile`. Tag every new item `TODO` until reviewed,
matching the existing convention.

## Flagged solver risks (carry into implementation)

- **Scenario 1 (mixed Nash):** non-interior / zero-denominator games have no fully
  mixed equilibrium — screen to guarantee `0<p,q<1` AND `pureNash().length===0`.
- **Scenario 2 (backward induction):** ties at a decision node create multiple SPE
  — author strictly unique payoffs at every node and assert it during generation.
- **Scenario 3 (Cournot):** screen costs so every firm's equilibrium quantity is
  positive (no corner solution); **Bertrand epsilon-undercutting is excluded**.
- **Scenarios 3 & 5 (integer vs continuous):** closed forms are usually fractional
  — tune parameters to clean integers or commit to `decimalPattern`.
