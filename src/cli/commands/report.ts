/**
 * `report` subcommand: one snapshot per dataset manifest, written with its
 * detail files and the index into `--output` (D11). Delegates to `runReport`
 * in `src/report/`. A snapshot names the harness commit that built it, so the
 * build refuses a tree with tracked changes under the paths its rows depend
 * on; `--allow-dirty` builds anyway and marks the snapshot `harnessDirty`.
 */
import { Command, Options } from "@effect/cli";
import { Command as Proc } from "@effect/platform";
import { Effect, Either } from "effect";
import { ConfigError } from "../../errors/index.js";
import { gitSha } from "../../orchestration/run-loop.js";
import { type ReportSummary, runReport } from "../../report/index.js";
import { makeLoggerLayer } from "../logger.js";

/** One line per snapshot, then the detail and index counts. */
export const logSummary = (summary: ReportSummary): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (const { entry: e, written } of summary.snapshots)
      yield* Effect.logInfo(
        `report: ${e.dataset}${e.evalVersion === null ? "" : ` @ ${e.evalVersion}`}: ${e.rows} rows over ${e.challenges} challenges → ${e.digest}.json${written ? "" : " (unchanged)"}`,
      );
    yield* Effect.logInfo(
      `report: details ${summary.detailsWritten} written, ${summary.detailsSkipped} skipped (v1/no-store), ${summary.detailsPruned} pruned; index keeps ${summary.kept} earlier snapshot(s)`,
    );
  });

/** Tracked paths a snapshot's rows depend on. */
const HARNESS_PATHS = ["src", "releases", "datasets", "configs.yaml", "system-prompts.yaml"];

/** `git status --porcelain` lines of tracked changes under {@link HARNESS_PATHS}; a failed check counts as a change. */
const trackedChanges = Proc.lines(
  Proc.make("git", "status", "--porcelain", "--untracked-files=no", "--", ...HARNESS_PATHS),
).pipe(
  Effect.map((lines) => lines.filter((l) => l.trim() !== "")),
  Effect.catchAll(() => Effect.succeed(["(git status failed)"])),
);

/** Refuse a dirty harness tree unless `allowDirty`, which marks the snapshot instead. */
export const harnessTree = (
  dirty: ReadonlyArray<string>,
  allowDirty: boolean,
): Either.Either<{ harnessDirty: boolean }, ConfigError> =>
  dirty.length === 0 || allowDirty
    ? Either.right({ harnessDirty: dirty.length > 0 })
    : Either.left(
        new ConfigError({
          path: ".",
          message: `tracked changes the snapshot's rows depend on, so harnessGitSha would not reproduce it:\n${dirty.join("\n")}\ncommit them, or pass --allow-dirty for a development build marked harnessDirty`,
        }),
      );

const datasetsDir = Options.directory("datasets-dir").pipe(
  Options.withDescription("Directory of dataset manifests; one snapshot per manifest"),
  Options.withDefault("datasets"),
);
const store = Options.directory("store").pipe(
  Options.withDescription("Store holding bundles/ and scores/"),
  Options.withDefault("store"),
);
const releasesDir = Options.directory("releases-dir").pipe(
  Options.withDescription("Directory holding the release directories"),
  Options.withDefault("releases"),
);
const legacyRoot = Options.directory("legacy-root").pipe(
  Options.withDescription("Directory holding the legacy archives the manifests name"),
  Options.withDefault("."),
);
const output = Options.directory("output").pipe(
  Options.withDescription("Snapshot directory (index.json, <digest>.json, details/)"),
  Options.withDefault("webapp/public/snapshots"),
);
const configsFile = Options.file("configs-file").pipe(
  Options.withDescription("configs.yaml whose modelKey overrides apply"),
  Options.withDefault("configs.yaml"),
);
const allowDirty = Options.boolean("allow-dirty").pipe(
  Options.withDescription(
    "Build from a tree with tracked changes; the snapshot records harnessDirty: true and a -dirty sha",
  ),
  Options.withDefault(false),
);
const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

export const reportCommand = Command.make(
  "report",
  { datasetsDir, store, releasesDir, legacyRoot, output, configsFile, allowDirty, verbose },
  (args) =>
    Effect.gen(function* () {
      const { harnessDirty } = yield* harnessTree(yield* trackedChanges, args.allowDirty);
      const summary = yield* runReport({
        datasetsDir: args.datasetsDir,
        store: args.store,
        releasesDir: args.releasesDir,
        legacyRoot: args.legacyRoot,
        output: args.output,
        configsPath: args.configsFile,
        harnessGitSha: yield* gitSha,
        harnessDirty,
      });
      yield* logSummary(summary);
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(Command.withDescription("Build one snapshot per dataset manifest for the webapp"));
