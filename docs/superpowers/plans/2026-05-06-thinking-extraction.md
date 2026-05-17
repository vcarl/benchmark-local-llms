# Thinking Extraction Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop re-inlining structured reasoning fields, persist raw + cleaned output on `ExecutionResult`, and fail loudly on unclosed `<think>` tags so truncated CoTs no longer leak into scorer input.

**Architecture:** `ExecutionResult` gains `reasoning` and `rawOutput` fields. `extractOutput` returns separated `{ content, reasoning }` instead of flattening. `stripThinkingTags` returns `{ output, reasoning, error }` and detects unclosed `<think>` tags as `thinking_truncated` errors. Scorers read `result.output` directly — no more strip-at-score-time. Spec: `docs/superpowers/specs/2026-05-06-thinking-extraction-design.md`.

**Tech Stack:** TypeScript, Effect (Schema, Effect generators), vitest, Biome.

---

## Task ordering rationale

1. Extend `ExecutionResult` schema with optional-via-defaults `reasoning`/`rawOutput`. Update every fixture that constructs `ExecutionResult` literally so tests still compile and pass.
2. Rewrite `stripThinkingTags` (TDD): new return shape `{ output, reasoning, error }` and unclosed-tag detection. Self-contained, no upstream/downstream dependencies yet.
3. Rewrite `extractOutput` (TDD): new return shape `{ content, reasoning }`. Update `CompletionResult` to carry `reasoning`. Update `ChatCompletion` `complete` to plumb it.
4. Update `makeSuccessResult` in `run-prompt.ts`: branch on `completion.reasoning !== null` (structured signal path) vs. `null` (inlined-strip path), populate the three fields, propagate `error` for `thinking_truncated`.
5. Update `scoreExecution`: drop `stripThinkingTags` call, read `result.output` directly.
6. Run full test suite, lint, and typecheck. Smoke-test verifies the integrated path.

---

## Task 1: Extend `ExecutionResult` schema

**Files:**
- Modify: `src/schema/execution.ts:37-67`
- Modify: `src/schema/execution.test.ts:43,72,108` (three literals)
- Modify: `src/archive/__tests__/fixtures.ts:76-101` (`sampleResult` helper)
- Modify: `src/orchestration/__tests__/fixtures.ts:265-292` (`sampleExistingResult` helper)
- Modify: `src/report/__fixtures__/archive-fixtures.ts:97-121` (`fixtureResult` helper)
- Modify: `src/scoring/score-result.test.ts:7-31` (`baseResult` literal)
- Modify: `src/scoring/game.test.ts:5,127` (two `ExecutionResult` literals)
- Modify: `src/orchestration/__tests__/summary.test.ts:15` (`baseResult` literal)
- Modify: `src/__tests__/integration-smoke.test.ts:58` (`executionResult` literal)
- Modify: `src/game/session/run-session.ts:297-322` (`buildResult` constructor)

- [ ] **Step 1: Add `reasoning` and `rawOutput` fields to the schema.**

In `src/schema/execution.ts`, replace the `output` line in the `ExecutionResult` Schema.Struct with three lines:

```ts
  output: Schema.String,
  reasoning: Schema.NullOr(Schema.String),
  rawOutput: Schema.String,
  error: Schema.NullOr(Schema.String),
```

Update the doc-comment block above `ExecutionResult` (lines 18-36) to document the three fields. Append after the existing `Cache key for cross-run dedup` paragraph:

```
 * `output` is the final answer that scorers consume. `reasoning` is the
 * separated thinking, populated either from the runtime's structured
 * reasoning field (`reasoning_content` / `reasoning` in the OpenAI shape)
 * or extracted from inlined `<think>…</think>` / Harmony channel markers.
 * `rawOutput` is the unmodified `content` field from the API response,
 * always populated for audit; it equals `output` when no stripping
 * happened. Scenario rows use `output: ""`, `reasoning: null`,
 * `rawOutput: ""` because scenario results record agent-event traces
 * rather than text answers.
```

- [ ] **Step 2: Run schema tests, watch them fail.**

```bash
pnpm exec vitest run src/schema/execution.test.ts
```

Expected: three failures complaining that `reasoning` / `rawOutput` are missing from the test literals.

- [ ] **Step 3: Update `src/schema/execution.test.ts` literals.**

For each of the three `ExecutionResult` literals at lines 43, 72, 108, add the two new fields just after `output:`:

```ts
      output: "ANSWER: 4183",
      reasoning: null,
      rawOutput: "ANSWER: 4183",
      error: null,
```

For the scenario literal (line 72) where `output: ""`:

```ts
      output: "",
      reasoning: null,
      rawOutput: "",
      error: null,
```

For the error literal (line 108) where `output: ""`:

```ts
      output: "",
      reasoning: null,
      rawOutput: "",
      error: "LlmRequestError: connection refused",
```

- [ ] **Step 4: Update each fixture/literal across the codebase.**

For each file listed under "Files" above (excluding the schema file and schema test, already done), add `reasoning: null` and `rawOutput: <same as output>` immediately after the `output:` line. For helpers like `sampleResult` / `fixtureResult` / `sampleExistingResult`, also add the fields to the override-merge defaults so callers can override them but don't have to.

Concrete pattern for fixture helpers, e.g. `src/report/__fixtures__/archive-fixtures.ts:112`:

```ts
  output: overrides.output ?? "the answer is 4183",
  reasoning: overrides.reasoning ?? null,
  rawOutput: overrides.rawOutput ?? overrides.output ?? "the answer is 4183",
  error: overrides.error ?? null,
```

The `?? overrides.output ?? "..."` chain in `rawOutput` makes "no thinking happened, raw equals cleaned" the default behavior, which matches the most common test case.

For `src/game/session/run-session.ts:297-322` (production code), add the fields to the literal:

```ts
    output: "",
    reasoning: null,
    rawOutput: "",
    error,
```

- [ ] **Step 5: Run schema tests, watch them pass.**

```bash
pnpm exec vitest run src/schema/execution.test.ts
```

Expected: all three round-trip tests pass.

- [ ] **Step 6: Run typecheck.**

```bash
pnpm typecheck
```

Expected: clean. If anything else constructs `ExecutionResult` literally and was missed, it surfaces here.

- [ ] **Step 7: Run full test suite to baseline.**

```bash
pnpm test
```

Expected: green. Schema additions are pure-additive at this stage — no behavior changed yet.

- [ ] **Step 8: Commit.**

```bash
git add -A
git commit -m "feat(schema): add reasoning and rawOutput fields to ExecutionResult

Pure schema extension. Fixtures and inline literals updated; scenario
rows carry empty rawOutput. Behavior unchanged — fields are populated
but not yet meaningful until orchestration is wired up."
```

---

## Task 2: Rewrite `stripThinkingTags` with structured return + unclosed-tag detection

**Files:**
- Modify: `src/scoring/strip-thinking.ts:1-58`
- Modify: `src/scoring/strip-thinking.test.ts:1-70`

- [ ] **Step 1: Rewrite the test file to express the new contract.**

Replace `src/scoring/strip-thinking.test.ts` entirely:

```ts
import { describe, expect, it } from "vitest";
import { stripThinkingTags } from "./strip-thinking.js";

describe("stripThinkingTags — DeepSeek <think> blocks", () => {
  it("separates a closed think block into reasoning + output", () => {
    const r = stripThinkingTags("<think>let me reason about this</think>\n\nThe answer is 42.");
    expect(r.output).toBe("The answer is 42.");
    expect(r.reasoning).toBe("let me reason about this");
    expect(r.error).toBeNull();
  });

  it("separates a multi-line think block", () => {
    const r = stripThinkingTags("<think>\nstep 1\nstep 2\nstep 3\n</think>   \nFinal output here.");
    expect(r.output).toBe("Final output here.");
    expect(r.reasoning).toBe("\nstep 1\nstep 2\nstep 3\n");
    expect(r.error).toBeNull();
  });

  it("returns reasoning=null when there is no think block", () => {
    const r = stripThinkingTags("plain answer");
    expect(r.output).toBe("plain answer");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("only consumes up to the first </think> (matches prior behavior)", () => {
    const r = stripThinkingTags("prefix text <think>a</think> middle <think>b</think> suffix");
    expect(r.output).toBe("middle <think>b</think> suffix");
    // reasoning captures everything before the first </think>, including the
    // pre-tag prefix, since the tag wasn't anchored to start. This mirrors
    // the existing regex (^.*?</think>).
    expect(r.reasoning).toBe("prefix text <think>a");
    expect(r.error).toBeNull();
  });

  it("returns error=thinking_truncated when <think> opens with no </think>", () => {
    const r = stripThinkingTags("<think>I was reasoning when the budget ran ou");
    expect(r.output).toBe("");
    expect(r.reasoning).toBe("I was reasoning when the budget ran ou");
    expect(r.error).toBe("thinking_truncated");
  });

  it("treats a multi-line unclosed think block the same way", () => {
    const r = stripThinkingTags("<think>\nfirst, I'll consider…\nthen I'll");
    expect(r.output).toBe("");
    expect(r.reasoning).toBe("\nfirst, I'll consider…\nthen I'll");
    expect(r.error).toBe("thinking_truncated");
  });
});

describe("stripThinkingTags — Harmony (gpt-oss) channels", () => {
  it("extracts final body to output, analysis body to reasoning, terminated by <|end|>", () => {
    const input =
      "<|channel|>analysis<|message|>thinking...<|end|>" +
      "<|channel|>final<|message|>the final answer<|end|>";
    const r = stripThinkingTags(input);
    expect(r.output).toBe("the final answer");
    expect(r.reasoning).toBe("thinking...");
    expect(r.error).toBeNull();
  });

  it("extracts final body terminated by <|return|>", () => {
    const input =
      "<|channel|>analysis<|message|>scratch<|end|>" +
      "<|channel|>final<|message|>computed: 7<|return|>";
    const r = stripThinkingTags(input);
    expect(r.output).toBe("computed: 7");
    expect(r.reasoning).toBe("scratch");
    expect(r.error).toBeNull();
  });

  it("extracts final body when terminator is end-of-string", () => {
    const r = stripThinkingTags("<|channel|>final<|message|>trailing answer no terminator");
    expect(r.output).toBe("trailing answer no terminator");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("strips leftover harmony control tokens after extraction", () => {
    const r = stripThinkingTags("<|channel|>final<|message|><|start|>hello<|mid|> world<|end|>");
    expect(r.output).toBe("hello world");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("preserves inner whitespace but trims ends on output and reasoning", () => {
    const r = stripThinkingTags("<|channel|>final<|message|>   answer with pad   <|end|>");
    expect(r.output).toBe("answer with pad");
  });
});

describe("stripThinkingTags — combined / edge cases", () => {
  it("harmony extraction takes precedence then think strip still runs on the body", () => {
    const r = stripThinkingTags("<|channel|>final<|message|><think>hidden</think>visible<|end|>");
    expect(r.output).toBe("visible");
    expect(r.reasoning).toBe("hidden");
  });

  it("trims surrounding whitespace on a plain string", () => {
    const r = stripThinkingTags("   answer   ");
    expect(r.output).toBe("answer");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests; expect compile-time failure (return type mismatch).**

```bash
pnpm exec vitest run src/scoring/strip-thinking.test.ts
```

Expected: TypeScript errors — `Property 'output' does not exist on type 'string'`, etc. The test file compiles against the new contract; the implementation hasn't caught up yet.

- [ ] **Step 3: Rewrite the implementation.**

Replace the `stripThinkingTags` function body in `src/scoring/strip-thinking.ts`. Keep the regex constants and their doc comments at the top of the file (`HARMONY_FINAL_RE`, `HARMONY_TOKEN_RE`, `THINK_RE`). Add a new regex for the analysis channel and an unclosed-think detector.

```ts
/**
 * Match the analysis channel body, terminated by `<|end|>` or end-of-string.
 * Used to capture reasoning when the model emits Harmony channel markers.
 */
const HARMONY_ANALYSIS_RE = /<\|channel\|>\s*analysis\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|$)/s;

/**
 * Detect a `<think>` opener with no matching `</think>` anywhere downstream.
 * If this matches, the body is everything after `<think>` to end-of-input —
 * i.e. a truncated reasoning block. Without this branch the bare-regex
 * `THINK_RE` fails to match and the entire CoT silently flows to the scorer.
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
      reasoning: inner.reasoning ?? (analysisBody !== null ? analysisBody.replace(HARMONY_TOKEN_RE, "").trim() : null),
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
  if (closed && closed[1] !== undefined && closed[2] !== undefined) {
    // The reasoning body is everything before </think>, with the leading
    // <think> tag (if present) stripped. Anything before the <think> opener
    // is preserved in reasoning to mirror the prior `^.*?</think>` behavior
    // which discarded all leading content.
    const beforeClose = closed[1];
    const openerIdx = beforeClose.indexOf("<think>");
    const reasoning = openerIdx >= 0 ? beforeClose.slice(0, openerIdx) + beforeClose.slice(openerIdx + "<think>".length) : beforeClose;
    return {
      output: closed[2].trim(),
      reasoning,
      error: null,
    };
  }
  // Unclosed <think>: budget exhausted before the model closed the tag.
  // No answer was produced.
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
```

A note on the analysis-channel ordering: the new tests assert that for a Harmony input with both channels, `reasoning` carries the analysis body and `output` carries the final body. That's why `stripThinkingTags` looks up the analysis match alongside the final match.

- [ ] **Step 4: Run the strip-thinking tests, watch them pass.**

```bash
pnpm exec vitest run src/scoring/strip-thinking.test.ts
```

Expected: all tests pass. If a test fails on whitespace details around the reasoning body (e.g., the multi-line case or the prefix-leak case), inspect the actual vs expected and adjust either the regex or the test — the spec is silent on whether we trim reasoning, so prefer "preserve verbatim" when in doubt. The Harmony cases trim reasoning of leftover control tokens; the `<think>` cases preserve the inner body verbatim.

- [ ] **Step 5: Run typecheck.**

```bash
pnpm typecheck
```

Expected: errors at the call site `src/scoring/score-result.ts:55` — `Type 'StripResult' is not assignable to type 'string'`. Leave that error standing; Task 5 fixes it.

- [ ] **Step 6: Commit (with the typecheck failure noted).**

```bash
git add src/scoring/strip-thinking.ts src/scoring/strip-thinking.test.ts
git commit -m "refactor(strip-thinking): return structured result with unclosed-tag detection

stripThinkingTags now returns { output, reasoning, error } instead of
a single string. Unclosed <think> tags are flagged as
error=thinking_truncated (was: silently kept the entire CoT as the
answer). Harmony analysis-channel content surfaces as reasoning rather
than being discarded.

Note: score-result.ts still calls the old shape and will fail
typecheck until Task 5 is in. This commit is intentionally on the
typecheck-broken intermediate state to keep the diff readable."
```

---

## Task 3: Rewrite `extractOutput` and plumb `reasoning` through `CompletionResult`

**Files:**
- Modify: `src/llm/chat-completion.ts:60-74` (`CompletionResult` interface)
- Modify: `src/llm/chat-completion.ts:164-190` (`extractOutput`)
- Modify: `src/llm/chat-completion.ts:308-335` (`complete` callsite + return)
- Modify: `src/llm/chat-completion.test.ts` (existing extractOutput tests)
- Modify: `src/orchestration/__tests__/fixtures.ts:120-154` (`makeChatCompletionMock` default fallback)

- [ ] **Step 1: Update `CompletionResult` to carry separated reasoning.**

In `src/llm/chat-completion.ts`, change the `CompletionResult` interface:

```ts
export interface CompletionResult {
  /** Generated final-answer text (no thinking). */
  readonly output: string;
  /**
   * Separated reasoning when the runtime exposes it as a distinct field
   * (`reasoning_content` from llamacpp `--reasoning-format deepseek`,
   * `reasoning` from mlx_lm.server). `null` when the runtime did not
   * separate reasoning out of the answer; in that case, downstream code
   * must apply the inline-strip path (`stripThinkingTags`) to recover any
   * thinking inlined into `output`.
   */
  readonly reasoning: string | null;
  readonly promptTokens: number;
  readonly generationTokens: number;
  readonly promptTps: number | null;
  readonly generationTps: number | null;
}
```

- [ ] **Step 2: Rewrite `extractOutput` to return separated values.**

Replace the function (lines 164-190):

```ts
export const extractOutput = (
  choices: ReadonlyArray<{
    readonly message: {
      readonly content?: string | null | undefined;
      readonly reasoning_content?: string | null | undefined;
      readonly reasoning?: string | null | undefined;
    };
  }>,
): { readonly content: string; readonly reasoning: string | null } => {
  if (choices.length === 0) return { content: "", reasoning: null };
  const first = choices[0];
  if (first === undefined) return { content: "", reasoning: null };
  const content = (first.message.content ?? "").trim();
  const reasoningContent = (first.message.reasoning_content ?? "").trim();
  const reasoning = (first.message.reasoning ?? "").trim();
  // Providers that split reasoning out of `content` use either
  // `reasoning_content` (llama.cpp `--reasoning-format deepseek`) or
  // `reasoning` (mlx_lm.server); never both on the same response.
  const split = reasoningContent.length > 0 ? reasoningContent : reasoning;
  return {
    content,
    reasoning: split.length > 0 ? split : null,
  };
};
```

- [ ] **Step 3: Update the `complete` callsite to plumb `reasoning`.**

In `src/llm/chat-completion.ts:308-335`, change the block:

```ts
      const extracted = extractOutput(decoded.choices);
      if (extracted.content.length === 0 && extracted.reasoning === null) {
        return yield* Effect.fail(
          new LlmEmptyResponse({
            model: params.model,
            promptName: params.promptName,
          }),
        );
      }

      const endMs = yield* Clock.currentTimeMillis;
      const elapsed = ((endMs - startMs) / 1000).toFixed(1);
      yield* Effect.logDebug(
        `response 200 in ${elapsed}s, prompt_tokens=${decoded.usage.prompt_tokens} gen_tokens=${decoded.usage.completion_tokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      const timings = decoded.timings;
      return {
        output: extracted.content,
        reasoning: extracted.reasoning,
        promptTokens: decoded.usage.prompt_tokens,
        generationTokens: decoded.usage.completion_tokens,
        promptTps: timings === undefined ? null : timings.prompt_per_second,
        generationTps: timings === undefined ? null : timings.predicted_per_second,
      } satisfies CompletionResult;
```

The empty-response check is now: empty if BOTH `content` and `reasoning` are absent. This preserves the existing behavior (the test `maps empty content (no reasoning fallback) to LlmEmptyResponse` still passes) and adds the natural extension that a reasoning-only response (mlx mid-think budget hit) is also empty (because there's no answer to score).

Update the doc comment on `CompletionResult.output` (lines 60-74) — drop the comment about `<think>` wrapping; the field is now just "final-answer text".

- [ ] **Step 4: Update existing extractOutput tests in `src/llm/chat-completion.test.ts`.**

The existing tests at lines 155, 186, 210 assert that `result.output` includes `<think>...</think>` wrapping. With the new contract, `result.output` is the final answer only and `result.reasoning` carries the separated body. Find each of these `expect(result.output).toBe(...)` lines and update.

For the test at line 155 (`wraps reasoning_content in <think>...</think> when content is empty`):
  - Rename: "captures reasoning_content as result.reasoning when content is empty"
  - Change `expect(result.output).toBe("<think>hmm let me think… the answer is 4</think>")` to:
    ```ts
    expect(result.output).toBe("");
    expect(result.reasoning).toBe("hmm let me think… the answer is 4");
    ```

For the test at line 186 (`wraps mlx_lm's reasoning field in <think>...</think> when content is empty`):
  - Rename: "captures mlx_lm's reasoning field as result.reasoning when content is empty"
  - Replace the assertion similarly (`output === ""`, `reasoning === "thinking it through"`).

For the test at line 210 (`preserves both reasoning and visible content when both are populated`):
  - Rename: "preserves reasoning and content as separate fields when both are populated"
  - Change the assertion:
    ```ts
    expect(result.output).toBe("12");
    expect(result.reasoning).toBe("7 + 5 = 12, user wants just the number");
    ```

Important context: the test at line 307 (`maps an empty message object to LlmEmptyResponse`) and line 335 (`maps empty content (no reasoning fallback) to LlmEmptyResponse`) test the empty-response path. With the new logic — empty when content AND reasoning are both empty — the behavior is unchanged for these cases. Re-read both tests to confirm they still describe the new contract; if a test name says "no reasoning fallback", that name is still accurate. No assertion changes needed on lines 307 and 335.

- [ ] **Step 5: Update `makeChatCompletionMock` fallback in test fixtures.**

In `src/orchestration/__tests__/fixtures.ts:120-154`, the default fallback `CompletionResult` is missing the new `reasoning` field. Update:

```ts
  fallback: ChatCompletionStub = {
    kind: "ok",
    result: {
      output: "default-output",
      reasoning: null,
      promptTokens: 10,
      generationTokens: 5,
      promptTps: 100,
      generationTps: 20,
    },
  },
```

Search for every other `CompletionResult` literal in tests and add `reasoning: null` to them. Run typecheck after this step to surface any missed call sites:

```bash
pnpm typecheck
```

Expected: no errors related to `CompletionResult`. Errors at `src/scoring/score-result.ts:55` (from Task 2) are still expected; ignore.

- [ ] **Step 6: Run chat-completion tests.**

```bash
pnpm exec vitest run src/llm/chat-completion.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "refactor(chat-completion): return reasoning as a separate field

extractOutput no longer wraps reasoning_content/reasoning in <think>
tags and prepends to content. Instead, returns { content, reasoning }
verbatim and the CompletionResult interface gains a reasoning field.

LlmEmptyResponse now fires only when both content and reasoning are
absent — a reasoning-only response (mlx_lm.server mid-think budget
hit) is still empty because there's no answer to score."
```

---

## Task 4: Update `makeSuccessResult` to assemble the new `ExecutionResult` fields

**Files:**
- Modify: `src/orchestration/run-prompt.ts:85-123` (`makeSuccessResult`)
- Modify: `src/orchestration/run-prompt.ts:125-154` (`makeErrorResult`)
- Modify: `src/orchestration/__tests__/run-prompt.test.ts` (existing tests)

- [ ] **Step 1: Add a helper that decides the three fields based on the completion shape.**

Above `makeSuccessResult` in `src/orchestration/run-prompt.ts`, add:

```ts
import { stripThinkingTags } from "../scoring/strip-thinking.js";

/**
 * Resolve the final-answer / reasoning / raw-output triplet from a
 * completion. Two paths:
 *
 *   1. Structured signal: the runtime split reasoning into a separate
 *      field (`completion.reasoning !== null`). Trust it: `output =
 *      completion.output`, `reasoning = completion.reasoning`,
 *      `rawOutput = completion.output`. No stripping.
 *
 *   2. Inlined: `completion.reasoning === null`. The model may have
 *      inlined thinking into the answer (`<think>…</think>`, Harmony
 *      channels). Run `stripThinkingTags`; the result carries the
 *      cleaned `output`, the extracted `reasoning`, and an `error`
 *      (`"thinking_truncated"`) when an unclosed think block was
 *      detected. `rawOutput` always equals the original
 *      `completion.output` so the audit field stays meaningful even
 *      when stripping rewrote the answer.
 */
const resolveOutputFields = (completion: CompletionResult): {
  output: string;
  reasoning: string | null;
  rawOutput: string;
  error: string | null;
} => {
  if (completion.reasoning !== null) {
    return {
      output: completion.output,
      reasoning: completion.reasoning,
      rawOutput: completion.output,
      error: null,
    };
  }
  const stripped = stripThinkingTags(completion.output);
  return {
    output: stripped.output,
    reasoning: stripped.reasoning,
    rawOutput: completion.output,
    error: stripped.error,
  };
};
```

- [ ] **Step 2: Wire the helper into `makeSuccessResult`.**

Replace the `output: completion.output,` line (current line 114) and the `error: null,` line (current line 115) with:

```ts
  ...(() => {
    const fields = resolveOutputFields(completion);
    return {
      output: fields.output,
      reasoning: fields.reasoning,
      rawOutput: fields.rawOutput,
      error: fields.error,
    };
  })(),
```

(The IIFE pattern keeps the destructuring contained inside the literal. If you find this pattern unwieldy, refactor `makeSuccessResult` to compute the four fields above the literal and reference them. Either is fine.)

Cleaner alternative (preferred if you have flexibility):

```ts
export const makeSuccessResult = (
  input: RunPromptInput,
  completion: CompletionResult,
  startedAt: string,
  wallTimeSec: number,
): ExecutionResult => {
  const fields = resolveOutputFields(completion);
  return {
    archiveId: input.archiveId,
    runId: input.runId,
    // … all the unchanged fields …
    wallTimeSec,
    output: fields.output,
    reasoning: fields.reasoning,
    rawOutput: fields.rawOutput,
    error: fields.error,
    promptHash: input.prompt.promptHash,
    // … the rest …
  };
};
```

- [ ] **Step 3: Update `makeErrorResult` to populate the new fields.**

Replace the `output: ""` and `error` lines:

```ts
  output: "",
  reasoning: null,
  rawOutput: "",
  error,
```

- [ ] **Step 4: Update `run-prompt.test.ts` to exercise the three paths.**

Add three new tests after the existing "produces an ExecutionResult on success" test in `src/orchestration/__tests__/run-prompt.test.ts`:

```ts
  it("preserves reasoning as a separate field when the completion carries it (structured path)", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "12",
          reasoning: "7 + 5 = 12, user wants just the number",
          promptTokens: 10,
          generationTokens: 5,
          promptTps: 100,
          generationTps: 20,
        },
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        archiveId: "archive-1",
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.output).toBe("12");
    expect(result.reasoning).toBe("7 + 5 = 12, user wants just the number");
    expect(result.rawOutput).toBe("12");
    expect(result.error).toBeNull();
  });

  it("strips inlined thinking and populates rawOutput when the completion is unsplit (inlined path)", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "<think>let me reason</think>The answer is 4",
          reasoning: null,
          promptTokens: 10,
          generationTokens: 5,
          promptTps: 100,
          generationTps: 20,
        },
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        archiveId: "archive-1",
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.output).toBe("The answer is 4");
    expect(result.reasoning).toBe("let me reason");
    expect(result.rawOutput).toBe("<think>let me reason</think>The answer is 4");
    expect(result.error).toBeNull();
  });

  it("flags unclosed thinking as error=thinking_truncated with empty output", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "<think>I was reasoning when budget ran o",
          reasoning: null,
          promptTokens: 10,
          generationTokens: 5,
          promptTps: 100,
          generationTps: 20,
        },
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        archiveId: "archive-1",
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.output).toBe("");
    expect(result.reasoning).toBe("I was reasoning when budget ran o");
    expect(result.rawOutput).toBe("<think>I was reasoning when budget ran o");
    expect(result.error).toBe("thinking_truncated");
  });
```

The existing test at line 30-43 asserts `result.output` and `result.error` for the simple case — those assertions still pass because the default fallback uses `reasoning: null` and the answer "The answer is 4" has no thinking markers, so `stripThinkingTags` is a no-op.

The existing fold-error tests (LlmRequestError, LlmTimeoutError) at lines 45-90 still pass — `makeErrorResult` populates the new fields with their null/empty defaults.

- [ ] **Step 5: Run run-prompt tests.**

```bash
pnpm exec vitest run src/orchestration/__tests__/run-prompt.test.ts
```

Expected: all tests pass — existing 9 + 3 new = 12.

- [ ] **Step 6: Run typecheck.**

```bash
pnpm typecheck
```

Expected: clean, except the still-broken `src/scoring/score-result.ts:55` from Task 2. (We're about to fix that.)

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "feat(orchestration): populate reasoning and rawOutput on ExecutionResult

makeSuccessResult now branches on completion.reasoning: when the
runtime split it out (DeepSeek llamacpp --reasoning-format deepseek,
mlx_lm.server), the field flows through verbatim; when it didn't, run
stripThinkingTags on the inlined output and capture the extracted
reasoning. Unclosed <think> tags surface as error=thinking_truncated.

rawOutput is always the original API content for audit purposes."
```

---

## Task 5: Drop `stripThinkingTags` from the scoring path

**Files:**
- Modify: `src/scoring/score-result.ts:18,46-77`
- Modify: `src/scoring/score-result.test.ts` (no logic change; verify pass)

- [ ] **Step 1: Update `scoreExecution` to read `result.output` directly.**

In `src/scoring/score-result.ts`:

1. Remove the `stripThinkingTags` import (line 18).

2. In the `scoreExecution` body (lines 54-69), replace `const stripped = stripThinkingTags(result.output);` with nothing, and replace each `stripped` reference with `result.output`. The function becomes:

```ts
  if (isPromptEntry(entry)) {
    const cfg = entry.scorer;
    switch (cfg.type) {
      case "exact_match":
        return scoreExactMatch(result.output, cfg);
      case "constraint":
        return scoreConstraints(result.output, cfg);
      case "code_exec":
        return scoreCodeExec(result.output, cfg.testCode);
      case "game":
        return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
    }
  }
```

3. Update the doc comment above `scoreExecution` (lines 37-45) — remove the "strip thinking tags from the output and route" wording. Replace with:

```
 * Top-level scoring dispatch (§4). Routes the execution to the appropriate
 * scorer based on the entry type. Reads `result.output` directly — thinking
 * extraction has already happened upstream in `runPrompt` (the cleaned
 * answer lands in `result.output`; reasoning lives in `result.reasoning`;
 * the unmodified API content is in `result.rawOutput` for audit).
```

- [ ] **Step 2: Run scoring tests.**

```bash
pnpm exec vitest run src/scoring/score-result.test.ts
```

Expected: all 4 existing tests pass. The first test ("dispatches exact_match prompt entries") sets `output: "The answer is 42."` — exact_match against the regex matches `42`, score 1.

- [ ] **Step 3: Run typecheck.**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Run full test suite.**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 5: Run lint.**

```bash
pnpm lint
```

Expected: clean. Biome may flag the now-unused `stripThinkingTags` import in some other file if any was missed; if so, remove the unused import.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "refactor(scoring): read result.output directly, drop strip-at-score

scoreExecution no longer calls stripThinkingTags. Cleaning happened
upstream during orchestration; result.output is the final answer.
result.reasoning and result.rawOutput are available to scorers but
unused today (forward-looking)."
```

---

## Task 6: Final verification

**Files:** none modified.

- [ ] **Step 1: Full test suite.**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 2: Full lint.**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Full typecheck.**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Inspect a sample archive line manually (optional but recommended).**

Run a single tiny prompt against a live runtime if one is available, or skip if not. The point is to verify the archived JSONL line includes `reasoning` and `rawOutput`. If no runtime is available locally, this step can be skipped — the unit tests already cover the assembly path.

- [ ] **Step 5: Final commit if anything fell out.**

If there were no further changes, skip this step. Otherwise:

```bash
git add -A
git commit -m "chore: final cleanup after thinking-extraction refactor"
```

---

## Self-review notes

- **Spec coverage**: every numbered item in the spec maps to a task. `extractOutput` separation → Task 3. `ExecutionResult.reasoning` / `rawOutput` → Task 1. `stripThinkingTags` new shape → Task 2. Unclosed-tag → Task 2 + Task 4. Scorer reads `result.output` → Task 5.
- **Type consistency**: `StripResult` (Task 2), `CompletionResult.reasoning` (Task 3), `resolveOutputFields` return shape (Task 4) all use the same `output: string; reasoning: string | null; error: string | null` triplet, plus `rawOutput` only at the orchestration layer.
- **Intermediate broken state**: Task 2 commits with `src/scoring/score-result.ts:55` typecheck-broken; Task 5 fixes it. Anyone reading the commit history will see that intentional gap noted in Task 2's commit message.
- **No `Score.warnings` / no heuristic post-check / no `schemaVersion` bump** — confirmed against scope. Old archives will fail to parse (missing `reasoning`/`rawOutput` fields); regenerate them.
