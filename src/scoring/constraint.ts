import { Effect } from "effect";
import type { ConstraintConfig } from "../schema/scorer.js";
import { evaluateConstraint } from "./constraint-checks.js";
import type { ConstraintBreakdown, Score } from "./score-result.js";

/**
 * constraint scorer (requirements §4.3 / runner.py:_score_constraints).
 *
 * For each constraint: evaluate to pass / fail / errored. The score is
 * `passedCount / totalCount` (matches the prototype; §4.3). If the
 * constraint list is empty, score is 0 — mirrors the Python guard
 * `len(passed) / total if total > 0 else 0.0`.
 *
 * ConstraintEvalError does NOT bubble up; it is caught and recorded as an
 * errored check. This matches the prototype's `try/except` around the
 * lambda call which routes any exception into the `failed` bucket — BUT we
 * intentionally separate `errored` from `failed` per the requirements doc
 * (§4.3: "record as errored (distinct from failed)"). This is the one
 * documented behavioral departure from the prototype for this scorer.
 */
export const scoreConstraints = (output: string, config: ConstraintConfig): Effect.Effect<Score> =>
  Effect.gen(function* () {
    const passed: string[] = [];
    const failed: string[] = [];
    const errored: string[] = [];

    for (const def of config.constraints) {
      const result = yield* Effect.either(evaluateConstraint(output, def));
      if (result._tag === "Right") {
        if (result.right) passed.push(def.name);
        else failed.push(def.name);
      } else {
        errored.push(def.name);
      }
    }

    const total = config.constraints.length;
    const score = total > 0 ? passed.length / total : 0;
    const breakdown: ConstraintBreakdown = { passed, failed, errored };

    const details = formatDetails(passed.length, total, failed, errored);
    return { score, details, breakdown };
  });

const formatDetails = (
  passedCount: number,
  total: number,
  failed: ReadonlyArray<string>,
  errored: ReadonlyArray<string>,
): string => {
  const parts: string[] = [`${passedCount}/${total}`];
  if (failed.length > 0) parts.push(`failed [${failed.join(", ")}]`);
  if (errored.length > 0) parts.push(`errored [${errored.join(", ")}]`);
  if (failed.length === 0 && errored.length === 0) parts.push("all passed");
  return parts.join(": ");
};
