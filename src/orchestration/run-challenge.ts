/**
 * Challenge orchestrator: one config × challenge on an already-booted server,
 * written as a v4 bundle into the store.
 *
 * The header goes to an open file (or the run continues the open file of the
 * same config, hardware, release and challenge). The cell is skipped whole
 * when one sealed bundle already holds, with no harness failure, every item × sample
 * 0..k-1 at the current prompt; otherwise every item × sample is executed and
 * appended (a resumed open file keeps what it already holds). At the end the
 * open file is sealed into `bundles/<digest>.jsonl` and the score records of
 * its executions are appended to `scores/<digest>.jsonl`. A skipped cell is
 * still scored, for the console summary only.
 *
 * `ChatCompletion` is required in the environment and provided by the caller.
 */
import { type CommandExecutor, FileSystem, type HttpClient, type Path } from "@effect/platform";
import { Clock, Effect, Random } from "effect";
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import {
  type BundleConflict,
  type BundleInvalid,
  FileIOError,
  type JsonlCorruptLine,
} from "../errors/index.js";
import { type ChatCompletion, chatMessages } from "../llm/chat-completion.js";
import { LLAMACPP_FIXED_FLAGS } from "../llm/servers/llamacpp.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import { type AttemptAggregate, groupSamples, passFraction } from "../schema/attempt.js";
import type { ModelConfig } from "../schema/model.js";
import { scoreFields, scoreRecord } from "../scoring/rules.js";
import {
  appendExecution,
  type BundleConfig,
  type BundleEnv,
  type BundleHeader,
  bundlePath,
  createOpenBundle,
  type Execution,
  readBundle,
  sealBundle,
} from "../store/bundle.js";
import { digestOf } from "../store/digest.js";
import { appendScores, type ScoreRecord } from "../store/scores.js";
import { executionKey, findOpenBundle, type Held, heldOf } from "../store/store-index.js";
import { runPrompt } from "./run-prompt.js";

/** The machine and harness part of a bundle's `env`. */
export type RunEnv = Pick<
  BundleEnv,
  "platform" | "runtimeVersion" | "nodeVersion" | "harnessGitSha" | "hardware" | "hardwareId"
>;

export interface RunChallengeInput {
  readonly config: ResolvedConfiguration;
  readonly challenge: ResolvedChallenge;
  readonly store: string;
  /** Release of the challenge directory (`releaseOfChallengesDir`). */
  readonly release: string;
  readonly runId: string;
  readonly contributor: string;
  readonly env: RunEnv;
  readonly weightsDigest: string | null;
  /** Each sealed bundle's held executions (`loadPresent`). */
  readonly present: ReadonlyArray<Held>;
  /** Execute the whole cell, even when a sealed bundle already holds it. */
  readonly noSkip?: boolean;
  /** Samples per item, `0..k-1`; default 1. */
  readonly samplesOf?: (item: ResolvedItem) => number;
}

export interface ChallengeOutcome {
  /** Digest of the sealed bundle; null when nothing was executed. */
  readonly bundle: string | null;
  readonly executed: number;
  readonly skipped: number;
  readonly aggregate: AttemptAggregate;
}

/**
 * Mean over items of each item's pass fraction (samples scoring exactly 1);
 * `passed` when it meets the challenge's threshold. Empty → `{ 0, false }`.
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

/** The `ModelConfig` shape the LLM-server factory and runPrompt expect. */
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

const SAMPLING_KEYS = [
  "topP",
  "topK",
  "minP",
  "presencePenalty",
  "presenceContextSize",
  "repetitionPenalty",
  "repetitionContextSize",
] as const;

const sampling = (c: ResolvedConfiguration) =>
  Object.fromEntries(SAMPLING_KEYS.flatMap((k) => (c[k] === undefined ? [] : [[k, c[k]]])));

/** The config digest's preimage. */
export const bundleConfig = (
  c: ResolvedConfiguration,
  weightsDigest: string | null,
): BundleConfig => ({
  artifact: c.artifact,
  weightsDigest,
  runtime: c.runtime,
  ...(c.quant === undefined ? {} : { quant: c.quant }),
  temperature: c.temperature,
  maxTokens: c.maxTokens,
  sampling: sampling(c),
  ...(c.chatTemplateKwargs === undefined ? {} : { chatTemplateKwargs: c.chatTemplateKwargs }),
  chatTemplateDigest: c.chatTemplateDigest ?? null,
  systemPrompt: c.systemPromptText,
});

export const bundleHeader = (input: RunChallengeInput, startedAt: string): BundleHeader => {
  const c = input.config;
  const config = bundleConfig(c, input.weightsDigest);
  return {
    schemaVersion: 4,
    configId: c.id,
    config,
    configDigest: digestOf(config),
    release: input.release,
    challenge: input.challenge.id,
    run: { id: input.runId, contributor: input.contributor, startedAt, finishedAt: null },
    env: {
      ...input.env,
      ...(c.ctxSize === undefined ? {} : { ctxSize: c.ctxSize }),
      // extraArgs reaches only the mlx/omlx servers (see cli/deps.ts); record it where it applied.
      ...(c.runtime === "llamacpp"
        ? { serverFlags: LLAMACPP_FIXED_FLAGS }
        : c.extraArgs === undefined
          ? {}
          : { extraArgs: c.extraArgs }),
      ...(c.chatTemplate === undefined ? {} : { chatTemplate: c.chatTemplate }),
    },
    executions: null,
  };
};

const iso = (ms: number): string => new Date(ms).toISOString();

const messagesOf = (input: RunChallengeInput, item: ResolvedItem) =>
  chatMessages({
    systemPrompt: input.config.systemPromptText,
    userPrompt: item.prompt.promptText,
    ...(item.prompt.history === undefined ? {} : { history: item.prompt.history }),
  });

/** Execute one sample of one item: the execution line D3 describes. */
const executeSample = (
  input: RunChallengeInput,
  item: ResolvedItem,
  sample: number,
  messagesDigest: string,
  peakRssKb: Effect.Effect<number>,
): Effect.Effect<Execution, never, ChatCompletion> =>
  Effect.gen(function* () {
    const c = input.config;
    const seed = yield* Random.nextIntBetween(0, 2 ** 31 - 1);
    const exec = yield* runPrompt({
      archiveId: input.runId,
      runId: input.runId,
      model: modelFromConfig(c),
      prompt: item.prompt,
      systemPrompt: c.systemPromptText,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      seed,
      ...sampling(c),
      ...(c.chatTemplateKwargs === undefined ? {} : { chatTemplateKwargs: c.chatTemplateKwargs }),
      peakRssKb,
    });
    return {
      item: `${input.challenge.id}/${item.itemId}`,
      sample,
      seed,
      messagesDigest,
      executedAt: exec.executedAt,
      output: exec.output,
      reasoning: exec.reasoning,
      rawOutput: exec.rawOutput,
      error: exec.error,
      stopReason: exec.stopReason ?? null,
      measured: {
        promptTokens: exec.promptTokens,
        generationTokens: exec.generationTokens,
        promptTps: exec.promptTps,
        generationTps: exec.generationTps,
        peakMemoryGb: exec.peakMemoryGb,
        wallTimeSec: exec.wallTimeSec,
        ...exec.timing,
      },
    };
  });

/**
 * Run one config × challenge on a booted server and seal its bundle. Does not
 * acquire or release the server.
 */
export const runChallengeWithServer = (
  input: RunChallengeInput,
  server: ServerHandle,
): Effect.Effect<
  ChallengeOutcome,
  FileIOError | BundleInvalid | BundleConflict | JsonlCorruptLine,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const { store, challenge } = input;
    const fresh = bundleHeader(input, iso(yield* Clock.currentTimeMillis));
    const plan = challenge.items.flatMap((item) => {
      const messagesDigest = digestOf(messagesOf(input, item));
      return Array.from({ length: input.samplesOf?.(item) ?? 1 }, (_, sample) => ({
        item,
        sample,
        messagesDigest,
        key: executionKey({
          configDigest: fresh.configDigest,
          hardwareId: fresh.env.hardwareId,
          item: `${challenge.id}/${item.itemId}`,
          messagesDigest,
          sample,
        }),
      }));
    });

    // The whole cell is skipped only when one sealed bundle already holds all of it.
    const complete =
      input.noSkip === true
        ? undefined
        : input.present.find((h) => plan.every((p) => h.has(p.key)));
    if (complete !== undefined) {
      const graded: Array<{ itemId: string; score: number }> = [];
      for (const p of plan) {
        const held = complete.get(p.key);
        if (held === undefined) continue; // unreachable: `complete` holds every key
        const f = yield* scoreFields(held, p.item.scorer);
        graded.push({ itemId: p.item.itemId, score: f.score });
      }
      return {
        bundle: null,
        executed: 0,
        skipped: plan.length,
        aggregate: aggregate(graded, challenge.passThreshold),
      };
    }

    const adopted = yield* findOpenBundle(store, {
      configDigest: fresh.configDigest,
      hardwareId: fresh.env.hardwareId,
      release: fresh.release,
      challenge: fresh.challenge,
    });
    let openPath: string;
    // What the adopted open file already holds: a resumed run continues it.
    let resumed: Held = new Map();
    if (adopted === undefined) {
      openPath = yield* createOpenBundle(store, fresh);
    } else {
      openPath = adopted.path;
      resumed = heldOf(adopted.header, adopted.executions);
      yield* Effect.logInfo(
        `resuming ${openPath} (${adopted.executions.length} executions already written)`,
      );
    }
    const stamp = () =>
      Effect.map(Clock.currentTimeMillis, (ms) => ({
        harnessGitSha: input.env.harnessGitSha,
        scoredAt: iso(ms),
      }));

    const graded: Array<{ itemId: string; score: number; sample: number }> = [];
    const records = new Map<string, ScoreRecord>();
    let executed = 0;
    let skipped = 0;
    for (const { item, sample, messagesDigest, key } of plan) {
      const held = input.noSkip === true ? undefined : resumed.get(key);
      if (held !== undefined) {
        skipped += 1;
        const f = yield* scoreFields(held, item.scorer);
        graded.push({ itemId: item.itemId, sample, score: f.score });
        continue;
      }
      const e = yield* executeSample(input, item, sample, messagesDigest, server.peakRssKb);
      yield* appendExecution(openPath, e);
      executed += 1;
      const r = yield* scoreRecord(e, item.scorer, yield* stamp());
      records.set(r.execution, r);
      graded.push({ itemId: item.itemId, sample, score: r.score });
    }
    const agg = aggregate(graded, challenge.passThreshold);

    // Nothing generated: no bundle, and the header-only open file goes.
    if (executed === 0 && (adopted?.executions.length ?? 0) === 0) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs
        .remove(openPath)
        .pipe(
          Effect.mapError(
            (cause) => new FileIOError({ path: openPath, operation: "remove open bundle", cause }),
          ),
        );
      return { bundle: null, executed, skipped, aggregate: agg };
    }
    const digest = yield* sealBundle(store, openPath, iso(yield* Clock.currentTimeMillis));
    const sealed = yield* readBundle(bundlePath(store, digest));
    const scorers = new Map(challenge.items.map((i) => [`${challenge.id}/${i.itemId}`, i.scorer]));
    const toAppend: ScoreRecord[] = [];
    for (const e of sealed.executions) {
      const r = records.get(digestOf(e));
      const scorer = scorers.get(e.item);
      if (r !== undefined) toAppend.push(r);
      else if (scorer !== undefined) toAppend.push(yield* scoreRecord(e, scorer, yield* stamp()));
    }
    yield* appendScores(store, digest, toAppend);
    return { bundle: digest, executed, skipped, aggregate: agg };
  });
