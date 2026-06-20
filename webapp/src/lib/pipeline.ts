import type { BenchmarkResult } from "./data";
import { modelFamily } from "./data";
import { EFFICIENCY_SCALE } from "./constants";

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

// ─── Legacy shims (kept until Task 10 rewires the UI components) ─────────────
// aggregateMatrix / Cell / ConfigRow / ArtifactGroup are retained as thin shims
// so that __root.tsx, RunGroupTable, and RunRowItem continue to typecheck while
// the UI layer awaits a dedicated replacement task.

export interface Cell { score: number; passed: boolean; }

export interface ConfigRow {
  config_hash: string;
  artifact: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  system_prompt: string;
  cells: Record<string, Cell>;
  passRate: number;
  efficiency: number | null;
  attemptsCompleted: number;
}

export interface ArtifactGroup { artifact: string; rows: ConfigRow[]; }

export const bestAttempt = (records: BenchmarkResult[]): BenchmarkResult | null =>
  records.reduce<BenchmarkResult | null>(
    (best, r) => (best === null || r.score > best.score ? r : best),
    null,
  );

export const aggregateMatrix = (
  records: BenchmarkResult[],
): { columns: string[]; groups: ArtifactGroup[] } => {
  const columns = [...new Set(records.map((r) => r.challenge_id))].sort();

  const byConfig = new Map<string, BenchmarkResult[]>();
  for (const r of records) {
    const list = byConfig.get(r.config_hash) ?? [];
    list.push(r);
    byConfig.set(r.config_hash, list);
  }

  const rows: ConfigRow[] = [];
  for (const [config_hash, attempts] of byConfig) {
    const head = attempts[0];
    if (head === undefined) continue;
    const cells: Record<string, Cell> = {};
    for (const col of columns) {
      const best = bestAttempt(attempts.filter((a) => a.challenge_id === col));
      if (best !== null) cells[col] = { score: best.score, passed: best.passed };
    }
    const scores = computeConfigScores(attempts);
    rows.push({
      config_hash,
      artifact: head.artifact,
      runtime: head.runtime,
      quant: head.quant,
      temperature: head.temperature,
      system_prompt: head.system_prompt,
      cells,
      passRate: scores.passRate,
      efficiency: scores.efficiency,
      attemptsCompleted: attempts.length,
    });
  }

  const byArtifact = new Map<string, ConfigRow[]>();
  for (const row of rows) {
    const list = byArtifact.get(row.artifact) ?? [];
    list.push(row);
    byArtifact.set(row.artifact, list);
  }
  const groups = [...byArtifact.entries()]
    .map(([artifact, gRows]) => ({ artifact, rows: gRows }))
    .sort((a, b) => a.artifact.localeCompare(b.artifact));

  return { columns, groups };
};
