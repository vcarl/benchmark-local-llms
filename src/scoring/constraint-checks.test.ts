import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ConstraintDef } from "../schema/constraints.js";
import { evaluateConstraint } from "./constraint-checks.js";

const run = (output: string, def: ConstraintDef): boolean =>
  Effect.runSync(evaluateConstraint(output, def));

describe("constraint checks — text / length family", () => {
  it("contains: case-insensitive substring hit", () => {
    const def: ConstraintDef = { check: "contains", name: "t", value: "HELLO" };
    expect(run("say hello world", def)).toBe(true);
  });

  it("contains: miss", () => {
    const def: ConstraintDef = { check: "contains", name: "t", value: "bye" };
    expect(run("hello world", def)).toBe(false);
  });

  it("contains_exact: case-sensitive hit", () => {
    const def: ConstraintDef = { check: "contains_exact", name: "t", value: "Hello" };
    expect(run("Hello world", def)).toBe(true);
  });

  it("contains_exact: case mismatch fails", () => {
    const def: ConstraintDef = { check: "contains_exact", name: "t", value: "Hello" };
    expect(run("hello world", def)).toBe(false);
  });

  it("not_contains_char: passes when char absent (case-insensitive)", () => {
    const def: ConstraintDef = { check: "not_contains_char", name: "t", char: "Z" };
    expect(run("abc def", def)).toBe(true);
  });

  it("not_contains_char: fails when char present (case-insensitive)", () => {
    const def: ConstraintDef = { check: "not_contains_char", name: "t", char: "Z" };
    expect(run("crazy horse", def)).toBe(false);
  });

  it("min_length: strictly greater than specified length", () => {
    // Prototype: len(o.strip()) > length.
    const def: ConstraintDef = { check: "min_length", name: "t", length: 5 };
    expect(run("123456", def)).toBe(true); // 6 > 5
    expect(run("12345", def)).toBe(false); // 5 not > 5
    expect(run("  12345  ", def)).toBe(false); // trim then 5 not > 5
  });
});

describe("constraint checks — regex family", () => {
  it("regex: simple hit without dotall", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`\d{3}`,
    };
    expect(run("abc 123 def", def)).toBe(true);
  });

  it("regex: dotall true allows `.` to match newlines", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: "start.*end",
      dotall: true,
    };
    expect(run("start\nmiddle\nend", def)).toBe(true);
  });

  it("regex: dotall false (default) cannot match across newlines", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: "start.*end",
    };
    expect(run("start\nmiddle\nend", def)).toBe(false);
  });

  it("regex_count_min: meets minimum count", () => {
    const def: ConstraintDef = {
      check: "regex_count_min",
      name: "t",
      pattern: String.raw`\d+`,
      min: 3,
    };
    expect(run("1 2 3 4", def)).toBe(true);
  });

  it("regex_count_min: below minimum count", () => {
    const def: ConstraintDef = {
      check: "regex_count_min",
      name: "t",
      pattern: String.raw`\d+`,
      min: 5,
    };
    expect(run("1 2 3 4", def)).toBe(false);
  });
});

describe("constraint checks — json family", () => {
  it("valid_json: parses a top-level object", () => {
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    expect(run('{"a":1,"b":2}', def)).toBe(true);
  });

  it("valid_json: fails on garbage", () => {
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    expect(run("not json at all", def)).toBe(false);
  });

  it("valid_json: falls back to first balanced {...} block embedded in prose", () => {
    // Fallback is a balanced-delimiter scan: it starts at the first `{`/`[`
    // and walks to the matching closer, respecting string literals. Newlines
    // inside the block are fine; nested braces are spanned.
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    expect(run('preamble {"k":"v"} trailing', def)).toBe(true);
    expect(run('preamble text\n{"key":\n"value"}\n... trailing', def)).toBe(true);
    // Nested object: the scan extracts the FULL outer object
    // `{"outer":{"x":1}}`, not the innermost `{"x":1}` — see "prose-wrapped
    // nested object" below for the structural assertions on this behavior.
    expect(run('garbage {"outer":{"x":1}} trailing', def)).toBe(true);
  });

  it("json_has_keys: all keys present", () => {
    const def: ConstraintDef = {
      check: "json_has_keys",
      name: "t",
      keys: ["a", "b"],
    };
    expect(run('{"a":1,"b":2}', def)).toBe(true);
    expect(run('{"a":1}', def)).toBe(false);
  });

  it("json_all_string_values: all values are strings", () => {
    const def: ConstraintDef = { check: "json_all_string_values", name: "t" };
    expect(run('{"a":"x","b":"y"}', def)).toBe(true);
    expect(run('{"a":"x","b":2}', def)).toBe(false);
  });

  it("json_nested_is_object: nested key is object", () => {
    const def: ConstraintDef = {
      check: "json_nested_is_object",
      name: "t",
      key: "meta",
    };
    expect(run('{"meta":{"x":1}}', def)).toBe(true);
    expect(run('{"meta":"not obj"}', def)).toBe(false);
  });

  it("json_nested_has_key: parent has key", () => {
    const def: ConstraintDef = {
      check: "json_nested_has_key",
      name: "t",
      parent: "meta",
      key: "x",
    };
    expect(run('{"meta":{"x":1}}', def)).toBe(true);
    expect(run('{"meta":{"y":1}}', def)).toBe(false);
    expect(run('{"meta":"oops"}', def)).toBe(false);
  });

  it("json_field_equals: scalar equality", () => {
    const def: ConstraintDef = {
      check: "json_field_equals",
      name: "t",
      key: "status",
      value: "ok",
    };
    expect(run('{"status":"ok"}', def)).toBe(true);
    expect(run('{"status":"nope"}', def)).toBe(false);
  });

  it("json_field_is_list: value is an array", () => {
    const def: ConstraintDef = {
      check: "json_field_is_list",
      name: "t",
      key: "tags",
    };
    expect(run('{"tags":[1,2]}', def)).toBe(true);
    expect(run('{"tags":"x"}', def)).toBe(false);
  });

  it("json_list_item_has: finds matching item in list", () => {
    const def: ConstraintDef = {
      check: "json_list_item_has",
      name: "t",
      listKey: "items",
      matchField: "id",
      matchValue: 2,
      checkField: "ok",
      checkValue: true,
    };
    const body = '{"items":[{"id":1,"ok":false},{"id":2,"ok":true}]}';
    expect(run(body, def)).toBe(true);
    const noMatch = '{"items":[{"id":2,"ok":false}]}';
    expect(run(noMatch, def)).toBe(false);
  });
});

describe("constraint checks — Python inline regex flags (translated at eval time)", () => {
  const runEither = (output: string, def: ConstraintDef) =>
    Effect.runSync(Effect.either(evaluateConstraint(output, def)));

  it("regex: leading (?i) is translated to the JS `i` flag", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`(?i)Data\.TaggedError`,
    };
    expect(run("Data.TaggedError", def)).toBe(true);
    expect(run("data.taggederror", def)).toBe(true);
    expect(run("Data TaggedError", def)).toBe(false);
  });

  it("regex: (?i) with alternation matches inside backticks", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`(?i)Layer\.(mergeAll|merge)`,
    };
    expect(run("`Layer.merge`", def)).toBe(true);
  });

  it("regex: leading (?m) is translated to the JS `m` flag", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`(?m)^yield\*`,
    };
    expect(run("const x = 1\nyield* Effect.log()", def)).toBe(true);
    expect(run("no line starts with it: yield* x", def)).toBe(false);
  });

  it("regex: combined leading flags (?im) translate to both JS flags", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`(?im)^data\.`,
    };
    expect(run("preamble\nData.TaggedError", def)).toBe(true);
  });

  it("regex: combined leading flags (?si) translate to both JS flags", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: "(?si)START.*end",
    };
    expect(run("start\nmiddle\nEND", def)).toBe(true);
  });

  it("regex: leading (?s) dedupes against harness-supplied dotall flag", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: "(?s)start.*end",
      dotall: true,
    };
    expect(run("start\nmiddle\nend", def)).toBe(true);
  });

  it("regex: mid-pattern bare (?i) group is left alone and lands in errored", () => {
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`foo(?i)bar`,
    };
    expect(runEither("foobar", def)._tag).toBe("Left");
  });

  it("regex: scoped (?i:...) group is left alone (natively valid in modern V8)", () => {
    // ES2025 pattern modifiers: `(?i:...)` compiles natively on Node >= 23,
    // so no translation happens and the engine handles it directly.
    const def: ConstraintDef = {
      check: "regex",
      name: "t",
      pattern: String.raw`foo(?i:bar)`,
    };
    expect(run("fooBAR", def)).toBe(true);
  });

  it("regex_count_min: leading (?i) is translated and counted case-insensitively", () => {
    const def: ConstraintDef = {
      check: "regex_count_min",
      name: "t",
      pattern: "(?i)effect",
      min: 2,
    };
    expect(run("Effect and EFFECT", def)).toBe(true);
    expect(run("Effect only once", def)).toBe(false);
  });
});

describe("constraint checks — json extraction robustness", () => {
  const FENCED_PERSON = [
    "```json",
    "{",
    '  "name": "Sarah Jenkins",',
    '  "age": 34,',
    '  "address": {',
    '    "street": "452 Oak Lane",',
    '    "city": "Columbus",',
    '    "zip": "43215"',
    "  }",
    "}",
    "```",
  ].join("\n");

  it("fenced nested person JSON: valid_json passes", () => {
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    expect(run(FENCED_PERSON, def)).toBe(true);
  });

  it("fenced nested person JSON: json_has_keys sees the OUTER object's keys", () => {
    const def: ConstraintDef = { check: "json_has_keys", name: "t", keys: ["name"] };
    expect(run(FENCED_PERSON, def)).toBe(true);
  });

  it("fenced nested person JSON: json_nested_is_object finds `address`", () => {
    const def: ConstraintDef = { check: "json_nested_is_object", name: "t", key: "address" };
    expect(run(FENCED_PERSON, def)).toBe(true);
  });

  it("fenced nested person JSON: json_nested_has_key finds address.city", () => {
    const def: ConstraintDef = {
      check: "json_nested_has_key",
      name: "t",
      parent: "address",
      key: "city",
    };
    expect(run(FENCED_PERSON, def)).toBe(true);
  });

  it("prose-wrapped nested object: extracts the full outer object, not the innermost", () => {
    const prose = 'Here is the JSON: {"a":{"b":1}} hope that helps';
    expect(run(prose, { check: "valid_json", name: "t" })).toBe(true);
    expect(run(prose, { check: "json_nested_is_object", name: "t", key: "a" })).toBe(true);
    expect(run(prose, { check: "json_nested_has_key", name: "t", parent: "a", key: "b" })).toBe(
      true,
    );
  });

  it("fenced top-level array: valid_json passes", () => {
    const fencedArray = "```json\n[1, 2, 3]\n```";
    expect(run(fencedArray, { check: "valid_json", name: "t" })).toBe(true);
  });

  it("prose-wrapped top-level array: valid_json passes", () => {
    expect(run("The list: [1, 2, 3] done", { check: "valid_json", name: "t" })).toBe(true);
  });

  it("flat fenced object still works (regression guard)", () => {
    const flat = '```json\n{"a": 1, "b": 2}\n```';
    expect(run(flat, { check: "valid_json", name: "t" })).toBe(true);
    expect(run(flat, { check: "json_has_keys", name: "t", keys: ["a", "b"] })).toBe(true);
  });

  it("preserves the null-means-unparseable contract for literal `null` output", () => {
    expect(run("null", { check: "valid_json", name: "t" })).toBe(false);
  });

  it("pathological run of unmatched openers completes in linear time", () => {
    // The balanced scan makes ONE aggregate pass: the first opener's scan
    // reaches end-of-text, which terminates the whole search instead of
    // rescanning from each of the 50k openers (the quadratic worst case).
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    const started = performance.now();
    expect(run("{".repeat(50_000), def)).toBe(false);
    // Loose guard: linear scan is sub-millisecond; quadratic was seconds.
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it("unmatched opener before a block hides it: scan terminates at end-of-text", () => {
    // Deliberate linear-time tradeoff: an opener that never closes swallows
    // everything after it, so the trailing valid object is not extracted.
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    const started = performance.now();
    expect(run(`${"{".repeat(50_000)}{"a":1}`, def)).toBe(false);
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it("closed-but-unparseable blocks before valid JSON: still finds it, fast", () => {
    // Each `{x}` closes but fails JSON.parse; the scan retries from just
    // after each opener (bounded rescans), then extracts the real object.
    const def: ConstraintDef = { check: "valid_json", name: "t" };
    const text = `${"{x}".repeat(10_000)} {"a":1}`;
    const started = performance.now();
    expect(run(text, def)).toBe(true);
    expect(run(text, { check: "json_has_keys", name: "t", keys: ["a"] })).toBe(true);
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});

describe("constraint checks — numbered-line family", () => {
  it("numbered_lines: both from and to markers present", () => {
    const def: ConstraintDef = {
      check: "numbered_lines",
      name: "t",
      from: 1,
      to: 5,
    };
    const body = "1. first\n2. second\n3. third\n4. fourth\n5. fifth";
    expect(run(body, def)).toBe(true);
  });

  it("numbered_lines: missing `to` fails", () => {
    const def: ConstraintDef = {
      check: "numbered_lines",
      name: "t",
      from: 1,
      to: 5,
    };
    const body = "1. first\n2. second";
    expect(run(body, def)).toBe(false);
  });

  it("no_numbered_line: succeeds when line absent", () => {
    const def: ConstraintDef = { check: "no_numbered_line", name: "t", line: 6 };
    expect(run("1. a\n2. b", def)).toBe(true);
  });

  it("no_numbered_line: fails when line present", () => {
    const def: ConstraintDef = { check: "no_numbered_line", name: "t", line: 2 };
    expect(run("1. a\n2. b", def)).toBe(false);
  });

  it("numbered_line_exists: finds the line", () => {
    const def: ConstraintDef = { check: "numbered_line_exists", name: "t", line: 3 };
    expect(run("1. a\n2. b\n3. c", def)).toBe(true);
  });

  it("numbered_line_exists: missing line", () => {
    const def: ConstraintDef = { check: "numbered_line_exists", name: "t", line: 7 };
    expect(run("1. a\n2. b", def)).toBe(false);
  });

  it("numbered_lines accepts `N)` and `N ` markers (per regex `[.):\\s]`)", () => {
    const def: ConstraintDef = { check: "numbered_line_exists", name: "t", line: 2 };
    expect(run("1) first\n2) second", def)).toBe(true);
    expect(run("1 first\n2 second", def)).toBe(true);
  });
});

describe("constraint checks — count family", () => {
  it("line_count: exact match", () => {
    const def: ConstraintDef = { check: "line_count", name: "t", count: 3 };
    expect(run("a\nb\nc", def)).toBe(true);
    expect(run("a\n\nb\n\nc", def)).toBe(true); // blanks ignored
    expect(run("a\nb", def)).toBe(false);
  });

  it("word_count_exact: matches word with boundaries, case-insensitive", () => {
    const def: ConstraintDef = {
      check: "word_count_exact",
      name: "t",
      word: "foo",
      count: 2,
    };
    expect(run("Foo bar FOO baz", def)).toBe(true);
    expect(run("Foo bar foobar FOO", def)).toBe(true); // `foobar` is not a whole word
    expect(run("foo", def)).toBe(false);
  });

  it("all_lines_word_count: every non-empty line in [min, max]", () => {
    const def: ConstraintDef = {
      check: "all_lines_word_count",
      name: "t",
      min: 2,
      max: 4,
    };
    expect(run("one two three\nfour five\nsix seven eight four", def)).toBe(true);
    expect(run("one\ntwo three", def)).toBe(false); // first line too short
    expect(run("a b c d e\nf g", def)).toBe(false); // first line too long
  });
});
