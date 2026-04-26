/**
 * Archive file writer (§6.1). The archive format is a JSONL file with a
 * `RunManifest` on line 1 (header), `ExecutionResult` records on lines 2..N
 * (body), and at run-end we rewrite line 1 with the finalized manifest
 * (stats + finishedAt populated). See §6.1 of the requirements doc for
 * the long-form rationale.
 *
 * Strategy choices for this module:
 *
 * - **Header write:** plain overwrite (`flag: "w"`). `writeManifestHeader`
 *   is a fresh-run operation — any prior content for that archiveId is expected
 *   to be clobbered.
 *
 * - **Append:** `writeFileString` with `flag: "a"`. Single-writer-per-file
 *   is an explicit assumption (one run == one output file), so we don't
 *   need O_APPEND atomicity across processes.
 *
 * - **Trailer rewrite:** full read-then-rewrite. The alternative — seeking
 *   to offset 0 and overwriting only the first line — is fragile because
 *   the encoded manifest's byte length can change (nullable `finishedAt`
 *   going from `null` to a full ISO timestamp; stats going from 0 to non-
 *   zero doubles). Full rewrite is O(file size) but archive files cap at
 *   a few hundred KB in the prototype, well under the cost of correctness
 *   risk on partial rewrites.
 */
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError } from "../errors/index.js";
import { ExecutionResult, RunManifest, type RunStats } from "../schema/index.js";

const encodeManifest = Schema.encode(RunManifest);
const encodeResult = Schema.encode(ExecutionResult);

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

/**
 * Write the manifest header as line 1 of `path`, replacing any prior content.
 * The manifest should be in "open" state: `finishedAt: null`, stats zeroed.
 * `writeManifestTrailer` finalizes these fields when the run ends.
 */
export const writeManifestHeader = (
  path: string,
  manifest: RunManifest,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const encoded = yield* encodeManifest(manifest).pipe(
      Effect.mapError(toFileIOError(path, "encode-manifest")),
    );
    const line = `${JSON.stringify(encoded)}\n`;
    yield* fs
      .writeFileString(path, line, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(path, "write-header")));
  });

/**
 * Append one ExecutionResult as a JSONL line. The file must already exist
 * (writeManifestHeader is the required predecessor); we don't create it here.
 */
export const appendResult = (
  path: string,
  result: ExecutionResult,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const encoded = yield* encodeResult(result).pipe(
      Effect.mapError(toFileIOError(path, "encode-result")),
    );
    const line = `${JSON.stringify(encoded)}\n`;
    yield* fs
      .writeFileString(path, line, { flag: "a" })
      .pipe(Effect.mapError(toFileIOError(path, "append-result")));
  });

/**
 * Finalize the manifest: rewrite line 1 with updated `finishedAt` and
 * `stats`, leaving all ExecutionResult lines after it untouched.
 *
 * Implementation: read the whole file, decode line 1, replace fields,
 * re-serialize, rewrite the whole file. The alternative — seek/overwrite
 * at offset 0 — doesn't work when the encoded manifest's byte length
 * changes (which it always does, going from open to finalized).
 */
export const writeManifestTrailer = (
  path: string,
  finishedAt: string,
  stats: RunStats,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError(toFileIOError(path, "read-for-trailer")));

    // Split off the header line. Preserve the remainder verbatim so we don't
    // round-trip untrusted result lines through the decoder here — that's
    // the reader's job. This is a minimally-invasive rewrite.
    const firstNewline = contents.indexOf("\n");
    if (firstNewline < 0) {
      yield* Effect.fail(
        new FileIOError({
          path,
          operation: "trailer-rewrite",
          cause: "archive has no newline-terminated header line",
        }),
      );
    }
    const headerLine = contents.slice(0, firstNewline);
    const rest = contents.slice(firstNewline + 1);

    const parsed = yield* Effect.try({
      try: () => JSON.parse(headerLine) as unknown,
      catch: (e) => new FileIOError({ path, operation: "trailer-parse-header", cause: String(e) }),
    });
    const existing = yield* Schema.decodeUnknown(RunManifest)(parsed).pipe(
      Effect.mapError(toFileIOError(path, "trailer-decode-header")),
    );
    const finalized: RunManifest = { ...existing, finishedAt, stats };
    const encoded = yield* encodeManifest(finalized).pipe(
      Effect.mapError(toFileIOError(path, "trailer-encode")),
    );
    const newHeaderLine = `${JSON.stringify(encoded)}\n`;
    yield* fs
      .writeFileString(path, newHeaderLine + rest, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(path, "trailer-write")));
  });
