// Format authored challenges as suite items and write them to challenges/.
// Scorers in play:
//   • exact_match — for unambiguous integer answers (last-match extract regex)
//   • constraint/regex (whole word) — for word/name answers: case-insensitive
//     and lenient about surrounding text, but anchored to word boundaries so a
//     substring of an unrelated word (e.g. "no" inside "cannot") cannot match
//   • constraint/regex (decimal) — for decimal answers, accepting equivalent
//     forms (0.5, .5, 0.50) while rejecting any other value
// Each item carries a `why` rationale, emitted as a YAML comment above it —
// documentation for whoever reviews the suite; never seen by the model.

import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { Document, isSeq } from "yaml";

export type SuiteItem = Record<string, unknown>;

/** An item plus the rationale for its answer (emitted as a comment). */
export interface AuthoredItem {
  item: SuiteItem;
  why: string;
}

interface BaseFields {
  name: string;
  category: string;
  tier: number;
  prompt: string;
  tags?: string[];
  /** One- or two-line explanation of why the answer is what it is. */
  why: string;
}

/** An exact_match item — best for numeric answers. */
export function exactItem(f: BaseFields & { expected: string; extract: string }): AuthoredItem {
  return {
    why: f.why,
    item: {
      name: f.name,
      category: f.category,
      tier: f.tier,
      prompt: f.prompt,
      scorer: "exact_match",
      expected: f.expected,
      extract: f.extract,
      tags: f.tags ?? ["TODO"],
    },
  };
}

/** A constraint item scored by a single case-insensitive `contains` check.
 *  Lenient — a substring of an unrelated word also matches. Prefer `wordItem`
 *  for short answers (yes/no, single keywords, names) where that is a hazard. */
export function containsItem(f: BaseFields & { value: string }): AuthoredItem {
  return {
    why: f.why,
    item: {
      name: f.name,
      category: f.category,
      tier: f.tier,
      prompt: f.prompt,
      scorer: "constraint",
      constraints: [{ name: `contains ${f.value}`, check: "contains", value: f.value }],
      tags: f.tags ?? ["TODO"],
    },
  };
}

/** Escape a literal for use inside a RegExp (mirrors the scorer's escapeRegExp). */
function escapeRegExp(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Whole-word, case-insensitive regex for a literal answer token or phrase. The
 * constraint scorer's `regex` check is case-sensitive (it exposes only a
 * `dotall` flag), so each letter is expanded to an `[Aa]`-style class rather
 * than relying on an ignore-case flag. Word boundaries stop a substring of an
 * unrelated word from matching — "no" no longer matches inside "cannot"/"now",
 * and a name no longer matches inside a longer word.
 */
export function wholeWordPattern(value: string): string {
  const body = Array.from(value)
    .map((ch) =>
      /[a-z]/i.test(ch)
        ? `[${ch.toUpperCase()}${ch.toLowerCase()}]`
        : /\s/.test(ch)
          ? "\\s+"
          : escapeRegExp(ch),
    )
    .join("");
  return `\\b${body}\\b`;
}

/**
 * Regex matching a decimal answer in any equivalent written form: optional
 * leading zero (`.5` ≡ `0.5`) and any number of trailing zeros (`0.50` ≡
 * `0.5`), while rejecting a different value (`0.55`, `10.5`) or a longer number
 * that merely contains these digits. Built from the canonical numeric value so
 * it stays in sync with the computed answer.
 */
export function decimalPattern(value: number): string {
  const [intRaw, fracRaw = ""] = String(value).split(".");
  // Allow the leading zero to be omitted only when the integer part is 0.
  const intPart = intRaw === "0" ? "0?" : escapeRegExp(intRaw);
  const frac = fracRaw.replace(/0+$/, "");
  const fracPat = `${frac.split("").map(escapeRegExp).join("")}0*`;
  return `(?<![\\d.])${intPart}\\.${fracPat}(?!\\d)`;
}

/** A constraint item scored by a single whole-word, case-insensitive regex.
 *  Stricter than `containsItem`: no substring-of-another-word false matches. */
export function wordItem(f: BaseFields & { value: string }): AuthoredItem {
  return {
    why: f.why,
    item: {
      name: f.name,
      category: f.category,
      tier: f.tier,
      prompt: f.prompt,
      scorer: "constraint",
      constraints: [
        { name: `matches ${f.value}`, check: "regex", pattern: wholeWordPattern(f.value) },
      ],
      tags: f.tags ?? ["TODO"],
    },
  };
}

/** A constraint item scored by a single caller-supplied regex pattern. */
export function regexItem(f: BaseFields & { pattern: string; label: string }): AuthoredItem {
  return {
    why: f.why,
    item: {
      name: f.name,
      category: f.category,
      tier: f.tier,
      prompt: f.prompt,
      scorer: "constraint",
      constraints: [{ name: f.label, check: "regex", pattern: f.pattern }],
      tags: f.tags ?? ["TODO"],
    },
  };
}

/** Build the suite YAML with a `# why` comment above each item. */
export function suiteYaml(
  id: string,
  authored: AuthoredItem[],
  version = 1,
  passThreshold = 0.8,
): string {
  const doc = new Document({ id, version, passThreshold, items: authored.map((a) => a.item) });
  const seq = doc.get("items");
  if (isSeq(seq)) {
    seq.items.forEach((node, i) => {
      const why = authored[i]?.why ?? "";
      // Leading space per line → `# text` (the library adds the `#`).
      (node as { commentBefore?: string }).commentBefore = why
        .split("\n")
        .map((l) => ` ${l}`)
        .join("\n");
    });
  }
  return doc.toString();
}

/** Write a suite to <dir>/<id>.yaml. */
export function writeSuiteFile(
  dir: string,
  id: string,
  authored: AuthoredItem[],
  version = 1,
  passThreshold = 0.8,
): string {
  const file = path.join(dir, `${id}.yaml`);
  writeFileSync(file, suiteYaml(id, authored, version, passThreshold));
  return file;
}
