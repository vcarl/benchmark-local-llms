import { useEffect, useState } from "react";
import styles from "./PromptView.module.css";
import type { PromptBenchmarkResult, ScoreBreakdown } from "../lib/data";
import { stripThinkingTags, extractThinkBlock } from "../lib/strip-thinking";
import { scoreBand } from "../lib/constants";

interface Props {
  rec: PromptBenchmarkResult;
  expanded: boolean;
  onToggle: () => void;
  isFocused: boolean;
  rowId: string;
}

const oneLine = (s: string) =>
  s.length === 0 ? "(empty)" : s.replace(/\s+/g, " ").trim();

export function PromptView({ rec, expanded, onToggle, isFocused, rowId }: Props) {
  const reasoning = extractThinkBlock(rec.output);
  const stripped = stripThinkingTags(rec.output);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  // Reset the reasoning toggle when the whole row collapses, so reopening
  // the row doesn't preserve a "closed" state from the previous expansion.
  useEffect(() => {
    if (!expanded) setReasoningOpen(true);
  }, [expanded]);

  const collapsedHeader = (
    <button
      type="button"
      className={styles.collapsedRow}
      onClick={onToggle}
      aria-expanded={expanded}
      data-band={scoreBand(rec.score)}
    >
      <span className={styles.scorePill}>{rec.score.toFixed(2)}</span>
      <span className={styles.collapsedName}>{rec.prompt_name}</span>
      <span className={styles.collapsedSummary}>{oneLine(stripped)}</span>
    </button>
  );

  if (!expanded) {
    return (
      <article
        id={rowId}
        className={styles.row}
        data-expanded={false}
        data-focused={isFocused}
      >
        {collapsedHeader}
      </article>
    );
  }

  return (
    <article
      id={rowId}
      className={styles.row}
      data-expanded={true}
      data-focused={isFocused}
    >
      {collapsedHeader}
      <MiniLabelSection
        label="prompt"
        body={rec.prompt_text || "(prompt not archived)"}
        smaller
      />
      <MiniLabelSection label="output" body={stripped || "(empty output)"} />
      {reasoning !== null && (
        <section className={styles.section}>
          <button
            type="button"
            className={styles.reasoningToggle}
            onClick={() => setReasoningOpen((v) => !v)}
            aria-expanded={reasoningOpen}
          >
            <span>{reasoningOpen ? "▾" : "▸"}</span>
            <span>reasoning · {reasoning.length} chars</span>
          </button>
          {reasoningOpen && (
            <pre className={styles.miniBody} data-tone="muted">
              {reasoning}
            </pre>
          )}
        </section>
      )}
      <RubricFooter rec={rec} />
    </article>
  );
}

function MiniLabelSection({
  label,
  body,
  smaller,
}: {
  label: string;
  body: string;
  smaller?: boolean;
}) {
  return (
    <section className={`${styles.section} ${styles.miniLabelBlock}`}>
      <span className={styles.miniLabel}>{label}</span>
      <pre
        className={styles.miniBody}
        style={smaller ? { fontSize: "var(--fz-10)" } : undefined}
      >
        {body}
      </pre>
    </section>
  );
}

// Renders the structured pass/fail/errored breakdown when present; otherwise
// falls back to the raw `score_details` string for non-constraint scorers
// (exact_match, code_exec, game) and execution-error sentinel rows.
function RubricFooter({ rec }: { rec: PromptBenchmarkResult }) {
  const bd = rec.score_breakdown;
  if (bd !== null) return <BreakdownRows bd={bd} />;
  if (!rec.score_details) return null;
  return (
    <div className={styles.rubricFooter}>
      <div className={styles.rubricRaw}>{rec.score_details}</div>
    </div>
  );
}

function BreakdownRows({ bd }: { bd: ScoreBreakdown }) {
  return (
    <div className={styles.rubricFooter}>
      {bd.passed.length > 0 && (
        <div className={styles.rubricRow}>
          <span className={styles.rubricLabel}>passed</span>
          <span>{bd.passed.join(", ")}</span>
        </div>
      )}
      {bd.failed.length > 0 && (
        <div className={styles.rubricRow}>
          <span className={styles.rubricLabel}>failed</span>
          <span>{bd.failed.join(", ")}</span>
        </div>
      )}
      {bd.errored.length > 0 && (
        <div className={styles.rubricRow}>
          <span className={styles.rubricLabel}>errored</span>
          <span>{bd.errored.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
