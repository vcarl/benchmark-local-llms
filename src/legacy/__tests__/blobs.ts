/**
 * Test fixtures for the legacy content store: write a blob where an archive
 * keeps it, and read blobs through a reader pinned to the bytes on disk.
 */
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { FileIOError } from "../../errors/index.js";
import { sha256Hex } from "../../store/digest.js";
import { type BlobKind, type BlobRef, contentDir, verifyBlob } from "../content-store.js";
import { blobPinKey, pinnedBlobReader } from "../pinned.js";
import type { BlobReader } from "../reconstruct.js";

/** Write `content` under `ref` in `archiveDir`'s content store; it must verify against `ref`. */
export const putBlob = <K extends BlobKind>(
  archiveDir: string,
  kind: K,
  ref: BlobRef<K>,
  content: string,
) =>
  Effect.gen(function* () {
    yield* verifyBlob(kind, ref, content);
    const fs = yield* FileSystem.FileSystem;
    const path = `${contentDir(archiveDir)}/${blobPinKey(kind, ref)}`;
    yield* fs.makeDirectory(`${contentDir(archiveDir)}/${kind}`, { recursive: true });
    yield* fs.writeFileString(path, content);
  }).pipe(Effect.orDie);

/** A pinned reader whose pins are the blobs' current bytes: a missing blob is unavailable. */
export const pinnedToDisk: BlobReader<never> = (archiveDir, kind, ref) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const key = blobPinKey(kind, ref);
    const path = `${contentDir(archiveDir)}/${key}`;
    const bytes = yield* fs
      .readFile(path)
      .pipe(Effect.mapError((cause) => new FileIOError({ path, operation: "blob-read", cause })));
    return yield* pinnedBlobReader(new Map([[archiveDir, { [key]: sha256Hex(bytes) }]]))(
      archiveDir,
      kind,
      ref,
    ).pipe(Effect.catchTag("LegacyDigestMismatch", Effect.die));
  });
