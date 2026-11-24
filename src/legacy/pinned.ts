/**
 * Pinned reads of a legacy dataset: every attempt file and content-store blob
 * is read only when its dataset manifest lists it, and its bytes are checked
 * against the manifest's SHA-256 before they are parsed.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { LegacyManifest } from "../dataset/manifest.js";
import { FileIOError, LegacyDigestMismatch } from "../errors/index.js";
import { sha256Hex } from "../store/digest.js";
import { type BlobKind, type BlobRef, verifyBlob } from "./content-store.js";
import { type LoadedAttempt, parseAttempt } from "./load-attempts.js";
import type { BlobReader } from "./reconstruct.js";

const EXT: Record<BlobKind, string> = { prompts: "txt", scorers: "json", system: "txt" };

/** A blob's manifest key, `<kind>/<key>.<ext>`, also its path under `<archive>/content/`. */
export const blobPinKey = <K extends BlobKind>(kind: K, ref: BlobRef<K>): string =>
  `${kind}/${typeof ref === "string" ? ref : (ref as { configHash: string }).configHash}.${EXT[kind]}`;

/** Read `path` and check its bytes against `expected`; a missing file is a mismatch with `actual: null`. */
export const readPinned = (path: string, expected: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.mapError((cause) => new FileIOError({ path, operation: "exists", cause })));
    if (!exists)
      return yield* Effect.fail(new LegacyDigestMismatch({ path, expected, actual: null }));
    const bytes = yield* fs
      .readFile(path)
      .pipe(Effect.mapError((cause) => new FileIOError({ path, operation: "read-pinned", cause })));
    const actual = sha256Hex(bytes);
    if (actual !== expected)
      return yield* Effect.fail(new LegacyDigestMismatch({ path, expected, actual }));
    return new TextDecoder().decode(bytes);
  });

/**
 * A {@link BlobReader} over `pins` (archive directory → its manifest blob
 * pins). An unlisted blob is absent (FileIOError, so its attempt is
 * NotReconstructible); a listed one must match its pin, then its 12-hex key.
 */
export const pinnedBlobReader =
  (pins: ReadonlyMap<string, Readonly<Record<string, string>>>): BlobReader<LegacyDigestMismatch> =>
  (archiveDir, kind, ref) =>
    Effect.gen(function* () {
      const key = blobPinKey(kind, ref);
      const path = `${archiveDir}/content/${key}`;
      const expected = pins.get(archiveDir)?.[key];
      if (expected === undefined)
        return yield* Effect.fail(
          new FileIOError({ path, operation: "blob-read", cause: "not pinned by the dataset" }),
        );
      const content = yield* readPinned(path, expected);
      yield* verifyBlob(kind, ref, content);
      return content;
    });

/**
 * Load a legacy dataset: the attempts its manifest lists, read from
 * `<legacyRoot>/<archive basename>/`, in manifest archive order and file-name
 * order within an archive, plus a {@link pinnedBlobReader} over its blob pins.
 */
export const loadLegacyDataset = (
  manifest: LegacyManifest,
  legacyRoot: string,
): Effect.Effect<
  {
    readonly attempts: ReadonlyArray<LoadedAttempt>;
    readonly blobPins: ReadonlyMap<string, Readonly<Record<string, string>>>;
    readonly readBlob: BlobReader<LegacyDigestMismatch>;
  },
  FileIOError | LegacyDigestMismatch,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const pathSvc = yield* Path.Path;
    const attempts: LoadedAttempt[] = [];
    const blobPins = new Map<string, Readonly<Record<string, string>>>();
    for (const [archive, pins] of Object.entries(manifest.legacy.archives)) {
      const dir = pathSvc.join(legacyRoot, archive);
      blobPins.set(dir, pins.blobs);
      for (const name of Object.keys(pins.attempts).sort()) {
        const path = pathSvc.join(dir, name);
        const source = yield* readPinned(path, pins.attempts[name] as string);
        attempts.push(
          yield* parseAttempt(path, source).pipe(
            Effect.mapError(
              (issue) => new FileIOError({ path, operation: "parse-attempt", cause: issue.reason }),
            ),
          ),
        );
      }
    }
    return { attempts, blobPins, readBlob: pinnedBlobReader(blobPins) };
  });
