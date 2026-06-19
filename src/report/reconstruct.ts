/**
 * Reconstruct an attempt purely from its v2 archive + content store — no corpus,
 * config, or challenge YAML. The proof of the self-sufficiency property; consumed
 * by `score` (store-primary), `bench export`, and the acceptance test.
 */
import { type FileSystem, Path } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { readBlob } from "../archive/content-store.js";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { ScorerConfig } from "../schema/scorer.js";
import { loadAttemptArchive } from "./load-attempts.js";

export class NotReconstructible extends Data.TaggedError("NotReconstructible")<{
  readonly path: string;
  readonly reason: string;
}> {}

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

export const loadAttemptReconstruction = (
  file: string,
): Effect.Effect<ReconstructedAttempt, NotReconstructible, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const pathSvc = yield* Path.Path;
    const archiveDir = pathSvc.dirname(file);

    const { manifest, items } = yield* loadAttemptArchive(file).pipe(
      Effect.mapError((i) => new NotReconstructible({ path: file, reason: i.reason })),
    );
    if (manifest.schemaVersion !== 2) {
      return yield* Effect.fail(
        new NotReconstructible({ path: file, reason: "v1 archive has no content store" }),
      );
    }

    const systemPromptText = yield* readBlob(archiveDir, "system", manifest.configHash).pipe(
      Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
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
        const promptText = yield* readBlob(archiveDir, "prompts", item.promptHash).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        const scorerJson = yield* readBlob(archiveDir, "scorers", item.scorerHash).pipe(
          Effect.mapError((e) => new NotReconstructible({ path: file, reason: String(e) })),
        );
        const parsed = yield* Effect.try({
          try: () => JSON.parse(scorerJson) as unknown,
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
