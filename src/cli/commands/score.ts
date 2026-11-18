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
 * Clean break from the legacy format: a non-attempt / legacy file is never
 * re-scored. A single `--archive` of one fails with a clear error; in a batch
 * (repeated `--archive`, or `--stale`) it is named, skipped, and tallied, and
 * the batch continues. `score` never calls the LLM.
 *
 * Identity: the store path never touches identity. The corpus path RE-STAMPS
 * an attempt onto the current challenge identity (challengeHash, per-item
 * itemHash/scorerHash, attemptId + filename) only when the change was
 * scorer-only — same challenge id/version, a completed attempt, and the
 * archived items map 1:1 onto the resolved items with identical promptHash.
 * Anything else is re-scored with identity left as-recorded. The original
 * attemptId is kept in `restampedFrom`.
 *
 * `--stale` batch-processes every completed attempt in `--archive-dir` whose
 * challengeHash differs from its current challenge's, or that holds an
 * echoed-reasoning output not yet dropped (E-0007) (implies `--corpus`).
 */
import { Command, Options } from "@effect/cli";
import { type CommandExecutor, FileSystem, Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { rewriteAttempt } from "../../archive/attempt-writer.js";
import { scorerHash, writeBlob } from "../../archive/content-store.js";
import type { ResolvedChallenge } from "../../config/challenges.js";
import { loadChallenge, promptContent } from "../../config/challenges.js";
import { stableStringify } from "../../config/hashing.js";
import { aggregate } from "../../orchestration/run-challenge.js";
import { currentItems, loadAttemptArchive } from "../../report/load-attempts.js";
import { loadAttemptReconstruction } from "../../report/reconstruct.js";
import type { AttemptAggregate, AttemptManifest, ItemResult } from "../../schema/attempt.js";
import type { ScorerConfig } from "../../schema/scorer.js";
import { scoreOrFold } from "../../scoring/dispatch.js";
import { applyScore, dropEchoedReasoning } from "../../scoring/failure-kind.js";
import { makeLoggerLayer } from "../logger.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

const archiveOpt = Options.file("archive").pipe(
  Options.repeated,
  Options.withDescription("Attempt archive JSONL file to re-score in place (repeatable)"),
);

const staleOpt = Options.boolean("stale").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Re-score every completed attempt in --archive-dir whose challengeHash differs from its current challenge's, or that holds an output echoing truncated reasoning (implies --corpus)",
  ),
);

const archiveDirOpt = Options.directory("archive-dir").pipe(
  Options.withDefault("./benchmark-archive"),
  Options.withDescription("Archive directory scanned by --stale"),
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

// ── Per-item re-score ladder ─────────────────────────────────────────────────

export interface RescoreResult {
  readonly updated: ReadonlyArray<ItemResult>;
  /** Items actually re-scored via `scoreByConfig` (incl. execution-error → 0). */
  readonly rescored: number;
  /** Items kept at their stored score: promptHash drift + missing-prompt. */
  readonly drift: number;
  /** promptNames of the `drift` items — their scores came from an earlier scorer. */
  readonly kept: ReadonlyArray<string>;
  /** promptNames of lines whose item is no longer in the challenge (kept verbatim, unscored). */
  readonly retired: ReadonlyArray<string>;
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
 * Per item (an output echoing truncated reasoning is first dropped, E-0007):
 *   1. promptName missing in the challenge → with `retire` (same challenge
 *      version) the item is retired: line kept verbatim, listed in `retired`;
 *      otherwise keep stored score, +drift, warn.
 *   2. resolved promptHash ≠ archived promptHash (prompt text drifted) → keep
 *      stored score, +drift, warn. Guard is promptHash, NOT itemHash: a
 *      scorer-only edit (same promptHash, different itemHash) MUST be applied.
 *   3. archived execution error (error !== null) → score 0, +rescored.
 *   4. otherwise → scoreOrFold(output, scorer); a scorer error folds to 0.
 *
 * Re-scored items (3, 4) take the resolved item's `itemHash` and `scorerHash`,
 * so each line names the scorer that produced its score.
 */
export const rescoreItems = (
  items: ReadonlyArray<ItemResult>,
  challenge: ResolvedChallenge,
  retire = true,
): Effect.Effect<RescoreResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const byName = new Map(challenge.items.map((i) => [i.itemId, i]));
    const updated: ItemResult[] = [];
    const notes: string[] = [];
    const warnings: string[] = [];
    const kept: string[] = [];
    const retired: string[] = [];
    let rescored = 0;

    for (const stored of items) {
      const archived = dropEchoedReasoning(stored);
      const resolvedItem = byName.get(archived.promptName);
      if (resolvedItem === undefined && retire) {
        retired.push(archived.promptName);
        updated.push(stored);
        continue;
      }
      if (resolvedItem === undefined) {
        kept.push(archived.promptName);
        const note = `  warn ${archived.promptName}: not in challenge → kept stored score ${archived.score}`;
        notes.push(note);
        warnings.push(note);
        updated.push(stored);
        continue;
      }
      if (resolvedItem.promptHash !== archived.promptHash) {
        kept.push(archived.promptName);
        const note = `  warn ${archived.promptName}: promptHash drift (stored ${archived.promptHash} vs resolved ${resolvedItem.promptHash}) → kept stored score ${archived.score}`;
        notes.push(note);
        warnings.push(note);
        updated.push(stored);
        continue;
      }
      const current = {
        ...archived,
        itemHash: resolvedItem.itemHash,
        scorerHash: scorerHash(resolvedItem.scorer),
      };
      rescored += 1;
      if (archived.error !== null) {
        notes.push(`  ${archived.promptName}: execution error → score 0 (was ${archived.score})`);
        updated.push(applyScore(current, undefined));
        continue;
      }
      const scoreResult = yield* scoreOrFold(archived.output, resolvedItem.scorer, {
        promptName: archived.promptName,
      });
      if (scoreResult.score !== archived.score) {
        notes.push(
          `  ${archived.promptName}: ${archived.score} → ${scoreResult.score} (${scoreResult.details})`,
        );
      }
      updated.push(applyScore(current, scoreResult));
    }

    return { updated, rescored, drift: kept.length, kept, retired, notes, warnings };
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
    for (const stored of items) {
      const archived = dropEchoedReasoning(stored);
      const scorer = byId.get(archived.itemId);
      if (scorer === undefined) {
        updated.push(stored);
        continue;
      }
      rescored += 1;
      if (archived.error !== null) {
        updated.push(applyScore(archived, undefined));
        continue;
      }
      const r = yield* scoreOrFold(archived.output, scorer, { promptName: archived.promptName });
      if (r.score !== archived.score) {
        notes.push(`  ${archived.promptName}: ${archived.score} → ${r.score} (${r.details})`);
      }
      updated.push(applyScore(archived, r));
    }
    return { updated, rescored, drift: 0, kept: [], retired: [], notes, warnings: [] };
  });

/**
 * Record on the manifest which items kept a score from an earlier scorer
 * (prompt drift), or clear the record when every item was re-scored.
 */
export const withStaleScoreItems = (
  manifest: AttemptManifest,
  kept: ReadonlyArray<string>,
): AttemptManifest => {
  const { staleScoreItems: _prior, ...rest } = manifest;
  return kept.length === 0 ? rest : { ...rest, staleScoreItems: [...new Set(kept)] };
};

/** Record on the manifest which lines belong to retired items, or clear the record. */
const withRetiredItems = (
  manifest: AttemptManifest,
  retired: ReadonlyArray<string>,
): AttemptManifest => {
  const { retiredItems: _prior, ...rest } = manifest;
  return retired.length === 0 ? rest : { ...rest, retiredItems: [...new Set(retired)] };
};

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

// ── Re-stamp onto the current challenge identity ─────────────────────────────

/**
 * Why `manifest` + `items` may NOT be re-stamped onto `challenge`'s identity,
 * or `null` when the change since the run was scorer-only or a retirement:
 * same challenge id/version, a completed attempt whose attemptId embeds its
 * challengeHash, unique item names, and every resolved item present in the
 * archive with an identical promptHash. Archived items absent from the
 * challenge are retired items and do not block.
 */
export const restampBlocker = (
  manifest: AttemptManifest,
  items: ReadonlyArray<ItemResult>,
  challenge: ResolvedChallenge,
): string | null => {
  if (manifest.challengeId !== challenge.id || manifest.challengeVersion !== challenge.version) {
    return `challenge ${manifest.challengeId}@${manifest.challengeVersion} ≠ resolved ${challenge.id}@${challenge.version}`;
  }
  if (manifest.finishedAt === null || manifest.interrupted) return "attempt incomplete";
  if (manifest.attemptId.split("-")[2] !== manifest.challengeHash) {
    return "attemptId does not embed challengeHash";
  }
  // A resampled item has one line per sample; a duplicated (item, sample) is the defect.
  if (new Set(items.map((i) => `${i.promptName}#${i.sample ?? 0}`)).size !== items.length) {
    return "duplicate item names in archive";
  }
  const archived = new Map(items.map((i) => [i.promptName, i]));
  for (const r of challenge.items) {
    const a = archived.get(r.itemId);
    if (a === undefined) return `item ${r.itemId} missing from archive`;
    if (a.promptHash !== r.promptHash) return `promptHash drift on ${r.itemId}`;
  }
  return null;
};

/** Apply `challenge`'s identity to an eligible attempt (see {@link restampBlocker}). */
export const restamp = (
  manifest: AttemptManifest,
  items: ReadonlyArray<ItemResult>,
  challenge: ResolvedChallenge,
): { manifest: AttemptManifest; items: ReadonlyArray<ItemResult> } => {
  const byName = new Map(challenge.items.map((i) => [i.itemId, i]));
  const parts = manifest.attemptId.split("-");
  parts[2] = challenge.challengeHash;
  return {
    manifest: {
      ...manifest,
      attemptId: parts.join("-"),
      challengeHash: challenge.challengeHash,
      restampedFrom: manifest.restampedFrom ?? manifest.attemptId,
    },
    items: items.map((it) => {
      const r = byName.get(it.promptName);
      return r === undefined
        ? it
        : { ...it, itemHash: r.itemHash, scorerHash: scorerHash(r.scorer) };
    }),
  };
};

// ── Command ──────────────────────────────────────────────────────────────────

type Outcome = "restamped" | "rescored" | "skipped";

/**
 * Corpus re-score of one loaded attempt against the resolved challenge, with
 * the scorer-only re-stamp. A re-stamp first writes the current prompt/scorer
 * blobs, then atomically writes `<newAttemptId>.jsonl` and removes the old
 * file — an interruption between the two leaves the old (still stale) file,
 * which the next `--stale` pass re-stamps to the same name.
 */
const scoreFromCorpus = (
  archive: string,
  manifest: AttemptManifest,
  items: ReadonlyArray<ItemResult>,
  resolved: ResolvedChallenge,
  dryRun: boolean,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const { updated, rescored, drift, kept, retired, notes, warnings } = yield* rescoreItems(
      items,
      resolved,
      manifest.challengeVersion === resolved.version,
    );
    const live = currentItems({ retiredItems: retired }, updated);
    const agg = aggregate(live, resolved.passThreshold);
    const scored = withRetiredItems(
      withStaleScoreItems({ ...manifest, aggregate: agg }, kept),
      retired,
    );
    const archiveDir = pathSvc.dirname(archive);
    const current = manifest.challengeHash === resolved.challengeHash;
    const blocker = current ? null : restampBlocker(manifest, items, resolved);
    const outcome: Outcome = !current && blocker === null ? "restamped" : "rescored";

    // Dry-run shows every per-item note (incl. clean score changes); normal
    // mode surfaces only the drift/skip warnings.
    for (const note of dryRun ? notes : warnings) yield* printLine(note);
    if (retired.length > 0) {
      yield* printLine(`  retired (kept, unscored): ${retired.join(", ")}`);
    }

    // Re-scored items now name the current scorers; write their blobs first.
    if (!dryRun) {
      for (const r of resolved.items) {
        yield* writeBlob(archiveDir, "prompts", r.promptHash, promptContent(r.prompt));
        yield* writeBlob(archiveDir, "scorers", scorerHash(r.scorer), stableStringify(r.scorer));
      }
    }

    if (outcome === "restamped") {
      const next = restamp(scored, updated, resolved);
      const nextPath = pathSvc.join(archiveDir, `${next.manifest.attemptId}.jsonl`);
      yield* printLine(
        `  ${dryRun ? "would restamp" : "restamp"} ${manifest.attemptId} → ${next.manifest.attemptId}`,
      );
      if (!dryRun) {
        yield* rewriteAttempt(nextPath, next.manifest, next.items);
        if (nextPath !== archive) yield* fs.remove(archive);
      }
    } else {
      if (blocker !== null) {
        yield* printLine(`  no restamp (${blocker}); challengeHash kept as-recorded`);
      }
      if (!dryRun) yield* rewriteAttempt(archive, scored, updated);
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
    return outcome;
  });

const NOT_AN_ATTEMPT = "not an attempt archive";
const skippedNotAttempt = (file: string) =>
  printLine(
    `${file}: skipped — ${NOT_AN_ATTEMPT} (legacy run format; score reads attempt archives only)`,
  );

const scoreOne = (
  archive: string,
  opts: {
    challengesDir: string;
    challenge: Option.Option<string>;
    dryRun: boolean;
    corpus: boolean;
    /** Batch mode: record a skip reason instead of failing on a non-attempt file. */
    noteSkip: ((reason: string) => void) | null;
  },
) =>
  Effect.gen(function* () {
    const { dryRun } = opts;
    const loadedE = yield* loadAttemptArchive(archive).pipe(Effect.either);
    if (loadedE._tag === "Left") {
      if (opts.noteSkip === null) {
        return yield* Effect.fail(
          new Error(`${archive}: ${NOT_AN_ATTEMPT} (score no longer reads the legacy format)`),
        );
      }
      opts.noteSkip(NOT_AN_ATTEMPT);
      yield* skippedNotAttempt(archive);
      return "skipped" as Outcome;
    }
    const { manifest, items } = loadedE.right;

    // Store-primary path: v2 archive + no --corpus flag → re-score from content
    // store without needing corpus or challenge YAML on disk.
    if (!opts.corpus && manifest.schemaVersion >= 2) {
      const recon = yield* loadAttemptReconstruction(archive).pipe(
        Effect.mapError((e) => new Error(`${archive}: ${e.reason}`)),
      );
      const passThreshold = manifest.passThreshold ?? 1;
      const { updated, rescored, drift, kept, notes } = yield* rescoreItemsFromStore(
        items,
        recon.items,
      );
      const agg = aggregate(currentItems(manifest, updated), passThreshold);
      if (dryRun) {
        for (const note of notes) yield* printLine(note);
      } else {
        yield* rewriteAttempt(
          archive,
          withStaleScoreItems({ ...manifest, aggregate: agg }, kept),
          updated,
        );
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
      return "rescored" as Outcome;
    }

    // Corpus path: v1 archive, or --corpus → resolve the current challenge.
    const challengePath = Option.getOrElse(
      opts.challenge,
      () => `${opts.challengesDir}/${manifest.challengeId}.yaml`,
    );
    // Whole-archive fallback: an unresolvable challenge is a graceful no-op.
    const resolvedOpt = yield* loadChallenge(challengePath).pipe(Effect.either);
    if (resolvedOpt._tag === "Left") {
      yield* printLine(
        `score (fallback, no write): ${manifest.configId} × ${manifest.challengeId}@${manifest.challengeVersion} → challenge unresolvable (${challengePath}); archive left untouched`,
      );
      return "skipped" as Outcome;
    }
    return yield* scoreFromCorpus(archive, manifest, items, resolvedOpt.right, dryRun);
  });

/**
 * `--stale`: every completed attempt `.jsonl` in `archiveDir` whose
 * challengeHash differs from its current challenge's, or that holds an
 * echoed-reasoning output (E-0007), via the corpus path.
 * Non-attempt (legacy run) files are named and skipped; they and incomplete
 * and unresolvable attempts are tallied as skipped by reason.
 */
const scoreStale = (
  archiveDir: string,
  challengesDir: string,
  dryRun: boolean,
  tally: Record<Outcome | "current", number>,
  skipReasons: Map<string, number>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const skip = (reason: string) => {
      tally.skipped += 1;
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    };
    const files = (yield* fs.readDirectory(archiveDir)).filter((f) => f.endsWith(".jsonl")).sort();
    const challenges = new Map<string, ResolvedChallenge | null>();
    for (const f of files) {
      const archive = pathSvc.join(archiveDir, f);
      const loaded = yield* loadAttemptArchive(archive).pipe(Effect.either);
      if (loaded._tag === "Left") {
        skip(NOT_AN_ATTEMPT);
        yield* skippedNotAttempt(f);
        continue;
      }
      const { manifest, items } = loaded.right;
      if (manifest.finishedAt === null || manifest.interrupted) {
        skip("incomplete");
        continue;
      }
      if (!challenges.has(manifest.challengeId)) {
        const r = yield* loadChallenge(`${challengesDir}/${manifest.challengeId}.yaml`).pipe(
          Effect.either,
        );
        challenges.set(manifest.challengeId, r._tag === "Right" ? r.right : null);
      }
      const resolved = challenges.get(manifest.challengeId) ?? null;
      if (resolved === null) {
        skip("challenge unresolvable");
        continue;
      }
      // A current attempt is still stale while it holds an echoed-reasoning
      // output scored as an answer (E-0007).
      if (
        manifest.challengeHash === resolved.challengeHash &&
        items.every((i) => dropEchoedReasoning(i) === i)
      ) {
        tally.current += 1;
        continue;
      }
      yield* printLine(`${f}:`);
      tally[yield* scoreFromCorpus(archive, manifest, items, resolved, dryRun)] += 1;
    }
  });

export const scoreCommand = Command.make(
  "score",
  {
    archive: archiveOpt,
    stale: staleOpt,
    archiveDir: archiveDirOpt,
    challengesDir: challengesDirOpt,
    challenge: challengeOpt,
    dryRun: dryRunOpt,
    verbose: verboseOpt,
    corpus: corpusOpt,
  },
  ({ archive, stale, archiveDir, challengesDir, challenge, dryRun, verbose, corpus }) =>
    Effect.gen(function* () {
      if (archive.length === 0 && !stale) {
        return yield* Effect.fail(
          new Error("score: pass --archive <file> (repeatable) or --stale"),
        );
      }
      const tally: Record<Outcome | "current", number> = {
        restamped: 0,
        rescored: 0,
        skipped: 0,
        current: 0,
      };
      const skipReasons = new Map<string, number>();
      const noteSkip =
        archive.length > 1 || stale
          ? (reason: string) => skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1)
          : null;
      for (const a of archive) {
        tally[yield* scoreOne(a, { challengesDir, challenge, dryRun, corpus, noteSkip })] += 1;
      }
      if (stale) yield* scoreStale(archiveDir, challengesDir, dryRun, tally, skipReasons);
      if (stale || archive.length > 1) {
        const reasons = [...skipReasons].map(([r, n]) => `${r} ${n}`).join(", ");
        yield* printLine(
          `score${dryRun ? " (dry-run)" : ""}: ${tally.restamped} ${dryRun ? "would restamp" : "restamped"}, ${tally.rescored} rescored-only, ${tally.skipped} skipped${reasons === "" ? "" : ` (${reasons})`}${stale ? `, ${tally.current} already current` : ""}`,
        );
      }
    }).pipe(Effect.provide(makeLoggerLayer(verbose))),
).pipe(
  Command.withDescription(
    "Re-score attempt archives in place; --corpus re-stamps scorer-only changes onto the current challenge identity",
  ),
);
