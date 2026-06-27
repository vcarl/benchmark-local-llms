/**
 * Entity extraction shared by the `set_match` and `ordered_match` scorers.
 *
 * The model emits prose; we recover *which* known entities it named (and, for
 * the ordered scorer, in what order) by testing each token in a closed
 * `vocabulary` for a whole-word occurrence in the response. Anchoring on the
 * vocabulary makes parsing robust to surrounding noise and stops the model from
 * gaming the scorer with synonyms or non-vocabulary tokens.
 */

export interface ExtractOptions {
  /** Case-sensitive matching. Defaults to false (case-insensitive). */
  readonly caseSensitive?: boolean;
}

/** Escape a literal for use inside a RegExp (mirrors emit.ts `escapeRegExp`). */
const escapeRegExp = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/**
 * Whole-word pattern for a vocabulary token. Internal whitespace is relaxed to
 * `\s+` so a multi-word token matches across runs of spaces / line breaks. The
 * `(?<!\w) … (?!\w)` bounds stop a token from matching as a substring of a
 * longer word ("Bob" must not match inside "Bobby"), mirroring the
 * `wholeWordPattern` helper in `scripts/author/emit.ts`.
 */
const tokenPattern = (token: string): string => {
  const body = token.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return `(?<!\\w)(?:${body})(?!\\w)`;
};

/**
 * Index of the first whole-word occurrence of `token` in `output`, or -1 if it
 * never appears. A blank token never matches.
 */
const firstIndexOf = (output: string, token: string, caseSensitive: boolean): number => {
  if (token.trim() === "") return -1;
  const re = new RegExp(tokenPattern(token), caseSensitive ? "" : "i");
  const m = re.exec(output);
  return m === null ? -1 : m.index;
};

/**
 * The set of `vocabulary` tokens present in `output` (whole-word match). Order
 * is irrelevant; duplicates in the prose collapse to a single member. Tokens
 * outside the vocabulary are ignored.
 */
export const extractSet = (
  output: string,
  vocabulary: ReadonlyArray<string>,
  opts: ExtractOptions = {},
): ReadonlySet<string> => {
  const caseSensitive = opts.caseSensitive ?? false;
  const found = new Set<string>();
  for (const token of vocabulary) {
    if (firstIndexOf(output, token, caseSensitive) >= 0) found.add(token);
  }
  return found;
};

/**
 * The sequence of `vocabulary` tokens ordered by the index of their first
 * occurrence in `output`, deduplicated keeping the first occurrence. Ties (which
 * only arise if two tokens share a start index) break by vocabulary order, which
 * `Array.prototype.sort` preserves as a stable sort. Tokens outside the
 * vocabulary are ignored.
 */
export const extractSequence = (
  output: string,
  vocabulary: ReadonlyArray<string>,
  opts: ExtractOptions = {},
): ReadonlyArray<string> => {
  const caseSensitive = opts.caseSensitive ?? false;
  const hits: Array<{ token: string; index: number }> = [];
  for (const token of vocabulary) {
    const index = firstIndexOf(output, token, caseSensitive);
    if (index >= 0) hits.push({ token, index });
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.token);
};
