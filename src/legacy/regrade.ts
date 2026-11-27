/**
 * Legacy executions graded through the score log, `<store>/scores/legacy.jsonl`,
 * which `./bench score --dataset <legacy dataset>` appends to. An archived
 * line counts for an item when its prompt matches (src/legacy/rows.ts); its
 * grade depends on the release:
 *
 * - An open release (the draft) grades every counted line like a v4
 *   execution: a score record under the item's full scorer digest at the
 *   dataset's eval version (scorer config, scoring rules version, sandbox
 *   runner), read from `release.json` and its blob.
 * - A closed release (alpha, `closed` in `release.json`) is archival: a line
 *   whose 12-hex `scorerHash` is the item's current one keeps its stored score,
 *   any other takes a record under the item's current scorer config. Its rows
 *   are pinned by the manifest's `rowsDigest` (src/report/index.ts).
 *
 * A legacy execution's identity in the log is {@link legacyExecutionDigest}:
 * the SHA-256 of its config, challenge, item, prompt, sample, executedAt and
 * what the scorer reads (output, reasoning, error, stopReason), so every
 * copy of one execution (a replay, a re-stamp) shares it.
 */
import { Effect, Schema } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import { SnapshotInvalid } from "../errors/index.js";
import { type Release, scorerDigestAt } from "../release/release.js";
import type { ItemResult } from "../schema/attempt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { SCORING_RULES, ScorerBlob, scorerBlob, scorerDigest } from "../scoring/rules.js";
import { digestOf } from "../store/digest.js";
import { readScores, type ScoreRecord } from "../store/scores.js";
import type { RowsInput } from "./rows.js";

/** The scoring rules version stored legacy scores were graded under. */
export const LEGACY_STORED_RULES = 1;

/** The score log's name under `<store>/scores/`. */
export const LEGACY_SCORE_LOG = "legacy";

export const legacyExecutionDigest = (
  configHash: string,
  challengeId: string,
  line: ItemResult,
): string =>
  digestOf({
    configHash,
    challengeId,
    itemId: line.itemId,
    promptHash: line.promptHash,
    sample: line.sample ?? 0,
    executedAt: line.executedAt,
    output: line.output,
    reasoning: line.reasoning,
    error: line.error,
    stopReason: line.stopReason ?? null,
  });

/** An item's grading scorer: its digest (the score record's key), config and sandbox runner. */
interface Scorer {
  readonly digest: string;
  readonly config: ScorerConfig;
  readonly runner: string | undefined;
  /** The scoring rules version in the scorer blob. */
  readonly rules: number;
}

/** A counted line the log holds no record for under its item's scorer. */
export interface Ungraded {
  readonly execution: string;
  readonly challengeId: string;
  readonly line: ItemResult;
  readonly scorer: Scorer;
}

/** Each item's scorer: `release.json`'s at `evalVersion` (open release), else the challenge YAML's. */
const scorersOf = (
  release: Release,
  evalVersion: string | null,
  challenges: ReadonlyArray<ResolvedChallenge>,
) =>
  Effect.gen(function* () {
    const out = new Map<string, Scorer>();
    for (const c of challenges)
      for (const i of c.items) {
        const key = `${c.id}/${i.itemId}`;
        if (release.file.closed !== undefined) {
          const blob = JSON.parse(scorerBlob(i.scorer)) as { runner?: string };
          out.set(key, {
            digest: scorerDigest(i.scorer),
            config: i.scorer,
            runner: blob.runner,
            rules: SCORING_RULES,
          });
          continue;
        }
        const digest = scorerDigestAt(release, evalVersion, key);
        const where = `${release.dir}/blobs/${digest}`;
        const bytes = digest === undefined ? undefined : release.blobs.get(digest);
        if (digest === undefined || bytes === undefined)
          return yield* Effect.fail(
            new SnapshotInvalid({ path: where, detail: `no scorer blob for ${key}` }),
          );
        const blob = yield* Schema.decodeUnknown(ScorerBlob)(bytes).pipe(
          Effect.mapError((e) => new SnapshotInvalid({ path: where, detail: e.message })),
        );
        if (blob.rules !== SCORING_RULES)
          return yield* Effect.fail(
            new SnapshotInvalid({
              path: where,
              detail: `scoring rules ${blob.rules}; this harness runs ${SCORING_RULES}`,
            }),
          );
        out.set(key, { digest, config: blob.config, runner: blob.runner, rules: blob.rules });
      }
    return out;
  });

/**
 * The rows' `grade` over the score log for `challenges` (the release's
 * current items), collecting every counted line it lacks a record for.
 */
export const legacyRegrader = (
  store: string,
  release: Release,
  evalVersion: string | null,
  challenges: ReadonlyArray<ResolvedChallenge>,
) =>
  Effect.gen(function* () {
    const records = yield* readScores(store, LEGACY_SCORE_LOG);
    const byKey = new Map(records.map((r) => [stableStringify([r.execution, r.scorer]), r]));
    const scorers = yield* scorersOf(release, evalVersion, challenges);
    const open = release.file.closed === undefined;
    const missing = new Map<string, Ungraded>();
    /** Sandbox runners of the scorer blobs whose records were used. */
    const runners = new Set<string>();
    /** Scoring rules versions of the grades used: a record's blob's, or {@link LEGACY_STORED_RULES} for a stored score. */
    const rules = new Set<number>();
    /** The line's record under its item's scorer; undefined when it keeps its stored score. */
    const lookup = (
      line: ItemResult,
      configHash: string,
      challengeId: string,
      currentScorerHash: string,
    ): ScoreRecord | Ungraded | undefined => {
      if (!open && line.scorerHash === currentScorerHash) return undefined;
      const scorer = scorers.get(`${challengeId}/${line.itemId}`);
      if (scorer === undefined) return undefined;
      const execution = legacyExecutionDigest(configHash, challengeId, line);
      const record = byKey.get(stableStringify([execution, scorer.digest]));
      if (record === undefined) return { execution, challengeId, line, scorer };
      if (scorer.runner !== undefined) runners.add(scorer.runner);
      rules.add(scorer.rules);
      return record;
    };
    const grade: NonNullable<RowsInput["grade"]> = (line, { configHash, challengeId, item }) => {
      const r = lookup(line, configHash, challengeId, item.scorerHash);
      if (r === undefined) {
        rules.add(LEGACY_STORED_RULES);
        return line;
      }
      if ("line" in r) {
        missing.set(r.execution, r);
        return line;
      }
      return r;
    };
    const configOf = (challengeId: string, itemId: string) =>
      scorers.get(`${challengeId}/${itemId}`)?.config;
    return { grade, lookup, configOf, missing, runners, rules };
  });
