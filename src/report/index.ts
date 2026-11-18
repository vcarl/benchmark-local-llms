/**
 * Report generator entry point. Wires the attempt-archive pipeline:
 *
 *   loadAttemptArchives → buildRows + detailSources → writeDataJs → writeDetails
 *
 * The CLI (D1) calls {@link runReport} and formats the returned
 * {@link ReportSummary} for the operator.
 *
 * Errors are typed: only `FileIOError` from `writeDataJs` / directory listing
 * propagates. Per-file or per-line archive problems are collected in
 * `summary.loadIssues`, not raised.
 */
import path from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Clock, Effect, Option } from "effect";
import { listChallengeFiles, loadChallenge, type ResolvedChallenge } from "../config/challenges.js";
import { parseYaml } from "../config/yaml.js";
import type { FileIOError } from "../errors/index.js";
import { detailSources } from "./aggregate.js";
import { type AttemptLoadIssue, loadAttemptArchives } from "./load-attempts.js";
import { modelKeyOverrides } from "./model-key.js";
import { buildRows, type RowsDataset } from "./rows.js";
import { writeDataJs } from "./write-data-js.js";
import {
  type DetailWriteResult,
  type FamilyOf,
  singletonFamily,
  writeDetails,
} from "./write-details.js";

export interface ReportOptions {
  /** Directory containing `*.jsonl` archives to report on. */
  readonly archiveDir: string;
  /**
   * Output path for `data.js`. Defaults to `<repo>/webapp/src/data/data.js`
   * relative to the archive directory's parent.
   */
  readonly outputPath?: string;
  /** If true, skip the write step (useful for tests / dry-run). */
  readonly dryRun?: boolean;
  /** Challenge YAML directory the challenge set is read from (default `challenges`). */
  readonly challengesDir?: string;
  /** `configs.yaml` whose `modelKey` overrides apply (default `configs.yaml`; missing = none). */
  readonly configsPath?: string;
}

export interface ReportSummary {
  readonly archiveDir: string;
  readonly outputPath: string;
  readonly attemptsLoaded: number;
  readonly loadIssues: ReadonlyArray<AttemptLoadIssue>;
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
  readonly dryRun: boolean;
  readonly detailsWritten: number;
  readonly detailsSkipped: number;
  /** The selected rows per dataset (`globalThis.__BENCHMARK_ROWS`). */
  readonly datasets: ReadonlyArray<RowsDataset>;
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
 * The challenge set (every challenge loadable from the directory), and item
 * families read from it — metadata, so archives need no re-score. An
 * unloadable file is left out of the set; an item it does not name falls back
 * to a singleton family.
 */
const loadChallengeSet = (
  challengesDir: string,
): Effect.Effect<
  { challenges: ResolvedChallenge[]; familyOf: FamilyOf },
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const byItem = new Map<string, string>();
    const challenges: ResolvedChallenge[] = [];
    const files = yield* listChallengeFiles(challengesDir).pipe(Effect.orElseSucceed(() => []));
    for (const f of files) {
      const c = yield* loadChallenge(f.path).pipe(Effect.option);
      if (Option.isNone(c)) continue;
      challenges.push(c.value);
      for (const i of c.value.items) byItem.set(`${c.value.id}/${i.itemId}`, i.family);
    }
    return {
      challenges,
      familyOf: (challengeId, item) =>
        byItem.get(`${challengeId}/${item.promptName}`) ?? singletonFamily(challengeId, item),
    };
  });

/** `challenges` → `main`; any other challenges directory names its own dataset. */
export const defaultDatasetLabel = (challengesDir: string): string => {
  const base = path.basename(path.resolve(challengesDir));
  return base === "challenges" ? "main" : base;
};

/** `artifact → modelKey` from a `configs.yaml`; a missing or unparseable file gives none. */
const loadModelKeys = (configsPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const src = yield* fs.readFileString(configsPath).pipe(Effect.option);
    if (Option.isNone(src)) return new Map<string, string>();
    const parsed = yield* parseYaml(configsPath, src.value).pipe(Effect.option);
    return modelKeyOverrides(Option.getOrUndefined(parsed));
  });

/**
 * Top-level report command. Loads the attempt archives, selects rows, writes
 * `data.js` and the item details. Returns a {@link ReportSummary} for CLI
 * formatting.
 */
export const runReport = (
  options: ReportOptions,
): Effect.Effect<ReportSummary, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const archiveDir = options.archiveDir;
    const outputPath = options.outputPath ?? defaultOutputPath(archiveDir);
    const dryRun = options.dryRun ?? false;
    const challengesDir = options.challengesDir ?? "challenges";

    const loaded = yield* loadAttemptArchives(archiveDir);
    const { challenges, familyOf } = yield* loadChallengeSet(challengesDir);
    const selection = detailSources(loaded.attempts);
    const datasets = [
      buildRows({
        attempts: loaded.attempts,
        challengeSet: challenges,
        dataset: {
          label: defaultDatasetLabel(challengesDir),
          // Base names only: an absolute path would leak the operator's home directory.
          archiveDir: path.basename(path.resolve(archiveDir)),
          challengesDir: path.basename(path.resolve(challengesDir)),
          release: null,
          errata: [],
        },
        generatedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
        modelKeys: yield* loadModelKeys(options.configsPath ?? "configs.yaml"),
      }),
    ];

    let details: DetailWriteResult = { written: 0, skipped: 0 };
    if (!dryRun) {
      yield* writeDataJs(outputPath, datasets);
      details = yield* writeDetails(
        defaultDetailsDir(outputPath),
        selection.detailSources,
        familyOf,
      );
    }

    return {
      archiveDir,
      outputPath,
      attemptsLoaded: loaded.attempts.length,
      loadIssues: loaded.issues,
      dropped: selection.dropped,
      dryRun,
      detailsWritten: details.written,
      detailsSkipped: details.skipped,
      datasets,
    };
  });

export { formatDataJs } from "./write-data-js.js";
