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
