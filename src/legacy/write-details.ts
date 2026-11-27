/**
 * Emit one lazy per-item detail file per completed, reconstructible (v2)
 * attempt: `<detailsDir>/<attempt_id>.json`. Built by joining
 * `loadAttemptReconstruction` (system prompt + per-item prompt text + scorer)
 * with the in-memory `ItemResult` fields (output, reasoning, score, error).
 * v1 / non-reconstructible attempts are skipped gracefully — the row still
 * counts them, only their drilldown is unavailable. {@link detailPayload} is
 * the file's JSON, shared with the v4 bundle details (src/report/v4-rows.ts).
 */
import * as path from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { FileIOError } from "../errors/index.js";
import { type AttemptManifest, groupSamples, type ItemResult } from "../schema/attempt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { sha256Hex } from "../store/digest.js";
import type { LoadedAttempt } from "./load-attempts.js";
import {
  type BlobReader,
  loadAttemptReconstruction,
  NotReconstructible,
  reconstructAttempt,
} from "./reconstruct.js";

/** Family (uncertainty cluster id) of one archived item line of a challenge. */
export type FamilyOf = (
  challengeId: string,
  item: Pick<ItemResult, "promptName" | "parentItemId">,
) => string;

/** The default: the item's own `challengeId/name` (a turn: its parent's). */
export const singletonFamily: FamilyOf = (challengeId, item) =>
  `${challengeId}/${item.parentItemId ?? item.promptName}`;

export interface DetailWriteResult {
  readonly written: number;
  readonly skipped: number;
}

/** The item-line fields a detail file shows. */
export type DetailLine = Pick<
  ItemResult,
  | "itemId"
  | "promptName"
  | "parentItemId"
  | "turn"
  | "output"
  | "reasoning"
  | "score"
  | "error"
  | "breakdown"
  | "wallTimeSec"
  | "promptTokens"
  | "generationTokens"
  | "ttftMs"
  | "prefillMs"
  | "decodeMs"
  | "timingSource"
  | "prefillTokens"
  | "cachedPromptTokens"
  | "draftTokens"
  | "draftAcceptedTokens"
>;

/** What one detail file is built from: an attempt's (or bundle's) identity, system prompt and lines. */
export interface DetailInput {
  readonly manifest: Pick<
    AttemptManifest,
    | "attemptId"
    | "configId"
    | "configHash"
    | "artifact"
    | "challengeId"
    | "challengeVersion"
    | "retiredItems"
  >;
  readonly systemPromptText: string;
  readonly items: ReadonlyArray<{
    readonly item: DetailLine;
    readonly promptText: string;
    readonly scorer: ScorerConfig;
  }>;
}

const toFileIOError =
  (path: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path, operation, cause: String(cause) });

/**
 * A source that carries its already-loaded `attempt` is reconstructed from it;
 * otherwise its `sourcePath` is read. Blobs are read through `read`; its
 * failures other than unavailability (see {@link BlobReader}) propagate.
 */
export const writeDetails = <E = never>(
  detailsDir: string,
  sources: ReadonlyArray<{ attemptId: string; sourcePath: string; attempt?: LoadedAttempt }>,
  read: BlobReader<E>,
  familyOf: FamilyOf = singletonFamily,
  /** A line's score and scorer under its item's current scorer, when they differ from the archived ones. */
  regrade: (
    manifest: AttemptManifest,
    line: ItemResult,
  ) => { readonly score: number; readonly scorer: ScorerConfig } | undefined = () => undefined,
): Effect.Effect<DetailWriteResult, FileIOError | E, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .makeDirectory(detailsDir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(detailsDir, "mkdir-details-dir")));

    let written = 0;
    let skipped = 0;
    for (const { attemptId, sourcePath, attempt } of sources) {
      const reconstructed = yield* (
        attempt === undefined
          ? loadAttemptReconstruction(sourcePath, read)
          : reconstructAttempt(attempt, read)
      ).pipe(
        Effect.map(Option.some),
        Effect.catchIf(
          (e): e is NotReconstructible => e instanceof NotReconstructible,
          () => Effect.succeed(Option.none()),
        ),
      );
      if (Option.isNone(reconstructed)) {
        skipped++;
        continue;
      }
      const recon = reconstructed.value;
      const payload = detailPayload(
        {
          ...recon,
          items: recon.items.map((r) => {
            const g = regrade(recon.manifest as AttemptManifest, r.item as ItemResult);
            return g === undefined
              ? r
              : { ...r, item: { ...r.item, score: g.score }, scorer: g.scorer };
          }),
        },
        familyOf,
      );
      yield* writeDetailFile(detailsDir, attemptId, payload);
      written++;
    }
    return { written, skipped };
  });

/**
 * Write `<detailsDir>/<id>.json` with each item's prompt text moved into a
 * prompt pack, `<detailsDir>/../prompts/<sha256>.json` (`{ item_id: text }`),
 * that the detail names in `prompts`. Prompts are public release items, the
 * same for every config, so one pack serves a challenge's details across configs.
 */
export const writeDetailFile = (
  detailsDir: string,
  id: string,
  payload: ReturnType<typeof detailPayload>,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { items, ...rest } = payload;
    const pack = JSON.stringify(Object.fromEntries(items.map((i) => [i.item_id, i.prompt_text])));
    const digest = sha256Hex(pack);
    const promptsDir = path.join(path.dirname(detailsDir), "prompts");
    const packPath = path.join(promptsDir, `${digest}.json`);
    yield* fs
      .makeDirectory(promptsDir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(promptsDir, "mkdir-prompts-dir")));
    if (!(yield* fs.exists(packPath).pipe(Effect.mapError(toFileIOError(packPath, "stat")))))
      yield* fs
        .writeFileString(packPath, pack)
        .pipe(Effect.mapError(toFileIOError(packPath, "write-prompt-pack")));
    const outPath = path.join(detailsDir, `${id}.json`);
    yield* fs
      .writeFileString(
        outPath,
        JSON.stringify({
          ...rest,
          prompts: digest,
          items: items.map(({ prompt_text: _, ...i }) => i),
        }),
      )
      .pipe(Effect.mapError(toFileIOError(outPath, "write-detail")));
  });

/** One detail file's JSON object: one entry per item (its first sample), with `samples: [passed, n]` when resampled. */
export const detailPayload = (recon: DetailInput, familyOf: FamilyOf = singletonFamily) => {
  const { manifest, systemPromptText } = recon;
  const retired = new Set(manifest.retiredItems ?? []);
  // One entry per item — its first sample — plus `samples: [passed, n]` when resampled.
  const groups = groupSamples(
    recon.items
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
  return {
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
      // Cost of this (first) sample. Fields the line lacks stay undefined
      // and drop out of the JSON, so older lines carry wall time and tokens only.
      timing: {
        wall_sec: item.wallTimeSec,
        prompt_tokens: item.promptTokens,
        generation_tokens: item.generationTokens,
        ttft_ms: item.ttftMs,
        prefill_ms: item.prefillMs,
        decode_ms: item.decodeMs,
        source: item.timingSource,
        prefill_tokens: item.prefillTokens,
        cached_prompt_tokens: item.cachedPromptTokens,
        draft_tokens: item.draftTokens,
        draft_accepted_tokens: item.draftAcceptedTokens,
      },
    })),
  };
};
