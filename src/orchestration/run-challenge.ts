/**
 * Challenge orchestrator: runs one `(config × challenge)` attempt end-to-end.
 *
 * Boots the LLM server for the configuration (reusing the LlmServerFactory from
 * RunModelDeps), runs each challenge item through `runPrompt`, scores each item
 * via `scoreByConfig` (scorer errors yield score 0, not a crashed attempt),
 * aggregates to `{ score, passed }`, and writes the per-attempt archive
 * (header → item lines → finalize).
 *
 * Server acquisition is inside `Effect.scoped`, exactly mirroring `run-model.ts`.
 * `ChatCompletion` is required in the environment and provided by the caller —
 * `runChallenge` does not construct it.
 */

import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Clock, Effect, Option } from "effect";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "../archive/attempt-writer.js";
import { findCachedItem } from "../archive/cache.js";
import { scorerHash, writeBlob } from "../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import { stableStringify } from "../config/hashing.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type { AttemptAggregate, AttemptManifest, ItemResult } from "../schema/attempt.js";
import type { ModelConfig } from "../schema/model.js";
import type { RunEnv } from "../schema/run-manifest.js";
import { scoreByConfig } from "../scoring/dispatch.js";
import type { RunModelDeps } from "./run-model.js";
import { runPrompt } from "./run-prompt.js";

// ── Pure helper ────────────────────────────────────────────────────────────

/**
 * Aggregate item results into a pass/fail score.
 * `score` = count of items with score === 1 divided by total items.
 * Partial credit (0 < score < 1) does NOT count as a passing item.
 * Empty items → `{ score: 0, passed: false }`.
 */
export const aggregate = (
  items: ReadonlyArray<{ score: number }>,
  passThreshold: number,
): AttemptAggregate => {
  if (items.length === 0) return { score: 0, passed: false };
  const perfect = items.filter((i) => i.score === 1).length;
  const score = perfect / items.length;
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
  /** When true, bypass the cross-run cache and always execute. Default false (cache ON). */
  readonly noCache?: boolean;
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
});

const baseHeader = (input: RunChallengeInput, startedAt: string): AttemptManifest => ({
  schemaVersion: 2,
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
  env: input.env,
  aggregate: { score: 0, passed: false },
  ...(input.config.quant !== undefined ? { quant: input.config.quant } : {}),
});

// ── Per-item helper ────────────────────────────────────────────────────────

/**
 * Resolve one challenge item to an `ItemResult`: cross-run cache hit (copied
 * verbatim — original executedAt/tokens/wallTime preserved so efficiency still
 * reflects true measured cost) or a fresh model execution stamped with
 * `itemHash`. Does NOT append or aggregate — the caller owns archive writes.
 *
 * Before the cache lookup, writes the per-item prompt and scorer blobs to the
 * content store so the store is complete regardless of cache hit or miss.
 *
 * Cache-hit scorerHash stamp: on a hit whose cached row has no `scorerHash`
 * (v1 archive), the returned row has `scorerHash` set. This is an intentional,
 * spec-sanctioned narrow exception to the "cache hit = verbatim copy" invariant:
 * only the denormalized `scorerHash` field is set; measured-cost fields
 * (executedAt, tokens, tps, peakMemory, wallTime) are preserved verbatim.
 */
export const executeOrCacheItem = (
  input: RunChallengeInput,
  item: ResolvedItem,
  peakRssKb?: Effect.Effect<number>,
): Effect.Effect<
  ItemResult,
  FileIOError | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const sh = scorerHash(item.scorer);
    yield* writeBlob(input.archiveDir, "prompts", item.promptHash, item.prompt.promptText);
    yield* writeBlob(input.archiveDir, "scorers", sh, stableStringify(item.scorer));

    if (input.noCache !== true) {
      const cached = yield* findCachedItem(input.archiveDir, {
        configHash: input.config.configHash,
        challengeId: input.challenge.id,
        challengeVersion: input.challenge.version,
        itemHash: item.itemHash,
      });
      if (Option.isSome(cached)) {
        const row = cached.value;
        return row.scorerHash === undefined ? { ...row, scorerHash: sh } : row;
      }
    }

    const exec = yield* runPrompt({
      archiveId: input.attemptId,
      runId: input.attemptId,
      model: modelFromConfig(input.config),
      prompt: item.prompt,
      systemPrompt: input.config.systemPromptText,
      temperature: input.config.temperature,
      maxTokens: input.config.maxTokens,
      ...(peakRssKb !== undefined ? { peakRssKb } : {}),
    });

    const scoreResult = yield* scoreByConfig(exec.output, item.scorer, {
      promptName: item.itemId,
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed({ kind: "prompt" as const, score: 0, details: "scorer error" }),
      ),
    );

    return {
      itemId: item.itemId,
      promptName: item.itemId,
      promptHash: item.promptHash,
      itemHash: item.itemHash,
      scorerHash: sh,
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
      score: exec.error === null ? scoreResult.score : 0,
    } satisfies ItemResult;
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
      const row = yield* executeOrCacheItem(input, item, server.peakRssKb);
      yield* appendItem(input.archivePath, row);
      scored.push(row);
    }
    const agg = aggregate(scored, input.challenge.passThreshold);
    const finishedMs = yield* Clock.currentTimeMillis;
    const finishedAt = new Date(finishedMs).toISOString();
    yield* finalizeAttempt(input.archivePath, finishedAt, agg);
    return { ...header, finishedAt, interrupted: false, aggregate: agg };
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
