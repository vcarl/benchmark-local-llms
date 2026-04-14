import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ConstraintDef } from "./constraints.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("ConstraintDef discriminated union", () => {
  it("round-trips contains", () => {
    const v = { check: "contains", name: "has_word", value: "hello" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips contains_exact", () => {
    const v = { check: "contains_exact", name: "case_sensitive", value: "Hello" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips not_contains_char", () => {
    const v = { check: "not_contains_char", name: "no_z", char: "z" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips min_length", () => {
    const v = { check: "min_length", name: "long_enough", length: 100 } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips regex with dotall", () => {
    const v = {
      check: "regex",
      name: "pattern",
      pattern: ".*foo.*",
      dotall: true,
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips regex without dotall (optional omitted)", () => {
    const v = { check: "regex", name: "pattern", pattern: "foo" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips regex_count_min", () => {
    const v = {
      check: "regex_count_min",
      name: "many",
      pattern: "foo",
      min: 3,
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips valid_json", () => {
    const v = { check: "valid_json", name: "parses" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_has_keys", () => {
    const v = {
      check: "json_has_keys",
      name: "keys",
      keys: ["a", "b", "c"],
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_all_string_values", () => {
    const v = { check: "json_all_string_values", name: "all_strings" } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_nested_is_object", () => {
    const v = {
      check: "json_nested_is_object",
      name: "is_object",
      key: "nested",
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_nested_has_key", () => {
    const v = {
      check: "json_nested_has_key",
      name: "has_nested_key",
      parent: "outer",
      key: "inner",
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_field_equals with string value", () => {
    const v = {
      check: "json_field_equals",
      name: "field_eq",
      key: "status",
      value: "ok",
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_field_equals with numeric value", () => {
    const v = {
      check: "json_field_equals" as const,
      name: "count",
      key: "n",
      value: 42,
    };
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_field_equals with object value", () => {
    const v = {
      check: "json_field_equals" as const,
      name: "deep",
      key: "meta",
      value: { a: 1, b: ["x", null] },
    };
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_field_is_list", () => {
    const v = {
      check: "json_field_is_list",
      name: "is_list",
      key: "items",
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips json_list_item_has", () => {
    const v = {
      check: "json_list_item_has" as const,
      name: "item_match",
      listKey: "items",
      matchField: "id",
      matchValue: "abc",
      checkField: "status",
      checkValue: "ready",
    };
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips numbered_lines", () => {
    const v = {
      check: "numbered_lines",
      name: "range",
      from: 1,
      to: 10,
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips no_numbered_line", () => {
    const v = { check: "no_numbered_line", name: "skip_3", line: 3 } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips numbered_line_exists", () => {
    const v = { check: "numbered_line_exists", name: "has_5", line: 5 } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips line_count", () => {
    const v = { check: "line_count", name: "ten_lines", count: 10 } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips word_count_exact", () => {
    const v = {
      check: "word_count_exact",
      name: "five_foos",
      word: "foo",
      count: 5,
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("round-trips all_lines_word_count", () => {
    const v = {
      check: "all_lines_word_count",
      name: "short_lines",
      min: 3,
      max: 8,
    } as const;
    expect(roundTrip(ConstraintDef, v)).toEqual(v);
  });

  it("rejects unknown check discriminator", () => {
    expect(() =>
      Schema.decodeUnknownSync(ConstraintDef)({ check: "not_a_check", name: "x" }),
    ).toThrow();
  });

  it("rejects missing discriminator", () => {
    expect(() => Schema.decodeUnknownSync(ConstraintDef)({ name: "x" })).toThrow();
  });

  it("rejects wrong shape for a known discriminator (contains without value)", () => {
    expect(() =>
      Schema.decodeUnknownSync(ConstraintDef)({ check: "contains", name: "x" }),
    ).toThrow();
  });
});
