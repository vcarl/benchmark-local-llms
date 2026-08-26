/**
 * Per-(prompt × temperature) execution. Wraps the {@link ChatCompletion}
 * service, measures wall-clock time via {@link Clock.currentTimeMillis}, and
 * assembles a full {@link ExecutionResult} ready for the archive writer.
 *
 * This module is the one and only place the C4 loop turns a
 * {@link PromptCorpusEntry} into an {@link ExecutionResult}. Scenario execution
 * lives in `run-scenario.ts`; the shared orchestration glue that cycles over
 * both lives in `run-model.ts`.
 *
 * Error handling: LLM errors are folded into the result (`error` populated,
 * `output: ""`). The surrounding run-model loop wants "record and continue"
 * semantics — surfacing a typed error would crash out of the tier loop and
 * lose work. Truly fatal errors (like the process executor faulting) are
 * defects that bubble past this module.
 */
import { Clock, Effect } from "effect";
import {
  ChatCompletion,
  type CompletionParams,
  type CompletionResult,
} from "../llm/chat-completion.js";
import { leafModelId } from "../llm/servers/omlx.js";
import type { ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import { stripThinkingTags } from "../scoring/strip-thinking.js";

export interface RunPromptInput {
  readonly archiveId: string;
  readonly runId: string;
  readonly model: ModelConfig;
  readonly prompt: PromptCorpusEntry;
  readonly systemPrompt: string;
  readonly temperature: number;
  readonly maxTokens: number;
  /** Optional per-request timeout (seconds). Default: 600 (matches §5.3). */
  readonly timeoutSec?: number;
  /**
   * Reader for the supervised LLM server's running peak RSS (KB). Sampled
   * after the completion settles and stamped onto the result. Omit (or
   * supply `Effect.succeed(0)`) to record "unknown" — the webapp renders
   * 0 as `—`. Production wiring threads `ServerHandle.peakRssKb` here.
   */
  readonly peakRssKb?: Effect.Effect<number>;
}

const DEFAULT_PROMPT_TIMEOUT_SEC = 600;

/** Render the model display name carried on the result line. */
const displayName = (model: ModelConfig): string => model.name ?? model.artifact;

/** Render the quant label. Empty string if not set — the schema permits it. */
const quantLabel = (model: ModelConfig): string => model.quant ?? "";

/**
 * Stringify an LLM-channel error into a short, human-readable summary that
 * fits on the result line without dumping structured state.
 *
 * Matches the prototype's 200-char truncation (`runner.py:247`) for parity
 * with how existing archives record failures.
 */
const stringifyLlmError = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "_tag" in cause) {
    return JSON.stringify(cause).slice(0, 200);
  }
  return String(cause).slice(0, 200);
};

/**
 * Derive tokens/sec for runtimes that don't report a `timings` block
 * (notably `mlx_lm.server`). Mirrors `runner.py::run_llamacpp_prompt`:
 * when the server omits timings, approximate `generationTps` from the
 * total wall time and generation token count. `promptTps` cannot be
 * reconstructed without knowing prefill time, so it stays at 0 in that
 * case — explicitly, not as a silent parse fallback.
 *
 * Exported for tests.
 */
export const deriveTps = (
  serverReported: CompletionResult["generationTps"],
  generationTokens: number,
  wallTimeSec: number,
): number => {
  if (serverReported !== null) return serverReported;
  if (generationTokens <= 0 || wallTimeSec <= 0) return 0;
  return generationTokens / wallTimeSec;
};

/**
 * Resolve the final-answer / reasoning / raw-output triplet from a
 * completion. Two paths:
 *
 *   1. Structured signal: the runtime split reasoning into a separate
 *      field (`completion.reasoning !== null`). Trust it: `output =
 *      completion.output`, `reasoning = completion.reasoning`,
 *      `rawOutput = completion.output`. No stripping.
 *
 *   2. Inlined: `completion.reasoning === null`. The model may have
 *      inlined thinking into the answer (`<think>…</think>`, Harmony
 *      channels). Run `stripThinkingTags`; the result carries the
 *      cleaned `output`, the extracted `reasoning`, and an `error`
 *      (`"thinking_truncated"`) when an unclosed think block was
 *      detected. `rawOutput` always equals the original
 *      `completion.output` so the audit field stays meaningful even
 *      when stripping rewrote the answer.
 */
const resolveOutputFields = (
  completion: CompletionResult,
): {
  output: string;
  reasoning: string | null;
  rawOutput: string;
  error: string | null;
} => {
  if (completion.reasoning !== null) {
    return {
      output: completion.output,
      reasoning: completion.reasoning,
      // The runtime already split reasoning out of the API response, so
      // there's no pre-strip "raw" body distinct from `output` to preserve.
      rawOutput: completion.output,
      error: null,
    };
  }
  const stripped = stripThinkingTags(completion.output);
  return {
    output: stripped.output,
    reasoning: stripped.reasoning,
    rawOutput: completion.output,
    error: stripped.error,
  };
};

/**
 * Convert a peak-RSS sample (KB) to the GB unit the archive carries.
 * 0 KB → 0 GB ("unknown"; the webapp renders this as `—`).
 *
 * Note this is server-lifetime peak RSS sampled by `ps` from the
 * supervisor (see `llm/servers/peak-rss.ts`). It excludes Metal/MLX
 * wired GPU buffers, so it under-counts MLX peak vs. the Python
 * prototype's `mlx.core.metal.get_peak_memory`. Every prompt issued
 * against the same supervised server records the same number.
 */
const peakRssKbToGb = (kb: number): number => kb / (1024 * 1024);

/**
 * Build an `ExecutionResult` from a successful {@link CompletionResult}. This
 * is extracted from `runPrompt` so tests can exercise the assembly path
 * directly without round-tripping through `ChatCompletion`.
 */
export const makeSuccessResult = (
  input: RunPromptInput,
  completion: CompletionResult,
  startedAt: string,
  wallTimeSec: number,
  peakRssKb: number,
): ExecutionResult => {
  const fields = resolveOutputFields(completion);
  return {
    archiveId: input.archiveId,
    runId: input.runId,
    executedAt: startedAt,
    promptName: input.prompt.name,
    temperature: input.temperature,
    model: displayName(input.model),
    runtime: input.model.runtime,
    quant: quantLabel(input.model),
    promptTokens: completion.promptTokens,
    generationTokens: completion.generationTokens,
    // llamacpp reports both; mlx_lm.server reports neither. When the server
    // doesn't, compute generationTps from wall time (see `deriveTps`). We
    // can't derive promptTps without prefill timing, so it stays 0 for MLX.
    promptTps: completion.promptTps ?? 0,
    generationTps: deriveTps(completion.generationTps, completion.generationTokens, wallTimeSec),
    peakMemoryGb: peakRssKbToGb(peakRssKb),
    wallTimeSec,
    output: fields.output,
    reasoning: fields.reasoning,
    rawOutput: fields.rawOutput,
    error: fields.error,
    promptHash: input.prompt.promptHash,
    scenarioHash: null,
    scenarioName: null,
    terminationReason: null,
    toolCallCount: null,
    finalPlayerStats: null,
    events: null,
    blobPool: null,
  };
};

export const makeErrorResult = (
  input: RunPromptInput,
  startedAt: string,
  wallTimeSec: number,
  error: string,
  peakRssKb: number,
): ExecutionResult => ({
  archiveId: input.archiveId,
  runId: input.runId,
  executedAt: startedAt,
  promptName: input.prompt.name,
  temperature: input.temperature,
  model: displayName(input.model),
  runtime: input.model.runtime,
  quant: quantLabel(input.model),
  promptTokens: 0,
  generationTokens: 0,
  promptTps: 0,
  generationTps: 0,
  peakMemoryGb: peakRssKbToGb(peakRssKb),
  wallTimeSec,
  output: "",
  reasoning: null,
  rawOutput: "",
  error,
  promptHash: input.prompt.promptHash,
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
  blobPool: null,
});

/**
 * The id to put in the OpenAI `model` field for this model.
 *
 * llamacpp and mlx_lm.server serve a single model and echo back whatever id
 * they are handed, so the full artifact goes over the wire. oMLX is a
 * multi-model server that registers each discovered model under its *leaf*
 * directory name (never `org/repo`), so an omlx request must name the leaf or
 * the server cannot route it. The leaf is derived by the omlx supervisor, which
 * is what names the staged directory — importing it keeps request and staging
 * from drifting apart.
 *
 * This affects the request only — `displayName`/`quantLabel` and every
 * archived/report field keep the full artifact.
 */
export const apiModelId = (model: Pick<ModelConfig, "artifact" | "runtime">): string =>
  model.runtime === "omlx" ? leafModelId(model.artifact) : model.artifact;

const toCompletionParams = (input: RunPromptInput): CompletionParams => ({
  runtime: input.model.runtime,
  model: apiModelId(input.model),
  promptName: input.prompt.name,
  systemPrompt: input.systemPrompt,
  userPrompt: input.prompt.promptText,
  temperature: input.temperature,
  maxTokens: input.maxTokens,
  timeoutSec: input.timeoutSec ?? DEFAULT_PROMPT_TIMEOUT_SEC,
});

/**
 * Run one `(prompt × temperature)` against the `ChatCompletion` service and
 * assemble the result. LLM errors (timeout, malformed response, empty
 * response, transport) are folded into an "error result" — this function
 * never produces a typed error for a scored-at-run-time outcome. Only
 * unexpected defects escape.
 */
export const runPrompt = (
  input: RunPromptInput,
): Effect.Effect<ExecutionResult, never, ChatCompletion> =>
  Effect.gen(function* () {
    const chat = yield* ChatCompletion;
    const startedMs = yield* Clock.currentTimeMillis;
    const startedAt = new Date(startedMs).toISOString();

    const peakReader = input.peakRssKb ?? Effect.succeed(0);

    return yield* chat.complete(toCompletionParams(input)).pipe(
      Effect.matchEffect({
        onSuccess: (completion) =>
          Effect.gen(function* () {
            const endedMs = yield* Clock.currentTimeMillis;
            const wallTimeSec = (endedMs - startedMs) / 1000;
            const peakKb = yield* peakReader;
            return makeSuccessResult(input, completion, startedAt, wallTimeSec, peakKb);
          }),
        onFailure: (cause) =>
          Effect.gen(function* () {
            const endedMs = yield* Clock.currentTimeMillis;
            const wallTimeSec = (endedMs - startedMs) / 1000;
            const peakKb = yield* peakReader;
            return makeErrorResult(input, startedAt, wallTimeSec, stringifyLlmError(cause), peakKb);
          }),
      }),
    );
  });
