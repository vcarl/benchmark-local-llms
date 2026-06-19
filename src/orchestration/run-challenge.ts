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
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
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
const modelFromConfig = (c: ResolvedConfiguration): ModelConfig => ({
  artifact: c.artifact,
  runtime: c.runtime,
  name: c.id,
  temperature: c.temperature,
  ...(c.quant !== undefined ? { quant: c.quant } : {}),
  ...(c.ctxSize !== undefined ? { ctxSize: c.ctxSize } : {}),
});

const baseHeader = (input: RunChallengeInput, startedAt: string): AttemptManifest => ({
  schemaVersion: 1,
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
 */
export const executeOrCacheItem = (
  input: RunChallengeInput,
  item: ResolvedItem,
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
    if (input.noCache !== true) {
      const cached = yield* findCachedItem(input.archiveDir, {
        configHash: input.config.configHash,
        challengeId: input.challenge.id,
        challengeVersion: input.challenge.version,
        itemHash: item.itemHash,
      });
      if (Option.isSome(cached)) return cached.value;
    }

    const exec = yield* runPrompt({
      archiveId: input.attemptId,
      runId: input.attemptId,
      model: modelFromConfig(input.config),
      prompt: item.prompt,
      systemPrompt: input.config.systemPromptText,
      temperature: input.config.temperature,
      maxTokens: input.config.maxTokens,
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
 * Run one `(config × challenge)` attempt end-to-end.
 *
 * Error channel: `FileIOError` (archive I/O) + `JsonlCorruptLine` (cache scan).
 * Scorer errors are caught and fold to score 0 per item. LLM server failures
 * are hard defects (`orDie`). `ChatCompletion` is required in the environment —
 * the caller provides it.
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
      const startedMs = yield* Clock.currentTimeMillis;
      const header = baseHeader(input, new Date(startedMs).toISOString());
      yield* writeAttemptHeader(input.archivePath, header);

      // Acquire the LLM server within this scope. The caller-provided ChatCompletion
      // talks to it on the runtime's fixed port. A server that won't boot is a hard
      // failure for a single submit → orDie keeps it out of the typed error channel.
      yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);

      const scored: ItemResult[] = [];
      for (const item of input.challenge.items) {
        const row = yield* executeOrCacheItem(input, item);
        yield* appendItem(input.archivePath, row);
        scored.push(row);
      }

      const agg = aggregate(scored, input.challenge.passThreshold);
      const finishedMs = yield* Clock.currentTimeMillis;
      const finishedAt = new Date(finishedMs).toISOString();
      yield* finalizeAttempt(input.archivePath, finishedAt, agg);

      return { ...header, finishedAt, interrupted: false, aggregate: agg };
    }),
  );
