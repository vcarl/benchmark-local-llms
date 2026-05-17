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

// Webapp-only helper: pull the reasoning text out of a <think>...</think>
// block for display in a collapsible UI. Not present in the scoring version.
export const extractThinkBlock = (text: string): string | null => {
  const m = THINK_BLOCK_RE.exec(text);
  return m && m[1] !== undefined ? m[1].trim() : null;
};
