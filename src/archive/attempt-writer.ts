/**
 * Per-attempt JSONL archive writer. Format mirrors `writer.ts`:
 * - Line 1: `AttemptManifest` header (open state: finishedAt=null, interrupted=true)
 * - Lines 2..N: `ItemResult` body records, one per challenge item
 * - `finalizeAttempt` rewrites line 1 with finishedAt, interrupted=false, filled aggregate
 *
 * Error type is the domain `FileIOError`; all FileSystem errors are mapped through
 * `toFileIOError` so callers see a uniform error channel.
 */
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError } from "../errors/index.js";
import { type AttemptAggregate, AttemptManifest, ItemResult } from "../schema/attempt.js";

const encodeManifest = Schema.encode(AttemptManifest);
const encodeItem = Schema.encode(ItemResult);

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

/**
 * Write the manifest header as line 1 of `path`, replacing any prior content.
 * The manifest should be in "open" state: `finishedAt: null`, `interrupted: true`,
 * aggregate zeroed. `finalizeAttempt` fills these when the attempt ends.
 */
export const writeAttemptHeader = (
  path: string,
  manifest: AttemptManifest,
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
 * Append one ItemResult as a JSONL line. The file must already exist
 * (writeAttemptHeader is the required predecessor).
 */
export const appendItem = (
  path: string,
  item: ItemResult,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const encoded = yield* encodeItem(item).pipe(
      Effect.mapError(toFileIOError(path, "encode-item")),
    );
    const line = `${JSON.stringify(encoded)}\n`;
    yield* fs
      .writeFileString(path, line, { flag: "a" })
      .pipe(Effect.mapError(toFileIOError(path, "append-item")));
  });

/**
 * Finalize the manifest: rewrite line 1 with `finishedAt`, `interrupted: false`,
 * and the filled `aggregate`, leaving all ItemResult lines after it untouched.
 *
 * Implementation mirrors `writeManifestTrailer` in `writer.ts`: read the whole
 * file, decode line 1, merge updated fields, re-encode, rewrite.
 */
export const finalizeAttempt = (
  path: string,
  finishedAt: string,
  aggregate: AttemptAggregate,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError(toFileIOError(path, "read-for-finalize")));

    const firstNewline = contents.indexOf("\n");
    if (firstNewline < 0) {
      return yield* Effect.fail(
        new FileIOError({
          path,
          operation: "finalize-rewrite",
          cause: "archive has no newline-terminated header line",
        }),
      );
    }
    const headerLine = contents.slice(0, firstNewline);
    const rest = contents.slice(firstNewline + 1);

    const parsed = yield* Effect.try({
      try: () => JSON.parse(headerLine) as unknown,
      catch: (e) => new FileIOError({ path, operation: "finalize-parse", cause: String(e) }),
    });
    const existing = yield* Schema.decodeUnknown(AttemptManifest)(parsed).pipe(
      Effect.mapError(toFileIOError(path, "finalize-decode-header")),
    );
    const finalized: AttemptManifest = { ...existing, finishedAt, interrupted: false, aggregate };
    const encoded = yield* encodeManifest(finalized).pipe(
      Effect.mapError(toFileIOError(path, "finalize-encode")),
    );
    const newHeaderLine = `${JSON.stringify(encoded)}\n`;
    yield* fs
      .writeFileString(path, newHeaderLine + rest, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(path, "finalize-write")));
  });
