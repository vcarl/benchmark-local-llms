import { createHash } from "node:crypto";

/**
 * Compute the 12-char SHA-256 prefix hash used as part of the cross-run
 * prompt cache key and the scenario hash (§2.2 / §2.3). Matches the Python
 * prototype's `compute_prompt_hash` / `compute_scenario_hash` output width
 * exactly so archive keys stay stable across the rewrite boundary.
 */
export const shortSha256 = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex").slice(0, 12);

/**
 * Hash of what the model sees on every run: user prompt text joined with the
 * resolved system prompt text. A change in either invalidates the cache.
 */
export const computePromptHash = (promptText: string, systemText: string): string =>
  shortSha256(`${promptText}|${systemText}`);

/**
 * Hash of the scenario inputs that determine the run. Excludes `name` so that
 * renaming a scenario file does not invalidate the cache (matches the Python
 * prototype's `compute_scenario_hash` exactly).
 */
export const computeScenarioHash = (parts: {
  fixture: string;
  scorer: string;
  scorerParams: Record<string, unknown>;
  players: ReadonlyArray<{ id: string; controlledBy: string }>;
  cutoffs: { wallClockSec: number; totalTokens: number; toolCalls: number };
}): string => {
  const blob = [
    parts.fixture,
    parts.scorer,
    stableStringify(parts.scorerParams),
    stableStringify(parts.players),
    `${parts.cutoffs.wallClockSec}|${parts.cutoffs.totalTokens}|${parts.cutoffs.toolCalls}`,
  ].join("|");
  return shortSha256(blob);
};

/**
 * JSON.stringify with recursively sorted object keys so equivalent objects
 * hash identically regardless of input ordering. Mirrors Python's
 * `json.dumps(..., sort_keys=True)`.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",");
  return `{${body}}`;
};
