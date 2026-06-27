import { Effect } from "effect";
import type { OrderedMatchConfig } from "../schema/scorer.js";
import { extractSequence } from "./entities.js";
import type { PromptScore } from "./score-result.js";

/**
 * Length of the longest common subsequence of `a` and `b` (order-preserving,
 * not necessarily contiguous). Standard O(|a|·|b|) dynamic program.
 */
const lcsLength = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): number => {
  const rows = a.length;
  const cols = b.length;
  // dp[j] holds LCS length for the current row; rolling single-row buffer.
  const dp = new Array<number>(cols + 1).fill(0);
  for (let i = 1; i <= rows; i++) {
    let prevDiag = 0; // dp[i-1][j-1]
    for (let j = 1; j <= cols; j++) {
      const temp = dp[j] ?? 0; // dp[i-1][j] before overwrite
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag + 1 : Math.max(dp[j] ?? 0, dp[j - 1] ?? 0);
      prevDiag = temp;
    }
  }
  return dp[cols] ?? 0;
};

/**
 * ordered_match scorer. Grades an ORDERED-sequence answer with LCS-ratio
 * partial credit.
 *
 * Extract the predicted sequence `P` (vocabulary tokens ordered by first
 * occurrence in the response), compare to the expected sequence `E`:
 *
 *   score = |LCS(P, E)| / max(|P|, |E|)   (1 when both empty)
 *
 * `score = 1` iff `P == E` exactly. The `max` denominator penalizes both
 * missing expected elements (shorter LCS) and extra predicted ones (larger
 * denominator). Pure (`Effect.sync`); never errors.
 */
export const scoreOrderedMatch = (
  output: string,
  config: OrderedMatchConfig,
): Effect.Effect<PromptScore> =>
  Effect.sync(() => {
    const predicted = extractSequence(output, config.vocabulary, {
      caseSensitive: config.caseSensitive ?? false,
    });
    const expected = config.expected;

    const denom = Math.max(predicted.length, expected.length);
    const lcs = lcsLength(predicted, expected);
    const score = denom === 0 ? 1 : lcs / denom;

    const details =
      `LCS=${lcs}/${denom} predicted [${predicted.join(" → ")}]` +
      ` expected [${expected.join(" → ")}]`;

    return { kind: "prompt", score, details };
  });
