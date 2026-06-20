import type { BenchmarkResult } from "./data";
import { modelFamily, modelSizeB } from "./data";
import { EFFICIENCY_SCALE } from "./constants";
import type { Filters } from "./filter-state";

// ─── Filtering ───────────────────────────────────────────────────────────────

const passesDim = (selected: string[] | undefined, v: string): boolean =>
  selected === undefined || selected.length === 0 || selected.includes(v);

export const applyFilters = (records: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  records.filter((r) => {
    if (!passesDim(f.family, modelFamily(r.artifact))) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (!passesDim(f.quant, r.quant ?? "—")) return false;
    if (!passesDim(f.temperature, String(r.temperature))) return false;
    if (!passesDim(f.challenge, `${r.challenge_id}@${r.challenge_version}`)) return false;
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
  const denom = overallTokens * timeSpent;
  if (denom === 0) return { passRate, efficiency: null };
  const efficiency = ((passRate * uniqueChallenges * completed) / denom) * EFFICIENCY_SCALE;
  return { passRate, efficiency };
};

// ─── RunRow / RunGroup / aggregateRuns ───────────────────────────────────────

export type RunSortKey = "score" | "efficiency" | "memory";

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

const rowForConfig = (attempts: BenchmarkResult[]): RunRow | null => {
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

const sortValue = (r: RunRow, key: RunSortKey): number =>
  key === "score" ? r.passRate : key === "efficiency" ? (r.efficiency ?? 0) : r.mem;

// score desc; efficiency/memory asc.
const compareRuns = (key: RunSortKey) => (a: RunRow, b: RunRow): number => {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  return key === "score" ? vb - va : va - vb;
};

export const aggregateRuns = (
  records: BenchmarkResult[],
  primary: RunSortKey,
  secondary: RunSortKey,
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

  const cmpSecondary = compareRuns(secondary);
  const cmpPrimary = compareRuns(primary);
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
}

// ─── ChallengeBreakdown (per-challenge rows for one config_hash) ─────────────

export interface ChallengeBreakdownRow {
  challengeKey: string;
  challengeId: string;
  challengeVersion: number;
  attemptId: string;
  passRate: number;
  itemCount: number;
  passedItems: number;
}

export const challengeBreakdown = (
  records: BenchmarkResult[],
  configHash: string,
): ChallengeBreakdownRow[] => {
  const rows: ChallengeBreakdownRow[] = [];
  for (const r of records) {
    if (r.config_hash !== configHash) continue;
    rows.push({
      challengeKey: `${r.challenge_id}@${r.challenge_version}`,
      challengeId: r.challenge_id,
      challengeVersion: r.challenge_version,
      attemptId: r.attempt_id,
      passRate: r.item_count === 0 ? 0 : r.passed_items / r.item_count,
      itemCount: r.item_count,
      passedItems: r.passed_items,
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
    const head = attempts[0];
    if (head === undefined) continue;
    const { passRate, efficiency } = computeConfigScores(attempts);
    points.push({
      config_hash: head.config_hash,
      artifact: head.artifact,
      family: modelFamily(head.artifact),
      runtime: head.runtime,
      quant: head.quant,
      temperature: head.temperature,
      x: attempts.reduce((s, a) => s + a.generation_tokens, 0),
      y: passRate,
      efficiency,
      sizeB: modelSizeB(head.artifact),
      peak_memory_gb: attempts.reduce((m, a) => (a.peak_memory_gb > m ? a.peak_memory_gb : m), 0),
      generation_tps: meanOrZero(attempts.map((a) => a.generation_tps)),
    });
  }
  return points;
};

