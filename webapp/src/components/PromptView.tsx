import { useState } from "react";
import styles from "./PromptView.module.css";
import type { BenchmarkResult } from "../lib/data";
import { stripThinkingTags, extractThinkBlock } from "../lib/strip-thinking";

export function PromptView({ rec }: { rec: BenchmarkResult }) {
  const [showThink, setShowThink] = useState(false);
  const reasoning = extractThinkBlock(rec.output);
  const stripped = stripThinkingTags(rec.output);

  return (
    <div className={styles.promptView}>
      <section className={styles.section}>
        <h3>Score detail</h3>
        <pre className={styles.runDetails}>{rec.score_details || "(none)"}</pre>
      </section>
      <section className={styles.section}>
        <h3>Prompt</h3>
        <pre className={styles.runText}>{rec.prompt_text || "(prompt not archived)"}</pre>
      </section>
      <section className={styles.section}>
        <h3>Output</h3>
        {reasoning !== null && (
          <div className={styles.thinking}>
            <button onClick={() => setShowThink((v) => !v)}>
              {showThink ? "▾" : "▸"} reasoning ({reasoning.length} chars)
            </button>
            {showThink && <pre className={`${styles.runText} ${styles.runThinking}`}>{reasoning}</pre>}
          </div>
        )}
        <pre className={styles.runText}>{stripped}</pre>
      </section>
    </div>
  );
}
