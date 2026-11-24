// P4 — SQL by execution. A seeded SQLite schema and rows are shown in the
// prompt; the test code rebuilds the database, runs the reference query and
// the model's SUBMISSION, and compares result sets (as multisets, or as lists
// when the question fixes the order). No key is stored. Screens make every
// trap bite: duplicate join rows, boundary values, rows outside the filter.

import {
  type DataItem,
  type Family,
  MONTHS,
  pad,
  type Rng,
  rngFor,
  screened,
  submissionItem,
} from "./data-common.js";

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

const inserts = (table: string, rows: readonly (readonly (string | number)[])[]) =>
  rows.map(
    (r) =>
      `INSERT INTO ${table} VALUES (${r.map((v) => (typeof v === "number" ? v : sqlString(v))).join(", ")});`,
  );

/**
 * The test program: build the DB, run reference and submission under an
 * authorizer that allows only reads, compare rows. Python 3.9-compatible.
 */
const testCode = (setup: string, reference: string, ordered: boolean): string =>
  [
    "import sqlite3",
    "from collections import Counter",
    "",
    `SETUP = ${JSON.stringify(setup)}`,
    `REFERENCE = ${JSON.stringify(reference)}`,
    "_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}",
    "",
    "def _rows(sql):",
    '    conn = sqlite3.connect(":memory:")',
    "    conn.executescript(SETUP)",
    "    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)",
    "    return conn.execute(sql).fetchall()",
    "",
    "_expected = _rows(REFERENCE)",
    "_got = _rows(SUBMISSION)",
    ordered
      ? 'assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])'
      : 'assert Counter(_got) == Counter(_expected), "rows %r != expected %r (any order)" % (_got[:5], _expected[:5])',
    "",
  ].join("\n");

const FORMAT =
  "Write one SQLite SELECT statement that returns exactly the requested columns, in the order given. " +
  "Reply with only the query in a ```sql fenced block.";

const CUSTOMERS = [
  "Ada Brooks",
  "Bilal Khan",
  "Carmen Ortiz",
  "Dev Patel",
  "Elena Petrova",
  "Femi Adeyemi",
  "Greta Lind",
  "Hugo Martin",
  "Isla Grant",
  "Jun Park",
];
const CITIES = ["Porto", "Ghent", "Bergen", "Tartu", "Graz"];

const item = (
  family: string,
  seed: number,
  setup: string,
  question: string,
  reference: string,
  ordered: boolean,
  wrong: string[],
): DataItem =>
  submissionItem({
    family,
    seed,
    category: "sql",
    tier: 2,
    lang: "sql",
    prompt: `The SQLite database below is created by these statements:\n\n\`\`\`sql\n${setup}\n\`\`\`\n\n${question}\n\n${FORMAT}`,
    why: `reference: ${reference}`,
    testCode: testCode(setup, reference, ordered),
    gold: reference,
    wrong,
  });

// ── Filter + aggregate ──────────────────────────────────────────────────────
const lastDay = (year: number, m: number) => new Date(Date.UTC(year, m, 0)).getUTCDate();

const filterAggregate = (seed: number): DataItem => {
  const family = "sql_filter_aggregate";
  const rng = rngFor(family, seed);
  const year = rng.int(2022, 2025);
  const month = rng.int(1, 11);
  const end = lastDay(year, month);
  const prefix = `${year}-${pad(month)}`;
  type Row = [number, string, string, number, string];
  const draw = (r: Rng): Row[] => {
    const rows: Row[] = [];
    const n = r.int(12, 16);
    for (let i = 0; i < n; i++) {
      const m = r.pick([month, month, month + 1, month === 1 ? 1 : month - 1]);
      const d = i === 0 ? end : r.int(1, lastDay(year, m));
      rows.push([
        101 + i,
        r.pick(CUSTOMERS),
        i === 0 ? "shipped" : r.pick(["shipped", "shipped", "pending", "cancelled"]),
        r.int(15, 480),
        `${year}-${pad(i === 0 ? month : m)}-${pad(d)}`,
      ]);
    }
    return rows;
  };
  const rows = screened(rng, draw, (rs) => {
    const inMonth = rs.filter((x) => x[4].startsWith(prefix));
    if (inMonth.filter((x) => x[2] === "shipped").length < 3) return "too few matches";
    if (!inMonth.some((x) => x[2] !== "shipped")) return "status filter does not bite";
    if (!rs.some((x) => x[2] === "shipped" && !x[4].startsWith(prefix)))
      return "month filter does not bite";
    return null;
  });
  const setup = [
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER, placed_on TEXT);",
    ...inserts("orders", rows),
  ].join("\n");
  const question =
    `Dates in placed_on are YYYY-MM-DD text. For orders with status 'shipped' placed in ${MONTHS[month - 1]} ${year}, ` +
    `return one row with two columns: the number of such orders, then their total amount.`;
  const reference = `SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'shipped' AND placed_on LIKE '${prefix}-%';`;
  return item(family, seed, setup, question, reference, false, [
    `SELECT COUNT(*), SUM(amount) FROM orders WHERE placed_on LIKE '${prefix}-%';`,
    `SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'shipped' AND placed_on >= '${prefix}-01' AND placed_on < '${prefix}-${pad(end)}';`,
  ]);
};

// ── Join ────────────────────────────────────────────────────────────────────
const join = (seed: number): DataItem => {
  const family = "sql_join";
  const rng = rngFor(family, seed);
  const draw = (r: Rng) => {
    const [home, ...others] = r.sample(CITIES, 3) as [string, ...string[]];
    const threshold = r.int(10, 30) * 10;
    const customers = CUSTOMERS.slice(0, 8).map(
      (name, i) => [i + 1, name, i < 4 ? home : r.pick(others)] as const,
    );
    const orders: [number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const amount = i === 0 ? threshold : r.int(Math.floor(threshold / 4), threshold * 2);
      orders.push([1001 + i, r.int(1, 8), amount]);
    }
    return { home, threshold, customers, orders };
  };
  const qualifies = (d: ReturnType<typeof draw>, cmp: (a: number) => boolean, anyCity = false) => {
    const city = new Map(d.customers.map(([id, , c]) => [id, c]));
    const name = new Map(d.customers.map(([id, n]) => [id, n]));
    return d.orders
      .filter(([, cid, a]) => cmp(a) && (anyCity || city.get(cid) === d.home))
      .map(([, cid]) => name.get(cid) as string);
  };
  const d = screened(rng, draw, (x) => {
    const hits = qualifies(x, (a) => a > x.threshold);
    const distinct = new Set(hits);
    if (distinct.size < 2) return "too few names";
    if (distinct.size === hits.length) return "no duplicate rows to trap a missing DISTINCT";
    if (new Set(qualifies(x, (a) => a > x.threshold, true)).size === distinct.size)
      return "city filter does not bite";
    if (new Set(qualifies(x, (a) => a >= x.threshold)).size === distinct.size)
      return "boundary does not bite";
    return null;
  });
  const setup = [
    "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), amount INTEGER);",
    ...inserts("customers", d.customers),
    ...inserts("orders", d.orders),
  ].join("\n");
  const question =
    `Return the names of customers in ${d.home} who have at least one order with an amount greater than ${d.threshold}. ` +
    `One column (name), each name once, sorted alphabetically.`;
  const from = "FROM customers c JOIN orders o ON o.customer_id = c.id";
  const reference = `SELECT DISTINCT c.name ${from} WHERE c.city = '${d.home}' AND o.amount > ${d.threshold} ORDER BY c.name;`;
  return item(family, seed, setup, question, reference, true, [
    `SELECT c.name ${from} WHERE c.city = '${d.home}' AND o.amount > ${d.threshold} ORDER BY c.name;`,
    `SELECT DISTINCT c.name ${from} WHERE c.city = '${d.home}' AND o.amount >= ${d.threshold} ORDER BY c.name;`,
    `SELECT DISTINCT c.name ${from} WHERE o.amount > ${d.threshold} ORDER BY c.name;`,
  ]);
};

// ── Group-by + having ───────────────────────────────────────────────────────
const CATEGORIES = ["garden", "kitchen", "toys", "books", "audio", "sports"];

const groupHaving = (seed: number): DataItem => {
  const family = "sql_group_having";
  const rng = rngFor(family, seed);
  type Sale = [number, string, number];
  const draw = (r: Rng) => {
    const cats = r.sample(CATEGORIES, 5);
    const sales: Sale[] = Array.from({ length: r.int(14, 18) }, (_, i) => [
      i + 1,
      r.pick(cats),
      r.int(1, 25),
    ]);
    const totals = new Map<string, number>();
    for (const [, c, q] of sales) totals.set(c, (totals.get(c) ?? 0) + q);
    const sorted = [...totals.values()].sort((a, b) => b - a);
    // Threshold = a middle category's own total, so "at least" vs "more than" differs.
    const threshold = sorted[Math.min(2, sorted.length - 1)] as number;
    return { sales, totals, sorted, threshold };
  };
  const d = screened(rng, draw, (x) => {
    if (new Set(x.sorted).size !== x.sorted.length) return "tied totals make the order ambiguous";
    if (x.sorted.length < 4) return "too few categories";
    return null;
  });
  const setup = [
    "CREATE TABLE sales (id INTEGER PRIMARY KEY, category TEXT, quantity INTEGER);",
    ...inserts("sales", d.sales),
  ].join("\n");
  const question =
    `For each category whose total quantity sold is at least ${d.threshold}, return the category and its total quantity ` +
    `(two columns), ordered by total quantity from highest to lowest.`;
  const reference = `SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) >= ${d.threshold} ORDER BY total DESC;`;
  return item(family, seed, setup, question, reference, true, [
    `SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) > ${d.threshold} ORDER BY total DESC;`,
    `SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) >= ${d.threshold} ORDER BY total;`,
    `SELECT category, SUM(quantity) AS total FROM sales WHERE quantity >= ${d.threshold} GROUP BY category ORDER BY total DESC;`,
  ]);
};

export const sqlFamilies: readonly Family[] = [
  { id: "sql_filter_aggregate", build: filterAggregate },
  { id: "sql_join", build: join },
  { id: "sql_group_having", build: groupHaving },
];
