/**
 * Migration tool entry point (requirements §11). Wires the D3 pipeline:
 *
 *   discoverPrototypeFiles → readPrototypeFile → groupByModel
 *     → reconstructArchive (per group, using current YAML corpus)
 *     → writeMigratedArchive
 *     → validateMigratedArchive (in-process round-trip check)
 *
 * The CLI (D1) calls {@link runMigrate} with source/output directories and
 * the freshly-loaded current corpus (loaded via B1's YAML loaders). The
 * returned {@link MigrateSummary} reports archive counts, unmatched prompts,
 * invalid records, and per-archive validation.
 *
 * **Destructive-safe** (§11.2). This module only reads from `sourceDir` and
 * writes to `outputDir` — never modifies or deletes source files.
 */
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { type GroupKey, groupByModel, type InvalidRecord } from "./group-by-model.js";
import { discoverPrototypeFiles, type PrototypeFile, readPrototypeFile } from "./read-prototype.js";
import { reconstructArchive } from "./reconstruct-manifest.js";
import { type ValidateResult, validateMigratedArchive } from "./validate.js";
import { writeMigratedArchive } from "./write-migrated.js";

export interface MigrateOptions {
  /** Directory containing the prototype's `*.jsonl` files. */
  readonly sourceDir: string;
  /** Where to write migrated `{archiveId}.jsonl` archives. Must not be `sourceDir`. */
  readonly outputDir: string;
  /** Current prompt corpus from freshly-loaded YAML. */
  readonly currentPromptCorpus: ReadonlyArray<PromptCorpusEntry>;
  /** Current scenario corpus from freshly-loaded YAML. */
  readonly currentScenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
  /** Temperature to stamp on each reconstructed manifest. Default 0.7. */
  readonly temperature?: number;
  /** If true, skip the write + validate steps (plan only). */
  readonly dryRun?: boolean;
}

export interface MigratedArchiveSummary {
  readonly groupKey: GroupKey;
  readonly archiveId: string;
  readonly runId: string;
  readonly outputPath: string | null;
  readonly sourceRecords: number;
  readonly migratedResults: number;
  readonly unmatched: ReadonlyArray<{ readonly promptName: string }>;
  readonly validation: ValidateResult | null;
}

export interface MigrateSummary {
  readonly sourceDir: string;
  readonly outputDir: string;
  readonly filesRead: number;
  readonly readIssues: ReadonlyArray<{
    readonly path: string;
    readonly lineNumber: number;
    readonly reason: string;
  }>;
  readonly invalidRecords: ReadonlyArray<InvalidRecord>;
  readonly archives: ReadonlyArray<MigratedArchiveSummary>;
  readonly dryRun: boolean;
}

const indexByName = <T extends { readonly name: string }>(
  entries: ReadonlyArray<T>,
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const e of entries) out[e.name] = e;
  return out;
};

/**
 * Top-level migration driver. Reads the prototype directory end-to-end,
 * produces one migrated archive per `(model, runtime, quant)` group, and
 * returns a report for the CLI.
 */
export const runMigrate = (
  options: MigrateOptions,
): Effect.Effect<
  MigrateSummary,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    if (options.sourceDir === options.outputDir) {
      return yield* Effect.die(
        new Error(
          `sourceDir and outputDir must differ (both were ${options.sourceDir}); migration is destructive-safe`,
        ),
      );
    }

    const sources = yield* discoverPrototypeFiles(options.sourceDir);
    const files: PrototypeFile[] = [];
    const readIssues: Array<{ path: string; lineNumber: number; reason: string }> = [];
    for (const src of sources) {
      const f = yield* readPrototypeFile(src);
      files.push(f);
      for (const issue of f.issues) {
        readIssues.push({ path: src, lineNumber: issue.lineNumber, reason: issue.reason });
      }
    }

    const { groups, invalid } = groupByModel(files);
    const promptCorpus = indexByName(options.currentPromptCorpus);
    const scenarioCorpus = indexByName(options.currentScenarioCorpus);

    const archives: MigratedArchiveSummary[] = [];
    for (const group of groups) {
      const recon = yield* reconstructArchive({
        group,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

      if (options.dryRun === true) {
        archives.push({
          groupKey: group.key,
          archiveId: recon.archiveId,
          runId: recon.runId,
          outputPath: null,
          sourceRecords: group.records.length,
          migratedResults: recon.results.length,
          unmatched: recon.unmatched.map((u) => ({ promptName: u.promptName })),
          validation: null,
        });
        continue;
      }

      const outputPath = yield* writeMigratedArchive(
        options.outputDir,
        recon.archiveId,
        recon.manifest,
        recon.results,
      );
      const validation = yield* validateMigratedArchive(outputPath);

      archives.push({
        groupKey: group.key,
        archiveId: recon.archiveId,
        runId: recon.runId,
        outputPath,
        sourceRecords: group.records.length,
        migratedResults: recon.results.length,
        unmatched: recon.unmatched.map((u) => ({ promptName: u.promptName })),
        validation,
      });
    }

    return {
      sourceDir: options.sourceDir,
      outputDir: options.outputDir,
      filesRead: files.length,
      readIssues,
      invalidRecords: invalid,
      archives,
      dryRun: options.dryRun ?? false,
    };
  });
