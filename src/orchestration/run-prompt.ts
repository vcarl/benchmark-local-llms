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
import type { ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";

export interface RunPromptInput {
  readonly archiveId: string;
  readonly runId: string;
  readonly model: ModelConfig;
  readonly prompt: PromptCorpusEntry;
  readonly temperature: number;
  readonly maxTokens: number;
  /** Optional per-request timeout (seconds). Default: 600 (matches §5.3). */
  readonly timeoutSec?: number;
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
 * Build an `ExecutionResult` from a successful {@link CompletionResult}. This
 * is extracted from `runPrompt` so tests can exercise the assembly path
 * directly without round-tripping through `ChatCompletion`.
 */
export const makeSuccessResult = (
  input: RunPromptInput,
  completion: CompletionResult,
  startedAt: string,
  wallTimeSec: number,
): ExecutionResult => ({
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
  // TODO: peakMemoryGb — the Python prototype reads this from the MLX
  // `stream_generate` response's `peak_memory` attribute, which is only
  // available in subprocess mode. The rewrite eliminates subprocess mode
  // (requirements §1.2 / §9.1) in favour of HTTP, and neither llama-server
  // nor mlx_lm.server expose peak memory over HTTP. Stub to 0 until we add
  // an out-of-band probe (e.g. `ps`-derived RSS or Metal memory API).
  peakMemoryGb: 0,
  wallTimeSec,
  output: completion.output,
  error: null,
  promptHash: input.prompt.promptHash,
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
});

export const makeErrorResult = (
  input: RunPromptInput,
  startedAt: string,
  wallTimeSec: number,
  error: string,
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
  peakMemoryGb: 0,
  wallTimeSec,
  output: "",
  error,
  promptHash: input.prompt.promptHash,
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
});

const toCompletionParams = (input: RunPromptInput): CompletionParams => ({
  runtime: input.model.runtime,
  model: input.model.artifact,
  promptName: input.prompt.name,
  systemPrompt: input.prompt.system.text,
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

    return yield* chat.complete(toCompletionParams(input)).pipe(
      Effect.matchEffect({
        onSuccess: (completion) =>
          Effect.gen(function* () {
            const endedMs = yield* Clock.currentTimeMillis;
            const wallTimeSec = (endedMs - startedMs) / 1000;
            return makeSuccessResult(input, completion, startedAt, wallTimeSec);
          }),
        onFailure: (cause) =>
          Effect.gen(function* () {
            const endedMs = yield* Clock.currentTimeMillis;
            const wallTimeSec = (endedMs - startedMs) / 1000;
            return makeErrorResult(input, startedAt, wallTimeSec, stringifyLlmError(cause));
          }),
      }),
    );
  });
