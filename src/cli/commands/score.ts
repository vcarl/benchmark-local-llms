/**
 * `score` subcommand — re-score an existing attempt archive in place.
 *
 * Re-applies the resolved challenge's scorers to an attempt archive's stored
 * `output`s and writes the updated per-item `score`s + recomputed `aggregate`
 * back into the SAME file. This enables a tight scorer-iteration loop:
 *   edit a scorer → `./bench score --archive X` → `./bench report`
 * without re-running any model. There is no stdout score table — only a
 * one-line summary.
 *
 * Clean break from the legacy format: a non-attempt / legacy file produces a
 * clear error, not a re-score (mirrors Phase 4). `score` never calls the LLM.
 *
 * Identity is never rewritten: re-scoring with an edited scorer leaves
 * `challengeHash` (and every other identity / provenance field) as-recorded.
 * A clean identity requires a real re-run via `submit`. Accepted limitation.
 */
import { Command, Options } from "@effect/cli";
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { rewriteAttempt } from "../../archive/attempt-writer.js";
import type { ResolvedChallenge } from "../../config/challenges.js";
import { loadChallenge } from "../../config/challenges.js";
import { aggregate } from "../../orchestration/run-challenge.js";
import { loadAttemptArchive } from "../../report/load-attempts.js";
import { loadAttemptReconstruction } from "../../report/reconstruct.js";
import type { AttemptAggregate, AttemptManifest, ItemResult } from "../../schema/attempt.js";
import type { ScorerConfig } from "../../schema/scorer.js";
import { scoreByConfig } from "../../scoring/dispatch.js";
import type { PromptScore } from "../../scoring/score-result.js";
import { makeLoggerLayer } from "../logger.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

const archiveOpt = Options.file("archive").pipe(
  Options.withDescription("Path to the attempt archive JSONL file to re-score in place"),
);

const challengesDirOpt = Options.directory("challenges-dir").pipe(
  Options.withDefault("challenges"),
  Options.withDescription("Directory containing challenge YAML files"),
);

const challengeOpt = Options.file("challenge").pipe(
  Options.optional,
  Options.withDescription(
    "Override the auto-resolved challenge file (default: <challenges-dir>/<challengeId>.yaml)",
  ),
);

const dryRunOpt = Options.boolean("dry-run").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Compute and report changes but leave the archive byte-for-byte untouched",
  ),
);

const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

const corpusOpt = Options.boolean("corpus").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Apply the CURRENT corpus scorers (edit-iterate loop) instead of the archive's stored scorers",
  ),
);

/**
 * Rebuild an archived item with a fresh score and breakdown. The stale
 * `breakdown` from the archive is always dropped first; the new one is attached
 * only when present (constraint scorers), so a re-score that no longer yields a
 * breakdown (non-constraint scorer, or execution error) clears the old value.
 */
const withBreakdown = (
  archived: ItemResult,
  score: number,
  breakdown: PromptScore["breakdown"],
): ItemResult => {
  const { breakdown: _stale, ...rest } = archived;
  return { ...rest, score, ...(breakdown !== undefined ? { breakdown } : {}) };
};

// ── Per-item re-score ladder ─────────────────────────────────────────────────

export interface RescoreResult {
  readonly updated: ReadonlyArray<ItemResult>;
  /** Items actually re-scored via `scoreByConfig` (incl. execution-error → 0). */
  readonly rescored: number;
  /** Items kept at their stored score: promptHash drift + missing-prompt. */
  readonly drift: number;
  /** Per-item human-readable lines describing each non-trivial outcome. */
  readonly notes: ReadonlyArray<string>;
  /**
   * The subset of `notes` for items that were SKIPPED (kept their stored score
   * due to promptHash drift / missing-from-challenge). These are the lines an
   * operator needs in a normal (non-dry-run) re-score to see which/how-many
   * items were not re-applied; the rest of `notes` (clean score changes) is
   * informational detail reserved for `--dry-run`.
   */
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Apply the re-score ladder to every archived item against the resolved
 * challenge. The whole-archive (challenge-unresolvable) fallback is handled by
 * the caller BEFORE this runs; here the challenge is known-resolved.
 *
 * Per item:
 *   1. promptName missing in the challenge → keep stored score, +drift, warn.
 *   2. resolved promptHash ≠ archived promptHash (prompt text drifted) → keep
 *      stored score, +drift, warn. Guard is promptHash, NOT itemHash: a
 *      scorer-only edit (same promptHash, different itemHash) MUST be applied.
 *   3. archived execution error (error !== null) → score 0, +rescored.
 *   4. otherwise → scoreByConfig(output, scorer); a scorer error folds to 0.
 */
export const rescoreItems = (
  items: ReadonlyArray<ItemResult>,
  challenge: ResolvedChallenge,
): Effect.Effect<RescoreResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const byName = new Map(challenge.items.map((i) => [i.itemId, i]));
    const updated: ItemResult[] = [];
    const notes: string[] = [];
    const warnings: string[] = [];
    let rescored = 0;
    let drift = 0;

    for (const archived of items) {
      const resolvedItem = byName.get(archived.promptName);
      if (resolvedItem === undefined) {
        drift += 1;
        const note = `  warn ${archived.promptName}: not in challenge → kept stored score ${archived.score}`;
        notes.push(note);
        warnings.push(note);
        updated.push(archived);
        continue;
      }
      if (resolvedItem.promptHash !== archived.promptHash) {
        drift += 1;
        const note = `  warn ${archived.promptName}: promptHash drift (stored ${archived.promptHash} vs resolved ${resolvedItem.promptHash}) → kept stored score ${archived.score}`;
        notes.push(note);
        warnings.push(note);
        updated.push(archived);
        continue;
      }
      if (archived.error !== null) {
        rescored += 1;
        notes.push(`  ${archived.promptName}: execution error → score 0 (was ${archived.score})`);
        updated.push(withBreakdown(archived, 0, undefined));
        continue;
      }
      const scoreResult = yield* scoreByConfig(archived.output, resolvedItem.scorer, {
        promptName: archived.promptName,
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed<PromptScore>({ kind: "prompt", score: 0, details: "scorer error" }),
        ),
      );
      rescored += 1;
      if (scoreResult.score !== archived.score) {
        notes.push(
          `  ${archived.promptName}: ${archived.score} → ${scoreResult.score} (${scoreResult.details})`,
        );
      }
      updated.push(withBreakdown(archived, scoreResult.score, scoreResult.breakdown));
    }

    return { updated, rescored, drift, notes, warnings };
  });

/**
 * Re-score archived items using the scorer configs stored in the v2 content
 * store (no corpus or challenge YAML required). Each item's scorer is looked up
 * from `reconItems` by `itemId`. Items not found in the reconstruction are kept
 * as-is (treated as unexpectedly absent — should not happen for a well-formed v2
 * archive, but we degrade gracefully).
 */
export const rescoreItemsFromStore = (
  items: ReadonlyArray<ItemResult>,
  reconItems: ReadonlyArray<{ item: ItemResult; scorer: ScorerConfig }>,
): Effect.Effect<RescoreResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const byId = new Map(reconItems.map((r) => [r.item.itemId, r.scorer]));
    const updated: ItemResult[] = [];
    const notes: string[] = [];
    let rescored = 0;
    for (const archived of items) {
      const scorer = byId.get(archived.itemId);
      if (scorer === undefined) {
        updated.push(archived);
        continue;
      }
      if (archived.error !== null) {
        rescored += 1;
        updated.push(withBreakdown(archived, 0, undefined));
        continue;
      }
      const r = yield* scoreByConfig(archived.output, scorer, {
        promptName: archived.promptName,
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed<PromptScore>({ kind: "prompt", score: 0, details: "scorer error" }),
        ),
      );
      rescored += 1;
      if (r.score !== archived.score) {
        notes.push(`  ${archived.promptName}: ${archived.score} → ${r.score} (${r.details})`);
      }
      updated.push(withBreakdown(archived, r.score, r.breakdown));
    }
    return { updated, rescored, drift: 0, notes, warnings: [] };
  });

// ── Summary line ─────────────────────────────────────────────────────────────

export interface SummaryInput {
  readonly configId: string;
  readonly challengeId: string;
  readonly version: number;
  readonly aggregate: AttemptAggregate;
  readonly rescored: number;
  readonly total: number;
  readonly drift: number;
  readonly fallback: number;
  readonly dryRun: boolean;
}

export const formatSummary = (s: SummaryInput): string => {
  const verdict = s.aggregate.passed ? "PASS" : "FAIL";
  const counts = `[rescored ${s.rescored}/${s.total}, drift ${s.drift}, fallback ${s.fallback}]`;
  const prefix = s.dryRun ? "score (dry-run, no write): " : "score: ";
  return `${prefix}${s.configId} × ${s.challengeId}@${s.version} → aggregate ${s.aggregate.score.toFixed(3)} ${verdict}  ${counts}`;
};

// ── Command ──────────────────────────────────────────────────────────────────

export const scoreCommand = Command.make(
  "score",
  {
    archive: archiveOpt,
    challengesDir: challengesDirOpt,
    challenge: challengeOpt,
    dryRun: dryRunOpt,
    verbose: verboseOpt,
    corpus: corpusOpt,
  },
  ({ archive, challengesDir, challenge, dryRun, verbose, corpus }) =>
    Effect.gen(function* () {
      const loaded = yield* loadAttemptArchive(archive).pipe(
        Effect.mapError(
          () =>
            new Error(
              `${archive}: not an attempt archive (score no longer reads the legacy format)`,
            ),
        ),
      );
      const { manifest, items } = loaded;

      // Store-primary path: v2 archive + no --corpus flag → re-score from content
      // store without needing corpus or challenge YAML on disk.
      const useStore = corpus === false && manifest.schemaVersion === 2;
      if (useStore) {
        const recon = yield* loadAttemptReconstruction(archive).pipe(
          Effect.mapError((e) => new Error(`${archive}: ${e.reason}`)),
        );
        const passThreshold = manifest.passThreshold ?? 1;
        const { updated, rescored, drift, notes } = yield* rescoreItemsFromStore(
          items,
          recon.items,
        );
        const agg = aggregate(updated, passThreshold);
        const newManifest: AttemptManifest = { ...manifest, aggregate: agg };
        if (dryRun) {
          for (const note of notes) yield* printLine(note);
        } else {
          yield* rewriteAttempt(archive, newManifest, updated);
        }
        yield* printLine(
          formatSummary({
            configId: manifest.configId,
            challengeId: manifest.challengeId,
            version: manifest.challengeVersion,
            aggregate: agg,
            rescored,
            total: items.length,
            drift,
            fallback: 0,
            dryRun,
          }),
        );
        return;
      }

      // Corpus path: v1 archive, or v2 archive with --corpus flag → resolve the
      // current challenge from disk and re-score against it.
      const challengePath =
        challenge._tag === "Some"
          ? challenge.value
          : `${challengesDir}/${manifest.challengeId}.yaml`;

      // Whole-archive fallback: an unresolvable challenge (missing file or parse
      // failure) is a graceful no-op, not a hard error. Warn, leave the file
      // untouched, exit 0. Evaluated once, before the per-item loop.
      const resolvedOpt = yield* loadChallenge(challengePath).pipe(Effect.either);
      if (resolvedOpt._tag === "Left") {
        yield* printLine(
          `score (fallback, no write): ${manifest.configId} × ${manifest.challengeId}@${manifest.challengeVersion} → challenge unresolvable (${challengePath}); archive left untouched`,
        );
        return;
      }
      const resolved = resolvedOpt.right;

      const { updated, rescored, drift, notes, warnings } = yield* rescoreItems(items, resolved);
      const agg = aggregate(updated, resolved.passThreshold);
      const newManifest: AttemptManifest = { ...manifest, aggregate: agg };

      if (dryRun) {
        // Dry-run shows every per-item note (incl. clean score changes) so the
        // operator can preview the full effect before committing to a write.
        for (const note of notes) {
          yield* printLine(note);
        }
      } else {
        yield* rewriteAttempt(archive, newManifest, updated);
        // Normal mode still surfaces the drift/skip warnings so operators see
        // which/how-many items were not re-applied — not just the summary count.
        for (const warning of warnings) {
          yield* printLine(warning);
        }
      }

      yield* printLine(
        formatSummary({
          configId: manifest.configId,
          challengeId: manifest.challengeId,
          version: manifest.challengeVersion,
          aggregate: agg,
          rescored,
          total: items.length,
          drift,
          fallback: 0,
          dryRun,
        }),
      );
    }).pipe(Effect.provide(makeLoggerLayer(verbose))),
).pipe(
  Command.withDescription("Re-score an existing attempt archive in place against current scorers"),
);
