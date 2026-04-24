import { Effect } from "effect";
import type { ExactMatchConfig } from "../schema/scorer.js";
import type { Score } from "./score-result.js";

/**
 * exact_match scorer (requirements §4.2 / runner.py:_score_exact_match).
 *
 * 1. `re.findall(pattern, output)` — Python uses the raw regex string as-is.
 *    We mirror with `new RegExp(pattern, "g")` + `matchAll`. The Python
 *    `findall` with a single capture group returns the group text, not the
 *    whole match; with no capture group, it returns the whole match. We
 *    replicate both via `m[1] ?? m[0]` so patterns without a capture group
 *    still work.
 * 2. Use the **last match** — models commonly show work before the final
 *    answer (verbatim comment from runner.py:175).
 * 3. Strip commas from the extracted string (for numeric answers like
 *    `2,395,912`).
 * 4. Compare to `config.expected` — exact, case-sensitive string equality.
 *
 * Effect is pure (`Effect.sync`) — no failure channel; a missing match
 * returns a zero score with a descriptive `details` message, matching the
 * prototype's non-error return.
 */
export const scoreExactMatch = (output: string, config: ExactMatchConfig): Effect.Effect<Score> =>
  Effect.sync(() => {
    const re = new RegExp(config.extract, "g");
    const matches = Array.from(output.matchAll(re));
    if (matches.length === 0) {
      return { score: 0, details: "no match for pattern in output" };
    }
    // Last match (prototype behavior). Prefer first capture group; fall back
    // to whole match if the pattern has none (matches Python's re.findall).
    const last = matches[matches.length - 1];
    if (last === undefined) {
      return { score: 0, details: "no match for pattern in output" };
    }
    const raw = last[1] ?? last[0];
    const extracted = raw.replace(/,/g, "");
    if (extracted === config.expected) {
      return { score: 1, details: `correct: ${extracted}` };
    }
    return { score: 0, details: `expected ${config.expected}, got ${extracted}` };
  });
