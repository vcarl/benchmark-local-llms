/**
 * Incremental degenerate-repetition detector for streamed generations.
 *
 * A model that loses the thread does not stop — it repeats. Observed in the
 * archive: a healthy generation's most-repeated 12-gram occurs once or twice,
 * while a runaway repeated one 281 times, and another repeated
 * `"an upstream an upstream an upstream…"` 2,217 times. The gap between those
 * two populations is enormous, which is what makes this cheap to detect and
 * safe to act on.
 *
 * The detector is fed text as it streams and answers one question: has some
 * window of words repeated so often that the generation is provably stuck?
 * It deliberately says nothing about *quality* — long, wandering, non-repeating
 * reasoning is not a loop, and this must not fire on it. (One of the three
 * observed failures was exactly that: 3,798 words, 99.6% distinct. It runs to
 * the token budget and that is the correct outcome for it.)
 */

export interface LoopDetectorOptions {
  /** Words per window. Long enough that prose and JSON don't collide by chance. */
  readonly n?: number;
  /** Repeats of a single window before we call it stuck. */
  readonly threshold?: number;
  /** Don't judge anything until this many words have been generated. */
  readonly minWords?: number;
}

export interface LoopDetector {
  /**
   * Feed the next chunk of generated text. Returns `true` once the generation
   * is provably looping; once `true`, it stays `true`.
   */
  readonly push: (delta: string) => boolean;
  /** Words seen so far. */
  readonly wordCount: () => number;
  /** Highest repeat count reached by any single window. */
  readonly maxRepeats: () => number;
}

const DEFAULT_N = 12;
/**
 * 40 sits an order of magnitude above the healthy ceiling (2) and well below
 * the observed loops (281, 2217), so it neither trips on legitimate repetition
 * nor waits around once a model is genuinely stuck.
 */
const DEFAULT_THRESHOLD = 40;
/**
 * Below this, repetition is not yet evidence: short structured answers (JSON,
 * tables) reuse phrasing legitimately, and we would rather spend a few hundred
 * wasted words than kill a real answer.
 */
const DEFAULT_MIN_WORDS = 400;

export const makeLoopDetector = (options: LoopDetectorOptions = {}): LoopDetector => {
  const n = options.n ?? DEFAULT_N;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const minWords = options.minWords ?? DEFAULT_MIN_WORDS;

  const counts = new Map<string, number>();
  // Only the last `n - 1` words matter for forming the next window; the rest
  // is already accounted for. Keeping just the tail bounds memory regardless
  // of how long the generation runs.
  let tail: string[] = [];
  let words = 0;
  let maxRepeats = 0;
  let looping = false;
  // A chunk can split a word across deltas, so the final fragment is held back
  // until the next delta completes it.
  let partial = "";

  const push = (delta: string): boolean => {
    if (looping) return true;

    const text = partial + delta;
    // A trailing non-space means the last token may still be growing.
    const endsMidWord = text.length > 0 && !/\s$/.test(text);
    const pieces = text.split(/\s+/).filter((w) => w.length > 0);
    if (endsMidWord && pieces.length > 0) {
      partial = pieces[pieces.length - 1] ?? "";
      pieces.pop();
    } else {
      partial = "";
    }

    for (const w of pieces) {
      tail.push(w);
      words += 1;
      if (tail.length < n) continue;
      if (tail.length > n) tail = tail.slice(tail.length - n);
      const key = tail.join(" ");
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next > maxRepeats) maxRepeats = next;
      if (words >= minWords && next >= threshold) {
        looping = true;
        return true;
      }
    }
    return false;
  };

  return {
    push,
    wordCount: () => words,
    maxRepeats: () => maxRepeats,
  };
};
