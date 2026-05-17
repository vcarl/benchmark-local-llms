import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AgentEventType,
  ConstraintCheck,
  Runtime,
  ScorerType,
  TerminationReason,
} from "./enums.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("Runtime", () => {
  it.each(["llamacpp", "mlx"] as const)("round-trips %s", (value) => {
    expect(roundTrip(Runtime, value)).toBe(value);
  });

  it("rejects unknown values", () => {
    expect(() => Schema.decodeUnknownSync(Runtime)("cuda")).toThrow();
  });
});

describe("ScorerType", () => {
  it.each([
    "exact_match",
    "constraint",
    "code_exec",
    "game",
  ] as const)("round-trips %s", (value) => {
    expect(roundTrip(ScorerType, value)).toBe(value);
  });
});

describe("TerminationReason", () => {
  it.each([
    "completed",
    "wall_clock",
    "tokens",
    "tool_calls",
    "error",
  ] as const)("round-trips %s", (value) => {
    expect(roundTrip(TerminationReason, value)).toBe(value);
  });
});

describe("AgentEventType", () => {
  it.each([
    "tool_call",
    "tool_result",
    "tool_error",
    "turn_end",
    "error",
    "connection",
  ] as const)("round-trips %s", (value) => {
    expect(roundTrip(AgentEventType, value)).toBe(value);
  });
});

describe("ConstraintCheck", () => {
  const values = [
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
  ] as const;

  it("has exactly 20 variants", () => {
    expect(values.length).toBe(20);
  });

  it.each(values)("round-trips %s", (value) => {
    expect(roundTrip(ConstraintCheck, value)).toBe(value);
  });
});
