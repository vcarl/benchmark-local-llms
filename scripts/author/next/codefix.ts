// Code edits — fix a planted bug. Each family is a reference Python function
// (written for this set; release 0's challenges/code_* items are not reused).
// A seed picks one single-token mutant of it: a comparison slip or flip, an
// arithmetic swap, a boolean swap, or an integer literal off by one (which
// covers wrong defaults and bounds). The prompt shows the mutant and the shown
// tests; the test file holds those plus held-out tests, so special-casing the
// shown asserts fails. Graded by `code_exec` running the model's function.
//
// Screen: every candidate mutant runs once in the scorer sandbox (Docker) at
// generation time. A mutant is kept only if it compiles, never hangs, and
// fails at least one shown test; the reference must pass every test.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { sandboxArgs } from "../../../src/scoring/sandbox.js";
import { type DataItem, type Family, rngFor, screened, variantMeta } from "./data-common.js";

interface Reference {
  readonly id: string;
  /** What the function should do, stated in the prompt. */
  readonly spec: string;
  /** No string literals or annotations: the mutation scan is token-level. */
  readonly source: string;
  readonly shown: readonly string[];
  readonly heldOut: readonly string[];
}

const REFERENCES: readonly Reference[] = [
  {
    id: "codefix_binary_search",
    spec: "`binary_search(xs, target)` returns the index of `target` in the ascending list `xs` of distinct integers, or -1 if it is absent.",
    source: [
      "def binary_search(xs, target):",
      "    lo, hi = 0, len(xs) - 1",
      "    while lo <= hi:",
      "        mid = (lo + hi) // 2",
      "        if xs[mid] == target:",
      "            return mid",
      "        if xs[mid] < target:",
      "            lo = mid + 1",
      "        else:",
      "            hi = mid - 1",
      "    return -1",
    ].join("\n"),
    shown: [
      "assert binary_search([1, 3, 5, 7, 9], 7) == 3",
      "assert binary_search([1, 3, 5, 7, 9], 1) == 0",
      "assert binary_search([1, 3, 5, 7, 9], 9) == 4",
      "assert binary_search([1, 3, 5, 7, 9], 4) == -1",
      "assert binary_search([], 3) == -1",
    ],
    heldOut: [
      "assert binary_search([2], 2) == 0",
      "assert binary_search([2, 4], 4) == 1",
      "assert binary_search([2, 4], 1) == -1",
      "assert binary_search(list(range(0, 100, 3)), 51) == 17",
      "assert binary_search(list(range(0, 100, 3)), 52) == -1",
      "assert binary_search([-5, -2, 0, 8], -5) == 0",
    ],
  },
  {
    id: "codefix_max_window_sum",
    spec: "`max_window_sum(xs, k)` returns the largest sum of any `k` consecutive elements of `xs`, or None when `k` is not between 1 and `len(xs)`.",
    source: [
      "def max_window_sum(xs, k):",
      "    if k <= 0 or k > len(xs):",
      "        return None",
      "    total = sum(xs[:k])",
      "    best = total",
      "    for i in range(k, len(xs)):",
      "        total += xs[i] - xs[i - k]",
      "        if total > best:",
      "            best = total",
      "    return best",
    ].join("\n"),
    shown: [
      "assert max_window_sum([1, 4, 2, 10, 2, 3], 2) == 12",
      "assert max_window_sum([5, -1, 3], 3) == 7",
      "assert max_window_sum([3, 8, 1], 1) == 8",
      "assert max_window_sum([1, 2], 0) is None",
      "assert max_window_sum([1, 2], 3) is None",
      "assert max_window_sum([-4, -2, -7], 2) == -6",
    ],
    heldOut: [
      "assert max_window_sum([9, 1, 1, 1], 2) == 10",
      "assert max_window_sum([1, 1, 1, 9], 2) == 10",
      "assert max_window_sum([7], 1) == 7",
      "assert max_window_sum([], 1) is None",
      "assert max_window_sum([2, -8, 3, 3, -1, 4], 3) == 6",
    ],
  },
  {
    id: "codefix_merge_intervals",
    spec: "`merge_intervals(intervals)` takes a list of `[start, end]` pairs (start <= end) and returns the merged intervals as `[start, end]` lists sorted by start. Intervals that overlap or touch (one ends where the next starts) merge.",
    source: [
      "def merge_intervals(intervals):",
      "    merged = []",
      "    for start, end in sorted(intervals):",
      "        if merged and start <= merged[-1][1]:",
      "            merged[-1][1] = max(merged[-1][1], end)",
      "        else:",
      "            merged.append([start, end])",
      "    return merged",
    ].join("\n"),
    shown: [
      "assert merge_intervals([[1, 3], [2, 6], [8, 10]]) == [[1, 6], [8, 10]]",
      "assert merge_intervals([[5, 7], [1, 2]]) == [[1, 2], [5, 7]]",
      "assert merge_intervals([[1, 4], [4, 5]]) == [[1, 5]]",
      "assert merge_intervals([[1, 10], [2, 3]]) == [[1, 10]]",
      "assert merge_intervals([]) == []",
    ],
    heldOut: [
      "assert merge_intervals([[3, 3]]) == [[3, 3]]",
      "assert merge_intervals([[6, 8], [1, 3], [2, 4], [9, 9]]) == [[1, 4], [6, 8], [9, 9]]",
      "assert merge_intervals([[0, 1], [1, 2], [2, 3]]) == [[0, 3]]",
      "assert merge_intervals([[1, 5], [2, 3], [4, 9]]) == [[1, 9]]",
    ],
  },
  {
    id: "codefix_paginate",
    spec: "`paginate(items, page, per_page=10)` returns the items on 1-based page number `page` when each page holds `per_page` items. A page before the first or past the end is an empty list.",
    source: [
      "def paginate(items, page, per_page=10):",
      "    if page < 1:",
      "        return []",
      "    start = (page - 1) * per_page",
      "    return items[start:start + per_page]",
    ].join("\n"),
    shown: [
      "assert paginate(list(range(25)), 1) == list(range(10))",
      "assert paginate(list(range(25)), 3) == [20, 21, 22, 23, 24]",
      "assert paginate(list('abcdefg'), 2, 3) == ['d', 'e', 'f']",
      "assert paginate(list(range(25)), 4) == []",
      "assert paginate(list(range(5)), 0) == []",
    ],
    heldOut: [
      "assert paginate([], 1) == []",
      "assert paginate(list(range(12)), 2) == [10, 11]",
      "assert paginate(list('abcdefg'), 3, 3) == ['g']",
      "assert paginate(list(range(5)), -1) == []",
      "assert paginate(list(range(30)), 3, 10) == list(range(20, 30))",
    ],
  },
];

// ── Mutation ────────────────────────────────────────────────────────────────
const SWAPS: Record<string, readonly string[]> = {
  "<": ["<=", ">"],
  "<=": ["<", ">"],
  ">": [">=", "<"],
  ">=": [">", "<"],
  "==": ["!="],
  "!=": ["=="],
  "+": ["-"],
  "-": ["+"],
  and: ["or"],
  or: ["and"],
  True: ["False"],
  False: ["True"],
};
const TOKEN = /<=|>=|==|!=|<|>|\+|-|\b(?:and|or|True|False)\b|\b\d+\b/g;

export interface Mutant {
  readonly source: string;
  readonly kind: "comparison" | "arithmetic" | "boolean" | "literal";
  /** e.g. `line 3: "<=" -> "<"`. */
  readonly change: string;
}

/** Every single-token mutation of `source`, in source order. */
export const mutants = (source: string): Mutant[] =>
  Array.from(source.matchAll(TOKEN)).flatMap((m) => {
    const tok = m[0];
    const at = m.index;
    const n = Number(tok);
    const repls = /^\d+$/.test(tok) ? [...(n > 0 ? [n - 1] : []), n + 1].map(String) : SWAPS[tok];
    const line = source.slice(0, at).split("\n").length;
    const kind: Mutant["kind"] = /^\d+$/.test(tok)
      ? "literal"
      : /[<>=!]/.test(tok)
        ? "comparison"
        : /[+-]/.test(tok)
          ? "arithmetic"
          : "boolean";
    return (repls ?? []).map((r) => ({
      kind,
      source: source.slice(0, at) + r + source.slice(at + tok.length),
      change: `line ${line}: ${JSON.stringify(tok)} -> ${JSON.stringify(r)}`,
    }));
  });

// ── Screen (runs in the scorer sandbox) ─────────────────────────────────────
/** stdin: [{source, tests}]; stdout: per job, null (no compile) or per-test true/false/"hang". */
const SCREEN_PY = `
import json, signal, sys
def _alarm(*_):
    raise TimeoutError()
signal.signal(signal.SIGALRM, _alarm)
def run(job):
    ns = {}
    try:
        exec(compile(job["source"], "<f>", "exec"), ns)
    except Exception:
        return None
    out = []
    for t in job["tests"]:
        signal.setitimer(signal.ITIMER_REAL, 0.1)
        try:
            exec(t, dict(ns))
            ok = True
        except TimeoutError:
            ok = "hang"
        except Exception:
            ok = False
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        out.append(ok)
        if ok == "hang":
            break
    return out
print(json.dumps([run(j) for j in json.load(sys.stdin)]))
`;

type Outcome = (boolean | "hang")[] | null;

let screenCache: Map<string, Mutant[]> | undefined;

/** Family id → its accepted mutants, in source order. One sandbox run for all families. */
const accepted = (): Map<string, Mutant[]> => {
  if (screenCache) return screenCache;
  const jobs = REFERENCES.flatMap((r) =>
    [r.source, ...mutants(r.source).map((m) => m.source)].map((source) => ({
      source,
      tests: [...r.shown, ...r.heldOut],
    })),
  );
  const res = spawnSync(
    "docker",
    sandboxArgs(`bench-author-${randomUUID()}`, 120, ["python3", "-c", SCREEN_PY]),
    { input: JSON.stringify(jobs), encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`codefix screen failed: ${res.stderr}`);
  const outcomes = JSON.parse(res.stdout) as Outcome[];
  screenCache = new Map();
  let k = 0;
  for (const r of REFERENCES) {
    const ref = outcomes[k++];
    if (!ref?.every((ok) => ok === true)) throw new Error(`${r.id}: reference fails its own tests`);
    const kept = mutants(r.source).filter(() => {
      const o = outcomes[k++];
      return (
        o !== null &&
        o !== undefined &&
        !o.includes("hang") &&
        o.slice(0, r.shown.length).includes(false)
      );
    });
    screenCache.set(r.id, kept);
  }
  return screenCache;
};

/**
 * The mutant for (family, seed): a kind, then a mutant of that kind, drawn from
 * the seed's stream (so plentiful literal mutants don't crowd out the rest),
 * distinct from lower seeds'.
 */
const chosen = (r: Reference, seed: number): Mutant => {
  const pool = accepted().get(r.id) ?? [];
  const taken = new Set(Array.from({ length: seed }, (_, s) => chosen(r, s).source));
  return screened(
    rngFor(r.id, seed),
    (rng) => {
      const kind = rng.pick([...new Set(pool.map((m) => m.kind))]);
      return rng.pick(pool.filter((m) => m.kind === kind));
    },
    (m) => (taken.has(m.source) ? "same mutant as a lower seed" : null),
  );
};

const build =
  (r: Reference) =>
  (seed: number): DataItem => {
    const m = chosen(r, seed);
    const meta = variantMeta(r.id, seed);
    const testFile = `${meta.name}.test.py`;
    const prompt =
      `${r.spec}\n\nThe implementation below has a bug: it fails at least one of the tests shown. ` +
      `Fix it so every test passes. The fixed function is also run against held-out tests of the same behavior, ` +
      `so fix the bug itself rather than special-casing these tests.\n\n` +
      `\`\`\`python\n${m.source}\n\`\`\`\n\nTests:\n\n\`\`\`python\n${r.shown.join("\n")}\n\`\`\`\n\n` +
      "Reply with only the corrected function in a ```python fenced block.";
    return {
      authored: {
        why: `${m.kind} mutation ${m.change}; ${r.shown.length} shown + ${r.heldOut.length} held-out tests`,
        item: { ...meta, category: "code", tier: 2, prompt, scorer: "code_exec", testFile },
      },
      gold: `\`\`\`python\n${r.source}\n\`\`\``,
      wrong: [`\`\`\`python\n${m.source}\n\`\`\``],
      testFile: { name: testFile, content: `${[...r.shown, ...r.heldOut].join("\n")}\n` },
    };
  };

export const codefixFamilies: readonly Family[] = REFERENCES.map((r) => ({
  id: r.id,
  build: build(r),
}));
