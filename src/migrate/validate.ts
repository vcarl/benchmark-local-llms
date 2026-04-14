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
 */
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { loadManifest } from "../archive/loader.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import { aggregateArchive } from "../report/aggregate.js";

export interface ValidateResult {
  readonly archivePath: string;
  readonly resultsLoaded: number;
  readonly webappRecords: number;
  readonly unmatched: number;
}

/**
 * Round-trip a migrated archive: load + aggregate. Returns per-archive
 * counts for a post-migration sanity check.
 */
export const validateMigratedArchive = (
  archivePath: string,
): Effect.Effect<
  ValidateResult,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const archive = yield* loadManifest(archivePath);
    const agg = yield* aggregateArchive(archive, { scoringMode: "as-run" });
    return {
      archivePath,
      resultsLoaded: archive.results.length,
      webappRecords: agg.records.length,
      unmatched: agg.unmatched.length,
    };
  });
