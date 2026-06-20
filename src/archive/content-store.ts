/**
 * Content-addressed sidecar store for self-sufficient v2 archives. Holds the
 * prompt text, scorer config, and system-prompt text as blobs under
 * `<archiveDir>/content/{prompts,scorers,system}/`, keyed by reused identity
 * hashes (promptHash / scorerHash / configHash). Writes are atomic
 * (temp+rename) and idempotent (content-addressed → an existing blob is left
 * untouched). Error channel: FileIOError, matching the rest of src/archive/.
 */
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { shortSha256, stableStringify } from "../config/hashing.js";
import { FileIOError } from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";

export type BlobKind = "prompts" | "scorers" | "system";

const EXT: Record<BlobKind, string> = { prompts: "txt", scorers: "json", system: "txt" };

export const contentDir = (archiveDir: string): string => `${archiveDir}/content`;

/** Store key (and on-disk bytes preimage) for a scorer config. */
export const scorerHash = (scorer: ScorerConfig): string => shortSha256(stableStringify(scorer));

const kindDir = (archiveDir: string, kind: BlobKind): string => `${contentDir(archiveDir)}/${kind}`;

const blobPath = (archiveDir: string, kind: BlobKind, key: string): string =>
  `${kindDir(archiveDir, kind)}/${key}.${EXT[kind]}`;

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

/**
 * Atomically + idempotently write `content` to `content/<kind>/<key>.<ext>`.
 * If the blob already exists it is a no-op (content-addressed ⇒ identical bytes).
 */
export const writeBlob = (
  archiveDir: string,
  kind: BlobKind,
  key: string,
  content: string,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = blobPath(archiveDir, kind, key);
    const exists = yield* fs.exists(path).pipe(Effect.mapError(toFileIOError(path, "blob-exists")));
    if (exists) return;
    const dir = kindDir(archiveDir, kind);
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(dir, "blob-mkdir")));
    const tmp = `${path}.tmp`;
    yield* fs
      .writeFileString(tmp, content, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(tmp, "blob-write-temp")));
    yield* fs.rename(tmp, path).pipe(
      Effect.mapError(toFileIOError(path, "blob-rename")),
      Effect.tapError(() => fs.remove(tmp).pipe(Effect.ignore)),
    );
  });

export const readBlob = (
  archiveDir: string,
  kind: BlobKind,
  key: string,
): Effect.Effect<string, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = blobPath(archiveDir, kind, key);
    return yield* fs.readFileString(path).pipe(Effect.mapError(toFileIOError(path, "blob-read")));
  });
