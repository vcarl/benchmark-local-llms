// Ports src/scoring/strip-thinking.ts to the webapp. Behavior must match
// byte-for-byte so the output displayed here matches what the scorer saw.

const HARMONY_FINAL_RE =
  /<\|channel\|>\s*final\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|$)/s;
const HARMONY_TOKEN_RE = /<\|[^|]*\|>/g;
const THINK_RE = /^.*?<\/think>\s*/s;
const THINK_BLOCK_RE = /<think>(.*?)<\/think>/s;

export const stripThinkingTags = (text: string): string => {
  let t = text;
  const m = HARMONY_FINAL_RE.exec(t);
  if (m && m[1] !== undefined) t = m[1];
  t = t.replace(HARMONY_TOKEN_RE, "");
  t = t.replace(THINK_RE, "");
  return t.trim();
};

// Harmony `analysis` channel: capture up to the next <|end|> or the next channel marker.
const HARMONY_ANALYSIS_RE =
  /<\|channel\|>\s*analysis\s*<\|message\|>(.*?)(?:<\|end\|>|<\|channel\|>|$)/s;

// Bare leading </think> (DeepSeek style: no opening <think> tag).
// Captures everything before the first </think> when no <think> appears earlier.
const BARE_CLOSE_THINK_RE = /^([\s\S]*?)<\/think>/;

// Webapp-only helper: pull the reasoning text for display in a collapsible UI.
// Checks formats in priority order:
//   1. <think>...</think> pair  (most specific; some models emit both an opening and closing tag)
//   2. Harmony analysis channel
//   3. Bare leading </think>    (DeepSeek style — only when no <think> opener exists)
// Returns null when no reasoning marker matches, or when a matching marker
// has an empty/whitespace-only body (cascades to the next branch).
const orNull = (s: string | undefined): string | null => {
  if (s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
};

export const extractThinkBlock = (text: string): string | null => {
  const pair = THINK_BLOCK_RE.exec(text);
  if (pair) {
    const v = orNull(pair[1]);
    if (v !== null) return v;
  }

  const harmony = HARMONY_ANALYSIS_RE.exec(text);
  if (harmony) {
    const v = orNull(harmony[1]);
    if (v !== null) return v;
  }

  if (!text.includes("<think>") && text.includes("</think>")) {
    const bare = BARE_CLOSE_THINK_RE.exec(text);
    if (bare) {
      const v = orNull(bare[1]);
      if (v !== null) return v;
    }
  }

  return null;
};
