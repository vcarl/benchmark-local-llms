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

import type { CommandExecutor, HttpClient, Path } from "@effect/platform";
import { FileSystem } from "@effect/platform";
import { Clock, Data, Effect, Option, Schema } from "effect";
import { appendItem, finalizeAttempt, writeAttemptHeader } from "../archive/attempt-writer.js";
import { findCachedItem } from "../archive/cache.js";
import { scorerHash, writeBlob } from "../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import { stableStringify } from "../config/hashing.js";
import type { JsonlCorruptLine } from "../errors/index.js";
import { FileIOError } from "../errors/index.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { AttemptAggregate } from "../schema/attempt.js";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";
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
      yield* writeBlob(
        input.archiveDir,
        "system",
        input.config.configHash,
        input.config.systemPromptText,
      );

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

// ── Resume ──────────────────────────────────────────────────────────────────

const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResult);

/** Raised when a resumed attempt's re-resolved config/challenge identity does not match its archive header. */
export class ResumeMismatchError extends Data.TaggedError("ResumeMismatchError")<{
  readonly attemptId: string;
  readonly field: "configHash" | "challengeHash";
  readonly expected: string;
  readonly actual: string;
}> {}

/**
 * Resume an interrupted attempt. Re-resolves config + challenge from `input`
 * (the caller did the YAML load), validates the resolved hashes against the
 * partial archive's header, executes only the items not already present in the
 * body, re-aggregates over the union, and finalizes.
 *
 * Distinct from the cross-run cache: the partial archive is `interrupted: true`,
 * so `findCachedItem` skips it; resume reads its body explicitly here. Missing
 * items still flow through `executeOrCacheItem`, so a completed sibling attempt
 * can still serve a cache hit (unless `noCache`).
 */
export const resumeChallenge = (
  input: RunChallengeInput,
): Effect.Effect<
  AttemptManifest,
  FileIOError | JsonlCorruptLine | ResumeMismatchError,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString(input.archivePath).pipe(
        Effect.mapError(
          (cause) =>
            new FileIOError({
              path: input.archivePath,
              operation: "resume-read",
              cause: String(cause),
            }),
        ),
      );
      const lines = source.split("\n").filter((l) => l.trim().length > 0);

      const headerJson = yield* Effect.try({
        try: () => JSON.parse(lines[0] ?? "") as unknown,
        catch: (e) =>
          new FileIOError({
            path: input.archivePath,
            operation: "resume-parse-header",
            cause: String(e),
          }),
      });
      const header = yield* decodeManifest(headerJson).pipe(
        Effect.mapError(
          (cause) =>
            new FileIOError({
              path: input.archivePath,
              operation: "resume-decode-header",
              cause: String(cause),
            }),
        ),
      );

      // Fail loudly on identity mismatch — do not append mismatched items.
      if (input.config.configHash !== header.configHash) {
        return yield* Effect.fail(
          new ResumeMismatchError({
            attemptId: input.attemptId,
            field: "configHash",
            expected: header.configHash,
            actual: input.config.configHash,
          }),
        );
      }
      if (input.challenge.challengeHash !== header.challengeHash) {
        return yield* Effect.fail(
          new ResumeMismatchError({
            attemptId: input.attemptId,
            field: "challengeHash",
            expected: header.challengeHash,
            actual: input.challenge.challengeHash,
          }),
        );
      }

      // Decode the already-present body rows. Unlike the cross-run cache reader
      // (which skips a corrupt line), a corrupt body row fails the resume rather
      // than silently re-running an item we already have a completed result for.
      const existing: ItemResult[] = [];
      for (let i = 1; i < lines.length; i++) {
        const json = yield* Effect.try({
          try: () => JSON.parse(lines[i] as string) as unknown,
          catch: (e) =>
            new FileIOError({
              path: input.archivePath,
              operation: "resume-parse-item",
              cause: String(e),
            }),
        });
        existing.push(
          yield* decodeItem(json).pipe(
            Effect.mapError(
              (cause) =>
                new FileIOError({
                  path: input.archivePath,
                  operation: "resume-decode-item",
                  cause: String(cause),
                }),
            ),
          ),
        );
      }
      const doneIds = new Set(existing.map((r) => r.itemId));

      // Boot the server only if there is at least one missing item.
      const missing = input.challenge.items.filter((it) => !doneIds.has(it.itemId));
      if (missing.length > 0) {
        yield* input.deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie);
      }

      const newRows: ItemResult[] = [];
      for (const item of missing) {
        const row = yield* executeOrCacheItem(input, item);
        yield* appendItem(input.archivePath, row);
        newRows.push(row);
      }

      const union = [...existing, ...newRows];
      const agg = aggregate(union, input.challenge.passThreshold);
      const finishedMs = yield* Clock.currentTimeMillis;
      const finishedAt = new Date(finishedMs).toISOString();
      yield* finalizeAttempt(input.archivePath, finishedAt, agg);

      return { ...header, finishedAt, interrupted: false, aggregate: agg };
    }),
  );
