# Thinking Extraction Refactor

## Problem

Today, every model output passes through three regex strippers in `src/scoring/strip-thinking.ts` at scoring time:

1. Harmony `final` channel extraction
2. Harmony control-token strip
3. DeepSeek-style `<think>…</think>` strip (anchored to start, *requires* closing tag)

Upstream of that, `extractOutput` in `src/llm/chat-completion.ts` already separates `reasoning_content` (llamacpp `--reasoning-format deepseek`) and `reasoning` (mlx) from `content`, but then **wraps them in `<think>…</think>` and prepends to `content`** to flatten everything into a single `output` string. The regex stripper at scoring time is partially undoing the inlining that orchestration just did.

This causes three concrete problems:

1. **Structured signals are thrown away.** When the API hands us reasoning as a distinct field, we re-inline it instead of preserving the separation. Scorers operate on a string that mixes thinking and answer even when the runtime gave us a clean split.
2. **Unclosed thinking tags leak the entire CoT.** The `<think>…</think>` regex requires a closing tag. DeepSeek truncates before `</think>` on long generations; the result is that the entire CoT flows into the scorer as the "answer," typically grading 0 even when the model arrived at the right reasoning.
3. **Stripping is transient and unauditable.** Cleaned output exists only in memory during scoring. Archives store raw output. Re-scoring re-strips. There is no way to inspect "what did the scorer actually see?" without re-running the stripper, and stripping bugs cannot be diff-reviewed against archived data.

## Goals

- Scorers consume a single, dedicated "final answer" field on `ExecutionResult`.
- When the runtime API exposes reasoning as a structured field, preserve that separation through the archive instead of flattening.
- When reasoning is inlined into `content` (Harmony tokens, `<think>` tags), strip it at orchestration time and persist both raw and cleaned forms.
- Unclosed thinking tags fail explicitly as errors rather than silently corrupting the scorer's input.

## Non-goals

- No new model→format registry. Current regex priority order is retained.
- No `Score.warnings` field. No heuristic post-check for unstripped reasoning markers.
- No archive `schemaVersion` bump. Archives that don't carry the new fields fail to parse and are regenerated, consistent with the project's recent legacy-cleanup posture (commit 9f2aae7).
- No backwards-compatible reads for old archives.
- No changes to scorers themselves beyond switching their input from "raw output passed through `stripThinkingTags`" to "`result.output` directly."

## Design

### Schema changes

`ExecutionResult` (`src/schema/execution.ts`) gains two fields and redefines the meaning of `output`:

```ts
output:    Schema.String        // FINAL ANSWER ONLY — what the scorer reads
reasoning: Schema.NullOr(Schema.String)  // separated thinking, structured or extracted
rawOutput: Schema.String        // original API content field, always populated for audit
```

`output` is the cleaned final answer in every case:
- When the API returned structured reasoning, `output === content from API` (no stripping needed).
- When reasoning was inlined and successfully stripped, `output` is the post-strip remainder.
- When reasoning was unclosed/truncated, `output === ""` and `error = "thinking_truncated"`.

`reasoning` is null only when the model produced no thinking at all (no separated field, no recognized inline tag). Otherwise it holds the thinking body — either lifted from a structured API field, or extracted by the stripper, or the truncated body in the unclosed-tag case.

`rawOutput` is always the unmodified `content` field from the API response, regardless of whether stripping happened. This is the audit field that makes stripping bugs reproducible from archived data.

### Orchestration-side changes

`extractOutput` in `src/llm/chat-completion.ts:164-190` is rewritten to return separated fields:

```ts
extractOutput(response): { content: string; reasoning: string | null }
```

It pulls `choices[0].message.content`, `choices[0].message.reasoning_content`, and `choices[0].message.reasoning` exactly as today, but stops wrapping reasoning in `<think>…</think>` and prepending. If either structured-reasoning field is non-empty, it becomes `reasoning`; otherwise `reasoning = null`.

`run-prompt.ts` then decides whether to invoke the inlined-thinking path:

- If `extractOutput` returned `reasoning !== null`: structured separation worked. Set `output = content`, `reasoning = reasoning`, `rawOutput = content`. Done.
- If `reasoning === null`: try `stripThinkingTags(content)`. The stripper now returns `{ output, reasoning, error }` instead of just a string. Set `rawOutput = content`, `output = result.output`, `reasoning = result.reasoning`, `error = result.error` (propagates `"thinking_truncated"` when applicable).

### Stripper-side changes

`stripThinkingTags` in `src/scoring/strip-thinking.ts` changes signature:

```ts
stripThinkingTags(input: string): {
  output: string
  reasoning: string | null
  error: string | null
}
```

The three existing regex passes are kept in their current order:

1. Harmony `final` channel — extract body as output, anything before/around the channel marker as reasoning.
2. Harmony control tokens — strip from output (these are post-channel-extraction noise).
3. `<think>…</think>` — when matched, capture body as reasoning, remainder as output.

**Unclosed-tag handling** is added for `<think>`: if `<think>` appears with no `</think>`, return `{ output: "", reasoning: <body after opener>, error: "thinking_truncated" }`. Harmony's existing regex already accommodates truncation (matches up to `<|end|>`, `<|return|>`, or end of string), so unclosed-tag detection is not added there — only the `<think>` regex, which today silently keeps the entire CoT as the answer when truncated.

If no opener tag is matched at all, return `{ output: input.trim(), reasoning: null, error: null }` — i.e., the model produced no thinking, the content *is* the answer.

### Scoring-side changes

`scoreExecution` in `src/scoring/score-result.ts:46-77` no longer calls `stripThinkingTags`. It reads `result.output` directly and passes it to the scorer. The `result.reasoning` field is available to scorers if they want it (none do today; this is forward-looking).

If `result.error` is non-null at scoring time (whether from an LLM error or `"thinking_truncated"`), the run is treated as a 0 / failed score. This matches existing behavior for LLM errors; the `"thinking_truncated"` value just adds a new reason that lands in the same path.

### Archive changes

The archive writer in `src/archive/writer.ts` serializes the new `ExecutionResult` shape directly. No `schemaVersion` change. No translation layer. Archives written before this change cannot be read by code after this change; the recovery path is to delete and regenerate, matching the existing posture for archive evolution (commits 9f2aae7, 9bbfd39).

## Touched files

- `src/llm/chat-completion.ts` — `extractOutput` returns separated fields
- `src/orchestration/run-prompt.ts` — wires structured signal vs. inlined-strip decision into `ExecutionResult`
- `src/schema/execution.ts` — adds `reasoning`, `rawOutput` fields
- `src/scoring/strip-thinking.ts` — new return shape, unclosed-tag detection
- `src/scoring/score-result.ts` — drops `stripThinkingTags` call, reads `result.output` directly
- Anywhere else that reads `ExecutionResult.output` expecting raw-with-thinking content (CLI inspectors, report generators) — verify they don't need to switch to `rawOutput` for their purpose. Most should keep using `output`; the inspector/debug paths may want `rawOutput` for auditing stripping behavior.

## Behavior matrix

| API response shape | `extractOutput` returns | Stripper path | Final ExecutionResult |
|---|---|---|---|
| Structured reasoning + content (DeepSeek llamacpp `--reasoning-format deepseek`, mlx, OpenAI o-series) | `{ content, reasoning: <body> }` | skipped | `output=content`, `reasoning=body`, `rawOutput=content`, `error=null` |
| Inlined thinking, recognized + closed | `{ content: <full>, reasoning: null }` | strips, recognizes | `output=<after-tag>`, `reasoning=<inside-tag>`, `rawOutput=<full>`, `error=null` |
| Inlined thinking, recognized + unclosed | `{ content: <full>, reasoning: null }` | detects unclosed | `output=""`, `reasoning=<truncated body>`, `rawOutput=<full>`, `error="thinking_truncated"` |
| No thinking at all | `{ content, reasoning: null }` | no tag matched, passthrough | `output=content`, `reasoning=null`, `rawOutput=content`, `error=null` |
| Unknown wrapper inlined into content | `{ content, reasoning: null }` | no tag matched, passthrough | `output=content` (with embedded reasoning leaked through), `reasoning=null`, `rawOutput=content`, `error=null` |

The last row is an accepted limitation: novel wrappers we don't recognize will leak. The fix when this surfaces is to add a regex to the existing set, not to add infrastructure.
