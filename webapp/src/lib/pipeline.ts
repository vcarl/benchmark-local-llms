import type { BenchmarkResult } from "./data";
import { EFFICIENCY_SCALE } from "./constants";

// ─── Config×Challenge matrix ─────────────────────────────────────────────────

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

export const computeConfigScores = (
  attempts: BenchmarkResult[],
): { passRate: number; efficiency: number | null } => {
  const completed = attempts.length;
  if (completed === 0) return { passRate: 0, efficiency: null };
  const passed = attempts.filter((a) => a.passed).length;
  const passRate = passed / completed;
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
