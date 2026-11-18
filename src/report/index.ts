/**
 * Report generator entry point. Wires the attempt-archive pipeline:
 *
 *   per dataset: loadAttemptArchives → buildRows + detailSources
 *   then: writeDataJs (every dataset) → writeDetails
 *
 * The CLI (D1) calls {@link runReport} and formats the returned
 * {@link ReportSummary} for the operator.
 *
 * Error surface: discovery (directory ENOENT, etc.) and the final write
 * propagate as `FileIOError`. Individual archive failures are collected in
 * `summary.loadIssues`, not raised.
 */
import path from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Clock, Effect, Option, Schema } from "effect";
import { listChallengeFiles, loadChallenge, type ResolvedChallenge } from "../config/challenges.js";
import { ErrataFile, ReleaseBaseline } from "../config/errata.js";
import { parseYaml } from "../config/yaml.js";
import type { FileIOError } from "../errors/index.js";
import type { HardwareProfile } from "../schema/run-manifest.js";
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

/** One archive directory scored against one challenge directory. */
export interface DatasetSource {
  readonly archiveDir: string;
  readonly challengesDir: string;
  readonly label: string;
}

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
  /**
   * Challenge YAML directory the item families and scopes are read from
   * (default `challenges`). An item it does not name — or a missing or
   * unloadable challenge — falls back to a singleton family and its
   * challenge's default scope.
   */
  readonly challengesDir?: string;
  /** Name of the dataset the rows describe (default {@link defaultDatasetLabel}). */
  readonly datasetLabel?: string;
  /**
   * Machine that attempts without a hardware profile (written before
   * schemaVersion 3) are attributed to. Default `{ id: "unknown" }`.
   */
  readonly legacyHardware?: { readonly id: string; readonly profile?: HardwareProfile };
  /** A second dataset emitted after the main one (the pilot set). */
  readonly pilot?: DatasetSource;
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
  /** The selected rows per dataset (`globalThis.__BENCHMARK_ROWS`), main first. */
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
 * The challenge set (the current challenge YAML), and item families read from
 * it — metadata, so archives need no re-score. An unloadable file is left out
 * of the set.
 */
const loadChallengeSet = (
  challengesDir: string,
): Effect.Effect<
  { challenges: ResolvedChallenge[]; familyOf: FamilyOf },
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const byItem = new Map<string, { family: string }>();
    const challenges: ResolvedChallenge[] = [];
    const files = yield* listChallengeFiles(challengesDir).pipe(Effect.orElseSucceed(() => []));
    for (const f of files) {
      const c = yield* loadChallenge(f.path).pipe(Effect.option);
      if (Option.isNone(c)) continue;
      challenges.push(c.value);
      for (const i of c.value.items) byItem.set(`${c.value.id}/${i.itemId}`, i);
    }
    const of = (challengeId: string, promptName: string) =>
      byItem.get(`${challengeId}/${promptName}`);
    return {
      challenges,
      familyOf: (challengeId, item) =>
        of(challengeId, item.promptName)?.family ?? singletonFamily(challengeId, item),
    };
  });

/** `challenges` → `main`; any other challenges directory names its own dataset. */
export const defaultDatasetLabel = (challengesDir: string): string => {
  const base = path.basename(path.resolve(challengesDir));
  return base === "challenges" ? "main" : base;
};

/**
 * Release label and errata ids that apply to the set: the `release-baseline.json`
 * and `errata.yaml` beside the challenges directory, when they name a set item.
 * A missing or unreadable file contributes nothing.
 */
const loadReleaseContext = (challengesDir: string, challenges: ReadonlyArray<ResolvedChallenge>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = path.dirname(path.resolve(challengesDir));
    const keys = new Set(
      challenges.flatMap((c) =>
        c.items.flatMap((i) => [`${c.id}/${i.itemId}`, `${c.id}/${i.parentItemId ?? i.itemId}`]),
      ),
    );
    const read = (f: string) => fs.readFileString(path.join(root, f)).pipe(Effect.option);
    const baselineSrc = yield* read("release-baseline.json");
    const baseline = Option.isNone(baselineSrc)
      ? Option.none()
      : yield* Effect.try(() => JSON.parse(baselineSrc.value) as unknown).pipe(
          Effect.flatMap(Schema.decodeUnknown(ReleaseBaseline)),
          Effect.option,
        );
    const errataSrc = yield* read("errata.yaml");
    const errata = Option.isNone(errataSrc)
      ? Option.none()
      : yield* parseYaml("errata.yaml", errataSrc.value).pipe(
          Effect.flatMap(Schema.decodeUnknown(ErrataFile)),
          Effect.option,
        );
    return {
      release: Option.match(baseline, {
        onNone: () => null,
        onSome: (b) => (Object.keys(b.items).some((k) => keys.has(k)) ? b.release : null),
      }),
      errata: Option.match(errata, {
        onNone: () => [],
        onSome: (e) => e.errata.filter((x) => x.items.some((k) => keys.has(k))).map((x) => x.id),
      }),
    };
  });

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
 * Top-level report command. Loads each dataset's attempt archives, selects
 * rows, writes `data.js` and the item details. Returns a {@link ReportSummary}
 * for CLI formatting.
 */
export const runReport = (
  options: ReportOptions,
): Effect.Effect<ReportSummary, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const outputPath = options.outputPath ?? defaultOutputPath(options.archiveDir);
    const dryRun = options.dryRun ?? false;
    const modelKeys = yield* loadModelKeys(options.configsPath ?? "configs.yaml");
    const generatedAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    const challengesDir = options.challengesDir ?? "challenges";
    const sources: DatasetSource[] = [
      {
        archiveDir: options.archiveDir,
        challengesDir,
        label: options.datasetLabel ?? defaultDatasetLabel(challengesDir),
      },
      ...(options.pilot === undefined ? [] : [options.pilot]),
    ];

    const datasets: RowsDataset[] = [];
    const issues: AttemptLoadIssue[] = [];
    const dropped = { incomplete: 0, duplicate: 0 };
    let attemptsLoaded = 0;
    let details: DetailWriteResult = { written: 0, skipped: 0 };
    const pending: {
      sources: ReturnType<typeof detailSources>["detailSources"];
      familyOf: FamilyOf;
    }[] = [];
    for (const src of sources) {
      const loaded = yield* loadAttemptArchives(src.archiveDir);
      const { challenges, familyOf } = yield* loadChallengeSet(src.challengesDir);
      const selection = detailSources(loaded.attempts);
      attemptsLoaded += loaded.attempts.length;
      issues.push(...loaded.issues);
      dropped.incomplete += selection.dropped.incomplete;
      dropped.duplicate += selection.dropped.duplicate;
      pending.push({ sources: selection.detailSources, familyOf });
      datasets.push(
        buildRows({
          attempts: loaded.attempts,
          challengeSet: challenges,
          dataset: {
            label: src.label,
            // Base names only: an absolute path would leak the operator's home directory.
            archiveDir: path.basename(path.resolve(src.archiveDir)),
            challengesDir: path.basename(path.resolve(src.challengesDir)),
            ...(yield* loadReleaseContext(src.challengesDir, challenges)),
          },
          legacyHardware: options.legacyHardware ?? { id: "unknown" },
          generatedAt,
          modelKeys,
        }),
      );
    }

    if (!dryRun) {
      yield* writeDataJs(outputPath, datasets);
      for (const p of pending) {
        const r = yield* writeDetails(defaultDetailsDir(outputPath), p.sources, p.familyOf);
        details = { written: details.written + r.written, skipped: details.skipped + r.skipped };
      }
    }

    return {
      archiveDir: options.archiveDir,
      outputPath,
      attemptsLoaded,
      loadIssues: issues,
      dropped,
      dryRun,
      detailsWritten: details.written,
      detailsSkipped: details.skipped,
      datasets,
    };
  });

export { formatDataJs } from "./write-data-js.js";
