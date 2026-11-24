/**
 * Reconstruct an attempt purely from its v2 archive + content store — no corpus,
 * config, or challenge YAML. The proof of the self-sufficiency property; consumed
 * by the report's detail files, the EEE export, and the pinned legacy reader.
 */
import { type FileSystem, Path } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { BlobDigestMismatch, FileIOError } from "../errors/index.js";
import type { BlobKind, BlobRef } from "../legacy/content-store.js";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { ScorerConfig } from "../schema/scorer.js";
import { type LoadedAttempt, loadAttemptArchive } from "./load-attempts.js";
import { parseScorerContentTolerant } from "./parse-scorer-content.js";

export class NotReconstructible extends Data.TaggedError("NotReconstructible")<{
  readonly path: string;
  readonly reason: string;
}> {}

/**
 * Reads one content-store blob. A FileIOError or BlobDigestMismatch means the
 * blob is unavailable (the attempt is NotReconstructible); any other failure
 * `E` propagates. src/legacy/pinned.ts supplies the reader: it reads only the
 * blobs a dataset manifest pins.
 */
export type BlobReader<E = never> = <K extends BlobKind>(
  archiveDir: string,
  kind: K,
  ref: BlobRef<K>,
) => Effect.Effect<string, FileIOError | BlobDigestMismatch | E, FileSystem.FileSystem>;

export interface ReconstructedItem {
  readonly item: ItemResult;
  readonly promptText: string;
  readonly scorer: ScorerConfig;
}
export interface ReconstructedAttempt {
  readonly manifest: AttemptManifest;
  readonly systemPromptText: string;
  readonly items: ReadonlyArray<ReconstructedItem>;
}

const decodeScorer = Schema.decodeUnknown(ScorerConfig);

/** Join a loaded attempt with the content-store blobs beside its `sourcePath`. */
export const reconstructAttempt = <E = never>(
  { sourcePath: file, manifest, items }: LoadedAttempt,
  read: BlobReader<E>,
): Effect.Effect<ReconstructedAttempt, NotReconstructible | E, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const pathSvc = yield* Path.Path;
    const archiveDir = pathSvc.dirname(file);
    const unavailable = (e: FileIOError | BlobDigestMismatch | E): NotReconstructible | E =>
      e instanceof FileIOError || e instanceof BlobDigestMismatch
        ? new NotReconstructible({ path: file, reason: String(e) })
        : (e as E);

    if (manifest.schemaVersion < 2) {
      return yield* Effect.fail(
        new NotReconstructible({ path: file, reason: "v1 archive has no content store" }),
      );
    }

    const systemPromptText = yield* read(archiveDir, "system", manifest).pipe(
      Effect.mapError(unavailable),
    );

    const reconstructed = yield* Effect.forEach(items, (item) =>
      Effect.gen(function* () {
        if (item.scorerHash === undefined) {
          return yield* Effect.fail(
            new NotReconstructible({
              path: file,
              reason: `item ${item.itemId} missing scorerHash`,
            }),
          );
        }
        const promptText = yield* read(archiveDir, "prompts", item.promptHash).pipe(
          Effect.mapError(unavailable),
        );
        const scorerJson = yield* read(archiveDir, "scorers", item.scorerHash).pipe(
          Effect.mapError(unavailable),
        );
        const parsed = yield* Effect.try({
          try: () => parseScorerContentTolerant(scorerJson),
          catch: (e) => new NotReconstructible({ path: file, reason: `scorer JSON: ${String(e)}` }),
        });
        const scorer = yield* decodeScorer(parsed).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        return { item, promptText, scorer } satisfies ReconstructedItem;
      }),
    );

    return { manifest, systemPromptText, items: reconstructed };
  });

/** Load an attempt file and {@link reconstructAttempt} it. */
export const loadAttemptReconstruction = <E = never>(
  file: string,
  read: BlobReader<E>,
): Effect.Effect<ReconstructedAttempt, NotReconstructible | E, FileSystem.FileSystem | Path.Path> =>
  loadAttemptArchive(file).pipe(
    Effect.mapError((i) => new NotReconstructible({ path: file, reason: i.reason })),
    Effect.flatMap((loaded) => reconstructAttempt(loaded, read)),
  );
