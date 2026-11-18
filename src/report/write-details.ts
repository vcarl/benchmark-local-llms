/**
 * Emit one lazy per-item detail file per completed, reconstructible (v2)
 * attempt: `<detailsDir>/<attempt_id>.json`. Built by joining
 * `loadAttemptReconstruction` (system prompt + per-item prompt text + scorer)
 * with the in-memory `ItemResult` fields (output, reasoning, score, error).
 * v1 / non-reconstructible attempts are skipped gracefully — the record still
 * appears in `data.js`, only its drilldown is unavailable.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { FileIOError } from "../errors/index.js";
import { groupSamples, type ItemResult } from "../schema/attempt.js";
import { loadAttemptReconstruction } from "./reconstruct.js";

/** Family (uncertainty cluster id) of one archived item line of a challenge. */
export type FamilyOf = (challengeId: string, item: ItemResult) => string;

/** The default: the item's own `challengeId/name` (a turn: its parent's). */
export const singletonFamily: FamilyOf = (challengeId, item) =>
  `${challengeId}/${item.parentItemId ?? item.promptName}`;

export interface DetailWriteResult {
  readonly written: number;
  readonly skipped: number;
}

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

export const writeDetails = (
  detailsDir: string,
  sources: ReadonlyArray<{ attemptId: string; sourcePath: string }>,
  familyOf: FamilyOf = singletonFamily,
): Effect.Effect<DetailWriteResult, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    yield* fs
      .makeDirectory(detailsDir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(detailsDir, "mkdir-details-dir")));

    let written = 0;
    let skipped = 0;
    for (const { attemptId, sourcePath } of sources) {
      const recon = yield* Effect.either(loadAttemptReconstruction(sourcePath));
      if (recon._tag === "Left") {
        skipped++;
        continue;
      }
      const { manifest, systemPromptText } = recon.right;
      const retired = new Set(manifest.retiredItems ?? []);
      // One entry per item — its first sample — plus `samples: [passed, n]` when resampled.
      const groups = groupSamples(
        recon.right.items
          .filter(({ item }) => !retired.has(item.promptName))
          .map((r) => ({ ...r, itemId: r.item.itemId })),
      );
      const items = groups.map((g) => g[0] as (typeof g)[number]);
      const samplesOf = new Map(
        groups.map((g) => [
          g[0]?.itemId,
          g.length > 1
            ? ([g.filter(({ item }) => item.score === 1).length, g.length] as const)
            : undefined,
        ]),
      );
      // Derived, not stored, so it always agrees with the current (re-)scores.
      const passedTurn = new Set(
        items.flatMap(({ item }) =>
          item.parentItemId !== undefined && item.score === 1
            ? [`${item.parentItemId}#${item.turn}`]
            : [],
        ),
      );
      const priorTurnPassed = (item: (typeof items)[number]["item"]): boolean | null =>
        item.parentItemId === undefined || item.turn === undefined || item.turn === 1
          ? null
          : passedTurn.has(`${item.parentItemId}#${item.turn - 1}`);
      const payload = {
        attempt_id: manifest.attemptId,
        config_id: manifest.configId,
        config_hash: manifest.configHash,
        artifact: manifest.artifact,
        challenge_id: manifest.challengeId,
        challenge_version: manifest.challengeVersion,
        system_prompt_text: systemPromptText,
        items: items.map(({ item, promptText, scorer }) => ({
          item_id: item.itemId,
          prompt_name: item.promptName,
          family: familyOf(manifest.challengeId, item),
          // Turn units only (undefined → key dropped on single-shot items).
          parent_item_id: item.parentItemId,
          turn: item.turn,
          prior_turn_passed: priorTurnPassed(item),
          prompt_text: promptText,
          output: item.output,
          reasoning: item.reasoning,
          score: item.score,
          samples: samplesOf.get(item.itemId),
          error: item.error,
          scorer,
          // Per-check constraint breakdown when present (undefined → JSON.stringify
          // drops the key, so pre-breakdown archives emit no field at all).
          breakdown: item.breakdown,
        })),
      };
      const outPath = pathSvc.join(detailsDir, `${attemptId}.json`);
      yield* fs
        .writeFileString(outPath, JSON.stringify(payload), { flag: "w" })
        .pipe(Effect.mapError(toFileIOError(outPath, "write-detail")));
      written++;
    }
    return { written, skipped };
  });
