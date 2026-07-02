/**
 * Python → JS regex inline-flag translation.
 *
 * Challenge YAML is authored with Python-style inline flag groups such as
 * `(?i)Data\.TaggedError`. A bare inline group is a SyntaxError in a JS
 * RegExp (only the scoped ES2025 form `(?i:...)` compiles natively), so
 * without translation every such constraint silently lands in the scorer's
 * `errored` bucket and counts as 0.
 *
 * {@link translateInlineFlags} handles exactly one LEADING group containing
 * any combination of `i`, `m`, `s` — e.g. `(?i)`, `(?m)`, `(?im)`, `(?si)` —
 * stripping it from the pattern and merging the flags with any
 * harness-supplied base flags (deduped). Everything else is left untouched:
 *   - mid-pattern bare groups (`foo(?i)bar`) → still a JS error → errored;
 *   - scoped groups (`(?i:bar)`) → natively valid, no translation needed;
 *   - unsupported Python flags (`(?x)`, `(?a)`, …) → still a JS error.
 */

const LEADING_INLINE_FLAGS_RE = /^\(\?([ims]+)\)/;

export interface TranslatedPattern {
  readonly pattern: string;
  readonly flags: string;
}

export const translateInlineFlags = (pattern: string, baseFlags = ""): TranslatedPattern => {
  const m = LEADING_INLINE_FLAGS_RE.exec(pattern);
  if (m === null || m[1] === undefined) return { pattern, flags: baseFlags };
  const merged = new Set([...baseFlags, ...m[1]]);
  return { pattern: pattern.slice(m[0].length), flags: Array.from(merged).join("") };
};
