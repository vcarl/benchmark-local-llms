/**
 * `report` subcommand — loads attempt archives and emits the webapp's
 * `data.js` file. Delegates to `runReport` (D2) in `src/report/`.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import { FileIOError } from "../../errors/index.js";
import { hardwareId, probeHardware } from "../../orchestration/hardware.js";
import { type ReportSummary, runReport } from "../../report/index.js";
import { makeLoggerLayer } from "../logger.js";

/**
 * Emit the audit block for a completed report run.
 *
 * Always prints — even when all counters are zero — so operators have a clear
 * read on what was loaded, what was dropped and why, and what was written.
 *
 * Line 1: how many attempts were loaded
 * Line 2: how many results were dropped (and why)
 * Line 3: where data.js was written, then one line per dataset
 */
export const logAuditBlock = (summary: ReportSummary): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`report: loaded ${summary.attemptsLoaded} attempts`);
    yield* Effect.logInfo(
      `report: dropped ${summary.dropped.incomplete} (incomplete), ${summary.dropped.duplicate} (duplicate)`,
    );
    yield* Effect.logInfo(`report: wrote ${summary.outputPath}`);
    for (const d of summary.datasets)
      yield* Effect.logInfo(
        `report: dataset ${d.dataset.label}: ${d.rows.length} rows over ${d.challengeSet.length} challenges`,
      );
    yield* Effect.logInfo(
      `report: details ${summary.detailsWritten} written, ${summary.detailsSkipped} skipped (v1/no-store)`,
    );
  });

/**
 * True when a {@link FileIOError} indicates the archive directory itself is
 * missing (rather than a per-file load failure). The archive-dir read is the
 * first filesystem op `runReport` performs; ENOENT / NotFound here usually
 * means the operator hasn't run `./bench migrate` yet.
 */
export const isMissingArchiveDirError = (err: FileIOError): boolean =>
  err.operation === "readDirectory" && /ENOENT|NotFound/i.test(String(err.cause));

export const missingArchiveDirHint = (archiveDir: string): string =>
  `No archive directory at '${archiveDir}'. Run './bench migrate' to create ` +
  "archives from benchmark-execution/, or pass --archive-dir to point at an existing directory.";

const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Archive directory to scan"),
  Options.withDefault("./benchmark-archive"),
);

const output = Options.directory("output").pipe(
  Options.withDescription("Output directory for data.js (e.g. webapp/src/data)"),
  Options.withDefault("./webapp/src/data"),
);

const challengesDir = Options.directory("challenges-dir").pipe(
  Options.withDescription("Challenge YAML directory the item families are read from"),
  Options.withDefault("challenges"),
);

const datasetLabel = Options.text("dataset-label").pipe(
  Options.withDescription(
    "Name of the dataset the rows describe (default: main for ./challenges, else the challenges dir name)",
  ),
  Options.optional,
);

const legacyHardware = Options.text("legacy-hardware").pipe(
  Options.withDescription(
    "Machine for attempts without a hardware profile: 'local' (this machine), 'unknown', or a hardwareId",
  ),
  Options.withDefault("local"),
);

/** `--legacy-hardware` → the machine pre-schemaVersion-3 attempts are attributed to. */
export const resolveLegacyHardware = (value: string) =>
  value === "local"
    ? Effect.map(probeHardware, (profile) => ({ id: hardwareId(profile), profile }))
    : Effect.succeed({ id: value });

const noPilot = Options.boolean("no-pilot").pipe(
  Options.withDescription(
    "Emit only the main dataset (default: also <archive-dir>-next scored against <challenges-dir>-next as pilot1, when both exist)",
  ),
  Options.withDefault(false),
);

/** Label of the pilot dataset `bench report` adds beside the main one. */
export const PILOT_LABEL = "pilot1";

/** The pilot dataset: `<archive-dir>-next` against `<challenges-dir>-next`, when both exist. */
export const pilotSource = (archiveDir: string, challengesDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const strip = (d: string) => d.replace(/\/+$/, "");
    const pilot = {
      archiveDir: `${strip(archiveDir)}-next`,
      challengesDir: `${strip(challengesDir)}-next`,
      label: PILOT_LABEL,
    };
    const exists = (d: string) => fs.exists(d).pipe(Effect.orElseSucceed(() => false));
    return (yield* exists(pilot.archiveDir)) && (yield* exists(pilot.challengesDir))
      ? pilot
      : undefined;
  });

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

export const reportCommand = Command.make(
  "report",
  { archiveDir, output, challengesDir, datasetLabel, legacyHardware, noPilot, verbose },
  (args) =>
    Effect.gen(function* () {
      const outputPath = path.join(args.output, "data.js");
      const pilot = args.noPilot
        ? undefined
        : yield* pilotSource(args.archiveDir, args.challengesDir);

      const summary = yield* runReport({
        archiveDir: args.archiveDir,
        outputPath,
        challengesDir: args.challengesDir,
        ...Option.match(args.datasetLabel, {
          onNone: () => ({}),
          onSome: (datasetLabel) => ({ datasetLabel }),
        }),
        legacyHardware: yield* resolveLegacyHardware(args.legacyHardware),
        ...(pilot === undefined ? {} : { pilot }),
      }).pipe(
        Effect.tapError((err) =>
          err instanceof FileIOError && isMissingArchiveDirError(err)
            ? Effect.logError(missingArchiveDirHint(args.archiveDir))
            : Effect.void,
        ),
      );

      if (summary.loadIssues.length > 0) {
        yield* Effect.logWarning(`report: ${summary.loadIssues.length} archive load issue(s)`);
      }
      yield* logAuditBlock(summary);
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(Command.withDescription("Generate webapp report data from archive files"));
