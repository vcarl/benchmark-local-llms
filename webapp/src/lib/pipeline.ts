import type { BenchmarkResult } from "./data";
import { modelFamily, modelSizeB } from "./data";
import { EFFICIENCY_SCALE } from "./constants";
import type { Filters } from "./filter-state";

// ─── Filtering ───────────────────────────────────────────────────────────────

// Strip the `@version` suffix from a challenge key so filtering operates on the
// base challenge id only (one pill per challenge, matching any version). Used at
// both the option-generation site (__root) and the match site below so they
// can't drift.
export const baseChallengeId = (key: string): string => {
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
};

const passesDim = (selected: string[] | undefined, v: string): boolean =>
  selected === undefined || selected.length === 0 || selected.includes(v);

export const applyFilters = (records: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  records.filter((r) => {
    if (!passesDim(f.family, modelFamily(r.artifact))) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (!passesDim(f.quant, r.quant ?? "—")) return false;
    if (!passesDim(f.temperature, String(r.temperature))) return false;
    if (!passesDim(f.challenge, baseChallengeId(`${r.challenge_id}@${r.challenge_version}`))) return false;
    return true;
  });

// ─── Config scores (shared utility) ──────────────────────────────────────────

export const computeConfigScores = (
  attempts: BenchmarkResult[],
): { passRate: number; efficiency: number | null } => {
  const completed = attempts.length;
  if (completed === 0) return { passRate: 0, efficiency: null };
  const totalItems = attempts.reduce((s, a) => s + a.item_count, 0);
  const passedItems = attempts.reduce((s, a) => s + a.passed_items, 0);
  const passRate = totalItems === 0 ? 0 : passedItems / totalItems;
  const uniqueChallenges = new Set(
    attempts.map((a) => `${a.challenge_id}@${a.challenge_version}`),
  ).size;
  const overallTokens = attempts.reduce((s, a) => s + a.generation_tokens, 0);
  const timeSpent = attempts.reduce((s, a) => s + a.wall_time_sec, 0);
  const denom = Math.log(overallTokens) * (timeSpent / 60);
  if (!Number.isFinite(denom) || denom <= 0) return { passRate, efficiency: null };
  const efficiency = ((passRate * uniqueChallenges * completed) / denom) * EFFICIENCY_SCALE;
  return { passRate, efficiency };
};

// ─── RunRow / RunGroup / aggregateRuns ───────────────────────────────────────

export type RunSortKey = "score" | "efficiency" | "memory";
export type SortDir = "asc" | "desc";

// The natural direction for a metric: memory is lower-is-better (asc), while
// score and efficiency are higher-is-better (desc). Picking a new metric resets
// that side to this default; the toggle button only flips it afterward.
export const defaultSortDir = (key: RunSortKey): SortDir =>
  key === "memory" ? "asc" : "desc";

export interface RunRow {
  config_hash: string;
  artifact: string;
  family: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  passRate: number;
  efficiency: number | null;
  tokens: number;
  genTps: number;
  mem: number;
  wallTime: number;
  uniqueChallenges: number;
  itemCount: number;
  attemptsCompleted: number;
  // The config's attempts split into distinct benchmarking invocations
  // (newest → oldest). Always non-empty; `invocations[0]` is the most recent
  // and supplies this row's headline metric fields (see `rowForConfig`).
  invocations: InvocationRow[];
}

// A single benchmarking invocation (run) for one config: the RunRow metric
// fields scoped to that invocation's attempts, plus the invocation's most-recent
// finished_at and its underlying records.
export interface InvocationRow extends RunRow {
  finishedAt: string;
  records: BenchmarkResult[];
}

export interface RunGroup {
  artifact: string;
  family: string;
  rows: RunRow[];
}

const meanOrZero = (values: number[]): number => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
};

// Aggregate a flat list of attempts into the metric fields of a RunRow (no
// invocation splitting — this is the leaf aggregation reused by both
// `splitInvocations` and `rowForConfig`). Returns null on empty input.
const metricsForAttempts = (
  attempts: BenchmarkResult[],
): Omit<RunRow, "invocations"> | null => {
  const head = attempts[0];
  if (head === undefined) return null;
  const { passRate, efficiency } = computeConfigScores(attempts);
  return {
    config_hash: head.config_hash,
    artifact: head.artifact,
    family: modelFamily(head.artifact),
    runtime: head.runtime,
    quant: head.quant,
    temperature: head.temperature,
    passRate,
    efficiency,
    tokens: attempts.reduce((s, a) => s + a.generation_tokens, 0),
    genTps: meanOrZero(attempts.map((a) => a.generation_tps)),
    mem: attempts.reduce((m, a) => (a.peak_memory_gb > m ? a.peak_memory_gb : m), 0),
    wallTime: attempts.reduce((s, a) => s + a.wall_time_sec, 0),
    uniqueChallenges: new Set(attempts.map((a) => `${a.challenge_id}@${a.challenge_version}`)).size,
    itemCount: attempts.reduce((s, a) => s + a.item_count, 0),
    attemptsCompleted: attempts.length,
  };
};

// Sort a COPY of attempts by finished_at DESC (lexicographic ISO, same ordering
// as challengeBreakdown / finishedSpan), tie-broken by attempt_id DESC so equal
// or empty finished_at is deterministic.
const sortedByFinishedDesc = (attempts: BenchmarkResult[]): BenchmarkResult[] =>
  attempts.slice().sort((a, b) => {
    if (a.finished_at !== b.finished_at) return a.finished_at < b.finished_at ? 1 : -1;
    return a.attempt_id < b.attempt_id ? 1 : a.attempt_id > b.attempt_id ? -1 : 0;
  });

/**
 * Split a config's attempts into distinct benchmarking invocations (runs),
 * newest → oldest. Walking the attempts in finished_at-DESC order, attempts
 * accumulate into the current invocation until a BARE `challenge_id` already
 * present in the current batch repeats — that repeat opens a new (older)
 * invocation. This matches the >1h-gap rule in the data (v1 = 6-challenge suite,
 * v2 = 10-challenge suite, v1 ⊂ v2): a fresh run necessarily re-runs challenge
 * ids already seen, so the first repeat marks the run boundary.
 *
 * Each returned InvocationRow carries the RunRow metric fields aggregated over
 * just that invocation's attempts, the invocation's max finished_at, and its
 * underlying records. `invocations` is always [] on these rows (no recursion).
 */
export const splitInvocations = (attempts: BenchmarkResult[]): InvocationRow[] => {
  const sorted = sortedByFinishedDesc(attempts);
  const batches: BenchmarkResult[][] = [];
  let current: BenchmarkResult[] = [];
  let seen = new Set<string>();
  for (const a of sorted) {
    if (seen.has(a.challenge_id)) {
      batches.push(current);
      current = [];
      seen = new Set<string>();
    }
    current.push(a);
    seen.add(a.challenge_id);
  }
  if (current.length > 0) batches.push(current);

  const rows: InvocationRow[] = [];
  for (const batch of batches) {
    const metrics = metricsForAttempts(batch);
    if (metrics === null) continue;
    const finishedAt = batch.reduce(
      (m, a) => (a.finished_at > m ? a.finished_at : m),
      "",
    );
    rows.push({ ...metrics, invocations: [], finishedAt, records: batch });
  }
  return rows;
};

const rowForConfig = (attempts: BenchmarkResult[]): RunRow | null => {
  const invocations = splitInvocations(attempts);
  const headline = invocations[0];
  if (headline === undefined) return null;
  // The headline IS the most-recent invocation (no metric drift), plus the full
  // invocation list. headline already carries invocations: [] from
  // splitInvocations; overwrite it with the real list here.
  return { ...headline, invocations };
};

const sortValue = (r: RunRow, key: RunSortKey): number =>
  key === "score" ? r.passRate : key === "efficiency" ? (r.efficiency ?? 0) : r.mem;

const compareRuns = (key: RunSortKey, dir: SortDir) => (a: RunRow, b: RunRow): number => {
  const asc = sortValue(a, key) - sortValue(b, key);
  return dir === "desc" ? -asc : asc;
};

export const aggregateRuns = (
  records: BenchmarkResult[],
  primary: RunSortKey,
  secondary: RunSortKey,
  primaryDir: SortDir = defaultSortDir(primary),
  secondaryDir: SortDir = defaultSortDir(secondary),
): RunGroup[] => {
  const byConfig = new Map<string, BenchmarkResult[]>();
  for (const r of records) {
    const list = byConfig.get(r.config_hash) ?? [];
    list.push(r);
    byConfig.set(r.config_hash, list);
  }
  const rows: RunRow[] = [];
  for (const attempts of byConfig.values()) {
    const row = rowForConfig(attempts);
    if (row !== null) rows.push(row);
  }

  const byArtifact = new Map<string, RunRow[]>();
  for (const row of rows) {
    const list = byArtifact.get(row.artifact) ?? [];
    list.push(row);
    byArtifact.set(row.artifact, list);
  }

  const cmpSecondary = compareRuns(secondary, secondaryDir);
  const cmpPrimary = compareRuns(primary, primaryDir);
  const tieBreak = (a: RunRow, b: RunRow): number =>
    a.runtime.localeCompare(b.runtime) ||
    (a.quant ?? "").localeCompare(b.quant ?? "") ||
    a.temperature - b.temperature;

  const groups: RunGroup[] = [];
  for (const [artifact, gRows] of byArtifact) {
    const sorted = gRows.slice().sort((a, b) => cmpSecondary(a, b) || tieBreak(a, b));
    const lead = sorted[0];
    if (lead === undefined) continue;
    groups.push({ artifact, family: lead.family, rows: sorted });
  }
  groups.sort((a, b) => {
    const la = a.rows[0];
    const lb = b.rows[0];
    if (la === undefined || lb === undefined) return 0;
    return cmpPrimary(la, lb) || a.artifact.localeCompare(b.artifact);
  });
  return groups;
};

// ─── ScatterPoints (one cost/quality point per config_hash) ─────────────────────

export interface ScatterPoint {
  config_hash: string;
  artifact: string;
  family: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  x: number;
  y: number;
  efficiency: number | null;
  sizeB: number | null;
  peak_memory_gb: number;
  generation_tps: number;
  wall_time_sec: number;
}

// ─── Scatter visual-encoding helpers ─────────────────────────────────────────

// Wall-time (seconds) → star-point count. Log-scaled across the typical
// per-config total range (~30s to many hours); clamped to [4, 15] so the
// shape stays legible at both ends.
export const starPointsForWallTime = (seconds: number): number => {
  const s = Math.max(seconds, 1);
  const n = Math.floor(Math.log2(s) * 1.08) - 1;
  return Math.max(4, Math.min(15, n));
};

export interface TpsDomain {
  min: number;
  max: number;
}

// Compute the generation_tps domain across an array of ScatterPoints. Filters
// out non-positive values so the domain is meaningful even when some configs
// have missing tps. Returns a degenerate-but-safe domain when there's no
// usable data.
export const computeTpsDomain = (points: ScatterPoint[]): TpsDomain => {
  const values = points.map((p) => p.generation_tps).filter((t) => Number.isFinite(t) && t > 0);
  if (values.length === 0) return { min: 1, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min, max: min * 1.0001 };
  return { min, max };
};

const OPACITY_MIN = 0.35;
const OPACITY_MAX = 0.95;

// Map a generation-tps value to a fill-opacity in [OPACITY_MIN, OPACITY_MAX]
// using a log scale across the supplied domain. Faster generation → more
// opaque. Out-of-range / non-positive inputs clamp to OPACITY_MIN.
export const opacityForTps = (tps: number, domain: TpsDomain): number => {
  if (!Number.isFinite(tps) || tps <= 0) return OPACITY_MIN;
  const { min, max } = domain;
  if (!(max > min)) return (OPACITY_MIN + OPACITY_MAX) / 2;
  const lo = Math.log(min);
  const hi = Math.log(max);
  const t = (Math.log(Math.max(min, Math.min(max, tps))) - lo) / (hi - lo);
  return OPACITY_MIN + t * (OPACITY_MAX - OPACITY_MIN);
};

// ─── ChallengeBreakdown (per-challenge rows for one config_hash) ─────────────

export interface ChallengeBreakdownRow {
  challengeKey: string;
  challengeId: string;
  challengeVersion: number;
  attemptId: string;
  passRate: number;
  itemCount: number;
  passedItems: number;
  // The BenchmarkResult this row was derived from (latest attempt for the
  // challenge). Carries runtime metrics the per-attempt detail JSON lacks, so
  // the drilldown can render its debug panel without re-querying DATA.
  record: BenchmarkResult;
}

export const challengeBreakdown = (
  records: BenchmarkResult[],
  configHash: string,
): ChallengeBreakdownRow[] => {
  // One row per (challenge, version) the config ran. A config+challenge can have
  // multiple attempts (re-runs); collapse them keeping the most recent attempt
  // (latest finished_at) so the pane shows each challenge exactly once.
  const latest = new Map<string, BenchmarkResult>();
  for (const r of records) {
    if (r.config_hash !== configHash) continue;
    const key = `${r.challenge_id}@${r.challenge_version}`;
    const prev = latest.get(key);
    if (prev === undefined || r.finished_at > prev.finished_at) latest.set(key, r);
  }
  const rows: ChallengeBreakdownRow[] = [];
  for (const [challengeKey, r] of latest) {
    rows.push({
      challengeKey,
      challengeId: r.challenge_id,
      challengeVersion: r.challenge_version,
      attemptId: r.attempt_id,
      passRate: r.item_count === 0 ? 0 : r.passed_items / r.item_count,
      itemCount: r.item_count,
      passedItems: r.passed_items,
      record: r,
    });
  }
  rows.sort((a, b) => a.challengeKey.localeCompare(b.challengeKey));
  return rows;
};

export const computeScatterPoints = (records: BenchmarkResult[]): ScatterPoint[] => {
  const byConfig = new Map<string, BenchmarkResult[]>();
  for (const r of records) {
    const list = byConfig.get(r.config_hash) ?? [];
    list.push(r);
    byConfig.set(r.config_hash, list);
  }
  const points: ScatterPoint[] = [];
  for (const attempts of byConfig.values()) {
    // One point per config_hash, computed from the LATEST invocation only (so it
    // matches the headline RunRow and links 1:1 to the ranking row), not all
    // pooled attempts.
    const latest = splitInvocations(attempts)[0]?.records;
    const head = latest?.[0];
    if (latest === undefined || head === undefined) continue;
    const { passRate, efficiency } = computeConfigScores(latest);
    points.push({
      config_hash: head.config_hash,
      artifact: head.artifact,
      family: modelFamily(head.artifact),
      runtime: head.runtime,
      quant: head.quant,
      temperature: head.temperature,
      x: latest.reduce((s, a) => s + a.generation_tokens, 0),
      y: passRate,
      efficiency,
      sizeB: modelSizeB(head.artifact),
      peak_memory_gb: latest.reduce((m, a) => (a.peak_memory_gb > m ? a.peak_memory_gb : m), 0),
      generation_tps: meanOrZero(latest.map((a) => a.generation_tps)),
      wall_time_sec: latest.reduce((s, a) => s + a.wall_time_sec, 0),
    });
  }
  return points;
};

