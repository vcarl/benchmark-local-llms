import { Data } from "effect";

/**
 * Archive / JSONL I/O errors from requirements §3.1. Raised by the archive
 * loader/writer (phase B2) and the report generator (phase D2).
 */

/**
 * A JSONL archive line failed to parse. Includes `filePath` and `lineNumber`
 * so the operator can locate the bad line — the Python prototype crashed
 * without either piece of context (§3.2).
 */
export class JsonlCorruptLine extends Data.TaggedError("JsonlCorruptLine")<{
  readonly filePath: string;
  readonly lineNumber: number;
  readonly rawLine: string;
}> {}

/**
 * A filesystem operation failed (read, write, stat, etc). `operation` is a
 * free-form label; `cause` carries the original upstream error (tagged
 * error, PlatformError, or whatever the source surfaced) so the CLI / test
 * layer can inspect or format it however it wants.
 */
export class FileIOError extends Data.TaggedError("FileIOError")<{
  readonly path: string;
  readonly operation: string;
  readonly cause: unknown;
}> {}
