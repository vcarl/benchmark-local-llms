/**
 * The scoring rules: everything between an execution line and its score that
 * is not the item's own scorer config. Output cleaning (an output that only
 * echoes truncated reasoning is no answer), errored executions left unscored,
 * scorer failures folded to a `scorer_error` zero, and failure-kind
 * classification.
 *
 * `SCORING_RULES` versions them; it enters every scorer blob, so a bump
 * re-identifies every scorer. The golden corpus test
 * (`rules-golden.test.ts`) fails on any behaviour change until the version is
 * bumped (docs/SCORING.md § Scoring rules version).
 *
 * Rules 1 produced the alpha (legacy) scores. Rules 2 adds format-flaw partial
 * credit and the exact_match `fallbackExtract`, scores a `code_exec` timeout as
 * a runtime failure, classifies `context_exceeded`, and runs code scorers in
 * the sandbox.
 */
import type { CommandExecutor } from "@effect/platform";
import { Effect, Schema } from "effect";
import { stableStringify } from "../config/hashing.js";
import { ScorerConfig } from "../schema/scorer.js";
import type { Execution } from "../store/bundle.js";
import { digestOf, sha256Hex } from "../store/digest.js";
import type { ScoreRecord } from "../store/scores.js";
import { scoreOrFold } from "./dispatch.js";
import { classifyFailure, echoesTruncatedReasoning } from "./failure-kind.js";
import { SANDBOX_IMAGE } from "./sandbox.js";

export const SCORING_RULES = 2;

/** Scorer blob bytes: `{ config, rules, runner? }`, `runner` only for code scorers. */
export const scorerBlob = (config: ScorerConfig): string =>
  stableStringify({
    config,
    rules: SCORING_RULES,
    ...(config.type === "code_exec" || config.type === "custom" ? { runner: SANDBOX_IMAGE } : {}),
  });

/** Decodes scorer blob bytes (JSON) back to `{ config, rules, runner? }`. */
export const ScorerBlob = Schema.parseJson(
  Schema.Struct({
    config: ScorerConfig,
    rules: Schema.Number,
    runner: Schema.optional(Schema.String),
  }),
);

export const scorerDigest = (config: ScorerConfig): string => sha256Hex(scorerBlob(config));

export type ScoreFields = Pick<
  ScoreRecord,
  "score" | "failureKind" | "details" | "nearMiss" | "breakdown"
>;

type Gradable = Pick<Execution, "item" | "output" | "reasoning" | "error" | "stopReason">;

/** Grade one execution under one scorer config: a pure function of the two. */
export const scoreFields = (
  execution: Gradable,
  scorer: ScorerConfig,
): Effect.Effect<ScoreFields, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const output =
      execution.output !== "" && echoesTruncatedReasoning(execution) ? "" : execution.output;
    const scored =
      execution.error === null
        ? yield* scoreOrFold(output, scorer, {
            promptName: execution.item.slice(execution.item.indexOf("/") + 1),
          })
        : undefined;
    const score = scored?.score ?? 0;
    return {
      score,
      failureKind: classifyFailure({ ...execution, output, score }, scored),
      details: scored?.details ?? null,
      nearMiss: scored?.nearMiss ?? null,
      breakdown: scored?.breakdown ?? null,
    };
  });

/** The score record for `execution` under `scorer`, keyed by execution × scorer digest. */
export const scoreRecord = (
  execution: Execution,
  scorer: ScorerConfig,
  stamp: { readonly harnessGitSha: string; readonly scoredAt: string },
): Effect.Effect<ScoreRecord, never, CommandExecutor.CommandExecutor> =>
  Effect.map(scoreFields(execution, scorer), (fields) => ({
    execution: digestOf(execution),
    scorer: scorerDigest(scorer),
    ...fields,
    ...stamp,
  }));
