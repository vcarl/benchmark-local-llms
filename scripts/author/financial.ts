// Author-time helpers for financial-model challenges. WE design a specific
// multi-entity cash scenario; these run the monthly simulation so we can author
// the correct `expected` (insolvency month / breakeven price) without doing the
// arithmetic by hand, and render the scenario as prose for the prompt.

export interface Entity {
  name: string;
  startingCash: number;
  monthlyRevenue: number;
  monthlyCost: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
  /** If set, pay only what the sender can afford (min(amount, balance)) — a
   *  liquidity cascade: an upstream shortfall starves downstream entities. */
  bestEffort?: boolean;
}

/** The entity whose monthly revenue includes price * units (the breakeven lever). */
export interface Priced {
  entity: string;
  units: number;
  /** The set price (used for insolvency); omit/override for breakeven search. */
  price: number;
}

export interface Model {
  entities: Entity[];
  transfers?: Transfer[];
  horizon: number;
  priced?: Priced;
}

/** Returns name → array of end-of-month balances (length = horizon). */
function simulate(model: Model, priceOverride?: number): Map<string, number[]> {
  const price = priceOverride ?? model.priced?.price ?? 0;
  const balances = new Map<string, number>();
  const series = new Map<string, number[]>();
  for (const e of model.entities) {
    balances.set(e.name, e.startingCash);
    series.set(e.name, []);
  }
  for (let month = 0; month < model.horizon; month++) {
    for (const e of model.entities) {
      const priced =
        model.priced && e.name === model.priced.entity ? price * model.priced.units : 0;
      balances.set(e.name, (balances.get(e.name) ?? 0) + e.monthlyRevenue + priced - e.monthlyCost);
    }
    for (const t of model.transfers ?? []) {
      const avail = balances.get(t.from) ?? 0;
      const amt = t.bestEffort ? Math.max(0, Math.min(t.amount, avail)) : t.amount;
      balances.set(t.from, avail - amt);
      balances.set(t.to, (balances.get(t.to) ?? 0) + amt);
    }
    for (const e of model.entities) series.get(e.name)?.push(balances.get(e.name) ?? 0);
  }
  return series;
}

export interface InsolvencyResult {
  /** First 1-based month any entity ends negative; 0 if solvent through horizon. */
  month: number;
  entity: string | null;
  balances: Record<string, number[]>;
}

export function insolvency(model: Model): InsolvencyResult {
  const series = simulate(model);
  const balances: Record<string, number[]> = {};
  for (const [k, v] of series) balances[k] = v;
  for (let month = 0; month < model.horizon; month++) {
    for (const e of model.entities) {
      if ((series.get(e.name)?.[month] ?? 0) < 0) return { month: month + 1, entity: e.name, balances };
    }
  }
  return { month: 0, entity: null, balances };
}

/**
 * Smallest integer price at which the priced entity stays non-negative across
 * the whole horizon. Solvency is monotonic in price, so a linear scan suffices.
 * Returns null if even `priceHi` is insufficient (sharpen the scenario).
 */
export function breakeven(model: Model, priceHi = 1000): number | null {
  if (!model.priced) throw new Error("breakeven requires model.priced");
  const target = model.priced.entity;
  for (let p = 0; p <= priceHi; p++) {
    const ok = (simulate(model, p).get(target) ?? []).every((b) => b >= 0);
    if (ok) return p;
  }
  return null;
}

/**
 * Smallest integer price at which EVERY entity stays non-negative across the
 * whole horizon (the coupled-system breakeven). With best-effort transfers this
 * captures the cascade: too low a price on the priced entity starves whoever it
 * funds. Returns null if no price within `priceHi` keeps all solvent.
 */
export function systemBreakeven(model: Model, priceHi = 1000): number | null {
  if (!model.priced) throw new Error("systemBreakeven requires model.priced");
  for (let p = 0; p <= priceHi; p++) {
    const series = simulate(model, p);
    if (model.entities.every((e) => (series.get(e.name) ?? []).every((b) => b >= 0))) return p;
  }
  return null;
}

export interface Injection {
  entity: string;
  /** First-insolvency month after the injection; 0 means fully solvent. */
  month: number;
  tie: boolean;
}

/**
 * If a one-time `amount` were added to exactly ONE entity's starting cash, which
 * choice keeps the whole group solvent longest? Returns the entity that yields
 * the latest first-insolvency (0/none = fully solvent = best). The instructive
 * case: the right target is often the cascade's root, not the entity seen
 * failing first.
 */
export function bestInjection(model: Model, amount: number): Injection {
  const results = model.entities.map((e) => {
    const injected: Model = {
      ...model,
      entities: model.entities.map((x) =>
        x.name === e.name ? { ...x, startingCash: x.startingCash + amount } : x,
      ),
    };
    const m = insolvency(injected).month;
    return { entity: e.name, rank: m === 0 ? Number.POSITIVE_INFINITY : m, month: m };
  });
  results.sort((a, b) => b.rank - a.rank);
  const best = results[0];
  const tie = results.filter((r) => r.rank === best.rank).length > 1;
  return { entity: best.entity, month: best.month, tie };
}

/**
 * Smallest one-time cash injection into `entity` at month 0 that keeps EVERY
 * entity solvent for the whole horizon. Monotonic in the amount, so a scan
 * finds the threshold; null if no amount within `hi` suffices (some downstream
 * entity is unsalvageable from this entity). Tests funding the cascade's root.
 */
export function minInjectionToSolvency(model: Model, entity: string, hi = 10000): number | null {
  for (let x = 0; x <= hi; x++) {
    const injected: Model = {
      ...model,
      entities: model.entities.map((e) =>
        e.name === entity ? { ...e, startingCash: e.startingCash + x } : e,
      ),
    };
    if (insolvency(injected).month === 0) return x;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario-battery solvers (payment waterfall, counterparty contagion, covenant
// breach, NPV/project choice, loan amortization). These are pure, closed-form or
// fixed-point computations — NOT the monthly cash-sim above — used to author the
// `expected` answers for the five financial batteries. They deliberately do not
// throw: every guard returns a value or null so author code stays throw-free.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

// ── Scenario 1 — Payment waterfall (tranche priority) ────────────────────────

export interface Tranche {
  name: string;
  claim: number;
}

export interface WaterfallResult {
  /** name → payout for every named tranche, plus the residual under "Equity". */
  payouts: Record<string, number>;
  /** Most-senior tranche not paid in full (first to take a loss); null if all full. */
  firstLoss: string | null;
  /** Pool size at or below which equity receives nothing = Σ all non-equity claims. */
  equityZeroThreshold: number;
}

/**
 * Allocate a finite `pool` to `tranches` in strict priority order, each capped
 * at its claim; the equity tranche absorbs the (floored-at-0) residual. Pure
 * reducer — no time loop. `firstLoss` is the most-senior tranche paid less than
 * its claim. `equityZeroThreshold` is the sum of all claims: below it, equity
 * gets nothing.
 */
export function waterfall(pool: number, tranches: Tranche[]): WaterfallResult {
  const payouts: Record<string, number> = {};
  let avail = pool;
  let firstLoss: string | null = null;
  for (const t of tranches) {
    const pay = Math.max(0, Math.min(avail, t.claim));
    payouts[t.name] = pay;
    if (pay < t.claim && firstLoss === null) firstLoss = t.name;
    avail -= pay;
  }
  payouts.Equity = Math.max(0, avail);
  const equityZeroThreshold = tranches.reduce((s, t) => s + t.claim, 0);
  return { payouts, firstLoss, equityZeroThreshold };
}

// ── Scenario 2 — Counterparty contagion (threshold default cascade) ──────────

export interface Liability {
  from: string;
  to: string;
  amount: number;
}

export interface Shock {
  node: string;
  loss: number;
}

export interface ContagionModel {
  /** Firm names in tie-break order (earlier index defaults first on a same-round tie). */
  firms: string[];
  buffers: Record<string, number>;
  /** Debtor→creditor obligations; on default the full amount (LGD 100%) hits the creditor. */
  liabilities: Liability[];
  shock: Shock;
}

export interface CascadeResult {
  /** Firms in the order they first cross their buffer (strict — one at a time). */
  order: string[];
  failedCount: number;
  survives: (name: string) => boolean;
}

/**
 * Threshold-cascade fixed point (NOT Eisenberg–Noe): seed the shocked firm's
 * incoming loss, then repeatedly scan firms in listed order; the first
 * not-yet-defaulted firm whose incoming loss strictly exceeds its buffer
 * defaults, passing its full liabilities to creditors, and the scan restarts.
 * Stop when a full pass adds no new default. Defaulting one firm per pass in
 * index order makes `order` deterministic with an index tie-break.
 */
export function defaultCascade(model: ContagionModel): CascadeResult {
  const incoming: Record<string, number> = {};
  for (const f of model.firms) incoming[f] = 0;
  incoming[model.shock.node] = (incoming[model.shock.node] ?? 0) + model.shock.loss;
  const defaulted = new Set<string>();
  const order: string[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const f of model.firms) {
      if (defaulted.has(f)) continue;
      if ((incoming[f] ?? 0) > (model.buffers[f] ?? 0)) {
        defaulted.add(f);
        order.push(f);
        for (const l of model.liabilities) {
          if (l.from === f) incoming[l.to] = (incoming[l.to] ?? 0) + l.amount;
        }
        progressed = true;
        break; // restart the scan so propagation respects index order
      }
    }
  }
  return { order, failedCount: order.length, survives: (n) => !defaulted.has(n) };
}

/** True if the directed liability graph has no cycle (single-scan cascade is valid). */
export function isAcyclic(firms: string[], liabilities: Liability[]): boolean {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color: Record<string, number> = {};
  for (const f of firms) color[f] = WHITE;
  const out: Record<string, string[]> = {};
  for (const f of firms) out[f] = [];
  for (const l of liabilities) (out[l.from] ??= []).push(l.to);
  const stack: { node: string; phase: number }[] = [];
  for (const start of firms) {
    if (color[start] !== WHITE) continue;
    stack.push({ node: start, phase: 0 });
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      if (top.phase === 0) {
        color[top.node] = GRAY;
        top.phase = 1;
        for (const next of out[top.node] ?? []) {
          if (color[next] === GRAY) return false; // back edge → cycle
          if (color[next] === WHITE) stack.push({ node: next, phase: 0 });
        }
      } else {
        color[top.node] = BLACK;
        stack.pop();
      }
    }
  }
  return true;
}

/**
 * Smallest integer buffer top-up to `firm` that strictly lowers the cascade's
 * failure count. Monotone (more buffer never adds failures), so a linear scan
 * finds the threshold; null if none within `hi`.
 */
export function minBumpToHalt(model: ContagionModel, firm: string, hi = 100000): number | null {
  const baseline = defaultCascade(model).failedCount;
  for (let b = 1; b <= hi; b++) {
    const bumped: ContagionModel = {
      ...model,
      buffers: { ...model.buffers, [firm]: (model.buffers[firm] ?? 0) + b },
    };
    if (defaultCascade(bumped).failedCount < baseline) return b;
  }
  return null;
}

/**
 * Which single firm, given a large buffer top-up, minimizes the total failure
 * count (the bailout that saves the most firms). Tie-break by listed order.
 */
export function bestBailout(
  model: ContagionModel,
  bump = 1e9,
): { firm: string; failedCount: number } {
  let best = { firm: model.firms[0] ?? "", failedCount: Number.POSITIVE_INFINITY };
  for (const firm of model.firms) {
    const bumped: ContagionModel = {
      ...model,
      buffers: { ...model.buffers, [firm]: (model.buffers[firm] ?? 0) + bump },
    };
    const failedCount = defaultCascade(bumped).failedCount;
    if (failedCount < best.failedCount) best = { firm, failedCount };
  }
  return best;
}

// ── Scenario 3 — Covenant breach timing (DSCR) ───────────────────────────────

export type DebtSchedule = (month: number) => number;

/** DSCR per 1-based month: NOI_t / debtService(t), NOI_t = noi0·(1+growth)^(t−1). */
export function dscrSeries(
  noi0: number,
  growth: number,
  debtService: DebtSchedule,
  horizon: number,
): number[] {
  const series: number[] = [];
  for (let t = 1; t <= horizon; t++) {
    const noi = noi0 * (1 + growth) ** (t - 1);
    series.push(noi / debtService(t));
  }
  return series;
}

/**
 * First 1-based period the series crosses `threshold` — strictly below for
 * coverage ratios (`direction: "below"`), strictly above for leverage ratios
 * (`direction: "above"`). Returns the FIRST crossing even if the series later
 * recovers; 0 if it never crosses.
 */
export function firstBreach(
  series: number[],
  threshold: number,
  direction: "below" | "above",
): number {
  for (let i = 0; i < series.length; i++) {
    const v = series[i] ?? 0;
    if (direction === "below" ? v < threshold : v > threshold) return i + 1;
  }
  return 0;
}

/** Insolvent if any DSCR < insolventThreshold; else in breach if any < breachThreshold; else healthy. */
export function classifyState(
  series: number[],
  breachThreshold: number,
  insolventThreshold = 1.0,
): "insolvent" | "in breach" | "healthy" {
  if (series.some((v) => v < insolventThreshold)) return "insolvent";
  if (series.some((v) => v < breachThreshold)) return "in breach";
  return "healthy";
}

/**
 * Smallest monthly NOI growth rate that avoids any breach over the horizon.
 * DSCR rises monotonically in g, so bisection on [0, hi] converges to the
 * boundary where the binding step-up month just clears the threshold.
 */
export function minGrowthToAvoidBreach(
  noi0: number,
  debtService: DebtSchedule,
  horizon: number,
  breachThreshold: number,
  hi = 1,
): number {
  const avoids = (g: number): boolean =>
    firstBreach(dscrSeries(noi0, g, debtService, horizon), breachThreshold, "below") === 0;
  let lo = 0;
  let high = hi;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + high) / 2;
    if (avoids(mid)) high = mid;
    else lo = mid;
  }
  return high;
}

// ── Scenario 4 — NPV / project choice ────────────────────────────────────────

/** Net present value at rate r; cf[0] is the (negative) outlay, cf[t] discounted by (1+r)^t. */
export function npv(r: number, cf: number[]): number {
  let total = 0;
  for (let t = 0; t < cf.length; t++) total += (cf[t] ?? 0) / (1 + r) ** t;
  return total;
}

/** Period-by-period difference of two cash-flow streams (a − b). */
export function diffStream(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, t) => (a[t] ?? 0) - (b[t] ?? 0));
}

/** Number of sign changes in the nonzero terms of a stream (Descartes-style). */
export function signChanges(cf: number[]): number {
  let changes = 0;
  let prev = 0;
  for (const x of cf) {
    const s = Math.sign(x);
    if (s === 0) continue;
    if (prev !== 0 && s !== prev) changes++;
    prev = s;
  }
  return changes;
}

/**
 * Crossover discount rate where npv(r, a) = npv(r, b): the root of the
 * difference stream npv(r, a−b). Requires a single sign change in the diff (one
 * unique crossover) — verified at author time via {@link signChanges}. Bisection
 * on [lo, hi]; returns lo if the bracket holds no sign change.
 */
export function crossoverRate(a: number[], b: number[], lo = 0, hi = 1): number {
  const diff = diffStream(a, b);
  const f = (r: number): number => npv(r, diff);
  let r0 = lo;
  let r1 = hi;
  if (f(r0) === 0) return r0;
  if (Math.sign(f(r0)) === Math.sign(f(r1))) return r0; // no bracketed root
  for (let iter = 0; iter < 200; iter++) {
    const mid = (r0 + r1) / 2;
    if (Math.sign(f(mid)) === Math.sign(f(r0))) r0 = mid;
    else r1 = mid;
  }
  return (r0 + r1) / 2;
}

/**
 * Payback period: years until cumulative inflows recover the cf[0] outlay.
 * `fractional` interpolates within the recovery year (e.g. 1.8); otherwise the
 * integer year the outlay is first fully recovered. Returns 0 if never recovered.
 */
export function paybackPeriod(cf: number[], fractional = true): number {
  const outlay = -(cf[0] ?? 0);
  let cumulative = 0;
  for (let t = 1; t < cf.length; t++) {
    const flow = cf[t] ?? 0;
    const before = cumulative;
    cumulative += flow;
    if (cumulative >= outlay) {
      if (!fractional) return t;
      const need = outlay - before;
      return t - 1 + (flow === 0 ? 0 : need / flow);
    }
  }
  return 0;
}

// ── Scenario 5 — Loan amortization with extra principal ──────────────────────

export interface AmortRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface AmortResult {
  payment: number;
  schedule: AmortRow[];
  payoffMonth: number;
  totalInterest: number;
}

/**
 * Level-payment amortization with an optional fixed `extra` principal per month.
 * Rounding convention (pinned): the arithmetic runs at full precision ("work to
 * exact cents") and only the reported figures are rounded to the cent. Each
 * month interest = balance·i, principal = payment − interest + extra clamped to
 * the remaining balance, so the final payment clears the balance to exactly 0.
 * The extra is applied in the same month, after interest accrues. i = 0 →
 * linear P/N.
 */
export function amortize(P: number, i: number, N: number, extra = 0): AmortResult {
  const rawPayment = i === 0 ? P / N : (P * i) / (1 - (1 + i) ** -N);
  const schedule: AmortRow[] = [];
  let balance = P;
  let totalInterest = 0;
  let payoffMonth = 0;
  for (let month = 1; month <= N && balance > 0; month++) {
    const interest = balance * i;
    let principal = rawPayment - interest + extra;
    if (principal >= balance) principal = balance; // final stub clears the balance
    balance -= principal;
    totalInterest += interest;
    schedule.push({
      month,
      interest: round2(interest),
      principal: round2(principal),
      balance: round2(balance),
    });
    if (balance <= 0) {
      payoffMonth = month;
      break;
    }
  }
  return {
    payment: round2(rawPayment),
    schedule,
    payoffMonth,
    totalInterest: round2(totalInterest),
  };
}

/** Render the model as prose to drop into a prompt. */
export function describe(model: Model): string {
  const lines = model.entities.map((e) => {
    const priced =
      model.priced && e.name === model.priced.entity
        ? ` It sells ${model.priced.units} units/month at a set price.`
        : "";
    return `- ${e.name}: starts with $${e.startingCash}, earns $${e.monthlyRevenue}/month in other revenue, spends $${e.monthlyCost}/month.${priced}`;
  });
  const transfers = (model.transfers ?? []).map((t) =>
    t.bestEffort
      ? `- Each month ${t.from} sends $${t.amount} to ${t.to}, but only as much as it can afford that month.`
      : `- Each month, ${t.from} pays $${t.amount} to ${t.to}.`,
  );
  return [...lines, ...transfers].join("\n");
}
