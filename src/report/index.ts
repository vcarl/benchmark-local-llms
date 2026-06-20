/**
 * Report generator entry point. Wires the attempt-archive pipeline:
 *
 *   loadAttemptArchives → aggregateAttempts → writeDataJs → writeDetails
 *
 * The CLI (D1) calls {@link runReport} and formats the returned
 * {@link ReportSummary} for the operator.
 *
 * Error surface: discovery (directory ENOENT, etc.) and the final write
 * propagate as `FileIOError`. Individual archive failures are collected in
 * `summary.loadIssues`, not raised.
 */
import path from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { FileIOError } from "../errors/index.js";
import { aggregateAttempts } from "./aggregate.js";
import { type AttemptLoadIssue, loadAttemptArchives } from "./load-attempts.js";
import type { WebappRecord } from "./webapp-contract.js";
import { writeDataJs } from "./write-data-js.js";
import { type DetailWriteResult, writeDetails } from "./write-details.js";

export interface ReportOptions {
  /** Directory containing `*.jsonl` archives to report on. */
  readonly archiveDir: string;
  /**
   * Output path for the webapp data file. Defaults to
   * `webapp/src/data/data.js` relative to the archive dir's parent.
   */
  readonly outputPath?: string;
  /** If true, skip the write step (useful for tests / dry-run). */
  readonly dryRun?: boolean;
}

export interface ReportSummary {
  readonly archiveDir: string;
  readonly outputPath: string;
  readonly attemptsLoaded: number;
  readonly recordCount: number;
  readonly loadIssues: ReadonlyArray<AttemptLoadIssue>;
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
  readonly dryRun: boolean;
  /** Records returned for caller inspection (tests, CLI preview). */
  readonly records: ReadonlyArray<WebappRecord>;
  readonly detailsWritten: number;
  readonly detailsSkipped: number;
}

const defaultOutputPath = (archiveDir: string): string => {
  const repoRoot = path.resolve(archiveDir, "..");
  return path.join(repoRoot, "webapp", "src", "data", "data.js");
};

const defaultDetailsDir = (outputPath: string): string => {
  // outputPath is .../webapp/src/data/data.js → details live at .../webapp/public/details
  const webappRoot = path.resolve(path.dirname(outputPath), "..", "..");
  return path.join(webappRoot, "public", "details");
};

/**
 * Top-level report command. Loads attempt archives, aggregates results,
 * writes `data.js`. Returns a {@link ReportSummary} for CLI formatting.
 */
export const runReport = (
  options: ReportOptions,
): Effect.Effect<ReportSummary, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const archiveDir = options.archiveDir;
    const outputPath = options.outputPath ?? defaultOutputPath(archiveDir);
    const dryRun = options.dryRun ?? false;

    const loaded = yield* loadAttemptArchives(archiveDir);
    const { records, dropped, detailSources } = aggregateAttempts(loaded.attempts);

    let details: DetailWriteResult = { written: 0, skipped: 0 };
    if (!dryRun) {
      yield* writeDataJs(outputPath, records);
      details = yield* writeDetails(defaultDetailsDir(outputPath), detailSources);
    }

    return {
      archiveDir,
      outputPath,
      attemptsLoaded: loaded.attempts.length,
      recordCount: records.length,
      loadIssues: loaded.issues,
      dropped,
      dryRun,
      records,
      detailsWritten: details.written,
      detailsSkipped: details.skipped,
    };
  });

export type { WebappRecord } from "./webapp-contract.js";
export { formatDataJs } from "./write-data-js.js";
