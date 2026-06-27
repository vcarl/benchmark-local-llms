# Trust challenges — deeper-reasoning battery design

## Orientation

The trust domain is the weakest in the suite: every current item reduces to counting rows in a
visible table (`reliability` = kept/(kept+broke), `mostCooperative` = count of C's, `mostAligned`
= count of matching stances). This plan replaces that with five **scenario batteries** that demand
genuine reasoning — Bayesian updating, geometric discounting, principal-agent algebra, weighted
graph propagation, recency decay — while keeping a **deterministic, defensible** ground truth.

Each challenge is **one scenario world, authored once**, exposing **4–6 sibling sub-question items**,
each a scored dimension. Partial credit emerges from the siblings (4 of 5 passed = 0.8), so we do
not need per-item weights to get graded difficulty — but every scenario is built so that **narrow
(1-of-2 yes/no, 1-of-3) dimensions are a minority of the item count** and the wide, computed
dimensions dominate. Every scenario carries exactly one **wide-numeric capstone** (an open decimal
or count that is effectively non-guessable). One dimension (scenario 4's strongest *path*) needs the
new ordered/set scorer being built on a separate track — it is marked **⊕** with a single-name
fallback so the battery can ship before that scorer lands.

The intent in one line: **no more counting.** The same visible counts must yield different answers
depending on priors, discount factors, incentive gaps, edge weights, and decay — forcing the model
to compute, not tally.

The formula source of truth for all five is the resource pack on disk:
`/private/tmp/claude-501/-Users-vcarl-workspace-testbench-llms/5b29f6fb-cee3-475b-8ca1-f2c540a48381/scratchpad/resources-trust.md`.
Every solver below cites it; do not re-derive — implement against the pack's worked forms.

### Conventions inherited from the existing authoring stack

- Helpers are small pure functions returning `{ answer, ...detail, tie? }`, exact arithmetic,
  ties surfaced explicitly (mirror `alignment.ts` / `repeated.ts`).
- Rounding idiom: `round(x) = Math.round(x * 1e6) / 1e6`; `EPS = 1e-9`. Reuse, don't reinvent.
- Emit via `scripts/author/emit.ts`: `exactItem` (integers, last-match `extract`),
  `decimalPattern`/`regexItem` (decimals, accepts `0.5`/`.5`/`0.50`), `wordItem`/`wholeWordPattern`
  (names, yes/no — word-boundary anchored), `containsItem` (sets, lenient).
- Author in `scripts/author/draft.ts`, run `npx tsx scripts/author/draft.ts`, read the computed
  answers + paste-ready YAML. Nothing writes to `challenges/` automatically.
- Decimals scored with `decimalPattern(value)` carry the canonical 6-dp value; integers/counts with
  `exactItem`; names/yes-no with `wordItem`.

### Citation hygiene (pack corrections — honor these)

- Folk-theorem δ* inequality: cite a **game-theory text** (Mailath & Samuelson; Fudenberg & Tirole
  §5.1; Osborne & Rubinstein Ch. 8), **not Wikipedia** (which shows only the numeric δ ≥ ½ case).
- Algorithmic Game Theory (Nisan et al. 2007) mechanism-design material is **Ch. 9** — relevant for
  citation discipline though none of these five is a mechanism-design item.
- Principal-agent: Mas-Colell, Whinston & Green Ch. 14; Bolton & Dewatripont Ch. 4.

### Where code lands (summary — all five need NEW helpers)

`repeated.ts` only sums *finite* payoff tables; `alignment.ts` reliability is *flat* counting.
Neither supports any computation below. New helpers, all reusing `round`/`EPS`:

| Helper file | For scenario | Effort | Notes |
|---|---|---|---|
| `bayesHonesty.ts` | 1 | low | `posteriorOdds`, `posteriorMean`, `signalsToReach` |
| `folkThreshold.ts` (or extend `repeated.ts`) | 2 | trivial | reuse `PayoffMatrix`/`PRISONERS` |
| `moralHazard.ts` | 3 | low | arithmetic only; value is in the framing |
| `webOfTrust.ts` | 4 | med-high | max-product widest-path; most code of the five |
| `decayedReputation.ts` (beside `alignment.ts`) | 5 | low | decayed Beta mass + argmax |

Leave `alignment.ts` and `repeated.ts` as-is (the existing shallow items stay). Add new files;
wire them into `draft.ts` alongside the current suites.

---

## Scenario 1 — Bayesian trust calibration

**Concept.** An actor is Honest (H) or Dishonest (D). A known prior `π = P(H)`, and each observed
signal has known reliability: an honest actor emits a *good* signal with probability `s`
(sensitivity); a dishonest actor emits a *good* signal with probability `1 − t` (so specificity
`t = P(bad | D)`). Signals are conditionally independent (state this in prose). After `g` good and
`b` bad signals, posterior odds and probability (pack §1, Form B):

```
posterior_odds = (π / (1−π)) · (s / (1−t))^g · ((1−s) / t)^b
P(H | data)    = posterior_odds / (1 + posterior_odds)
```

The point vs counting: the *same* good/bad tally yields very different posteriors as `s`, `t`, `π`
vary; asymmetric `s ≠ t` is where "just count the good signals" diverges most from the truth.

**Worked example (ground-truth check).** π = 0.4, s = 0.8, t = 0.7 (so P(good|D) = 0.3),
history g = 4 good, b = 2 bad.

```
prior odds      = 0.4/0.6              = 2/3
good factor     = (0.8/0.3)^4          = (8/3)^4   = 4096/81
bad factor      = (0.2/0.7)^2          = (2/7)^2   = 4/49
posterior_odds  = (2/3)(4096/81)(4/49) = 32768/11907 ≈ 2.751994
P(H | data)     = 32768/44675          ≈ 0.733475      ← CAPSTONE
```

Dimensions below all start from this scenario.

| # | Dimension | Framing | Answer / scorer | Rough weight |
|---|---|---|---|---|
| 1a | **Posterior P(H \| history)** | "Given the prior and signal reliabilities, what is the probability this actor is honest after the history? (6 dp)" | `decimalPattern(0.733475)` | **0.40 (capstone)** |
| 1b | Posterior after one more bad signal | "One further *bad* signal arrives. What is the new probability of honesty?" | `decimalPattern(0.440179)` | 0.25 |
| 1c | Does belief cross below 50%? | "After that extra bad signal, has belief in honesty fallen below one-half?" yes/no | `wordItem("yes")` | 0.10 (narrow) |
| 1d | Consecutive good signals to reach 90% | "Starting from the original history, how many consecutive good signals are needed for honesty to reach 90%?" | `exactItem("2")` | 0.25 |

- 1b: multiply odds by bad factor `(1−s)/t = 2/7`: `2.751994 × 0.285714 = 0.786284`; P = `65536/148885 ≈ 0.440179`.
- 1c: 0.733475 → 0.440179 crosses below 0.5 ⇒ **yes** (the one genuinely narrow dimension; minority).
- 1d: each good signal multiplies odds by `s/(1−t) = 8/3`. Need odds ≥ 9 (P ≥ 0.9). From 2.751994:
  n=1 → 7.33865 (P 0.880); n=2 → 19.5697 (P 0.951). Answer **2**.

**Solver — `bayesHonesty.ts`.**
```
posteriorOdds(pi, s, t, g, b): number        // exact ratio then round()
posteriorMean(pi, s, t, g, b): number        // odds/(1+odds)
signalsToReach(pi, s, t, g, b, target): number  // min extra good signals s.t. P>=target; loop, exact
```
Optionally `posteriorMeanBeta(α, β, k, n) = (α+k)/(α+β+n)` for the simpler Form-A (Beta-Bernoulli)
instances. Algorithm is direct arithmetic; `signalsToReach` is a bounded loop multiplying odds by
the good-factor until `P ≥ target`.

**Edge cases (pack §1).** Forbid `s, t, π ∈ {0, 1}` — `s=1` or `t=1` lets a single contradicting
signal force the posterior to 0/1 and collapse the answer space. Keep sensitivity/specificity
strictly in (0,1). Use exact rational arithmetic, then `round()` to 6 dp. State conditional
independence in the prose.

**Variation axes / difficulty.** Highest-value axis is the **(s, t) pair** — asymmetric `s ≠ t`
(honest rarely lies, dishonest sometimes tells truth) maximally separates correct posterior from
naive counting. Push `s, t` toward 0.5 to make signals weakly informative (more arithmetic
sensitivity, harder). Other knobs: `π`; the g/b counts; presenting signals in temporal order
(distractor) vs as counts; Form A vs Form B. Tier 3 for 1a/1d, tier 2 for 1b, tier 1 for 1c.

**Citations.** Bishop, *PRML* (2006) §2.1.1 (Beta conjugate); Gelman et al., *BDA* 3rd ed. Ch. 2
§2.1; likelihood-ratio form from signal-detection theory (Green & Swets 1966) and diagnostic Bayes
(Westover et al., *J. Clin. Epidemiol.* 2020).

**Uniqueness risk:** none, provided the boundary parameters are forbidden.

---

## Scenario 2 — Folk-theorem cooperation threshold (grim trigger)

**Concept.** A symmetric stage prisoner's dilemma with payoffs `T > R > P > S` (Temptation,
Reward, Punishment, Sucker), played infinitely with discount factor δ under **grim trigger**
(cooperate until any defection, then defect forever). Cooperating forever pays `R/(1−δ)`; the best
one-shot deviation pays `T + δ·P/(1−δ)`. Cooperation is a subgame-perfect equilibrium iff
`R/(1−δ) ≥ T + δ·P/(1−δ)`, which collapses to the critical discount factor (pack §3):

```
δ* = (T − R) / (T − P)        cooperation sustainable  ⇔  δ ≥ δ*
```

The point vs counting/summing: `repeatedPayoff` sums a *finite* table; this is the infinite
geometric-discounting threshold via the one-shot-deviation principle — a different computation.

**Worked example.** Choose `T = 9, R = 5, P = 2, S = 0` (deliberately not the textbook δ*=½):

```
temptation gain T − R = 4
δ* = (9 − 5)/(9 − 2) = 4/7 ≈ 0.571429        ← CAPSTONE
at δ = 0.6:  0.6 ≥ 0.571429  ⇒ sustainable = yes
cooperative per-period payoff = R = 5
```

| # | Dimension | Framing | Answer / scorer | Rough weight |
|---|---|---|---|---|
| 2a | One-shot temptation gain | "By how much does defecting this round beat cooperating, before any punishment? (T − R)" | `exactItem("4")` | 0.20 |
| 2b | **Critical discount factor δ\*** | "Under grim trigger, what is the minimum discount factor at which cooperating forever is sustainable? (6 dp)" | `decimalPattern(0.571429)` | **0.40 (capstone)** |
| 2c | Sustainable at given δ? | "At a discount factor of 0.6, is cooperation sustainable under grim trigger?" yes/no | `wordItem("yes")` | 0.15 (narrow) |
| 2d | Cooperative per-period payoff | "If both cooperate every round, what does each earn per period?" | `exactItem("5")` | 0.25 |

**Solver — `folkThreshold.ts`** (reuse `PayoffMatrix`/`PRISONERS` from `repeated.ts`; do **not**
extend `repeatedPayoff`, which is finite-horizon):
```
folkThreshold(matrix): { deltaStar, T, R, P, S }   // (T−R)/(T−P), rounded
sustainableAt(matrix, delta): boolean              // delta >= deltaStar (EPS-tolerant)
temptationGain(matrix): number                     // T − R
perPeriodCoop(matrix): number                      // R
```
Extract `T,R,P,S` from the matrix as the mutual-C, deviation, mutual-D, sucker payoffs.

**Edge cases (pack §3).** Require `T > R > P` so δ* ∈ (0,1) is valid. State grim trigger explicitly
(other punishments change the threshold). Pick the payoff quadruple so δ* is a **non-obvious
fraction** (avoid 0.5 — guards against recall). Keep the stage game symmetric for v1 (asymmetric
needs per-player δ* with the max as the binding constraint — defer).

**Variation axes / difficulty.** Highest-value axis is the **(T, R, P, S) quadruple** — it sets δ*
to an arbitrary rational in (0,1), making the capstone wide and forcing the algebra. Also: threshold
(2b, wide) vs yes/no-at-δ (2c, narrow — keep as minority); δ chosen just above vs just below δ* to
test boundary care. Tier 3 for 2b, tier 2 for 2a/2d, tier 1 for 2c.

**Citations.** Mailath & Samuelson, *Repeated Games and Reputations* (Oxford 2006) Ch. 2–3;
Fudenberg & Tirole, *Game Theory* (MIT 1991) §5.1; Osborne & Rubinstein, *A Course in Game Theory*
(MIT 1994) Ch. 8. **Not Wikipedia.**

**Uniqueness risk:** none (δ* is unique given `T > R > P`).

---

## Scenario 3 — Moral hazard / incentive design (principal-agent)

**Concept.** A risk-neutral agent chooses effort `e ∈ {low, high}`. High effort costs `c_H`, low
costs `c_L < c_H`. Output is good with probability `p_H` under high effort and `p_L < p_H` under
low. The contract pays `w_b` on a bad outcome and `w_b + Δ` on a good outcome (bonus Δ). Agent
maximizes expected net utility `E[wage] − cost`. Incentive-compatibility (high effort chosen) holds
iff `U(high) ≥ U(low)`, which gives the minimum bonus (pack §7):

```
Δ* = (c_H − c_L) / (p_H − p_L)        IC for high effort  ⇔  Δ ≥ Δ*
```

Under a **flat wage** (Δ = 0) the agent always shirks: `U(low) − U(high) = c_H − c_L > 0`.

The point vs counting: this is utility maximization under a contract, not a tally.

**Worked example.** `c_H = 10, c_L = 2, p_H = 0.8, p_L = 0.5`; output value `V = 100` good / `0`
bad; agent reservation utility 0 (participation/IR binds).

```
flat wage: U(low) − U(high) = 10 − 2 = 8 > 0   ⇒ shirks = yes
Δ* = (10 − 2)/(0.8 − 0.5) = 8/0.3 ≈ 26.666667          ← CAPSTONE
At Δ* with IR binding, expected wage = c_H = 10
principal profit (high) = p_H·V − c_H = 0.8·100 − 10 = 70
principal profit (low, flat) = p_L·V − c_L = 0.5·100 − 2 = 48
70 > 48  ⇒ worth incentivizing = yes
```

| # | Dimension | Framing | Answer / scorer | Rough weight |
|---|---|---|---|---|
| 3a | Shirk under flat wage? | "Under a flat wage that pays the same regardless of outcome, does the agent exert low effort (shirk)?" yes/no | `wordItem("yes")` | 0.15 (narrow) |
| 3b | **Minimum bonus Δ\*** | "What is the smallest good-outcome bonus that makes high effort incentive-compatible? (6 dp)" | `decimalPattern(26.666667)` | **0.40 (capstone)** |
| 3c | Principal's expected profit at Δ* | "Setting the bonus to Δ* (participation binding), what is the principal's expected profit?" | `exactItem("70")` | 0.25 |
| 3d | Is it worth incentivizing? | "Compared with paying a flat wage and accepting low effort, is the principal better off paying Δ* for high effort?" yes/no | `wordItem("yes")` | 0.20 |

**Solver — `moralHazard.ts`.**
```
shirksUnderFlat(c_H, c_L): boolean             // c_H > c_L
minBonusIC(p_H, p_L, c_H, c_L): number         // (c_H − c_L)/(p_H − p_L), rounded
principalProfitAtIC(p_H, V_good, V_bad, c_H): number   // p_H·V_good + (1−p_H)·V_bad − c_H  (IR binding ⇒ E[wage]=c_H)
worthIncentivizing(p_H, p_L, V_good, V_bad, c_H, c_L): boolean
```
Note for 3c: with IR binding and reservation 0, `E[wage|high] = c_H` exactly, so profit reduces to
`p_H·V_good + (1−p_H)·V_bad − c_H`. Keep utility risk-neutral (`u(w)=w`) for exact arithmetic.

**Edge cases (pack §7).** Require `p_H > p_L` (Δ* well-defined and unique). Avoid knife-edge ties in
the yes/no dimensions (strict inequalities). Risk-neutral utility + integer/decimal payoffs keeps
everything exact. A negative `w_b` (penalty on bad outcome) is legitimate in this model — do not
clamp it; the prose can frame it as a deposit/clawback if desired.

**Variation axes / difficulty.** Highest-value axis: **ask for Δ\*** (wide decimal) rather than
yes/no-shirk (binary) — forces the IC algebra. Also: the cost gap `c_H − c_L`; the probability gap
`p_H − p_L` (smaller gap ⇒ larger Δ*, more sensitive); output value V (drives 3c). Optional advanced
axis (defer): concave utility `u(w)=√w`, which breaks closed-form exactness. Tier 3 for 3b/3c, tier
2 for 3d, tier 1 for 3a.

**Citations.** Mas-Colell, Whinston & Green, *Microeconomic Theory* (Oxford 1995) Ch. 14 §14.B
(hidden action / moral hazard); Bolton & Dewatripont, *Contract Theory* (MIT 2005) Ch. 4.

**Uniqueness risk:** none (given `p_H > p_L` and strict inequalities in the yes/no dimensions).

---

## Scenario 4 — Web of trust / transitive trust (directed weighted graph)

**Concept.** A directed graph of actors with edge weights `w(u→v) ∈ [0,1]` = direct trust. Trust
along a path = **product** of its edge weights; trust from source `s` to target `t` aggregated
across competing paths = **max over paths** of the path product (max is order-independent, avoids
double-counting, and stays a valid [0,1] trust value — state "use the strongest chain"; do **not**
sum). Compute with a Dijkstra-style max-product (widest-path) relaxation (pack §4, Variant A —
Richardson et al.).

The point vs counting: this is graph traversal + path algebra, well beyond pairwise table lookup —
the model must enumerate competing paths and take the max product, not multiply the first chain.

**Worked example.** Nodes S, A, B, C, T. Edges:

```
S→A 0.9   S→B 0.5   A→T 0.7   A→C 0.8   C→T 0.9   B→T 0.95   B→C 0.6
```
Path products:
```
S→A→T      = 0.9·0.7        = 0.63
S→A→C→T    = 0.9·0.8·0.9    = 0.648    ← strongest
S→B→T      = 0.5·0.95       = 0.475
S→B→C→T    = 0.5·0.6·0.9    = 0.27
max-product trust S→T = 0.648 via S → A → C → T            ← CAPSTONE
```

| # | Dimension | Framing | Answer / scorer | Rough weight |
|---|---|---|---|---|
| 4a | **Max-product trust S→T** | "Trust along a chain is the product of its links; across chains take the strongest. What is the strongest-chain trust from S to T? (6 dp)" | `decimalPattern(0.648)` | **0.40 (capstone)** |
| 4b ⊕ | The strongest path itself | "List the nodes of that strongest chain, in order from S to T." | **`scorer: ordered_match`** (now implemented): `vocabulary: [S, A, B, C, T]` (closed set of candidate node names, required), `expected: [S, A, C, T]` (gold path; every element MUST be in `vocabulary` or load fails with a hard `ConfigError`), `caseSensitive` optional (default false). LCS-ratio partial credit, exact order for full. **Optional fallback** (no longer required): `wordItem("C")` — "which intermediary lies on the strongest chain but not on the second-best?" | 0.25 |
| 4c | Reachable above a threshold? | "Is T reachable from S with trust above 0.6?" yes/no | `wordItem("yes")` | 0.15 (narrow) |
| 4d | Number of distinct paths above a threshold | "How many distinct directed paths from S to T have product strictly above 0.4?" | `exactItem("3")` | 0.20 |

- 4c: 0.648 > 0.6 ⇒ **yes**.
- 4d: products 0.648, 0.63, 0.475 are > 0.4; 0.27 is not ⇒ **3**.
- 4b fallback rationale: the second-best path (S→A→T, 0.63) shares A but not C, so C uniquely
  identifies the strongest chain — a clean single-name target while the ⊕ ordered scorer is pending.

**⊕ dependency.** 4b's full form (an *ordered* node sequence) uses `scorer: ordered_match`, now
implemented on the separate track. Ship 4b directly as the ordered sequence (`vocabulary: [S, A, B,
C, T]`, `expected: [S, A, C, T]`); the `wordItem("C")` fallback is optional, not required. The
capstone (4a) and the other dimensions do not depend on ⊕.

**Solver — `webOfTrust.ts`.**
```
type Edge = { from: string; to: string; w: number }   // w in [0,1]
bestPathTrust(edges, s, t): { value: number; path: string[]; tie: boolean }
   // max-product widest-path: priority-queue relaxation maximizing product,
   // or DP over a topological order if the graph is a DAG. Track predecessor for `path`.
pathsAbove(edges, s, t, tau): number    // count distinct simple paths with product > tau (DFS enumerate)
reachableAbove(edges, s, t, tau): boolean   // bestPathTrust(...).value > tau
```
Algorithm: negate-log to turn max-product into a shortest-path, or relax `best[v] = max(best[v],
best[u]·w(u→v))`. Edge cases (pack §4): forbid cycles in v1 (DAG keeps `pathsAbove` enumeration
finite and the topological DP clean); max-product is still well-defined on cycles since extra hops
only shrink the product, but the path-count dimension needs simple-path enumeration so a DAG is
cleanest. Set `tie = true` when two distinct paths tie at the max (the *value* stays unique; only
path identity is ambiguous — this is the ⊕ risk, see below).

**Variation axes / difficulty.** Highest-value axis: **number of competing paths** source→target,
plus a **ring/path structure** with a tempting-but-weaker shorter path (here S→A→T at 0.63 lures the
model away from the longer-but-stronger S→A→C→T at 0.648). Knobs: graph depth/width; single best
path vs multi-path aggregation; the threshold in 4c/4d. Tier 3 for 4a/4b, tier 2 for 4d, tier 1 for
4c.

**Citations.** Richardson, Agrawal & Domingos, "Trust Management for the Semantic Web," *ISWC 2003*,
LNCS 2870:351–368 (path-product, the canonical citation); Guha et al., "Propagation of Trust and
Distrust," *WWW 2004*:403–412 (matrix propagation, models distrust); GNU Privacy Handbook /
GnuPG `marginals-needed`/`max-cert-depth` defaults (3/5) for the discrete PGP-validity variant
(kept out of v1).

**Uniqueness/solver risk — FLAGGED (pack §4 + cross-cutting table).**
- **Keep distrust (negative) edges out of v1.** Adding distrust requires committing to one of
  several combination rules (Guha et al.) and risks non-uniqueness/indefensibility. All weights in
  [0,1], max-product only.
- **The ⊕ path dimension (4b) is the only place a tie bites.** The capstone *value* (4a) stays
  unique even if two paths tie at the max, but the *path identity* would not. Author the edge
  weights so the maximizing path is **strictly** unique (assert `tie === false` at authoring time
  via `bestPathTrust`), otherwise the ⊕ ordered answer — and the single-name fallback — is
  ambiguous. The certifier here is cheap (one solver call); run it.

---

## Scenario 5 — Decayed reputation with late reversal

**Concept.** A cast of actors each has a chronological feedback history of good/bad events. The flat
score (existing `reliability`) is `good/(good+bad)` — it ignores recency. The recency-weighted score
applies an exponential forgetting factor `λ ∈ (0,1]` by event age `a` (0 = most recent), then a
Beta(1,1)-smoothed posterior mean (pack §2, Beta Reputation System):

```
P = Σ_{good events} λ^{age}        N = Σ_{bad events} λ^{age}
reputation = (P + 1) / (P + N + 2)        # in (0,1), defined even when P+N=0
```

The point vs counting: an actor with a great *old* record and recent betrayals should rank *below*
a steadily-improving actor under decay — the flat count gets this backwards. The scenario is
constructed so the **flat winner differs from the decay winner**.

**Worked example.** λ = 0.6. Two actors, ages 0 (newest) … 5 (oldest):

```
Vale  (newest→oldest): bad, bad, good, good, good, good   → flat = 4/6 ≈ 0.666667
Pell  (newest→oldest): good, good, good, bad, bad, bad     → flat = 3/6 = 0.5
flat winner = Vale

Vale decayed:  P = λ²+λ³+λ⁴+λ⁵ = 0.78336 ;  N = λ⁰+λ¹ = 1.6
   reputation = (0.78336+1)/(0.78336+1.6+2) = 1.78336/4.38336 ≈ 0.406846   ← CAPSTONE
Pell decayed:  P = λ⁰+λ¹+λ² = 1.96 ;         N = λ³+λ⁴+λ⁵ = 0.42336
   reputation = (1.96+1)/(1.96+0.42336+2) = 2.96/4.38336 ≈ 0.675281
decay winner = Pell   (≠ flat winner Vale)
flat-vs-decay gap for Vale = 0.666667 − 0.406846 = 0.259821
```
(Both share denominator 4.38336 because the total decayed mass `Σλ^a` over the six ages is identical
— only the good/bad split differs.)

| # | Dimension | Framing | Answer / scorer | Rough weight |
|---|---|---|---|---|
| 5a | Flat (undecayed) reliability of Vale | "Ignoring timing, what fraction of Vale's commitments were kept? (6 dp)" | `decimalPattern(0.666667)` | 0.15 |
| 5b | **Recency-weighted score of Vale (λ=0.6)** | "Weighting recent events by λ=0.6 per round of age and Laplace-smoothing, what is Vale's reputation? (6 dp)" | `decimalPattern(0.406846)` | **0.35 (capstone)** |
| 5c | Most trustworthy under decay | "Under the same decayed scoring, which actor is most trustworthy?" name | `wordItem("Pell")` | 0.25 |
| 5d | Flat-vs-decay gap for Vale | "By how much does Vale's flat score exceed her decayed score? (6 dp)" | `decimalPattern(0.259821)` | 0.25 |

5c is the payoff dimension: the decay winner (Pell) differs from the flat winner (Vale), so a model
that counts loses it.

**Solver — `decayedReputation.ts`** (lives beside `alignment.ts`; the existing flat `reliability`
stays):
```
type Event = { age: number; good: boolean }   // age 0 = most recent, integer rounds-ago
type Actor = { name: string; events: Event[] }
flatScore(actor): number                       // good/(good+bad), rounded  (matches reliability)
decayedScore(actor, lambda): number            // (P+1)/(P+N+2), rounded
mostTrustworthyDecayed(actors, lambda): { answer, ranking, tie }   // argmax, tie flagged like mostTrustworthy
```
Define age as **integer rounds-ago** so `λ^age` is exact. State the smoothing constants (+1/+2) in
the prose. Reuse the `Ranked` shape and `EPS` tie test from `alignment.ts`.

**Edge cases (pack §2).** The smoothed score is always in (0,1) and unique; the **only** tie risk is
the argmax dimension (5c) — flag it and author a clear separation (here 0.675 vs 0.407, no contest).
Smaller λ sharpens recency (a late flip dominates more). Keep λ ∈ (0,1].

**Variation axes / difficulty.** Highest-value axis: **λ combined with a late-reversal history** — a
recent betrayal after a long clean record, which flat counting scores wrong and decay scores right.
Knobs: λ (smaller = harder); number of events; how decisively a late negative outweighs old
positives; single-score vs argmax-across-actors; optional per-rater weights `w_j·λ^a` (defer to v2).
Tier 3 for 5b/5c, tier 2 for 5d, tier 1 for 5a.

**Citations.** Jøsang & Ismail, "The Beta Reputation System," *15th Bled e-Commerce Conf.* 2002 (the
forgetting-factor citation); Kamvar, Schlosser & Garcia-Molina, "EigenTrust," *WWW 2003* (for the
weighted-aggregation idea — note EigenTrust itself is not time-decayed).

**Uniqueness/solver risk:** argmax ties only (5c). Author a wide score gap and assert `tie === false`
at authoring time. Otherwise none.

---

## Authoring checklist (all five)

- Build each new helper, wire it into `draft.ts`, run `npx tsx scripts/author/draft.ts`, and confirm
  the printed answers match the worked examples above **before** emitting YAML.
- Per battery, keep narrow yes/no dimensions a **minority of the item count** (≤1 of 4) and the wide
  capstone the heaviest dimension.
- Surface every `tie` flag in the draft report (mirror the existing `⚠️ TIE` logging); for scenarios
  4b and 5c, assert no tie at authoring time.
- Tag items `["TODO", "trust", <topic>]` until reviewed; emit decimals with `decimalPattern`,
  counts/integers with `exactItem`, names/yes-no with `wordItem`.
- Scenario 4b ships with the `wordItem` fallback; track the ⊕ ordered/set scorer and swap 4b to the
  sequence form when it lands.
