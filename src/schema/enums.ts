import { Schema } from "effect";

/**
 * Runtime used to serve a model. Metadata on results; not a structural grouping axis.
 */
export const Runtime = Schema.Literal("llamacpp", "mlx");
export type Runtime = typeof Runtime.Type;

/**
 * High-level scorer category. The {@link ScorerConfig} discriminated union in
 * `./scorer.ts` uses these same literals as its `type` tag.
 */
export const ScorerType = Schema.Literal("exact_match", "constraint", "code_exec", "game");
export type ScorerType = typeof ScorerType.Type;

/**
 * Why a game session ended. `completed` means the scenario's end condition fired;
 * `wall_clock`, `tokens`, `tool_calls` are cutoff trips; `error` is any failure.
 */
export const TerminationReason = Schema.Literal(
  "completed",
  "wall_clock",
  "tokens",
  "tool_calls",
  "error",
);
export type TerminationReason = typeof TerminationReason.Type;

/**
 * Normalized agent event categories emitted by the game session SSE stream.
 * Admiral log entries map onto this smaller, typed surface — unmapped Admiral
 * types (e.g. `llm_thought`, `notification`) are dropped upstream.
 */
export const AgentEventType = Schema.Literal(
  "tool_call",
  "tool_result",
  "tool_error",
  "turn_end",
  "error",
  "connection",
);
export type AgentEventType = typeof AgentEventType.Type;

/**
 * Discriminator for the 20 constraint check variants defined in `./constraints.ts`.
 * Used to tag `ConstraintDef` union members and (at config load time) to validate
 * unknown check names before any execution.
 */
export const ConstraintCheck = Schema.Literal(
  "contains",
  "contains_exact",
  "not_contains_char",
  "min_length",
  "regex",
  "regex_count_min",
  "valid_json",
  "json_has_keys",
  "json_all_string_values",
  "json_nested_is_object",
  "json_nested_has_key",
  "json_field_equals",
  "json_field_is_list",
  "json_list_item_has",
  "numbered_lines",
  "no_numbered_line",
  "numbered_line_exists",
  "line_count",
  "word_count_exact",
  "all_lines_word_count",
);
export type ConstraintCheck = typeof ConstraintCheck.Type;
