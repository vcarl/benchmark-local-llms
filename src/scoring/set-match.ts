import { Effect } from "effect";
import type { SetMatchConfig } from "../schema/scorer.js";
import { extractSet } from "./entities.js";
import type { PromptScore } from "./score-result.js";

/**
 * set_match scorer. Grades an unordered SET answer with F1 partial credit.
 *
 * Extract the predicted set `P` (vocabulary tokens named in the response),
 * compare to the expected set `E`. With `TP = |P ∩ E|`:
 *
 *   precision = TP / |P|            (0 when |P| = 0)
 *   recall    = TP / |E|            (0 when |E| = 0)
 *   score     = F1 = 2·TP / (|P| + |E|)   (1 when both empty)
 *
 * `F1 = 1` iff `P == E` — exactly the "all and only" full-credit rule. Pure
 * (`Effect.sync`); a wrong or empty answer returns a low score, never an error.
 */
export const scoreSetMatch = (output: string, config: SetMatchConfig): Effect.Effect<PromptScore> =>
  Effect.sync(() => {
    const predicted = extractSet(output, config.vocabulary, {
      caseSensitive: config.caseSensitive ?? false,
    });
    const expected = new Set(config.expected);

    let truePositives = 0;
    for (const t of predicted) if (expected.has(t)) truePositives++;

    const denom = predicted.size + expected.size;
    const score = denom === 0 ? 1 : (2 * truePositives) / denom;
    const precision = predicted.size === 0 ? 0 : truePositives / predicted.size;
    const recall = expected.size === 0 ? 0 : truePositives / expected.size;

    const matched = [...expected].filter((t) => predicted.has(t));
    const missing = [...expected].filter((t) => !predicted.has(t));
    const extra = [...predicted].filter((t) => !expected.has(t));

    const details =
      `F1=${score.toFixed(2)} precision=${precision.toFixed(2)} recall=${recall.toFixed(2)}` +
      ` matched [${matched.join(", ")}] missing [${missing.join(", ")}] extra [${extra.join(", ")}]`;

    return { kind: "prompt", score, details };
  });
