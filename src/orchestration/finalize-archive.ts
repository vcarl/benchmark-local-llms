/**
 * Archive trailer rewrite. Given a finalized `RunManifest` (stats,
 * `finishedAt`, `interrupted` filled in), replace the header line at the
 * top of the archive file without disturbing the `ExecutionResult` body.
 *
 * B2's {@link writeManifestTrailer} can't set `interrupted` because its
 * signature hard-codes a `{ ...existing, finishedAt, stats }` merge. Rather
 * than expand the B2 API from inside the orchestration layer (strict scope
 * fence — we don't own it), we do the rewrite inline here and reuse the
 * archive writer's `writeManifestHeader` for schema-encode correctness.
 *
 * Small inefficiency vs. `writeManifestTrailer`: we call
 * `writeManifestHeader` (which opens with `flag: "w"`, truncating the file)
 * then append the preserved body. For archive files under a few hundred KB
 * this is effectively the same as the B2 trailer rewrite.
 *
 * FOLLOW-UP: When B2 gains a generalized `writeManifestTrailer` that takes
 * the full finalized manifest (or a `Partial<RunManifest>` patch including
 * `interrupted`), delete this module and call it directly.
 */
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { writeManifestHeader } from "../archive/writer.js";
import type { FileIOError } from "../errors/index.js";
import type { RunManifest } from "../schema/run-manifest.js";

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    ({
      _tag: "FileIOError",
      path,
      operation,
      cause: String(cause),
    }) as FileIOError;

/**
 * Replace the first line of `archivePath` with a freshly-encoded finalized
 * manifest, preserving all subsequent lines byte-for-byte.
 */
export const finalizeArchive = (
  archivePath: string,
  finalized: RunManifest,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(archivePath)
      .pipe(Effect.mapError(toFileIOError(archivePath, "finalize-read")));
    const firstNewline = contents.indexOf("\n");
    const body = firstNewline < 0 ? "" : contents.slice(firstNewline + 1);
    yield* writeManifestHeader(archivePath, finalized);
    if (body.length > 0) {
      yield* fs
        .writeFileString(archivePath, body, { flag: "a" })
        .pipe(Effect.mapError(toFileIOError(archivePath, "finalize-append-body")));
    }
  });
