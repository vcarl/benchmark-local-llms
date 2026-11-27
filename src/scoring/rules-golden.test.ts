/**
 * Scoring-rules guard (docs/SCORING.md § Scoring rules version). The fixture's
 * cases run through the score-record computation; any change to the results
 * needs a new `history` entry under a bumped `SCORING_RULES`.
 *
 * `UPDATE_RULES_GOLDEN=1 npx vitest run src/scoring/rules-golden.test.ts`
 * rewrites `results` and records `history[SCORING_RULES]`. It refuses to
 * change the entry of a version already recorded unless the earlier results
 * are unchanged (cases only appended).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { expect, it } from "vitest";
import { stableStringify } from "../config/hashing.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { sha256Hex } from "../store/digest.js";
import { SCORING_RULES, type ScoreFields, scoreFields } from "./rules.js";

interface Golden {
  readonly cases: ReadonlyArray<{
    readonly name: string;
    readonly execution: Parameters<typeof scoreFields>[0];
    readonly scorer: ScorerConfig;
  }>;
  readonly results: ReadonlyArray<ScoreFields>;
  readonly history: Readonly<Record<string, string>>;
}

const FIXTURE = path.join(import.meta.dirname, "__fixtures__", "rules-golden.json");
const load = (): Golden => JSON.parse(readFileSync(FIXTURE, "utf8")) as Golden;

it("the scoring rules reproduce the golden corpus recorded for SCORING_RULES", async () => {
  const before = load();
  const computed = await Effect.runPromise(
    Effect.forEach(before.cases, (c) => scoreFields(c.execution, c.scorer)).pipe(
      Effect.provide(NodeContext.layer),
    ),
  );
  const digest = sha256Hex(stableStringify(computed));

  if (process.env["UPDATE_RULES_GOLDEN"] === "1") {
    const recorded = before.history[String(SCORING_RULES)];
    const appendedOnly =
      stableStringify(computed.slice(0, before.results.length)) === stableStringify(before.results);
    if (recorded !== undefined && recorded !== digest && !appendedOnly) {
      throw new Error(`rules ${SCORING_RULES} already recorded other results: bump SCORING_RULES`);
    }
    const history = { ...before.history, [String(SCORING_RULES)]: digest };
    writeFileSync(
      FIXTURE,
      `${JSON.stringify({ cases: before.cases, results: computed, history }, null, 2)}\n`,
    );
  }

  const golden = load();
  expect(computed).toEqual(golden.results);
  expect(golden.history[String(SCORING_RULES)]).toBe(digest);
  const keys = Object.keys(golden.history).map(Number);
  const first = keys[0] === 1 ? 1 : 2;
  expect(keys).toEqual(Array.from({ length: SCORING_RULES - first + 1 }, (_, i) => first + i));
  expect(new Set(Object.values(golden.history)).size).toBe(keys.length);
});

it("the golden corpus covers every failure kind", () => {
  const kinds = new Set(load().results.map((r) => r.failureKind));
  for (const k of [
    null,
    "wrong",
    "no_answer",
    "length_cutoff",
    "thinking_truncated",
    "loop",
    "scorer_error",
    "execution_error",
    "context_exceeded",
    "near_miss",
  ]) {
    expect(kinds).toContain(k);
  }
});
