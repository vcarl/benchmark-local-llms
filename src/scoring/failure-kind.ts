import type { FailureKind, ItemResult } from "../schema/attempt.js";
import type { PromptScore } from "./score-result.js";

type Scored = Pick<PromptScore, "failure" | "nearMiss">;

type Classifiable = Pick<ItemResult, "score" | "error" | "output" | "reasoning" | "stopReason">;

/**
 * oMLX, when the budget runs out mid-thinking, streams the unclosed reasoning
 * as `content` too. Such an output is no answer: scoring it would grep the
 * chain of thought. Shared by the runner (new results) and the score-record
 * computation (`rules.ts`), so both drop it the same way (erratum 0.6).
 */
export const echoesTruncatedReasoning = (r: {
  output: string;
  reasoning: string | null;
  stopReason?: string | null | undefined;
}): boolean => r.stopReason === "length" && r.output === r.reasoning;

/**
 * Why an item fell short of a full pass, or `null` when it scored 1. A pure
 * function of the stored item fields plus the scorer's outcome (`undefined`
 * when the item was not scored), so re-scoring an archive reproduces it.
 * First matching rule wins:
 *
 *   error "thinking_truncated"          → thinking_truncated (inline think block never closed)
 *   error "context_exceeded"            → context_exceeded (prompt does not fit the context window)
 *   any other error                     → execution_error (transport, timeout, malformed response)
 *   a declared near miss matched        → near_miss
 *   stopReason "loop"                   → loop (repetition detector cancelled the stream)
 *   stopReason "length", empty output
 *     with reasoning                    → thinking_truncated (split-reasoning runtime ran out thinking)
 *   stopReason "length"                 → length_cutoff
 *   scorer failed                       → scorer_error
 *   empty output, or scorer found
 *     nothing to extract                → no_answer
 *   otherwise                           → wrong (incl. partial credit)
 */
export const classifyFailure = (
  item: Classifiable,
  scored: Scored | undefined,
): FailureKind | null => {
  if (item.score === 1) return null;
  if (item.error === "thinking_truncated") return "thinking_truncated";
  if (item.error === "context_exceeded") return "context_exceeded";
  if (item.error !== null) return "execution_error";
  // The scored output earned declared partial credit, however generation ended.
  if (scored?.nearMiss !== undefined) return "near_miss";
  const empty = item.output.trim() === "";
  if (item.stopReason === "loop") return "loop";
  if (item.stopReason === "length") {
    return empty && item.reasoning !== null ? "thinking_truncated" : "length_cutoff";
  }
  if (scored?.failure === "scorer_error") return "scorer_error";
  if (empty || scored?.failure === "no_answer") return "no_answer";
  return "wrong";
};
