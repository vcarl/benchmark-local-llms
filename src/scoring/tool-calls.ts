import type { ExpectedToolCall, ToolCallsConstraint } from "../schema/constraints.js";
import { deepEqual, extractAnswerJson } from "./constraint-checks.js";

/**
 * The `tool_calls` check (docs/SCORING.md § tool_calls). The answer is a JSON
 * list of `{name, arguments}` calls (a bare call counts as a one-element
 * list), matched against the key as a multiset by a full assignment search.
 * Binary per item, except that a correct answer passing an optional argument
 * explicitly at its declared default earns {@link EXPLICIT_DEFAULT_CREDIT}.
 */

/** Credit for an otherwise correct answer that passes an optional argument at its default. */
export const EXPLICIT_DEFAULT_CREDIT = 0.75;

export interface ToolCallsOutcome {
  readonly credit: number;
  readonly details: string;
  /** Nothing parseable to grade: never a correct abstention. */
  readonly noAnswer: boolean;
  /** `name.arg` of each optional argument passed at its default in the scored assignment. */
  readonly explicitDefaults: ReadonlyArray<string>;
}

interface Call {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}
type Match = { ok: true; defaults: string[] } | { ok: false; why: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isCall = (v: unknown): v is Call =>
  isObj(v) && Object.keys(v).length === 2 && typeof v["name"] === "string" && isObj(v["arguments"]);

const sameMultiset = (a: unknown, b: unknown): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = [...a];
  return b.every((x) => {
    const i = left.findIndex((y) => deepEqual(x, y));
    if (i === -1) return false;
    left.splice(i, 1);
    return true;
  });
};

/** `{ oneOf: [...] }` lists alternatives; any other value is the one accepted value. */
const alternatives = (expected: unknown): readonly unknown[] =>
  isObj(expected) && Object.keys(expected).length === 1 && Array.isArray(expected["oneOf"])
    ? expected["oneOf"]
    : [expected];

const show = (k: string, v: unknown) => `${k}=${JSON.stringify(v)}`;

const matchCall = (exp: ExpectedToolCall, act: Call): Match => {
  if (act.name !== exp.name) return { ok: false, why: `wrong-name ${act.name}` };
  const unordered = new Set(exp.unordered ?? []);
  for (const [k, want] of Object.entries(exp.arguments)) {
    if (!(k in act.arguments)) return { ok: false, why: `missing-arg ${k}` };
    const got = act.arguments[k];
    const eq = unordered.has(k) ? sameMultiset : deepEqual;
    if (!alternatives(want).some((alt) => eq(got, alt)))
      return { ok: false, why: `wrong-arg ${show(k, got)}` };
  }
  const defaults: string[] = [];
  for (const [k, got] of Object.entries(act.arguments)) {
    if (k in exp.arguments) continue;
    if (exp.optional === undefined || !(k in exp.optional))
      return { ok: false, why: `unexpected-arg ${k}` };
    if (!deepEqual(got, exp.optional[k])) return { ok: false, why: `wrong-arg ${show(k, got)}` };
    defaults.push(k);
  }
  return { ok: true, defaults };
};

/**
 * The assignment of expected to actual calls with the fewest explicit
 * defaults, or null when no bijection matches every call. Exhaustive
 * backtracking: answers hold a handful of calls.
 */
const bestAssignment = (m: Match[][]): { cost: number; assign: number[] } | null => {
  const n = m.length;
  let best: { cost: number; assign: number[] } | null = null;
  const assign: number[] = [];
  const used = new Set<number>();
  const go = (i: number, cost: number) => {
    if (best !== null && cost >= best.cost) return;
    if (i === n) {
      best = { cost, assign: [...assign] };
      return;
    }
    for (let j = 0; j < n; j++) {
      const r = m[i]?.[j];
      if (used.has(j) || r === undefined || !r.ok) continue;
      used.add(j);
      assign.push(j);
      go(i + 1, cost + r.defaults.length);
      assign.pop();
      used.delete(j);
    }
  };
  go(0, 0);
  return best;
};

const plural = (n: number) => `${n} call${n === 1 ? "" : "s"}`;

export const scoreToolCalls = (output: string, def: ToolCallsConstraint): ToolCallsOutcome => {
  const fail = (details: string, noAnswer = false): ToolCallsOutcome => ({
    credit: 0,
    details,
    noAnswer,
    explicitDefaults: [],
  });
  const parsed = extractAnswerJson(output);
  if (parsed === null) return fail("no parseable JSON answer", true);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.every(isCall)) return fail("answer is not a list of {name, arguments} calls");
  const actual = list as Call[];
  const expected = def.value;

  if (expected.length === 0)
    return actual.length === 0
      ? { credit: 1, details: "no call expected, none made", noAnswer: false, explicitDefaults: [] }
      : fail(`expected no call, got ${actual.length}: ${actual.map((c) => c.name).join(", ")}`);

  const m = expected.map((e) => actual.map((a) => matchCall(e, a)));
  const best = actual.length === expected.length ? bestAssignment(m) : null;
  if (best !== null) {
    const explicitDefaults: string[] = [];
    const parts = expected.map((e, i) => {
      const r = m[i]?.[best.assign[i] ?? -1];
      const d = r?.ok === true ? r.defaults : [];
      explicitDefaults.push(...d.map((k) => `${e.name}.${k}`));
      return d.length === 0
        ? `${e.name}: matched`
        : `${e.name}: matched (explicit default ${d.join(", ")})`;
    });
    return {
      credit: best.cost === 0 ? 1 : EXPLICIT_DEFAULT_CREDIT,
      details: `${expected.length}/${expected.length} calls matched: ${parts.join("; ")}`,
      noAnswer: false,
      explicitDefaults,
    };
  }

  // Diagnosis only: each expected call's best single outcome, ignoring the bijection.
  const parts = expected.map((e, i) => {
    const row = m[i] ?? [];
    if (row.some((r) => r.ok)) return `${e.name}: matched`;
    const sameName = row.find((r, j) => !r.ok && actual[j]?.name === e.name);
    return sameName !== undefined && !sameName.ok
      ? `${e.name}: ${sameName.why}`
      : `${e.name}: missing`;
  });
  const names = new Set(expected.map((e) => e.name));
  const extra = actual.filter((a) => !names.has(a.name)).map((a) => `unexpected ${a.name}`);
  const count =
    actual.length === expected.length
      ? "no assignment matches every call"
      : `expected ${plural(expected.length)}, got ${actual.length}`;
  return fail([count, ...parts, ...extra].join("; "));
};
