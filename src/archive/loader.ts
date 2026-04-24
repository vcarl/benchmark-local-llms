/**
 * Archive file loader (§6.1). Reads a JSONL archive produced by `writer.ts`:
 * line 1 is the `RunManifest` header; lines 2..N are `ExecutionResult`
 * records. Returns a structured `{ manifest, results }` pair.
 *
 * Strategy choices:
 *
 * - **Full-read vs streaming:** archives cap at a few hundred KB in the
 *   prototype (§6.1), so a single `readFileString` is simpler than a line
 *   stream and avoids the backpressure machinery we don't need here.
 *
 * - **Blank lines:** tolerated. `writeFileString(..., flag: "a")` always
 *   terminates with `\n`, so a trailing empty entry after split is expected.
 *   Interior blank lines are silently skipped rather than treated as corrupt —
 *   the operator's recovery path on a half-written run depends on being able
 *   to re-open partially-written archives.
 *
 * - **Error surface:** any parse or decode failure on line N becomes a
 *   `JsonlCorruptLine` with `lineNumber: N` (1-based). Filesystem errors
 *   stay as `FileIOError`. We don't aggregate: the first bad line short-
 *   circuits the load. The operator has enough info to fix the file and
 *   re-try.
 */
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import { ExecutionResult, RunManifest } from "../schema/index.js";

const decodeManifest = Schema.decodeUnknown(RunManifest);
const decodeResult = Schema.decodeUnknown(ExecutionResult);

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

const parseJsonLine = (
  filePath: string,
  lineNumber: number,
  rawLine: string,
): Effect.Effect<unknown, JsonlCorruptLine> =>
  Effect.try({
    try: () => JSON.parse(rawLine) as unknown,
    catch: () => new JsonlCorruptLine({ filePath, lineNumber, rawLine }),
  });

const corruptFromDecodeError =
  (filePath: string, lineNumber: number, rawLine: string) =>
  (_cause: unknown): JsonlCorruptLine =>
    new JsonlCorruptLine({ filePath, lineNumber, rawLine });

export interface LoadedArchive {
  readonly manifest: RunManifest;
  readonly results: ReadonlyArray<ExecutionResult>;
}

/**
 * Read and decode a single JSONL archive. The returned `results` array is
 * in file order (same order `appendResult` wrote them).
 */
export const loadManifest = (
  path: string,
): Effect.Effect<LoadedArchive, FileIOError | JsonlCorruptLine, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError(toFileIOError(path, "read-archive")));

    // Split on `\n`; the trailing newline produces an empty final entry that
    // we skip. Interior empties are skipped too — see module-level comment.
    const lines = contents.split("\n");

    // Find the first non-empty line to treat as the header. If there is none,
    // the file is corrupt at line 1 (with an empty rawLine).
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] ?? "").length > 0) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex < 0) {
      yield* Effect.fail(new JsonlCorruptLine({ filePath: path, lineNumber: 1, rawLine: "" }));
    }

    const headerLine = lines[headerIndex] ?? "";
    const headerLineNumber = headerIndex + 1;
    const headerJson = yield* parseJsonLine(path, headerLineNumber, headerLine);
    const manifest = yield* decodeManifest(headerJson).pipe(
      Effect.mapError(corruptFromDecodeError(path, headerLineNumber, headerLine)),
    );

    const results: ExecutionResult[] = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      if (raw.length === 0) continue;
      const lineNumber = i + 1;
      const parsed = yield* parseJsonLine(path, lineNumber, raw);
      const result = yield* decodeResult(parsed).pipe(
        Effect.mapError(corruptFromDecodeError(path, lineNumber, raw)),
      );
      results.push(result);
    }

    return { manifest, results };
  });
