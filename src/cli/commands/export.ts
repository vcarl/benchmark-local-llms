/**
 * `export` subcommand — bundle an attempt archive + its content blobs into a
 * self-contained directory or tarball.
 *
 * The exported bundle (directory or .tar.gz) contains:
 *   <attemptId>.jsonl
 *   content/prompts/<promptHash>.txt      (one per item)
 *   content/scorers/<scorerHash>.json     (one per item)
 *   content/system/<configHash>.txt       (once, from manifest)
 *
 * The bundle is self-sufficient: `loadAttemptReconstruction` can read it
 * without any access to the original archive directory.
 *
 * Requires a v2 archive (schemaVersion === 2). v1 archives have no content
 * store and cannot be exported.
 */
import { Args, Command, Options } from "@effect/cli";
import {
  type CommandExecutor,
  FileSystem,
  Path,
  Command as PlatformCommand,
} from "@effect/platform";
import { Effect, Stream } from "effect";
import { readBlob, writeBlob } from "../../archive/content-store.js";
import { loadAttemptArchive } from "../../report/load-attempts.js";
import { makeLoggerLayer } from "../logger.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

// ── Core helper (exported for testing) ──────────────────────────────────────

/**
 * Copy an attempt jsonl and all its referenced content blobs from the archive
 * directory into `outDir`. Returns the list of paths written into `outDir`.
 *
 * Fails with `Error` if the archive is not a v2 archive (schemaVersion !== 2).
 */
export const exportBundle = (
  archiveFile: string,
  outDir: string,
): Effect.Effect<ReadonlyArray<string>, Error, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    const loaded = yield* loadAttemptArchive(archiveFile).pipe(
      Effect.mapError((issue) => new Error(`${archiveFile}: ${issue.reason}`)),
    );
    const { manifest, items } = loaded;

    if (manifest.schemaVersion !== 2) {
      return yield* Effect.fail(
        new Error(`${archiveFile}: v1 archive has no content store; export requires a v2 archive`),
      );
    }

    const archiveDir = pathSvc.dirname(archiveFile);
    const written: string[] = [];

    // Ensure output directory exists
    yield* fs
      .makeDirectory(outDir, { recursive: true })
      .pipe(Effect.mapError((cause) => new Error(`mkdir ${outDir}: ${String(cause)}`)));

    // Copy the jsonl file
    const jsonlBasename = pathSvc.basename(archiveFile);
    const jsonlDest = pathSvc.join(outDir, jsonlBasename);
    const jsonlContent = yield* fs
      .readFileString(archiveFile)
      .pipe(Effect.mapError((cause) => new Error(`read ${archiveFile}: ${String(cause)}`)));
    yield* fs
      .writeFileString(jsonlDest, jsonlContent)
      .pipe(Effect.mapError((cause) => new Error(`write ${jsonlDest}: ${String(cause)}`)));
    written.push(jsonlDest);

    // Copy system blob (once, from manifest.configHash)
    const systemContent = yield* readBlob(archiveDir, "system", manifest.configHash).pipe(
      Effect.mapError((e) => new Error(`read system blob ${manifest.configHash}: ${String(e)}`)),
    );
    yield* writeBlob(outDir, "system", manifest.configHash, systemContent).pipe(
      Effect.mapError((e) => new Error(`write system blob ${manifest.configHash}: ${String(e)}`)),
    );
    written.push(pathSvc.join(outDir, "content", "system", `${manifest.configHash}.txt`));

    // Track unique keys to avoid duplicate reads/writes
    const writtenPrompts = new Set<string>();
    const writtenScorers = new Set<string>();

    for (const item of items) {
      // Copy prompt blob
      if (!writtenPrompts.has(item.promptHash)) {
        writtenPrompts.add(item.promptHash);
        const promptContent = yield* readBlob(archiveDir, "prompts", item.promptHash).pipe(
          Effect.mapError((e) => new Error(`read prompt blob ${item.promptHash}: ${String(e)}`)),
        );
        yield* writeBlob(outDir, "prompts", item.promptHash, promptContent).pipe(
          Effect.mapError((e) => new Error(`write prompt blob ${item.promptHash}: ${String(e)}`)),
        );
        written.push(pathSvc.join(outDir, "content", "prompts", `${item.promptHash}.txt`));
      }

      // Copy scorer blob
      const sh = item.scorerHash;
      if (sh !== undefined && !writtenScorers.has(sh)) {
        writtenScorers.add(sh);
        const scorerContent = yield* readBlob(archiveDir, "scorers", sh).pipe(
          Effect.mapError((e) => new Error(`read scorer blob ${sh}: ${String(e)}`)),
        );
        yield* writeBlob(outDir, "scorers", sh, scorerContent).pipe(
          Effect.mapError((e) => new Error(`write scorer blob ${sh}: ${String(e)}`)),
        );
        written.push(pathSvc.join(outDir, "content", "scorers", `${sh}.json`));
      }
    }

    return written as ReadonlyArray<string>;
  });

// ── Shell tar helper ─────────────────────────────────────────────────────────

/**
 * Run `tar -czf <tarOut> -C <parent> <base>` via CommandExecutor.
 * Removes `stagingDir` after a successful tar.
 */
const makeTarball = (
  stagingDir: string,
  tarOut: string,
): Effect.Effect<void, Error, CommandExecutor.CommandExecutor | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Derive parent dir and base name for the -C flag
    const parts = stagingDir.replace(/\/+$/, "").split("/");
    const stagingBase = parts[parts.length - 1] ?? stagingDir;
    const stagingParent = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";

    const tarCmd = PlatformCommand.make("tar", "-czf", tarOut, "-C", stagingParent, stagingBase);

    yield* Effect.scoped(
      Effect.gen(function* () {
        const proc = yield* PlatformCommand.start(tarCmd);
        const [, , exitCode] = yield* Effect.all(
          [Stream.runDrain(proc.stdout), Stream.runDrain(proc.stderr), proc.exitCode],
          { concurrency: "unbounded" },
        );
        if (exitCode !== 0) {
          return yield* Effect.fail(new Error(`tar exited with code ${exitCode}`));
        }
      }),
    );

    yield* fs
      .remove(stagingDir, { recursive: true })
      .pipe(Effect.mapError((e) => new Error(`rm staging dir: ${String(e)}`)));
  });

// ── Options ──────────────────────────────────────────────────────────────────

const attemptArg = Args.text({ name: "attempt" }).pipe(
  Args.withDescription("AttemptId or path to a .jsonl attempt archive"),
);

const archiveDirOpt = Options.directory("archive-dir").pipe(
  Options.withDefault("benchmark-archive"),
  Options.withDescription(
    "Directory containing attempt archives and content store (default: benchmark-archive)",
  ),
);

const outOpt = Options.text("out").pipe(
  Options.optional,
  Options.withDescription("Output path (default: <attemptId>.tar.gz, or <attemptId>/ under --dir)"),
);

const dirOpt = Options.boolean("dir").pipe(
  Options.withDefault(false),
  Options.withDescription("Produce a plain directory bundle instead of a .tar.gz tarball"),
);

const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output"),
);

// ── Command ──────────────────────────────────────────────────────────────────

export const exportCommand = Command.make(
  "export",
  {
    attempt: attemptArg,
    archiveDir: archiveDirOpt,
    out: outOpt,
    dir: dirOpt,
    verbose: verboseOpt,
  },
  ({ attempt, archiveDir, out, dir, verbose }) =>
    Effect.gen(function* () {
      // Resolve the jsonl path: if attempt ends with .jsonl use as-is,
      // else treat as an attemptId and resolve under archiveDir.
      const archiveFile = attempt.endsWith(".jsonl") ? attempt : `${archiveDir}/${attempt}.jsonl`;

      // Derive attemptId from the file basename (strip .jsonl)
      const rawBasename = archiveFile.split("/").at(-1) ?? archiveFile;
      const attemptId = rawBasename.endsWith(".jsonl") ? rawBasename.slice(0, -6) : rawBasename;

      if (dir) {
        // --dir mode: bundle straight into the final output directory
        const finalOut = out._tag === "Some" ? out.value : attemptId;
        const writtenPaths = yield* exportBundle(archiveFile, finalOut);
        yield* printLine(`export: ${attemptId} → ${finalOut}/ (${writtenPaths.length} files)`);
      } else {
        // Tarball mode: export into a staging dir, then tar + remove staging
        const tarOut = out._tag === "Some" ? out.value : `${attemptId}.tar.gz`;
        const stagingDir = `${tarOut}.staging`;
        const writtenPaths = yield* exportBundle(archiveFile, stagingDir);
        yield* makeTarball(stagingDir, tarOut);
        yield* printLine(`export: ${attemptId} → ${tarOut} (${writtenPaths.length} files)`);
      }
    }).pipe(Effect.provide(makeLoggerLayer(verbose))),
).pipe(Command.withDescription("Bundle an attempt archive + content blobs for export"));
