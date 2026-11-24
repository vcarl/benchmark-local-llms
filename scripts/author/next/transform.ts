// P3 — Log and CSV transformation. A seeded log or table plus a stated rule
// (time window, status filter, ranking); a TS reference computes the key,
// graded by json_matches. Window edges and comment lines are stated, so a
// miss is conceptual. Each screen rejects draws where the trap (out-of-window
// lines, non-completed rows, single-row maxima) would not change the key.

import { stableStringify } from "../../../src/config/hashing.js";
import {
  type DataItem,
  type Family,
  jsonItem,
  pad,
  type Rng,
  rngFor,
  screened,
} from "./data-common.js";

/** Key-order-insensitive equality, as json_matches compares. */
const deepEq = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

// ── Status-code counts per endpoint ─────────────────────────────────────────
const ENDPOINTS = ["/api/orders", "/api/users", "/api/cart", "/api/search", "/health"];
const STATUSES = [200, 200, 200, 201, 204, 304, 400, 404, 404, 500, 503];

interface LogLine {
  sec: number;
  method: string;
  path: string;
  status: number;
  ms: number;
}

const clock = (sec: number) =>
  `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;

const countByEndpoint = (lines: readonly LogLine[]) => {
  const out: Record<string, Record<string, number>> = {};
  for (const l of lines) {
    const byStatus = out[l.path] ?? {};
    byStatus[String(l.status)] = (byStatus[String(l.status)] ?? 0) + 1;
    out[l.path] = byStatus;
  }
  return out;
};

export const statusCounts = (seed: number): DataItem => {
  const family = "transform_status_counts";
  const rng = rngFor(family, seed);
  const hour = rng.int(8, 20);
  const start = hour * 3600;
  const end = start + 3599;
  const draw = (r: Rng) => {
    const paths = r.sample(ENDPOINTS, 3);
    const line = (sec: number): LogLine => ({
      sec,
      method: r.pick(["GET", "GET", "POST"]),
      path: r.pick(paths),
      status: r.pick(STATUSES),
      ms: r.int(3, 900),
    });
    // Window edges are always present: start and end are in, one second either side is out.
    const secs = [start, end, start - 1, end + 1];
    for (let i = 0; i < 14; i++) secs.push(r.int(start, end));
    for (let i = 0; i < 3; i++)
      secs.push(r.chance(0.5) ? r.int(start - 900, start - 2) : r.int(end + 2, end + 900));
    return secs.sort((a, b) => a - b).map(line);
  };
  const lines = screened(rng, draw, (ls) => {
    const inside = ls.filter((l) => l.sec >= start && l.sec <= end);
    return deepEq(countByEndpoint(inside), countByEndpoint(ls)) ? "window does not matter" : null;
  });
  const inside = lines.filter((l) => l.sec >= start && l.sec <= end);
  const key = countByEndpoint(inside);
  const date = `2025-0${rng.int(1, 9)}-1${rng.int(0, 9)}`;
  const log = [
    `# access.log for ${date}, rotated at 00:00:00`,
    ...lines.map((l) => `${date}T${clock(l.sec)}Z ${l.method} ${l.path} ${l.status} ${l.ms}ms`),
  ].join("\n");
  const prompt =
    `Below is a web server access log. Each line is: timestamp, HTTP method, path, status code, latency. ` +
    `Lines starting with # are comments, not requests.\n\n` +
    `Count the requests per path and status code, using only requests with timestamps from ${clock(start)} ` +
    `to ${clock(end)} inclusive (all methods). Reply with only a JSON object mapping each path to an object that maps ` +
    `each status code (as a string key) to its count, e.g. {"/a": {"200": 3, "404": 1}}. ` +
    `Leave out paths and status codes with no requests in the window.\n\n\`\`\`\n${log}\n\`\`\``;
  return jsonItem({
    family,
    seed,
    category: "transformation",
    tier: 2,
    prompt,
    value: key,
    why: `${inside.length} of ${lines.length} requests fall in ${clock(start)}–${clock(end)}; key: ${JSON.stringify(key)}`,
    wrong: [countByEndpoint(lines)],
  });
};

// ── Group-by sum ────────────────────────────────────────────────────────────
const REGIONS = ["North", "South", "East", "West", "Central"];

export interface Order {
  id: number;
  region: string;
  status: string;
  units: number;
  cents: number;
}

const revenueByRegion = (rows: readonly Order[], onlyCompleted: boolean) => {
  const cents: Record<string, number> = {};
  for (const r of rows) {
    if (onlyCompleted && r.status !== "completed") continue;
    cents[r.region] = (cents[r.region] ?? 0) + r.units * r.cents;
  }
  return Object.fromEntries(
    Object.entries(cents).map(([k, v]) => [k, Number((v / 100).toFixed(2))]),
  );
};

export const groupSum = (seed: number): DataItem & { rows: Order[] } => {
  const family = "transform_group_sum";
  const rng = rngFor(family, seed);
  const draw = (r: Rng): Order[] => {
    const regions = r.sample(REGIONS, r.int(3, 4));
    const n = r.int(10, 14);
    const rows: Order[] = [];
    let id = 5000;
    for (let i = 0; i < n; i++) {
      id += r.int(1, 3);
      rows.push({
        id,
        region: r.pick(regions),
        status: r.pick(["completed", "completed", "completed", "refunded", "pending"]),
        units: r.int(1, 9),
        cents: r.int(250, 4999),
      });
    }
    return rows;
  };
  const rows = screened(rng, draw, (rs) =>
    deepEq(revenueByRegion(rs, true), revenueByRegion(rs, false))
      ? "status filter does not matter"
      : null,
  );
  const key = revenueByRegion(rows, true);
  const csv = [
    "order_id,region,status,units,unit_price",
    ...rows.map((r) => `${r.id},${r.region},${r.status},${r.units},${(r.cents / 100).toFixed(2)}`),
  ].join("\n");
  const prompt =
    `The CSV below has a header row followed by one row per order.\n\n` +
    `Compute the revenue per region, counting only orders whose status is "completed". An order's revenue is ` +
    `units × unit_price. Reply with only a JSON object mapping each region to its revenue as a number rounded to ` +
    `2 decimal places, e.g. {"North": 1234.5}. Leave out regions with no completed orders.\n\n\`\`\`csv\n${csv}\n\`\`\``;
  const unitsOnly = Object.fromEntries(
    Object.keys(key).map((k) => [
      k,
      rows
        .filter((r) => r.region === k && r.status === "completed")
        .reduce((s, r) => s + r.units, 0),
    ]),
  );
  return {
    ...jsonItem({
      family,
      seed,
      category: "transformation",
      tier: 2,
      prompt,
      value: key,
      why: `key: ${JSON.stringify(key)}`,
      wrong: [revenueByRegion(rows, false), unitsOnly],
    }),
    rows,
  };
};

// ── Top-k ranked list ───────────────────────────────────────────────────────
const USERS = ["alice", "bongani", "chen", "dmitri", "elif", "farah", "gustavo", "hiroshi"];

export interface Session {
  day: number;
  user: string;
  minutes: number;
}

export const totals = (rows: readonly Session[]) => {
  const t = new Map<string, number>();
  for (const r of rows) t.set(r.user, (t.get(r.user) ?? 0) + r.minutes);
  return t;
};

/** Users by descending `score`, ties alphabetical, first `k`. */
export const topBy = (scores: Map<string, number>, k: number) =>
  [...scores]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, k)
    .map(([u]) => u);

export const topK = (seed: number): DataItem & { rows: Session[]; month: number } => {
  const family = "transform_top_k";
  const rng = rngFor(family, seed);
  const k = 3;
  const draw = (r: Rng): Session[] => {
    const users = r.sample(USERS, 6);
    return Array.from({ length: r.int(14, 18) }, () => ({
      day: r.int(1, 28),
      user: r.pick(users),
      minutes: r.int(5, 120),
    })).sort((a, b) => a.day - b.day);
  };
  const maxRow = (rows: readonly Session[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.user, Math.max(m.get(r.user) ?? 0, r.minutes));
    return m;
  };
  const rows = screened(rng, draw, (rs) => {
    const t = [...totals(rs).values()].sort((a, b) => b - a);
    if (t.length < k + 1 || (t[k - 1] as number) === (t[k] as number)) return "tie at the cut";
    return deepEq(topBy(maxRow(rs), k), topBy(totals(rs), k))
      ? "single-row max gives the key"
      : null;
  });
  const key = topBy(totals(rows), k);
  const month = rng.int(1, 12);
  const csv = [
    "date,user,minutes",
    ...rows.map((r) => `2025-${pad(month)}-${pad(r.day)},${r.user},${r.minutes}`),
  ].join("\n");
  const prompt =
    `The CSV below logs study sessions: a header row, then one row per session.\n\n` +
    `Rank users by their total minutes across all sessions and list the top ${k}, highest first ` +
    `(break ties alphabetically). Reply with only a JSON array of the ${k} user names, e.g. ["ann", "bo", "cy"].\n\n` +
    `\`\`\`csv\n${csv}\n\`\`\``;
  const t = totals(rows);
  return {
    ...jsonItem({
      family,
      seed,
      category: "transformation",
      tier: 2,
      prompt,
      value: key,
      why: `totals: ${key.map((u) => `${u}=${t.get(u)}`).join(", ")}`,
      wrong: [topBy(maxRow(rows), k), [...key].reverse()],
    }),
    rows,
    month,
  };
};

export const transformFamilies: readonly Family[] = [
  { id: "transform_status_counts", build: statusCounts },
  { id: "transform_group_sum", build: groupSum },
  { id: "transform_top_k", build: topK },
];
