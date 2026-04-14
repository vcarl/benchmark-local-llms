/**
 * Common types returned from every scorer. The requirements doc §4.x consistently
 * describes a score (number) plus a human-readable `details` string; we mirror
 * that here with a single shape rather than four slightly-different ones.
 *
 * Score is in [0, 1] in all cases. `breakdown` carries constraint-specific
 * pass/fail/errored lists when relevant, so the report layer can render the
 * detail without re-running the scorer.
 */
export interface Score {
  readonly score: number;
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
}

export interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}
