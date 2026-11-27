import { Effect } from "effect";
import type { ExactMatchConfig } from "../schema/scorer.js";
import { translateInlineFlags } from "./regex-flags.js";
import { asFormatFlaw, type PromptScore } from "./score-result.js";

/**
 * exact_match scorer (requirements §4.2 / runner.py:_score_exact_match).
 *
 * 1. `re.findall(pattern, output)` — Python uses the raw regex string as-is.
 *    We mirror with `new RegExp(pattern, "g")` + `matchAll`, after translating
 *    a leading Python inline-flag group such as `(?i)` (see `regex-flags.ts`).
 *    The Python `findall` with a single capture group returns the group text,
 *    not the whole match; with no capture group, it returns the whole match.
 *    We replicate both via `m[1] ?? m[0]` so patterns without a capture group
 *    still work.
 * 2. Use the **last match** — models commonly show work before the final
 *    answer (verbatim comment from runner.py:175).
 * 3. Strip commas from the extracted string (for numeric answers like
 *    `2,395,912`).
 * 4. Compare to `config.expected` — exact, case-sensitive string equality.
 * 5. When `extract` finds nothing and `fallbackExtract` is set, grade the
 *    fallback's match instead: a correct answer found that way is a format
 *    flaw (`asFormatFlaw`); anything else keeps the `no_answer` zero.
 *
 * Effect is pure (`Effect.sync`) — no failure channel; a missing match
 * returns a zero score with a descriptive `details` message, matching the
 * prototype's non-error return.
 */
export const scoreExactMatch = (
  output: string,
  config: ExactMatchConfig,
): Effect.Effect<PromptScore> =>
  Effect.sync(() => {
    const primary = grade(output, config, config.extract);
    if (primary.failure !== "no_answer" || config.fallbackExtract === undefined) return primary;
    // ponytail: a near miss found only by the fallback earns nothing; scale its credit if that matters.
    const fallback = grade(output, config, config.fallbackExtract);
    return fallback.score === 1 ? asFormatFlaw(fallback, "no answer marker") : primary;
  });

const grade = (output: string, config: ExactMatchConfig, extract: string): PromptScore => {
  const { pattern, flags } = translateInlineFlags(extract, "g");
  // Last match (prototype behavior). Prefer first capture group; fall back
  // to whole match if the pattern has none (matches Python's re.findall).
  const last = Array.from(output.matchAll(new RegExp(pattern, flags))).at(-1);
  if (last === undefined) {
    return {
      kind: "prompt",
      score: 0,
      details: "no match for pattern in output",
      failure: "no_answer",
    };
  }
  const raw = last[1] ?? last[0];
  const extracted = raw.replace(/,/g, "");
  if (extracted === config.expected) {
    return { kind: "prompt", score: 1, details: `correct: ${extracted}` };
  }
  const near = config.nearMisses?.find((n) => n.expected === extracted);
  if (near !== undefined) {
    return {
      kind: "prompt",
      score: near.credit,
      details: `near miss (${near.slip}): expected ${config.expected}, got ${extracted}`,
      nearMiss: near.slip,
    };
  }
  return {
    kind: "prompt",
    score: 0,
    details: `expected ${config.expected}, got ${extracted}`,
  };
};
