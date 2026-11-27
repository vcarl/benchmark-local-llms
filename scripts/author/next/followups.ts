// Multi-turn follow-ups: 3-turn chains of incremental edits over the seeded
// extraction and transformation items. Turn 1 is the base item's prompt and
// key; turns 2–3 restate the data under a changed rule ("now drop…", "now
// collapse…", "rank…"). Every turn is graded by json_matches against a TS
// reference, and history carries the gold answers (see the multi-turn spec).
// Each follow-up's screen rejects parameters under which the edit would leave
// the previous answer, or the obvious wrong reading, unchanged.

import { stableStringify } from "../../../src/config/hashing.js";
import { type AuthoredItem, chainItem } from "../emit.js";
import { type Generated, withMeta } from "./common.js";
import { type DataItem, dollars, pad, rngFor, screened } from "./data-common.js";
import { invoice } from "./extraction.js";
import { groupSum, type Order, statusCounts, topBy, topK, totals } from "./transform.js";

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
const fence = (v: unknown) => `\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``;
/** The base item's json_matches key. */
const keyOf = <T>(d: DataItem): T => (d.authored.item["constraints"] as { value: T }[])[0]?.value as T;

interface Step {
  prompt: string;
  key: unknown;
  wrong: unknown[];
  why: string;
}

const chain = (
  family: string,
  seed: number,
  category: string,
  why: string,
  steps: Step[],
): Generated => {
  const turn = (s: Step): { turn: AuthoredItem; answer: string } => ({
    turn: {
      why: s.why,
      item: {
        name: "t",
        category,
        tier: 2,
        prompt: s.prompt,
        scorer: "constraint",
        constraints: [{ name: "matches key", check: "json_matches", value: s.key }],
      },
    },
    answer: fence(s.key),
  });
  const authored = chainItem({
    name: `${family}_s${seed}`,
    category,
    tier: 2,
    tags: ["chain", "followup"],
    why,
    turns: steps.map(turn),
  });
  return {
    authored: withMeta({ ...authored, item: { ...authored.item, family } }, seed, "core"),
    units: steps.map((s) => ({
      gold: fence(s.key),
      wrong: s.wrong.filter((w) => !same(w, s.key)).map((w) => JSON.stringify(w)),
    })),
  };
};

/** The base item as turn 1. */
const base = (d: DataItem): Step => ({
  prompt: String(d.authored.item["prompt"]),
  key: keyOf(d),
  wrong: d.wrong.map((w) => JSON.parse(w)),
  why: d.authored.why,
});

// ── Invoice: extract → reshape (line totals) → filter (drop cheap lines, new total) ──
interface Invoice {
  line_items: { description: string; quantity: number; unit_price: number }[];
  total: number;
}

const invoiceChain = (seed: number): Generated => {
  const family = "followup_invoice";
  const d = invoice(seed);
  const rec = keyOf<Invoice>(d);
  const cents = (l: Invoice["line_items"][number]) => Math.round(l.unit_price * 100) * l.quantity;
  const lineTotals = Object.fromEntries(
    rec.line_items.map((l) => [l.description, dollars(cents(l))]),
  );
  const prices = rec.line_items.map((l) => l.unit_price);
  const rng = rngFor(family, seed);
  // A whole-unit threshold strictly between two prices: drops at least one line, keeps at least one.
  const cut = screened(
    rng,
    (r) => r.int(Math.floor(Math.min(...prices)) + 1, Math.ceil(Math.max(...prices))),
    (t) =>
      prices.some((p) => p < t) && prices.some((p) => p > t) && !prices.includes(t)
        ? null
        : "threshold drops nothing or everything",
  );
  const kept = rec.line_items.filter((l) => l.unit_price >= cut);
  const dropped = rec.line_items.filter((l) => l.unit_price < cut);
  const t3 = {
    line_items: kept.map((l) => l.description),
    total: dollars(kept.reduce((s, l) => s + cents(l), 0)),
  };
  return chain(
    family,
    seed,
    "extraction",
    "Invoice: extract, then line totals, then drop cheap lines.",
    [
      base(d),
      {
        prompt:
          `Now give each line item's line total (quantity × unit_price). Reply with only a JSON object mapping ` +
          `each description to its line total as a number rounded to 2 decimal places.`,
        key: lineTotals,
        wrong: [Object.fromEntries(rec.line_items.map((l) => [l.description, l.unit_price]))],
        why: `line totals: ${JSON.stringify(lineTotals)}`,
      },
      {
        prompt:
          `Now drop every line item whose unit price is below ${cut} and recompute the total due from the lines ` +
          `that remain. Reply with only a JSON object with keys "line_items" (array of the remaining ` +
          `descriptions, in the original order) and "total" (number, rounded to 2 decimal places).`,
        key: t3,
        wrong: [
          { ...t3, total: rec.total },
          {
            line_items: dropped.map((l) => l.description),
            total: dollars(dropped.reduce((s, l) => s + cents(l), 0)),
          },
        ],
        why: `cut ${cut}: keep ${t3.line_items.join(", ")}; total ${t3.total}`,
      },
    ],
  );
};

// ── Orders: aggregate → re-aggregate with a changed status rule → reshape by status ──
const revenue = (rows: readonly Order[], statuses: readonly string[]) => {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!statuses.includes(r.status)) continue;
    const byStatus = out[r.region] ?? {};
    byStatus[r.status] = (byStatus[r.status] ?? 0) + r.units * r.cents;
    out[r.region] = byStatus;
  }
  return out;
};
const toDollars = (m: Record<string, number>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, dollars(v)]));
const flat = (nested: Record<string, Record<string, number>>) =>
  toDollars(
    Object.fromEntries(
      Object.entries(nested).map(([k, v]) => [k, Object.values(v).reduce((s, x) => s + x, 0)]),
    ),
  );

const ordersChain = (seed: number): Generated => {
  const family = "followup_orders";
  const d = groupSum(seed);
  const rows = d.rows;
  const rng = rngFor(family, seed);
  const extra = screened(
    rng,
    (r) => r.pick(["refunded", "pending"]),
    (s) => (rows.some((r) => r.status === s) ? null : `no ${s} orders`),
  );
  const rule = ["completed", extra];
  const nested = revenue(rows, rule);
  const t2 = flat(nested);
  const t3 = Object.fromEntries(Object.entries(nested).map(([k, v]) => [k, toDollars(v)]));
  return chain(
    family,
    seed,
    "transformation",
    `Orders: completed revenue, then also ${extra}, then broken down by status.`,
    [
      base(d),
      {
        prompt:
          `Now count "${extra}" orders as well as "completed" ones (still leaving out every other status) and ` +
          `recompute the revenue per region. Reply with only a JSON object mapping each region to its revenue as ` +
          `a number rounded to 2 decimal places. Leave out regions with no counted orders.`,
        key: t2,
        wrong: [keyOf(d), flat(revenue(rows, ["completed", "refunded", "pending"]))],
        why: `completed + ${extra}: ${JSON.stringify(t2)}`,
      },
      {
        prompt:
          `Now break that revenue down by status. Reply with only a JSON object mapping each region to an ` +
          `object that maps each counted status ("completed" or "${extra}") to that region's revenue from it, ` +
          `rounded to 2 decimal places, e.g. {"North": {"completed": 120.5, "${extra}": 30}}. ` +
          `Leave out a status with no orders in that region.`,
        key: t3,
        wrong: [
          t2,
          Object.fromEntries(
            Object.entries(revenue(rows, ["completed", "refunded", "pending"])).map(([k, v]) => [
              k,
              toDollars(v),
            ]),
          ),
        ],
        why: JSON.stringify(t3),
      },
    ],
  );
};

// ── Sessions: top-k → drop sessions before a date and re-rank → totals of the new top-k ──
const sessionsChain = (seed: number): Generated => {
  const family = "followup_sessions";
  const d = topK(seed);
  const rows = d.rows;
  const k = 3;
  const t1 = keyOf<string[]>(d);
  const rng = rngFor(family, seed);
  const from = (day: number) => rows.filter((r) => r.day >= day);
  const all = totals(rows);
  const cutDay = screened(
    rng,
    (r) => r.int(2, 28),
    (day) => {
      if (rows.some((r) => r.day === day)) return "a session sits on the cut";
      const kept = totals(from(day));
      const t = [...kept.values()].sort((a, b) => b - a);
      if (t.length < k + 1 || t[k - 1] === t[k]) return "tie at the top-k cut";
      const top = topBy(kept, k);
      if (same(top, t1)) return "cut does not change the ranking";
      return top.every((u) => kept.get(u) === all.get(u))
        ? "cut does not change the new top users' totals"
        : null;
    },
  );
  const date = `2025-${pad(d.month)}-${pad(cutDay)}`;
  const kept = totals(from(cutDay));
  const t2 = topBy(kept, k);
  const t3 = Object.fromEntries(t2.map((u) => [u, kept.get(u)]));
  return chain(
    family,
    seed,
    "transformation",
    `Sessions: top ${k}, then only sessions from ${date} on, then their totals.`,
    [
      base(d),
      {
        prompt:
          `Now drop every session dated before ${date} and rank the users again by total minutes. ` +
          `Reply with only a JSON array of the top ${k} user names, highest first (break ties alphabetically).`,
        key: t2,
        wrong: [t1, [...t2].reverse()],
        why: `from ${date}: ${t2.map((u) => `${u}=${kept.get(u)}`).join(", ")}`,
      },
      {
        prompt:
          `Still leaving out sessions dated before ${date}, give the total minutes of each of those ${k} ` +
          `users. Reply with only a JSON object mapping each user name to their total minutes as a number.`,
        key: t3,
        wrong: [Object.fromEntries(t2.map((u) => [u, all.get(u)]))],
        why: JSON.stringify(t3),
      },
    ],
  );
};

// ── Access log: per-status counts → collapse to status classes → rank paths by errors ──
const accessLogParts = (baseSeed: number) => {
  const d = statusCounts(baseSeed);
  const counts = keyOf<Record<string, Record<string, number>>>(d);
  const classes = Object.fromEntries(
    Object.entries(counts).map(([path, byStatus]) => {
      const c: Record<string, number> = {};
      for (const [s, n] of Object.entries(byStatus)) c[`${s[0]}xx`] = (c[`${s[0]}xx`] ?? 0) + n;
      return [path, c];
    }),
  );
  const sum = (m: Record<string, number>, pred: (k: string) => boolean) =>
    Object.entries(m).reduce((s, [k, n]) => s + (pred(k) ? n : 0), 0);
  const paths = Object.keys(classes);
  const rank = (score: (p: string) => number) =>
    topBy(new Map(paths.map((p) => [p, score(p)])), paths.length);
  const errors = (p: string) => sum(classes[p] ?? {}, (k) => k === "4xx" || k === "5xx");
  const byTotal = rank((p) => sum(classes[p] ?? {}, () => true));
  const t3 = rank(errors);
  const screen =
    new Set(paths.map(errors)).size < paths.length
      ? "tied error counts"
      : same(t3, [...paths].sort()) || same(t3, byTotal)
        ? "alphabetical or total-request order gives the ranking"
        : same(
              Object.values(classes).map((c) => Object.keys(c).length),
              Object.values(counts).map((c) => Object.keys(c).length),
            )
          ? "collapsing to classes merges nothing"
          : null;
  return { d, counts, classes, errors, byTotal, t3, screen };
};

const accessLogChain = (seed: number): Generated => {
  const family = "followup_access_log";
  // The base item cannot be redrawn, so walk base seeds seed, seed+3, … (disjoint across
  // chain seeds) to the first whose data passes the screen.
  let baseSeed = seed;
  while (accessLogParts(baseSeed).screen !== null) {
    baseSeed += 3;
    if (baseSeed > 300) throw new Error(`${family}: no acceptable base seed`);
  }
  const { d, counts, classes, errors, byTotal, t3 } = accessLogParts(baseSeed);
  return chain(
    family,
    seed,
    "transformation",
    `Access log (base seed ${baseSeed}): per-status counts, then status classes, then paths ranked by errors.`,
    [
      base(d),
      {
        prompt:
          `Now collapse the status codes into classes by their first digit ("2xx", "3xx", "4xx", "5xx"), same ` +
          `time window. Reply with only a JSON object mapping each path to an object that maps each class to its ` +
          `count, e.g. {"/a": {"2xx": 4, "4xx": 1}}. Leave out classes with no requests.`,
        key: classes,
        wrong: [counts],
        why: JSON.stringify(classes),
      },
      {
        prompt:
          `Now rank the paths by their number of error responses (4xx and 5xx together) in the window, most ` +
          `first, breaking ties alphabetically. Include every path from your last answer, even one with no ` +
          `errors. Reply with only a JSON array of the paths.`,
        key: t3,
        wrong: [byTotal, [...t3].reverse()],
        why: t3.map((p) => `${p}=${errors(p)}`).join(", "),
      },
    ],
  );
};

const FAMILIES = [invoiceChain, ordersChain, sessionsChain, accessLogChain];

export const followupItems = (): Generated[] =>
  FAMILIES.flatMap((build) => [0, 1, 2].map((seed) => build(seed)));
