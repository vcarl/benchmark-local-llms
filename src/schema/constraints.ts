import { Schema } from "effect";

/**
 * The 20 constraint check variants defined in requirements §2.2.
 *
 * Each variant is a tagged struct whose `check` literal matches one of the
 * 20 values in {@link ConstraintCheck} (see `./enums.ts`). The shape of each
 * variant follows the Python prototype's `evaluate_constraint()` dispatch
 * in `common.py:348` — each branch reads specific dict keys, and we capture
 * exactly those keys as schema fields, renamed to camelCase per §2.2.
 *
 * Field naming deviation note (captured in the Phase A return summary):
 * the Python prototype uses snake_case for fields inside constraints
 * (e.g. `list_key`, `match_field`). The requirements doc §2.2 specifies
 * camelCase. This does not break migration: constraint defs are rebuilt
 * from current YAML at migration time, not read from prototype JSONL.
 */

const name = { name: Schema.String } as const;

export const ContainsConstraint = Schema.Struct({
  check: Schema.Literal("contains"),
  ...name,
  value: Schema.String,
});
export type ContainsConstraint = typeof ContainsConstraint.Type;

export const ContainsExactConstraint = Schema.Struct({
  check: Schema.Literal("contains_exact"),
  ...name,
  value: Schema.String,
});
export type ContainsExactConstraint = typeof ContainsExactConstraint.Type;

export const NotContainsCharConstraint = Schema.Struct({
  check: Schema.Literal("not_contains_char"),
  ...name,
  char: Schema.String,
});
export type NotContainsCharConstraint = typeof NotContainsCharConstraint.Type;

export const MinLengthConstraint = Schema.Struct({
  check: Schema.Literal("min_length"),
  ...name,
  length: Schema.Number,
});
export type MinLengthConstraint = typeof MinLengthConstraint.Type;

export const RegexConstraint = Schema.Struct({
  check: Schema.Literal("regex"),
  ...name,
  pattern: Schema.String,
  dotall: Schema.optional(Schema.Boolean),
});
export type RegexConstraint = typeof RegexConstraint.Type;

export const RegexCountMinConstraint = Schema.Struct({
  check: Schema.Literal("regex_count_min"),
  ...name,
  pattern: Schema.String,
  min: Schema.Number,
});
export type RegexCountMinConstraint = typeof RegexCountMinConstraint.Type;

export const ValidJsonConstraint = Schema.Struct({
  check: Schema.Literal("valid_json"),
  ...name,
});
export type ValidJsonConstraint = typeof ValidJsonConstraint.Type;

export const JsonHasKeysConstraint = Schema.Struct({
  check: Schema.Literal("json_has_keys"),
  ...name,
  keys: Schema.Array(Schema.String),
});
export type JsonHasKeysConstraint = typeof JsonHasKeysConstraint.Type;

export const JsonAllStringValuesConstraint = Schema.Struct({
  check: Schema.Literal("json_all_string_values"),
  ...name,
});
export type JsonAllStringValuesConstraint = typeof JsonAllStringValuesConstraint.Type;

export const JsonNestedIsObjectConstraint = Schema.Struct({
  check: Schema.Literal("json_nested_is_object"),
  ...name,
  key: Schema.String,
});
export type JsonNestedIsObjectConstraint = typeof JsonNestedIsObjectConstraint.Type;

export const JsonNestedHasKeyConstraint = Schema.Struct({
  check: Schema.Literal("json_nested_has_key"),
  ...name,
  parent: Schema.String,
  key: Schema.String,
});
export type JsonNestedHasKeyConstraint = typeof JsonNestedHasKeyConstraint.Type;

export const JsonFieldEqualsConstraint = Schema.Struct({
  check: Schema.Literal("json_field_equals"),
  ...name,
  key: Schema.String,
  value: Schema.Unknown,
});
export type JsonFieldEqualsConstraint = typeof JsonFieldEqualsConstraint.Type;

export const JsonFieldIsListConstraint = Schema.Struct({
  check: Schema.Literal("json_field_is_list"),
  ...name,
  key: Schema.String,
});
export type JsonFieldIsListConstraint = typeof JsonFieldIsListConstraint.Type;

export const JsonListItemHasConstraint = Schema.Struct({
  check: Schema.Literal("json_list_item_has"),
  ...name,
  listKey: Schema.String,
  matchField: Schema.String,
  matchValue: Schema.Unknown,
  checkField: Schema.String,
  checkValue: Schema.Unknown,
});
export type JsonListItemHasConstraint = typeof JsonListItemHasConstraint.Type;

export const NumberedLinesConstraint = Schema.Struct({
  check: Schema.Literal("numbered_lines"),
  ...name,
  from: Schema.Number,
  to: Schema.Number,
});
export type NumberedLinesConstraint = typeof NumberedLinesConstraint.Type;

export const NoNumberedLineConstraint = Schema.Struct({
  check: Schema.Literal("no_numbered_line"),
  ...name,
  line: Schema.Number,
});
export type NoNumberedLineConstraint = typeof NoNumberedLineConstraint.Type;

export const NumberedLineExistsConstraint = Schema.Struct({
  check: Schema.Literal("numbered_line_exists"),
  ...name,
  line: Schema.Number,
});
export type NumberedLineExistsConstraint = typeof NumberedLineExistsConstraint.Type;

export const LineCountConstraint = Schema.Struct({
  check: Schema.Literal("line_count"),
  ...name,
  count: Schema.Number,
});
export type LineCountConstraint = typeof LineCountConstraint.Type;

export const WordCountExactConstraint = Schema.Struct({
  check: Schema.Literal("word_count_exact"),
  ...name,
  word: Schema.String,
  count: Schema.Number,
});
export type WordCountExactConstraint = typeof WordCountExactConstraint.Type;

export const AllLinesWordCountConstraint = Schema.Struct({
  check: Schema.Literal("all_lines_word_count"),
  ...name,
  min: Schema.Number,
  max: Schema.Number,
});
export type AllLinesWordCountConstraint = typeof AllLinesWordCountConstraint.Type;

/**
 * Discriminated union over all 20 constraint variants, dispatched on the
 * `check` literal. Decoders fail with a parse error if the discriminator
 * is unknown or if a variant's required fields are missing — this is how
 * {@link UnknownConstraintCheck} surfaces at YAML load time (requirements §3.1).
 */
export const ConstraintDef = Schema.Union(
  ContainsConstraint,
  ContainsExactConstraint,
  NotContainsCharConstraint,
  MinLengthConstraint,
  RegexConstraint,
  RegexCountMinConstraint,
  ValidJsonConstraint,
  JsonHasKeysConstraint,
  JsonAllStringValuesConstraint,
  JsonNestedIsObjectConstraint,
  JsonNestedHasKeyConstraint,
  JsonFieldEqualsConstraint,
  JsonFieldIsListConstraint,
  JsonListItemHasConstraint,
  NumberedLinesConstraint,
  NoNumberedLineConstraint,
  NumberedLineExistsConstraint,
  LineCountConstraint,
  WordCountExactConstraint,
  AllLinesWordCountConstraint,
);
export type ConstraintDef = typeof ConstraintDef.Type;
