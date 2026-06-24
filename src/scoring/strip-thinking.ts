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
 *   3. Try a closed think block in either dialect — `<think>…</think>`
 *      (Qwen/DeepSeek) or `[THINK]…[/THINK]` (Magistral): body → `reasoning`,
 *      remainder → `output`. A lone closer (`</think>` / `[/THINK]`) with no
 *      opener is also treated as a split — everything before it is reasoning,
 *      everything after is the answer. This covers models that emit a reasoning
 *      preamble and only the closing tag (observed from qwen3.5/qwen3.6 under
 *      llama.cpp `--reasoning-format none`).
 *   4. Try an unclosed opener (`<think>` / `[THINK]`): `error="thinking_truncated"`.
 *   5. No markers found: entire input (trimmed) is `output`, `reasoning=null`.
 *
 * Stray sentence tokens (`<s>` / `</s>`) are removed from `output` at every
 * exit. `--reasoning-format auto` on llama.cpp already strips these and
 * separates reasoning into `reasoning_content`, so this post-processing is the
 * fallback for runtimes that do NOT separate reasoning natively — chiefly
 * `mlx_lm.server`, which inlines `[THINK]…[/THINK]` and never populates a
 * `reasoning` field (verified empirically against mlx_lm 0.31.2).
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
 * Detect a think opener (either dialect) with no matching closer anywhere
 * downstream. If this matches, the body is everything after the opener to
 * end-of-input — i.e. a truncated reasoning block. Without this branch the
 * closed-tag regex fails to match and the entire CoT silently flows to the
 * scorer.
 */
const UNCLOSED_THINK_RE = /(?:<think>|\[THINK\])([\s\S]*)$/;

/**
 * Stray sentence-boundary tokens some templates leak into the answer body
 * (`<s>` BOS, `</s>` EOS). These are never part of the answer; strip them.
 */
const SENTENCE_TOKEN_RE = /<\/?s>/g;

const stripSentenceTokens = (text: string): string => text.replace(SENTENCE_TOKEN_RE, "");

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

/**
 * Closed think block in either dialect: `<think>…</think>` (Qwen/DeepSeek) or
 * `[THINK]…[/THINK]` (Magistral). Captures everything up to the FIRST closer as
 * reasoning and the remainder as output. A leading opener (if present) is
 * matched optionally and dropped from the reasoning body; when only the closer
 * is present the whole pre-closer prefix is reasoning — this is the qwen3.x
 * leak where the model emits a preamble and only the closing tag.
 *
 * `[\s\S]*?` is lazy so the first closer wins; the opener alternation tolerates
 * either dialect's opener appearing before either dialect's closer (templates
 * have been observed mixing them).
 */
const CLOSED_THINK_RE = /^(?:<think>|\[THINK\])?([\s\S]*?)(?:<\/think>|\[\/THINK\])\s*([\s\S]*)$/;

const stripThinkInline = (text: string): StripResult => {
  // Closed think block (either dialect, or a lone closer with no opener):
  // body before the closer → reasoning, body after → output.
  const closed = CLOSED_THINK_RE.exec(text);
  if (closed && closed[1] !== undefined && closed[2] !== undefined) {
    return {
      output: stripSentenceTokens(closed[2]).trim(),
      reasoning: closed[1],
      error: null,
    };
  }
  // Unclosed opener (either dialect): budget exhausted before the model closed
  // the tag. No answer was produced. Any pre-opener content is dropped — if the
  // model started thinking mid-response, the prior text was a partial attempt
  // that's no longer trustworthy.
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
    output: stripSentenceTokens(text.replace(HARMONY_TOKEN_RE, "")).trim(),
    reasoning: null,
    error: null,
  };
};
