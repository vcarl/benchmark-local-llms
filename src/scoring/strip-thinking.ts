/**
 * Strip reasoning / meta tokens and return a structured result.
 *
 * Returns `{ output, reasoning, error }` where:
 *   - `output`   — the final answer text, ready for scorer consumption.
 *   - `reasoning`— the separated thinking body, or `null` if none was detected.
 *   - `error`    — `"thinking_truncated"` when a `<think>` opener has no
 *                  corresponding `</think>`; `null` otherwise.
 *
 * Processing order (Harmony input is checked first because Harmony outputs
 * can embed `<think>` inside the final-channel body):
 *   1. If a Harmony `final` channel exists, extract its body as `output` and
 *      the `analysis` channel body (if present) as `reasoning`.
 *   2. Strip any remaining `<|...|>` Harmony control tokens from `output`.
 *   3. Try a closed `<think>…</think>` block: body → `reasoning`, remainder → `output`.
 *   4. Try an unclosed `<think>` block: return `error="thinking_truncated"`.
 *   5. No markers found: entire input (trimmed) is `output`, `reasoning=null`.
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
 * Match the analysis channel body, terminated by `<|end|>` or end-of-string.
 * Used to capture reasoning when the model emits Harmony channel markers.
 */
const HARMONY_ANALYSIS_RE =
  /<\|channel\|>\s*analysis\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|$)/s;

/**
 * Detect a `<think>` opener with no matching `</think>` anywhere downstream.
 * If this matches, the body is everything after `<think>` to end-of-input —
 * i.e. a truncated reasoning block. Without this branch the closed-tag regex
 * fails to match and the entire CoT silently flows to the scorer.
 */
const UNCLOSED_THINK_RE = /<think>([\s\S]*)$/;

export interface StripResult {
  readonly output: string;
  readonly reasoning: string | null;
  readonly error: string | null;
}

export const stripThinkingTags = (text: string): StripResult => {
  // Harmony format: try the channel pattern first because Harmony outputs
  // can also embed `<think>` inside the final-channel body, and we want the
  // outer extraction to win.
  const finalMatch = HARMONY_FINAL_RE.exec(text);
  if (finalMatch && finalMatch[1] !== undefined) {
    const analysisMatch = HARMONY_ANALYSIS_RE.exec(text);
    const analysisBody = analysisMatch?.[1] ?? null;
    let body = finalMatch[1];
    body = body.replace(HARMONY_TOKEN_RE, "");
    // The body may itself contain a <think>...</think>; recurse once on the
    // body so the inner block is split out. The recursion is bounded — we
    // pass `body` to a non-Harmony branch so it can't loop.
    const inner = stripThinkInline(body);
    return {
      output: inner.output.trim(),
      reasoning:
        inner.reasoning ??
        (analysisBody !== null ? analysisBody.replace(HARMONY_TOKEN_RE, "").trim() : null),
      error: null,
    };
  }
  return stripThinkInline(text);
};

const stripThinkInline = (text: string): StripResult => {
  // Closed <think>...</think>: capture everything before+inside the tag as
  // reasoning, everything after as output. The regex anchors to start so
  // only the leading thinking block is consumed (mirrors prior behavior).
  const closed = /^([\s\S]*?)<\/think>\s*([\s\S]*)$/.exec(text);
  if (closed && closed[1] !== undefined && closed[2] !== undefined && text.includes("<think>")) {
    // The reasoning body is everything before </think>. Strip a leading
    // `<think>` opener if it sits at the very start of the input; if the
    // opener appears after other text, keep it verbatim so the pre-tag
    // prefix and the literal `<think>` are both preserved (mirrors the
    // prior `^.*?</think>` behavior which captured all leading content).
    const beforeClose = closed[1];
    const reasoning = beforeClose.startsWith("<think>")
      ? beforeClose.slice("<think>".length)
      : beforeClose;
    return {
      output: closed[2].trim(),
      reasoning,
      error: null,
    };
  }
  // Unclosed <think>: budget exhausted before the model closed the tag.
  // No answer was produced. Any pre-opener content is dropped — if the
  // model started thinking mid-response, the prior text was a partial
  // attempt that's no longer trustworthy.
  const unclosed = UNCLOSED_THINK_RE.exec(text);
  if (unclosed && unclosed[1] !== undefined) {
    return {
      output: "",
      reasoning: unclosed[1],
      error: "thinking_truncated",
    };
  }
  // No think markers anywhere — the entire input is the answer.
  return {
    output: text.replace(HARMONY_TOKEN_RE, "").trim(),
    reasoning: null,
    error: null,
  };
};
