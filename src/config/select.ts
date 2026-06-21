/**
 * Pure selection helpers for the matrix runner. No Effect, no IO — glob
 * matching over already-loaded config ids and challenge file stems.
 *
 * Engine: picomatch v4. Patterns are full-string anchored. `*`, `?`, `[…]`,
 * and `{a,b}` brace alternation are supported; `.`, `-`, and `/` are literal
 * (so `qwen2.5-7b-mlx` matches itself but not `qwen2X5-7b-mlx`).
 */
import picomatch from "picomatch";

/**
 * Select configurations by id glob. With no pattern, return every config not
 * explicitly disabled (`active: false`) — opt-out semantics, matching the
 * `active: false` convention. An explicit pattern overrides the active gate:
 * explicit intent wins.
 */
export const selectConfigs = <T extends { id: string; active?: boolean | undefined }>(
  all: readonly T[],
  pattern?: string,
): T[] => {
  if (pattern === undefined) return all.filter((c) => c.active !== false);
  const isMatch = picomatch(pattern);
  return all.filter((c) => isMatch(c.id));
};

/** Select challenge file stems by glob. With no pattern, return all stems. */
export const selectChallengeStems = (stems: readonly string[], pattern?: string): string[] => {
  if (pattern === undefined) return [...stems];
  const isMatch = picomatch(pattern);
  return stems.filter((s) => isMatch(s));
};
