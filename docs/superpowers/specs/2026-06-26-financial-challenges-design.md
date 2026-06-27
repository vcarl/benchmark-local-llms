# Financial challenge batteries — design plan

A challenge here is a **scenario battery**: one scenario world, authored once, carrying 4–6 sibling sub-question **items**, each its own scored dimension. Partial credit is per-item — answering 4 of 5 dimensions on a scenario yields 0.8 on that scenario — exactly mirroring the existing `financial_bailout_target` / `financial_bailout_amount` pair that share the single `chain` model in `scripts/author/draft.ts`. Every battery below **must** include a wide-numeric **capstone** dimension (an open dollar / period / rate figure that is not guessable); narrow 1-of-2 / 1-of-3 dimensions are permitted only as **minority weight** beside the wide factors, never as the main signal. Some dimensions want a set or ordered-list scorer that does not yet exist in `emit.ts` (marked ⊕); for those the spec gives a single-name fallback the author ships today.

**Source of truth for all formulas, citations, edge cases, and variation axes:** `/private/tmp/claude-501/-Users-vcarl-workspace-testbench-llms/5b29f6fb-cee3-475b-8ca1-f2c540a48381/scratchpad/resources-financial.md` (the "resource pack"). Section numbers below (`pack §N`) point into it. Do not re-derive math — pull it from there and cross-check against the worked answers in this doc.

## Conventions shared by all five batteries

- **Where code lands.** New pure helpers go in a single new file `scripts/author/financialModels.ts` (sibling to `financial.ts`), imported by `draft.ts` exactly like `financial.js` is today. `financial.ts` stays the monthly cash-sim; do **not** bolt these onto its `Model`/`simulate()` — they are different shapes. The covenant-breach loop (§3) and amortization loop (§5) are the only two that echo the `insolvency()` / `simulate()` month-loop idiom and may be cross-referenced for style.
- **Scorers available now** (`emit.ts`): `exactItem` (integer, last-match regex extract), `wordItem` (whole-word name/label), `regexItem` + `decimalPattern(value)` (decimal accepting `0.5`/`.5`/`0.50`). There is **no** native percentage scorer and **no** set/ordered-list scorer. Decimals (rates, dollars-with-cents) score via `decimalPattern`; integers via `exactItem`; names/labels via `wordItem`.
- **Decimal & percentage answers.** Author rates as **decimals** (`0.1061`) and dollars rounded to a stated precision, then score with `decimalPattern`. Pin the rounding rule in the prompt ("to the nearest cent", "as a decimal to 4 places"). Never ask for a `%` token — `decimalPattern` does not model the percent sign.
- **Every battery's `why` field** must restate the ground-truth number and the one-line reason, as the existing items do.
- Each item keeps `tags: ["TODO", ...]` until reviewed, per the existing convention.

---

## Scenario 1 — Payment waterfall (tranche priority)

**Concept.** A finite cash pool is allocated to tranches in strict priority order, each capped at its claim; the equity tranche absorbs the residual. The discriminating regime (pack §1, axis a) is a pool that lands *inside* a middle tranche: senior full, mezz partial, equity zero. Pack §1.

**Worked instance.** Pool = **$640**. Tranches in priority order: Senior claim $520, Mezz claim $310, Junior claim $185; Equity = residual.
- Senior payout = **$520** (full; remainder $120)
- Mezz payout = **$120** (partial fill; remainder $0)
- Junior payout = $0, Equity residual = **$0**
- First tranche to take a loss (first not paid in full) = **Mezz**
- Pool size at which equity = $0 (capstone) = sum of all non-equity claims = 520+310+185 = **$1015**

**Solver to write.** `waterfall(pool: number, tranches: {name,claim}[]): { payouts: Record<string,number>, firstLoss: string|null, equityZeroThreshold: number }` — pure reducer, no loop over time (pack §1 canonical `allocate`). Algorithm: running `avail`, `pay = min(avail, claim)`, record first tranche with `pay < claim` as `firstLoss`, `Equity = avail` after the loop, `equityZeroThreshold = Σ claims`. Edge cases (pack §1): pool exactly equal to a cumulative breakpoint (tranche fully but not over-paid); equity floored at 0, never pays in.

| Dimension | Framing | Answer / scorer | Weight |
|---|---|---|---|
| senior_payout | "How much does the senior tranche receive?" | `640→520` exactItem | minor |
| mezz_payout | "How much does the mezzanine tranche receive?" (the partial-fill case) | `120` exactItem | medium (wide $) |
| equity_residual | "How much is left for equity?" | `0` exactItem | minor |
| first_loss_tranche | "Name the most senior tranche **not** paid in full." | `Mezz` wordItem (1-of-3) | minor |
| **pool_equity_zero (capstone)** | "Below what total pool size do equity holders receive nothing?" | `1015` exactItem | **major (wide $)** |

**Variation axes** (pack §1): pool position relative to breakpoints (a — the core dial, slide it through senior→mezz→junior); tranche count 3→5+; two-pass interest-then-principal; pro-rata split within a level; OC/coverage-test diversion. Difficulty scales with tranche count and with placing the pool mid-tranche so the partial figure is non-obvious.

**Citations.** Fabozzi (structured finance / waterfall chapters); Truva Corp "Navigating Payment Waterfalls"; Alterest "Cash Flow Waterfalls" — see pack §1.

---

## Scenario 2 — Counterparty contagion (default cascade) ⊕

**Concept.** An external shock hits one firm; if its incoming losses exceed its capital buffer it defaults and passes loss-given-default to its creditors; re-scan until no new default. The first visible failure is rarely the root, and the *order* and *set* of failures must be computed, not guessed. Use the **threshold-cascade** variant (pack §2, "Simpler authorable variant"), not full Eisenberg–Noe, to stay deterministic and avoid the linear solve.

**Worked instance.** Firms A,B,C,D,E with buffers A=50, B=80, C=60, D=300, E=45. Liabilities (debtor→creditor : amount, LGD = 100% of the amount on default): A→B 100, B→C 120, C→E 70, D→E 55, B→D 40. External shock: firm **A** takes a $120 loss.
- Round-by-round: A (120 > 50) defaults → B takes 100; B (100 > 80) defaults → C takes 120, D takes 40; C (120 > 60) defaults → E takes 70; E (70 > 45) defaults. D's incoming = 40 < 300, survives.
- Does firm C survive the shock? → **No** (defaults).
- Default order = **A, B, C, E** ⊕
- Total firms failed = **4**
- Buffer bump to firm **B** that halts the cascade (capstone): a **+$20** bump to B (80→100) stops B defaulting, so only A fails (1 total). (Computed minimum bumps that *reduce* the count: B +20→1 fail, C +60→2, E +25→3, A +70→0.)
- Which single bailout saves the most firms = **A** (a large buffer bump to A stops the cascade at zero failures).

**Solver to write.** `defaultCascade(firms, buffers, liabilities, shock: {node,loss}): { order: string[], failedCount: number, survives(name): boolean }` plus two search wrappers: `minBumpToHalt(firm)` (smallest buffer add to a named firm that lowers `failedCount`, integer scan — monotone) and `bestBailout()` (the firm whose large buffer bump minimizes `failedCount`, mirroring `bestInjection()` in `financial.ts`). Algorithm = fixed-point scan (pack §2 threshold variant): accumulate `incoming[creditor] += amount` when a debtor defaults, re-scan the firm list until a full pass adds no new defaults; `order` = sequence of first crossings. ~25 lines, reuses the entity/edge data shapes.

**RISKY — flag for review (pack §2 + §"genuinely problematic").** (1) The ⊕ `default order` dimension uses **`scorer: ordered_match`** (now implemented): `vocabulary: [A, B, C, D, E]` (closed set of candidate firm names, required), `expected: [A, B, C, E]` (gold failure sequence; every element MUST be in `vocabulary` or load fails with a hard `ConfigError`), and optional `caseSensitive` (default false). Partial credit is **LCS-ratio**, so full credit requires the exact order. Because the scorer now exists, the single-name fallback **"which firm defaults *second*?"** (`B`, wordItem) is **optional**, not required. (2) **Simultaneous same-round defaults make "the order" ambiguous** — the prompt MUST declare a tie-break (break ties by firm index / listed order) and the instance should be authored so no two firms cross in the same round (the worked instance has a strict A→B→C→E chain, no ties). (3) Full Eisenberg–Noe with **cyclic liabilities needs a fixed-point solve, not one pass** — stay on the threshold variant and keep the liability graph acyclic in authored instances, or the single-scan helper is wrong.

| Dimension | Framing | Answer / scorer | Weight |
|---|---|---|---|
| firm_c_survives | "Does firm C survive the shock?" | `No` wordItem (1-of-2) | minor |
| default_order ⊕ | "List the firms that default, in failure order." (optional fallback: "which firm fails **second**?" → `B`) | `scorer: ordered_match`, `vocabulary: [A,B,C,D,E]`, `expected: [A,B,C,E]`, `caseSensitive` opt — LCS-ratio partial credit, exact order for full | medium |
| total_failed | "How many firms fail in total?" | `4` exactItem | medium |
| **buffer_bump_halts (capstone)** | "What is the smallest buffer increase to firm B that stops the cascade after A?" | `20` exactItem | **major (wide $)** |
| best_single_bailout | "A single buffer top-up to which firm saves the most firms?" | `A` wordItem (1-of-5) | minor |

**Variation axes** (pack §2): buffer-to-exposure tightness so the cascade dies after exactly *k* firms (the difficulty dial); topology (chain vs hub-and-spoke vs ring); cycle presence (avoid for the single-scan helper); one big vs many small exposures. **Citations.** Eisenberg & Noe (2001) *Management Science*; Acemoglu/Ozdaglar/Tahbaz-Salehi (2015) *AER*; "Clearing Payment Vector" walkthrough — pack §2.

---

## Scenario 3 — Covenant breach timing (DSCR)

**Concept.** Per-period DSCR = NOI / debt service, compared against a fixed minimum each month; report the **first** breaching month. Debt service steps up on a known schedule while NOI grows slowly, so the breach lands at a non-obvious interior month. Convention: breach only when **strictly below** the minimum (`DSCR < 1.25` breaches, `=` passes). Pack §3.

**Worked instance.** Minimum DSCR = 1.25. Debt service steps up: months 1–3 = $80, months 4–6 = $110, months 7–12 = $140. NOI starts at $130 in month 1 and grows 2%/month: `NOI_t = 130 · 1.02^(t−1)`. Horizon 12 months.
- DSCR in month 1 = 130/80 = **1.625**
- First month the covenant breaches (capstone) = **month 7** (NOI_7 = 146.4, /140 = 1.046 < 1.25; months 4–6 clear the $110 tier at 1.25–1.28)
- Insolvent vs merely in-breach: DSCR never drops below 1.0 across the horizon → **merely in breach** (in breach months 7–12, never insolvent)
- Min revenue-growth rate that avoids breach = **≈ 0.0508 (5.08%/month)** — the month-7 step-up binds: `130·(1+g)^6 ≥ 1.25·140`

**Solver to write.** `firstBreach(series: number[], threshold, direction: "below"|"above"): number` returning the 1-based first crossing period, `0` if never — directly parallels `insolvency()` in `financial.ts` but on a ratio (pack §3 build note). Plus `dscrSeries(noi0, growth, debtService(t), horizon)` to build the ratio array, `classifyState(series)` (insolvent if any DSCR < 1.0, else in-breach if any < threshold, else healthy), and `minGrowthToAvoidBreach(...)` (bisection on `g`, monotone — DSCR rises in `g`). Edge cases (pack §3): `<` vs `≤` at the threshold (state it); leverage ratios flip the inequality direction (`direction: "above"` — guards against a hard-coded `<`); a ratio that dips then recovers must still report the *first* dip.

| Dimension | Framing | Answer / scorer | Weight |
|---|---|---|---|
| dscr_month_1 | "What is the DSCR in month 1?" | `1.625` regexItem + decimalPattern | minor |
| **first_breach_month (capstone)** | "In which month does the DSCR first fall below 1.25?" | `7` exactItem | **major (wide period)** |
| insolvent_or_inbreach | "By the end, is the firm insolvent or merely in breach?" | `in breach` wordItem (1-of-2/3) | minor |
| min_growth_no_breach | "What minimum monthly NOI growth rate avoids any breach?" | `0.0508` regexItem + decimalPattern | medium (wide rate) |

**Variation axes** (pack §3): growth/amortization rates tuned so the crossing lands at a chosen interior month (top axis); coverage vs leverage (opposite inequality); two-tier lock-up + default thresholds (two answers); dip-then-recover distractor. **Note** the min-growth answer is a decimal — pin "to 4 decimal places" in the prompt so `decimalPattern` matches cleanly. **Citations.** Investing.com "Debt Service Coverage Ratio"; Forvis Mazars "DSCR in Project Finance" (lock-up vs default tiers); Damodaran *Applied Corporate Finance* — pack §3.

---

## Scenario 4 — NPV / project choice

**Concept.** Discount two cash-flow streams to present value, pick the higher NPV at a stated rate, and find the **crossover discount rate** where the two are equal (a root-find on the difference stream). NPV is closed-form and exact; the crossover is the wide capstone. Pack §5.

**Worked instance.** Discount rate for the choice = 8%. Project A (front-loaded): outlay −$1000, then +$600, +$500, +$200 (years 1–3). Project B (back-loaded): −$1000, +$200, +$400, +$800.
- NPV(A) @ 8% = **$142.99**
- NPV(B) @ 8% = **$163.19**
- Which to pick = **B** (higher NPV at 8%; the pick flips above the crossover)
- Crossover discount rate where NPV(A) = NPV(B) (capstone) = **≈ 0.1061 (10.61%)** — both equal ≈ $98.90 there
- Payback period of A = **1.8 years** (cumulative 600 then 1100 > 1000 partway through year 2; integer-year answer = 2)

**Solver to write.** `npv(r, cf: number[]): number` (CF[0] the outlay; pack §5 closed form) and `crossoverRate(a, cf[], b, cf[]): number` = bisection for the root of `npv(r, a) − npv(r, b)` on the **difference stream** `a−b`. For the worked instance `a−b = [0, 400, 100, −600]` (one sign change → single root). Plus `paybackPeriod(cf, fractional=true)`. Edge cases (pack §5): keep the difference stream to a **single sign change** so exactly one crossover exists; if undiscounted totals are equal the crossover degenerates to r=0 (reject at author time — see RISKY).

**RISKY — flag for review (pack §5).** The resource pack flags **multiple-IRR / multi-root** streams (Descartes' rule): a difference stream changing sign ≥2× can have 2+ crossover rates and no unique ground truth. **Also discovered while drafting:** if the two projects have **equal undiscounted totals**, the crossover collapses to **r = 0%** (degenerate). The solver must therefore (1) assert the difference stream has exactly one sign change after `t0`, and (2) assert the projects' undiscounted totals differ. The worked instance satisfies both (totals 300 vs 400; one sign change). Do **not** ship an IRR dimension here — NPV and crossover are single-valued; IRR is the multi-root hazard the pack warns against.

| Dimension | Framing | Answer / scorer | Weight |
|---|---|---|---|
| npv_a | "NPV of project A at 8%?" | `142.99` regexItem + decimalPattern | medium (wide $) |
| npv_b | "NPV of project B at 8%?" | `163.19` regexItem + decimalPattern | medium (wide $) |
| which_project | "Which project should you pick at 8%?" | `B` wordItem (1-of-2) | minor |
| **crossover_rate (capstone)** | "At what discount rate do the two projects have equal NPV?" | `0.1061` regexItem + decimalPattern | **major (wide rate)** |
| payback_a | "Payback period of project A, in years?" | `1.8` regexItem + decimalPattern (or `2` exactItem if integer-year) | medium |

**Variation axes** (pack §5): discount rate and stream length (cleanest difficulty dial); uneven vs level flows; keep the difference stream's sign-change count = 1; tune the evaluation rate to sit clearly on one side of the crossover so `which_project` isn't a knife-edge (8% sits below 10.61% → B wins clearly). **Citations.** Brealey/Myers/Allen *Principles of Corporate Finance* (NPV rule, IRR pitfalls); "Computing Multiple IRRs"; Descartes-rule / multiple-IRR discussion — pack §5.

---

## Scenario 5 — Loan amortization with extra principal

**Concept.** A level-payment loan where the borrower adds a fixed extra principal each month. The extra payment breaks the closed-form payoff and forces a per-period loop (the interesting variant, pack §6 axis a): split each payment into interest + principal, subtract the extra, track the declining balance, and find the **payoff month**. Pack §6.

**Worked instance.** Principal $20,000, APR 6% (monthly rate i = 0.005), original term N = 60 months, extra principal = $100/month.
- Scheduled monthly payment `A = P·i/(1−(1+i)^−N)` = **$386.66**
- Balance after 12 months (with the $100 extra each month) = **$15,230.38** (vs $16,463.94 with no extra)
- Total interest paid over the life of the loan (with extra) = **$2,444.38** (vs $3,199.36 scheduled)
- Payoff month given the extra principal (capstone) = **month 47** (vs 60 scheduled)

**Solver to write.** `amortize(P, i, N, extra=0): { payment, schedule: {month, interest, principal, balance}[], payoffMonth, totalInterest }` (pack §6 iterative form — the **only** correct method with extra principal). Algorithm: `payment = P·i/(1−(1+i)^−N)`; each month `interest = B·i`, `principal = payment − interest + extra` (clamp to remaining `B`), `B −= principal`, accumulate interest, stop when `B ≤ 0`; `payoffMonth` = that month. Mirrors the `simulate()` month-loop idiom (pack §6 build note). Edge cases (pack §6): cent-rounding and the **final payment absorbing the residual** (state exact-vs-rounded in the prompt); `i = 0` → `A = P/N` linear; extra principal shortens the term below N.

**RISKY — minor flag (pack §6).** Payoff month and total interest are **rounding-sensitive**: real lenders round the payment to the cent and the final payment is a stub, so `B_N` ≠ exactly 0. The prompt MUST pin the convention (suggest: "work to exact cents, the final payment is whatever clears the balance") or the "correct" payoff month/interest is contestable by ±1 month / a few dollars. Not unsolvable — just pin it. Also fix whether the extra is applied in the same month as interest accrual (this spec applies extra in the month, after interest).

| Dimension | Framing | Answer / scorer | Weight |
|---|---|---|---|
| monthly_payment | "What is the scheduled monthly payment?" | `386.66` regexItem + decimalPattern | medium (wide $) |
| balance_after_12 | "What is the balance after 12 months (paying $100 extra each month)?" | `15230.38` regexItem + decimalPattern | medium (wide $) |
| total_interest | "Total interest paid over the life of the loan, with the extra principal?" | `2444.38` regexItem + decimalPattern | medium (wide $) |
| **payoff_month (capstone)** | "In which month is the loan fully paid off, given the $100 extra principal?" | `47` exactItem | **major (wide period)** |

**Variation axes** (pack §6): extra principal per month (top axis — turns a formula lookup into a simulation); ask balance-after-k vs payoff-month; rate and term magnitude; balloon / interest-only intro. **Citations.** finance-formulas "Remaining Balance Formula"; LibreTexts "Remaining Loan Balance"; Broverman *Mathematics of Investment and Credit* — pack §6.

---

## Build summary

| Battery | New helper(s) in `financialModels.ts` | Capstone (wide) | Scorer gap |
|---|---|---|---|
| 1 Waterfall | `waterfall()` reducer | pool where equity = $0 (`1015`) | none |
| 2 Contagion | `defaultCascade()`, `minBumpToHalt()`, `bestBailout()` | buffer bump halting cascade (`20`) | ⊕ ordered-list — ship "fails 2nd?" fallback |
| 3 Covenant | `firstBreach()`, `dscrSeries()`, `classifyState()`, `minGrowthToAvoidBreach()` | first breach month (`7`) | none |
| 4 NPV | `npv()`, `crossoverRate()`, `paybackPeriod()` | crossover rate (`0.1061`) | none (reject multi-sign / equal-total streams) |
| 5 Amortization | `amortize()` | payoff month (`47`) | none |

**Wire-up.** Author all five in `scripts/author/draft.ts` alongside the existing financial block, import helpers from `./financialModels.js`, emit via the same `writeSuiteFile(CHALLENGES_DIR, "financial", items)` path (append to the existing `financial` suite or split a new suite id). Each scenario's items share one authored world object, computed once, so the answers stay in sync — the `bailout_target`/`bailout_amount` pattern.

**Scorers to build on the side track:** an **ordered-list / set scorer** for scenario 2's `default_order`. Until it lands, every battery ships fully using `exactItem` / `regexItem`+`decimalPattern` / `wordItem` with the single-name fallback noted for §2.
