import type { ReactNode } from "react";
import styles from "./describe-scorer.module.css";

type JsonObj = Record<string, unknown>;

const asObj = (v: unknown): JsonObj | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonObj) : null;

const str = (v: unknown): string => (typeof v === "string" ? v : String(v));

const joinList = (v: unknown): string =>
  Array.isArray(v) ? v.map(str).join(", ") : str(v);

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Resolve a constraint `name` to its per-check outcome using the (untrusted)
 * breakdown payload. Returns `null` when the breakdown is absent/malformed or
 * the name appears in none of its arrays → caller renders no mark, matching the
 * pre-breakdown look. `errored` is reported distinctly so it can carry its own
 * title, but renders as the same ✗ as a plain failure.
 */
const constraintStatus = (
  breakdown: unknown,
  name: string,
): "passed" | "failed" | "errored" | null => {
  const b = asObj(breakdown);
  if (b === null) return null;
  if (strArr(b.passed).includes(name)) return "passed";
  if (strArr(b.failed).includes(name)) return "failed";
  if (strArr(b.errored).includes(name)) return "errored";
  return null;
};

const constraintMark = (status: "passed" | "failed" | "errored" | null): ReactNode => {
  if (status === null) return null;
  if (status === "passed") {
    return (
      <span className={styles.pass} aria-label="passed" title="passed">
        ✓
      </span>
    );
  }
  const title = status === "errored" ? "errored" : "failed";
  return (
    <span className={styles.fail} aria-label="failed" title={title}>
      ✗
    </span>
  );
};

/**
 * Render a per-prompt `scorer` config (the `ScorerConfig` discriminated union)
 * as a short human description of *how* the output was graded — replacing the
 * raw JSON blob in the drilldown. This is config, not results: the score value
 * itself is shown separately. Unknown / malformed shapes fall back to JSON so
 * nothing is silently dropped.
 */
export function describeScorer(scorer: unknown, breakdown?: unknown): ReactNode {
  const s = asObj(scorer);
  if (s === null) return <p className={styles.desc}>No scorer.</p>;

  const fallback = (
    <pre className={styles.fallback}>{JSON.stringify(scorer, null, 2)}</pre>
  );

  switch (s.type) {
    case "exact_match": {
      const extract = typeof s.extract === "string" ? s.extract : null;
      return (
        <p className={styles.desc}>
          <strong>Exact match.</strong>{" "}
          {extract !== null ? (
            <>
              Extract <code>{extract}</code> from the output, then compare it to{" "}
            </>
          ) : (
            <>Compare the output to </>
          )}
          <code>{str(s.expected)}</code>.
        </p>
      );
    }
    case "constraint": {
      const constraints = Array.isArray(s.constraints) ? s.constraints : [];
      return (
        <div className={styles.desc}>
          <p>
            <strong>Constraint.</strong> Output must satisfy {constraints.length}{" "}
            {constraints.length === 1 ? "check" : "checks"}; score is the fraction
            passed:
          </p>
          <ul className={styles.list}>
            {constraints.map((c, i) => {
              const co = asObj(c) ?? {};
              const name = typeof co.name === "string" ? co.name : `check ${i + 1}`;
              const check = typeof co.check === "string" ? co.check : "?";
              const mark = constraintMark(constraintStatus(breakdown, name));
              return (
                <li key={i}>
                  {mark}
                  {mark !== null ? " " : null}
                  {name} <span className={styles.muted}>({check})</span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "set_match":
    case "ordered_match": {
      const ordered = s.type === "ordered_match";
      const vocab = Array.isArray(s.vocabulary) ? s.vocabulary.length : 0;
      const caseSensitive = s.caseSensitive === true;
      return (
        <p className={styles.desc}>
          <strong>{ordered ? "Ordered match" : "Set match"}.</strong> Expected{" "}
          {ordered ? "sequence" : "set"} <code>{joinList(s.expected)}</code>, drawn
          from a vocabulary of {vocab} {vocab === 1 ? "item" : "items"}.{" "}
          {ordered
            ? "Partial credit by longest-common-subsequence ratio."
            : "Partial credit by F1 overlap."}{" "}
          {caseSensitive ? "Case-sensitive." : "Case-insensitive."}
        </p>
      );
    }
    case "code_exec":
      return (
        <p className={styles.desc}>
          <strong>Code execution.</strong> Runs Python assertions against the output;
          passes only if every assertion holds.
        </p>
      );
    case "game":
      return (
        <p className={styles.desc}>
          <strong>Game scorer.</strong> Scenario <code>{str(s.gameScorer)}</code>{" "}
          grades the run against its objective.
        </p>
      );
    case "custom":
      return (
        <p className={styles.desc}>
          <strong>Custom scorer.</strong> Challenge-supplied script{" "}
          <code>{str(s.script)}</code>.
        </p>
      );
    default:
      return fallback;
  }
}
