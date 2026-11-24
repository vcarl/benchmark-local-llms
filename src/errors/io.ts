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
 * A content-store blob does not hash to the key it is stored under (see
 * src/legacy/content-store.ts). `actual` is the key its bytes hash to.
 */
export class BlobDigestMismatch extends Data.TaggedError("BlobDigestMismatch")<{
  readonly kind: string;
  readonly key: string;
  readonly actual: string;
}> {
  override get message(): string {
    return `content/${this.kind}/${this.key} hashes to ${this.actual}, not its key`;
  }
}

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
}> {
  override get message(): string {
    return `${this.operation} failed on '${this.path}': ${String(this.cause)}`;
  }
}

/**
 * A file a dataset manifest pins by SHA-256 (a legacy attempt file or
 * content-store blob) does not match its pin. `actual` is null when the file
 * is missing.
 */
export class LegacyDigestMismatch extends Data.TaggedError("LegacyDigestMismatch")<{
  readonly path: string;
  readonly expected: string;
  readonly actual: string | null;
}> {
  override get message(): string {
    return this.actual === null
      ? `${this.path} is pinned at ${this.expected} but missing`
      : `${this.path} hashes to ${this.actual}, not its pinned ${this.expected}`;
  }
}
