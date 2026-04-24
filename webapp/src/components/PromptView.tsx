import { useState } from "react";
import type { BenchmarkResult } from "../lib/data";
import { stripThinkingTags, extractThinkBlock } from "../lib/strip-thinking";

export function PromptView({ rec }: { rec: BenchmarkResult }) {
  const [showThink, setShowThink] = useState(false);
  const reasoning = extractThinkBlock(rec.output);
  const stripped = stripThinkingTags(rec.output);

  return (
    <div className="prompt-view">
      <section>
        <h3>Score detail</h3>
        <pre className="run-details">{rec.score_details || "(none)"}</pre>
      </section>
      <section>
        <h3>Prompt</h3>
        <pre className="run-text">{rec.prompt_text || "(prompt not archived)"}</pre>
      </section>
      <section>
        <h3>Output</h3>
        {reasoning !== null && (
          <div className="thinking">
            <button onClick={() => setShowThink((v) => !v)}>
              {showThink ? "▾" : "▸"} reasoning ({reasoning.length} chars)
            </button>
            {showThink && <pre className="run-text run-thinking">{reasoning}</pre>}
          </div>
        )}
        <pre className="run-text">{stripped}</pre>
      </section>
    </div>
  );
}
