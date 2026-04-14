import { Data } from "effect";

/**
 * Scoring errors from requirements §3.1. These distinguish scorer-machinery
 * failures (lookup miss, constraint throw, code-exec subprocess failure) from
 * legitimate negative scores. A failed assertion is score=0; these errors are
 * score-unknown.
 */

/** A game scorer key was referenced that isn't in the registry. */
export class ScorerNotFound extends Data.TaggedError("ScorerNotFound")<{
  readonly scorerName: string;
}> {}

/**
 * A constraint evaluator threw unexpectedly. This is distinct from a
 * constraint legitimately evaluating to false — score_details records the
 * distinction per §3.2.
 */
export class ConstraintEvalError extends Data.TaggedError("ConstraintEvalError")<{
  readonly constraintName: string;
  readonly check: string;
  readonly cause: string;
}> {}

/** The `code_exec` Python subprocess exceeded its 10-second budget. */
export class CodeExecTimeout extends Data.TaggedError("CodeExecTimeout")<{
  readonly timeoutSec: number;
}> {}

/** The `code_exec` Python subprocess exited non-zero (e.g. AssertionError). */
export class CodeExecFailed extends Data.TaggedError("CodeExecFailed")<{
  readonly exitCode: number;
  readonly stderr: string;
}> {}
