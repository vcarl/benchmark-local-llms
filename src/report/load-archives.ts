/**
 * Archive directory discovery + bulk load (§7.1 step 1-2).
 *
 * The report generator scans a directory for `*.jsonl` archives and loads
 * each via B2's {@link loadManifest}. A per-file failure is surfaced as a
 * {@link ReportLoadIssue} in the returned summary rather than aborting the
 * whole report — one corrupted archive shouldn't block the rest.
 *
 * Non-recursive on purpose: archives sit flat under the archive dir in the
 * current layout (§6.1). Migration output goes in a subdirectory (see
 * `src/migrate/`), which the report CLI passes as a separate call if needed.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { type LoadedArchive, loadManifest } from "../archive/loader.js";
import { FileIOError, type JsonlCorruptLine } from "../errors/index.js";

export interface ArchiveLoadResult {
  /** Archives that loaded cleanly. */
  readonly archives: ReadonlyArray<{
    readonly path: string;
    readonly mtime: Date;
    readonly data: LoadedArchive;
  }>;
  /** Archives that failed to load — reported, not fatal. */
  readonly issues: ReadonlyArray<ReportLoadIssue>;
}

export interface ReportLoadIssue {
  readonly path: string;
  readonly reason: string;
}

/**
 * List `*.jsonl` files in `archiveDir`. Filesystem errors on the directory
 * itself (e.g. ENOENT) propagate — the caller should surface them to the
 * operator, who probably passed the wrong path.
 */
export const discoverArchives = (
  archiveDir: string,
): Effect.Effect<ReadonlyArray<string>, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;
    const entries = yield* fs.readDirectory(archiveDir).pipe(
      Effect.mapError(
        (cause) =>
          new FileIOError({
            path: archiveDir,
            operation: "read-archive-dir",
            cause: String(cause),
          }),
      ),
    );
    return entries
      .filter((e) => e.endsWith(".jsonl"))
      .map((e) => pathMod.join(archiveDir, e))
      .sort();
  });

/**
 * Load every archive in `archiveDir`. Per-file failures are caught and
 * collected as `issues`; successful loads go into `archives`. The dir-read
 * itself is still fatal.
 */
export const loadAllArchives = (
  archiveDir: string,
): Effect.Effect<ArchiveLoadResult, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* discoverArchives(archiveDir);
    const archives: Array<{ path: string; mtime: Date; data: LoadedArchive }> = [];
    const issues: ReportLoadIssue[] = [];

    for (const path of paths) {
      const outcome: Effect.Effect<
        { path: string; mtime: Date; data: LoadedArchive } | ReportLoadIssue,
        never,
        FileSystem.FileSystem
      > = Effect.gen(function* () {
        const data = yield* loadManifest(path);
        const stat = yield* fs.stat(path).pipe(
          Effect.mapError(
            (cause) =>
              new FileIOError({
                path,
                operation: "stat-archive",
                cause: String(cause),
              }),
          ),
        );
        const mtime = stat.mtime._tag === "Some" ? stat.mtime.value : new Date(0);
        return { path, mtime, data };
      }).pipe(
        Effect.catchAll((err: FileIOError | JsonlCorruptLine) =>
          Effect.succeed({ path, reason: formatLoadError(err) } satisfies ReportLoadIssue),
        ),
      );
      const r = yield* outcome;
      if ("data" in r) archives.push(r);
      else issues.push(r);
    }

    return { archives, issues };
  });

const formatLoadError = (err: FileIOError | JsonlCorruptLine): string => {
  if (err._tag === "JsonlCorruptLine") {
    return `corrupt JSONL line ${err.lineNumber}: ${err.rawLine.slice(0, 120)}`;
  }
  return `I/O error (${err.operation}): ${err.cause}`;
};
