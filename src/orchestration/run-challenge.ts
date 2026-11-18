/**
 * Challenge orchestrator: runs one `(config × challenge)` attempt end-to-end.
 *
 * Boots the LLM server for the configuration (reusing the LlmServerFactory from
 * RunModelDeps), runs each challenge item through `runPrompt`, scores each item
 * via `scoreOrFold` (scorer errors yield a classified score 0, not a crashed attempt),
 * aggregates to `{ score, passed }`, and writes the per-attempt archive
 * (header → item lines → finalize).
 *
 * Server acquisition is inside `Effect.scoped`, exactly mirroring `run-model.ts`.
 * `ChatCompletion` is required in the environment and provided by the caller —
 * `runChallenge` does not construct it.
 */

import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Clock, Effect, Random } from "effect";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "../archive/attempt-writer.js";
import { findCachedSamples } from "../archive/cache.js";
import { scorerHash, writeBlob } from "../archive/content-store.js";
import { promptContent, type ResolvedChallenge, type ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import { stableStringify } from "../config/hashing.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import { LLAMACPP_FIXED_FLAGS } from "../llm/servers/llamacpp.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import {
  type AttemptAggregate,
  type AttemptManifest,
  groupSamples,
  type ItemResult,
  passFraction,
} from "../schema/attempt.js";
import type { ModelConfig } from "../schema/model.js";
import type { RunEnv } from "../schema/run-manifest.js";
import { scoreOrFold } from "../scoring/dispatch.js";
import { applyScore } from "../scoring/failure-kind.js";
import type { RunModelDeps } from "./run-model.js";
import { runPrompt } from "./run-prompt.js";

// ── Pure helper ────────────────────────────────────────────────────────────

/**
 * Aggregate item results into a pass/fail score.
 * `score` = mean over items of each item's pass fraction (its samples scoring
 * exactly 1, over its samples); with one sample per item that is the count of
 * items with score === 1 divided by total items. Partial credit (0 < score < 1)
 * does NOT count as a pass. Empty items → `{ score: 0, passed: false }`.
 */
export const aggregate = (
  lines: ReadonlyArray<{ itemId: string; score: number }>,
  passThreshold: number,
): AttemptAggregate => {
  const items = groupSamples(lines);
  if (items.length === 0) return { score: 0, passed: false };
  const score = items.reduce((s, samples) => s + passFraction(samples), 0) / items.length;
  return { score, passed: score >= passThreshold };
};

// ── Input types ────────────────────────────────────────────────────────────

export interface RunChallengeInput {
  readonly config: ResolvedConfiguration;
  readonly challenge: ResolvedChallenge;
  readonly attemptId: string;
  /** Directory scanned for cross-run cache hits (the archive root). */
  readonly archiveDir: string;
  readonly archivePath: string;
  readonly env: RunEnv;
  /** Shared by every attempt of one `./bench run` invocation. */
  readonly invocationId?: string;
  /** Who produced the attempt (`BENCH_SUBMITTER`, default `local`). */
  readonly submitter?: string;
  /** When true, bypass the cross-run cache and always execute. Default false (cache ON). */
  readonly noCache?: boolean;
  /** Samples (generations) to hold per item; default 1. Samples already cached are reused. */
  readonly samplesOf?: (item: ResolvedItem) => number;
  /** Same deps bundle submit.ts builds; only `.llmServer` is used here. */
  readonly deps: RunModelDeps;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the `ModelConfig` shape the LLM-server factory + runPrompt expect.
 * Uses conditional spreads for optional fields to satisfy `exactOptionalPropertyTypes: true`.
 */
export const modelFromConfig = (c: ResolvedConfiguration): ModelConfig => ({
  artifact: c.artifact,
  runtime: c.runtime,
  name: c.id,
  temperature: c.temperature,
  ...(c.quant !== undefined ? { quant: c.quant } : {}),
  ...(c.ctxSize !== undefined ? { ctxSize: c.ctxSize } : {}),
  ...(c.chatTemplate !== undefined ? { chatTemplate: c.chatTemplate } : {}),
  ...(c.extraArgs !== undefined ? { extraArgs: c.extraArgs } : {}),
});

/** Configuration fields copied verbatim onto the manifest as provenance, when set. */
const PROVENANCE_FIELDS = [
  "topP",
  "topK",
  "minP",
  "presencePenalty",
  "repetitionPenalty",
  "repetitionContextSize",
  "chatTemplateKwargs",
  "ctxSize",
  "chatTemplate",
  "chatTemplateSha",
] as const satisfies ReadonlyArray<keyof ResolvedConfiguration & keyof AttemptManifest>;

const provenance = (c: ResolvedConfiguration): Partial<AttemptManifest> => ({
  ...Object.fromEntries(PROVENANCE_FIELDS.flatMap((k) => (c[k] === undefined ? [] : [[k, c[k]]]))),
  // extraArgs reaches only the mlx/omlx servers (see cli/deps.ts); record it where it applied.
  ...(c.runtime === "llamacpp"
    ? { serverFlags: LLAMACPP_FIXED_FLAGS }
    : c.extraArgs === undefined
      ? {}
      : { extraArgs: c.extraArgs }),
});

export const baseHeader = (input: RunChallengeInput, startedAt: string): AttemptManifest => ({
  schemaVersion: 3,
  attemptId: input.attemptId,
  startedAt,
  finishedAt: null,
  interrupted: true,
  configId: input.config.id,
  configHash: input.config.configHash,
  artifact: input.config.artifact,
  runtime: input.config.runtime,
  temperature: input.config.temperature,
  systemPrompt: input.config.systemPrompt,
  maxTokens: input.config.maxTokens,
  challengeId: input.challenge.id,
  challengeVersion: input.challenge.version,
  challengeHash: input.challenge.challengeHash,
  passThreshold: input.challenge.passThreshold,
  ...(input.invocationId === undefined ? {} : { invocationId: input.invocationId }),
  ...(input.submitter === undefined ? {} : { submitter: input.submitter }),
  env: input.env,
  aggregate: { score: 0, passed: false },
  ...(input.config.quant !== undefined ? { quant: input.config.quant } : {}),
  ...provenance(input.config),
});

// ── Per-item helper ────────────────────────────────────────────────────────

/**
 * Resolve one challenge item to its `ItemResult` lines, one per sample
 * `0..samplesOf(item)-1`: each sample is a cross-run cache hit (copied
 * verbatim — original executedAt/tokens/wallTime preserved so efficiency still
 * reflects true measured cost) or a fresh model execution stamped with
 * `itemHash`, its `sample` index (omitted for sample 0, so a one-sample line is
 * today's line), and the random `seed` sent with the request. Does NOT append
 * or aggregate — the caller owns archive writes.
 *
 * Before the cache lookup, writes the per-item prompt and scorer blobs to the
 * content store so the store is complete regardless of cache hit or miss.
 *
 * Cache-hit stamps: a hit carries `cachedFrom` (the executing attempt, set by
 * the cache lookup), and a hit whose cached row has no `scorerHash` (v1 archive)
 * has it set. These are the two sanctioned exceptions to the "cache hit =
 * verbatim copy" invariant; measured-cost fields (executedAt, tokens, tps,
 * peakMemory, wallTime) are preserved verbatim.
 */
export const executeOrCacheItem = (
  input: RunChallengeInput,
  item: ResolvedItem,
  peakRssKb?: Effect.Effect<number>,
): Effect.Effect<
  ItemResult[],
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const sh = scorerHash(item.scorer);
    yield* writeBlob(input.archiveDir, "prompts", item.promptHash, promptContent(item.prompt));
    yield* writeBlob(input.archiveDir, "scorers", sh, stableStringify(item.scorer));

    const cached =
      input.noCache === true
        ? new Map<number, ItemResult>()
        : yield* findCachedSamples(input.archiveDir, {
            configHash: input.config.configHash,
            challengeId: input.challenge.id,
            challengeVersion: input.challenge.version,
            itemHash: item.itemHash,
            ...(input.env.hardwareId === undefined ? {} : { hardwareId: input.env.hardwareId }),
          });

    const rows: ItemResult[] = [];
    const samples = input.samplesOf?.(item) ?? 1;
    for (let sample = 0; sample < samples; sample++) {
      const hit = cached.get(sample);
      if (hit !== undefined) {
        rows.push(hit.scorerHash === undefined ? { ...hit, scorerHash: sh } : hit);
        continue;
      }
      rows.push(yield* executeSample(input, item, sh, sample, peakRssKb));
    }
    return rows;
  });

const executeSample = (
  input: RunChallengeInput,
  item: ResolvedItem,
  sh: string,
  sample: number,
  peakRssKb: Effect.Effect<number> | undefined,
) =>
  Effect.gen(function* () {
    const seed = yield* Random.nextIntBetween(0, 2 ** 31 - 1);
    const exec = yield* runPrompt({
      archiveId: input.attemptId,
      runId: input.attemptId,
      model: modelFromConfig(input.config),
      prompt: item.prompt,
      systemPrompt: input.config.systemPromptText,
      temperature: input.config.temperature,
      maxTokens: input.config.maxTokens,
      seed,
      ...(input.config.repetitionPenalty === undefined
        ? {}
        : { repetitionPenalty: input.config.repetitionPenalty }),
      ...(input.config.repetitionContextSize === undefined
        ? {}
        : { repetitionContextSize: input.config.repetitionContextSize }),
      ...(input.config.topP === undefined ? {} : { topP: input.config.topP }),
      ...(input.config.topK === undefined ? {} : { topK: input.config.topK }),
      ...(input.config.minP === undefined ? {} : { minP: input.config.minP }),
      ...(input.config.presencePenalty === undefined
        ? {}
        : { presencePenalty: input.config.presencePenalty }),
      ...(input.config.chatTemplateKwargs === undefined
        ? {}
        : { chatTemplateKwargs: input.config.chatTemplateKwargs }),
      ...(peakRssKb !== undefined ? { peakRssKb } : {}),
    });

    const row: ItemResult = {
      itemId: item.itemId,
      promptName: item.itemId,
      promptHash: item.promptHash,
      itemHash: item.itemHash,
      scorerHash: sh,
      ...(item.parentItemId === undefined ? {} : { parentItemId: item.parentItemId }),
      ...(item.turn === undefined ? {} : { turn: item.turn }),
      ...(sample === 0 ? {} : { sample }),
      seed,
      executedAt: exec.executedAt,
      promptTokens: exec.promptTokens,
      generationTokens: exec.generationTokens,
      promptTps: exec.promptTps,
      generationTps: exec.generationTps,
      peakMemoryGb: exec.peakMemoryGb,
      wallTimeSec: exec.wallTimeSec,
      output: exec.output,
      reasoning: exec.reasoning,
      rawOutput: exec.rawOutput,
      error: exec.error,
      ...(exec.stopReason === undefined ? {} : { stopReason: exec.stopReason }),
      score: 0,
    };
    // An errored execution is not scored: it records score 0 and its failureKind.
    const scored =
      exec.error === null
        ? yield* scoreOrFold(exec.output, item.scorer, { promptName: item.itemId })
        : undefined;
    return applyScore(row, scored);
  });

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Inner body of a challenge run. Accepts an already-booted `ServerHandle` so
 * server lifetime can be hoisted to per-configuration in the matrix runner.
 * Does NOT acquire or release the server scope.
 */
export const runChallengeWithServer = (
  input: RunChallengeInput,
  server: ServerHandle,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const startedMs = yield* Clock.currentTimeMillis;
    const header = baseHeader(input, new Date(startedMs).toISOString());
    yield* writeAttemptHeader(input.archivePath, header);
    yield* writeBlob(
      input.archiveDir,
      "system",
      input.config.configHash,
      input.config.systemPromptText,
    );
    const scored: ItemResult[] = [];
    for (const item of input.challenge.items) {
      for (const row of yield* executeOrCacheItem(input, item, server.peakRssKb)) {
        yield* appendItem(input.archivePath, row);
        scored.push(row);
      }
    }
    const agg = aggregate(scored, input.challenge.passThreshold);
    const replayed = scored.filter((r) => r.cachedFrom !== undefined).length;
    const lines = { generated: scored.length - replayed, replayed };
    const finishedMs = yield* Clock.currentTimeMillis;
    const finishedAt = new Date(finishedMs).toISOString();
    yield* finalizeAttempt(input.archivePath, finishedAt, agg, { lines });
    return { ...header, finishedAt, interrupted: false, aggregate: agg, lines };
  });

/**
 * Run one `(config × challenge)` attempt end-to-end.
 *
 * Thin wrapper: boots the LLM server within an `Effect.scoped` then delegates
 * to `runChallengeWithServer`. Error channel: `FileIOError` (archive I/O) +
 * `JsonlCorruptLine` (cache scan). Scorer errors fold to score 0 per item.
 * LLM server failures are hard defects (`orDie`). `ChatCompletion` is required
 * in the environment — the caller provides it.
 */
export const runChallenge = (
  input: RunChallengeInput,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);
      return yield* runChallengeWithServer(input, server);
    }),
  );
