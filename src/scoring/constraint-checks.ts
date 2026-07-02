import { Effect } from "effect";
import { ConstraintEvalError } from "../errors/scorer.js";
import type { ConstraintDef } from "../schema/constraints.js";
import { translateInlineFlags } from "./regex-flags.js";

/**
 * Pure per-constraint evaluators, ported byte-for-byte from
 * `common.py:evaluate_constraint` (line 348). Each function takes the
 * already-thinking-stripped output plus the constraint's specific fields
 * (via the narrowed variant type) and returns a boolean.
 *
 * Python regex → JS regex notes (F2 verification-relevant):
 *   - `re.DOTALL` → `s` flag. No other semantic difference for the patterns
 *     we use (no `(?P<name>)`, no POSIX class diffs).
 *   - `re.MULTILINE` → `m` flag. Used by numbered_line* checks.
 *   - `re.escape(x)` → we reimplement as `escapeRegExp` (below) because JS
 *     does not ship a built-in. Matches Python's escape set:
 *     every ASCII non-alphanumeric character is escaped.
 */

const escapeRegExp = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/** `JSON.parse` that expresses failure as `null` instead of a rejection. */
const parseOrNull = (text: string): unknown | null =>
  Effect.runSync(
    Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => null,
    }).pipe(Effect.orElseSucceed(() => null)),
  );

/**
 * First markdown code fence (any language tag), analogous to
 * `extract-code.ts:FENCE_RE` but language-agnostic — model output wraps JSON
 * in ```json / ``` fences, not ```python ones.
 */
const JSON_FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/;

/**
 * Find the index of the delimiter that closes the `{` or `[` at `start`,
 * respecting JSON string literals and backslash escapes. Returns -1 when the
 * block never closes (i.e. the scan reached end-of-text). Depth-only
 * tracking is sufficient: a mismatched pair (`{...]`) yields a candidate
 * that `JSON.parse` rejects anyway.
 */
const findBalancedEnd = (text: string, start: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth <= 0) return depth === 0 ? i : -1;
    }
  }
  return -1;
};

/**
 * Scan for the first balanced top-level `{...}` or `[...]` block that parses
 * as JSON. Extracts a full nested object out of prose like
 * `Here is the JSON: {"a":{"b":1}} hope that helps`, and top-level arrays.
 *
 * Linear-time constraint: an unclosed candidate means `findBalancedEnd`
 * already scanned to end-of-text, so the whole search terminates there —
 * pathological inputs like `"{".repeat(50000)` cost one aggregate scan, not
 * one scan per opener. (Consequence: an unmatched opener hides any block
 * after it.) A candidate that closes but fails to parse only retries from
 * the character after its opener, so each rescan is bounded by that closed
 * block's length: O(N·k) overall for k closed blocks.
 */
const extractBalancedJson = (text: string): unknown | null => {
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c !== "{" && c !== "[") continue;
    const end = findBalancedEnd(text, i);
    if (end === -1) return null;
    const parsed = parseOrNull(text.slice(i, end + 1));
    if (parsed !== null) return parsed;
  }
  return null;
};

/**
 * Robust JSON extraction from model output:
 *   1. Try `JSON.parse(text.trim())` directly.
 *   2. If the output is fence-wrapped, try the first fenced block verbatim.
 *   3. Fall back to a balanced-delimiter scan over the whole text (which
 *      also covers fence interiors) for the first parseable `{...}`/`[...]`.
 *
 * Failure is expressed as a `null` value (matching the Python prototype's
 * `_try_parse_json` contract), not a rejection. This is correct per §4.3:
 * JSON parse failure is the check failing, not the scorer erroring.
 */
const tryParseJson = (text: string): unknown | null => {
  const strict = parseOrNull(text.trim());
  if (strict !== null) return strict;

  const fence = JSON_FENCE_RE.exec(text);
  if (fence?.[1] !== undefined) {
    const fenced = parseOrNull(fence[1].trim());
    if (fenced !== null) return fenced;
  }

  return extractBalancedJson(text);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep equality matching Python's `==` for JSON-shaped values (scalars,
 * arrays, objects). Used by `json_field_equals` — the prototype just
 * compares `obj.get(key) == value`; since the schema allows `Unknown`
 * expected values, we implement a JSON-structural deep equals.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
};

/**
 * Evaluate a single constraint. Returns an Effect that either succeeds with
 * a boolean (pass/fail) or fails with `ConstraintEvalError` if something
 * threw unexpectedly (e.g. a malformed regex pattern). The constraint
 * scorer upstream translates an error into the `errored` bucket rather
 * than counting it as a failed check.
 *
 * The switch is exhaustive on the discriminator; TS would catch a missing
 * case if the union grew. Each branch is a direct translation of the
 * Python prototype's corresponding `elif`.
 */
export const evaluateConstraint = (
  output: string,
  def: ConstraintDef,
): Effect.Effect<boolean, ConstraintEvalError> =>
  Effect.try({
    try: (): boolean => {
      switch (def.check) {
        case "contains":
          return output.toLowerCase().includes(def.value.toLowerCase());

        case "contains_exact":
          return output.includes(def.value);

        case "not_contains_char":
          return !output.toLowerCase().includes(def.char.toLowerCase());

        case "min_length":
          // Prototype: len(o.strip()) > length  (strictly greater).
          return output.trim().length > def.length;

        case "regex": {
          const base = def.dotall === true ? "s" : "";
          const t = translateInlineFlags(def.pattern, base);
          return new RegExp(t.pattern, t.flags).test(output);
        }

        case "regex_count_min": {
          // Python `re.findall` without global is equivalent to JS global
          // `matchAll` for counting non-overlapping matches.
          const t = translateInlineFlags(def.pattern, "g");
          const re = new RegExp(t.pattern, t.flags);
          const n = Array.from(output.matchAll(re)).length;
          return n >= def.min;
        }

        case "valid_json":
          return tryParseJson(output) !== null;

        case "json_has_keys": {
          const obj = tryParseJson(output);
          return isPlainObject(obj) && def.keys.every((k) => k in obj);
        }

        case "json_all_string_values": {
          const obj = tryParseJson(output);
          return isPlainObject(obj) && Object.values(obj).every((v) => typeof v === "string");
        }

        case "json_nested_is_object": {
          const obj = tryParseJson(output);
          if (!isPlainObject(obj)) return false;
          const inner = obj[def.key];
          return isPlainObject(inner);
        }

        case "json_nested_has_key": {
          const obj = tryParseJson(output);
          if (!isPlainObject(obj)) return false;
          const parent = obj[def.parent];
          return isPlainObject(parent) && def.key in parent;
        }

        case "json_field_equals": {
          const obj = tryParseJson(output);
          return isPlainObject(obj) && deepEqual(obj[def.key], def.value);
        }

        case "json_field_is_list": {
          const obj = tryParseJson(output);
          return isPlainObject(obj) && Array.isArray(obj[def.key]);
        }

        case "json_list_item_has": {
          const obj = tryParseJson(output);
          if (!isPlainObject(obj)) return false;
          const items = obj[def.listKey];
          if (!Array.isArray(items)) return false;
          return items.some(
            (item) =>
              isPlainObject(item) &&
              deepEqual(item[def.matchField], def.matchValue) &&
              deepEqual(item[def.checkField], def.checkValue),
          );
        }

        case "numbered_lines": {
          // Python: rf"^{from}[.):\s]" with re.MULTILINE, both must match.
          const fromRe = new RegExp(`^${def.from}[.):\\s]`, "m");
          const toRe = new RegExp(`^${def.to}[.):\\s]`, "m");
          return fromRe.test(output) && toRe.test(output);
        }

        case "no_numbered_line": {
          const re = new RegExp(`^${def.line}[.):\\s]`, "m");
          return !re.test(output);
        }

        case "numbered_line_exists": {
          const re = new RegExp(`^${def.line}[.):\\s]`, "m");
          return re.test(output);
        }

        case "line_count": {
          // Non-empty lines after trim, exact count.
          const lines = output
            .trim()
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0);
          return lines.length === def.count;
        }

        case "word_count_exact": {
          // Python: `re.findall(rf'\b{re.escape(word)}\b', o.lower())` count == count
          // Lowercase input only — word preserved as-is in the pattern, but
          // since `o.lower()` is applied in Python, matching is case-insensitive.
          const pattern = `\\b${escapeRegExp(def.word)}\\b`;
          const re = new RegExp(pattern, "g");
          const n = Array.from(output.toLowerCase().matchAll(re)).length;
          return n === def.count;
        }

        case "all_lines_word_count": {
          const lines = output
            .trim()
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0);
          return lines.every((l) => {
            // Python `l.split()` splits on any whitespace and drops empties.
            const words = l.split(/\s+/).filter((w) => w.length > 0);
            return def.min <= words.length && words.length <= def.max;
          });
        }
      }
    },
    catch: (cause) =>
      new ConstraintEvalError({
        constraintName: def.name,
        check: def.check,
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  });
