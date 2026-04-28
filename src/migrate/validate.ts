/**
 * Lightweight post-migration validation: load each migrated archive via B2's
 * loader, re-score via D2, and confirm it produces the expected record count.
 *
 * A full Python-prototype byte-diff comparison (requirements §11.1 step 4) is
 * deferred to the F2 verification phase — it requires running the Python
 * `report.py --report-only` as a subprocess and diffing webapp output, which
 * the task spec explicitly says we should "log a warning and skip" if it
 * can't be wired up cleanly here. This module does the in-process checks:
 *
 *   - Does the archive we just wrote round-trip through the loader?
 *   - Does D2's aggregator produce one record per (matched) prototype record?
 *
 * Anything finer-grained than that is an F2 concern.
 *
 * Hash-drift note: the aggregator now filters out results whose hash differs
 * from the current corpus. For validation purposes, we want to verify that
 * the archive is internally consistent (loads + scores), not that its hashes
 * match the *current* on-disk corpus. So we build a synthetic "current corpus"
 * from the manifest's embedded entries, patching each entry's hash to match
 * the corresponding result's stored hash. This makes validation
 * self-contained and hash-agnostic.
 */
import { type CommandExecutor, FileSystem, type Path } from "@effect/platform";
import { Effect } from "effect";
import { loadManifest } from "../archive/loader.js";
import { FileIOError, type JsonlCorruptLine } from "../errors/index.js";
import { aggregateAll } from "../report/aggregate.js";
import type { PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";

export interface ValidateResult {
  readonly archivePath: string;
  readonly resultsLoaded: number;
  readonly webappRecords: number;
  readonly dropped: number;
}

/**
 * Round-trip a migrated archive: load + aggregate. Returns per-archive
 * counts for a post-migration sanity check.
 *
 * To avoid hash-drift false positives (a migrated archive may carry a
 * prototype-era promptHash that differs from the current corpus), we build
 * a corpus whose hashes are patched to match each result's stored hash. This
 * is correct for validation: we're checking structural consistency, not
 * corpus currency.
 */
export const validateMigratedArchive = (
  archivePath: string,
): Effect.Effect<
  ValidateResult,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const archive = yield* loadManifest(archivePath);
    const stat = yield* fs.stat(archivePath).pipe(
      Effect.mapError(
        (cause) =>
          new FileIOError({
            path: archivePath,
            operation: "stat-archive",
            cause: String(cause),
          }),
      ),
    );
    const mtime = stat.mtime._tag === "Some" ? stat.mtime.value : new Date(0);

    // Build a patched corpus: for each result, override the manifest entry's
    // hash to match what the result actually stored, so the aggregator won't
    // filter it out due to hash drift. Results whose promptName has no matching
    // manifest entry are intentionally left out of the corpus — the aggregator
    // will count them as promptAbsent, which is the correct behavior: it
    // indicates a real archive defect, not a corpus-currency issue.
    const promptCorpus: Record<string, PromptCorpusEntry> = {};
    const scenarioCorpus: Record<string, ScenarioCorpusEntry> = {};

    for (const result of archive.results) {
      if (result.scenarioName !== null) {
        const entry = archive.manifest.scenarioCorpus[result.promptName];
        if (entry !== undefined) {
          scenarioCorpus[result.promptName] = {
            ...entry,
            scenarioHash: result.scenarioHash ?? entry.scenarioHash,
          };
        }
      } else {
        const entry = archive.manifest.promptCorpus[result.promptName];
        if (entry !== undefined) {
          promptCorpus[result.promptName] = {
            ...entry,
            promptHash: result.promptHash,
          };
        }
      }
    }

    const agg = yield* aggregateAll({
      archives: [{ path: archivePath, mtime, data: archive }],
      currentPromptCorpus: promptCorpus,
      currentScenarioCorpus: scenarioCorpus,
    });
    return {
      archivePath,
      resultsLoaded: archive.results.length,
      webappRecords: agg.records.length,
      dropped: agg.dropped.promptAbsent + agg.dropped.promptDrifted,
    };
  });
