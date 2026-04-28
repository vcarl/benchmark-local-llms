/**
 * Report generator entry point (requirements §7). Wires the D2 pipeline:
 *
 *   discoverArchives  → loadManifest (B2) → scoreExecution (B3)
 *                     → toWebappRecord → writeDataJs
 *
 * The CLI (D1) calls {@link runReport} and formats the returned
 * {@link ReportSummary} for the operator.
 *
 * Error surface: discovery (directory ENOENT, etc.) and the final write
 * propagate as `FileIOError`. Individual archive failures are collected in
 * `summary.loadIssues`, not raised. Scoring failures per-record fall back to
 * zero-score with a reason string (see `aggregate.safeScore`).
 */
import path from "node:path";
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { FileIOError } from "../errors/index.js";
import type { PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { aggregateAll } from "./aggregate.js";
import { loadAllArchives, type ReportLoadIssue } from "./load-archives.js";
import type { WebappRecord } from "./webapp-contract.js";
import { writeDataJs } from "./write-data-js.js";

export interface ReportOptions {
  /** Directory containing `*.jsonl` archives to report on. */
  readonly archiveDir: string;
  /**
   * Output path for the webapp data file. Defaults to
   * `webapp/src/data/data.js` relative to the archive dir's parent.
   */
  readonly outputPath?: string;
  /** Current prompt corpus (array; indexed by name internally). Required. */
  readonly currentPromptCorpus: ReadonlyArray<PromptCorpusEntry>;
  /** Current scenario corpus (array; indexed by name internally). Required. */
  readonly currentScenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
  /** If true, skip the write step (useful for tests / dry-run). */
  readonly dryRun?: boolean;
}

export interface ReportSummary {
  readonly archiveDir: string;
  readonly outputPath: string;
  readonly archivesLoaded: number;
  readonly recordCount: number;
  readonly loadIssues: ReadonlyArray<ReportLoadIssue>;
  readonly dropped: { readonly promptAbsent: number; readonly promptDrifted: number };
  readonly dryRun: boolean;
  /** Records returned for caller inspection (tests, CLI preview). */
  readonly records: ReadonlyArray<WebappRecord>;
}

const asIndex = <T extends { readonly name: string }>(
  entries: ReadonlyArray<T>,
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const e of entries) out[e.name] = e;
  return out;
};

const defaultOutputPath = (archiveDir: string): string => {
  const repoRoot = path.resolve(archiveDir, "..");
  return path.join(repoRoot, "webapp", "src", "data", "data.js");
};

/**
 * Top-level report command. Loads archives, scores results against the
 * current on-disk corpus, writes `data.js`. Returns a {@link ReportSummary}
 * for CLI formatting.
 */
export const runReport = (
  options: ReportOptions,
): Effect.Effect<
  ReportSummary,
  FileIOError,
  FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const archiveDir = options.archiveDir;
    const outputPath = options.outputPath ?? defaultOutputPath(archiveDir);
    const dryRun = options.dryRun ?? false;

    const loaded = yield* loadAllArchives(archiveDir);

    const currentPromptCorpus = asIndex(options.currentPromptCorpus);
    const currentScenarioCorpus = asIndex(options.currentScenarioCorpus);

    const { records, dropped } = yield* aggregateAll({
      archives: loaded.archives,
      currentPromptCorpus,
      currentScenarioCorpus,
    });

    if (!dryRun) {
      yield* writeDataJs(outputPath, records);
    }

    return {
      archiveDir,
      outputPath,
      archivesLoaded: loaded.archives.length,
      recordCount: records.length,
      loadIssues: loaded.issues,
      dropped,
      dryRun,
      records,
    };
  });

export type { WebappRecord } from "./webapp-contract.js";
export { formatDataJs } from "./write-data-js.js";
