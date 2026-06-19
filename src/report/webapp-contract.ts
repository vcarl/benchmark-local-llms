import type { AttemptManifest, ItemResult } from "../schema/attempt.js";

/** Round to 2 decimal places (mirrors Python round(x, 2) for finite positives). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * One reported, **completed** `(config × challenge)` attempt, flattened for the
 * webapp. Grain is per-attempt (not per-item): the matrix + two scores need only
 * attempt-level data; per-item detail is deferred. Field names are snake_case to
 * match the existing webapp data convention. Efficiency inputs
 * (`generation_tokens`, `wall_time_sec`) are summed over the attempt's items.
 */
export interface WebappRecord {
  readonly config_id: string;
  readonly config_hash: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  readonly system_prompt: string;
  readonly max_tokens: number;
  readonly challenge_id: string;
  readonly challenge_version: number;
  readonly attempt_id: string;
  readonly finished_at: string;
  readonly score: number;
  readonly passed: boolean;
  readonly generation_tokens: number;
  readonly wall_time_sec: number;
  readonly item_count: number;
  readonly passed_items: number;
}

/**
 * Flatten a finalized attempt into a {@link WebappRecord}. Precondition (enforced
 * by the caller, {@link aggregate}): `manifest.finishedAt` is non-null and
 * `interrupted` is false. `generation_tokens` / `wall_time_sec` sum the item lines.
 */
export const toWebappRecord = (
  manifest: AttemptManifest,
  items: ReadonlyArray<ItemResult>,
): WebappRecord => ({
  config_id: manifest.configId,
  config_hash: manifest.configHash,
  artifact: manifest.artifact,
  runtime: manifest.runtime,
  quant: manifest.quant ?? null,
  temperature: manifest.temperature,
  system_prompt: manifest.systemPrompt,
  max_tokens: manifest.maxTokens,
  challenge_id: manifest.challengeId,
  challenge_version: manifest.challengeVersion,
  attempt_id: manifest.attemptId,
  finished_at: manifest.finishedAt ?? "",
  score: round2(manifest.aggregate.score),
  passed: manifest.aggregate.passed,
  generation_tokens: items.reduce((s, i) => s + i.generationTokens, 0),
  wall_time_sec: round2(items.reduce((s, i) => s + i.wallTimeSec, 0)),
  item_count: items.length,
  passed_items: items.filter((i) => i.score === 1).length,
});
