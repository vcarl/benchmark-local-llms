/**
 * Strip reasoning / meta tokens so scorers see only the final answer.
 *
 * Ported byte-for-byte from `runner.py:_strip_thinking_tags` (the pattern
 * literals match the Python regexes, translated to JS syntax). The order of
 * operations matches exactly:
 *
 *   1. If a Harmony `final` channel exists, replace the text with its body.
 *   2. Strip any remaining `<|...|>` harmony control tokens.
 *   3. Strip a leading `.*?</think>\s*` block (DeepSeek style).
 *   4. Trim leading/trailing whitespace.
 *
 * The Python regexes use `re.DOTALL`; in JS we use the `s` flag for the same
 * semantics (`.` matches newlines). The DeepSeek strip pattern is anchored to
 * the start of the input (`^`), matching Python's `re.sub` applied once with
 * a leading `^.*?</think>`.
 */

/**
 * Matches the `final` harmony channel's message body.
 *
 * Python regex (from runner.py):
 *   r"<\|channel\|>\s*final\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|\Z)"
 *   with re.DOTALL
 *
 * JS translation: `\Z` (end of string) is not supported directly in JS; but
 * since we `.search()` (not `.match()` anchored), end-of-string is covered
 * by `$` with the `s` flag absent on the alternatives — however the original
 * Python `.search()` consumes lazily up to the first alternative, including
 * end-of-string. We model `\Z` as `$` (end of string, `$` without the `m`
 * flag matches only at the very end, equivalent to `\Z` in a non-multiline
 * Python regex).
 */
const HARMONY_FINAL_RE = /<\|channel\|>\s*final\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|$)/s;

/** Any remaining `<|...|>` harmony control token. Python: `r"<\|[^|]*\|>"`. */
const HARMONY_TOKEN_RE = /<\|[^|]*\|>/g;

/**
 * Leading think-block strip (DeepSeek R1 style).
 * Python: `re.compile(r"^.*?</think>\s*", re.DOTALL)` applied with `.sub(..., text)`
 * which replaces only the first match. The `^` anchor with DOTALL means the
 * whole document up to (and through) the first `</think>` plus trailing
 * whitespace.
 */
const THINK_RE = /^.*?<\/think>\s*/s;

export const stripThinkingTags = (text: string): string => {
  let t = text;
  const m = HARMONY_FINAL_RE.exec(t);
  if (m && m[1] !== undefined) {
    t = m[1];
  }
  t = t.replace(HARMONY_TOKEN_RE, "");
  t = t.replace(THINK_RE, "");
  return t.trim();
};
