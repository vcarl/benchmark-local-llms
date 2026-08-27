/**
 * `ChatCompletion` service (phase C1). A unified OpenAI-compatible HTTP client
 * for both runtimes: llamacpp on port 18080 and `mlx_lm.server` on port 18081.
 *
 * This service ASSUMES the target server is already spawned and listening —
 * server lifecycle (spawn, health check, cleanup) is the C2 task's scope. At
 * merge time, C2 should construct its server-lifecycle Layer on top of
 * `ChatCompletionLive`; the port/model here are carried per-request via
 * {@link CompletionParams}, so no wiring is needed at the service boundary.
 *
 * Non-streaming only — streaming for chat responses is not required by the
 * orchestration flow (§5.3). SSE is used by the game-session layer for
 * Admiral's log stream, which is unrelated to this service.
 *
 * Response parsing:
 * - `choices[0].message.content` is the final-answer text.
 * - When the runtime separates reasoning from the answer it does so via a
 *   distinct field — `reasoning_content` on llama.cpp built with
 *   `--reasoning-format deepseek`, or `reasoning` on `mlx_lm.server`. The
 *   service surfaces that body verbatim in `CompletionResult.reasoning` and
 *   leaves `output` as the answer alone. When neither field is populated,
 *   `reasoning` is `null` and downstream code (the inline-strip path in
 *   `src/scoring/strip-thinking.ts`) recovers any thinking the runtime
 *   inlined into `content` with `<think>…</think>` tags.
 * - `usage.prompt_tokens`/`usage.completion_tokens` → tokens counters.
 * - `timings.prompt_per_second`/`timings.predicted_per_second` → tps
 *   counters when the server reports them (llamacpp). `mlx_lm.server` does
 *   not emit a `timings` object, so both tps fields come back as `null`.
 *   The caller (`runPrompt`) is responsible for either deriving `generationTps`
 *   from wall time or recording 0 explicitly — this service does NOT silently
 *   coerce missing timings to 0, because that hides the signal.
 */
import { HttpClient, HttpClientRequest } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Clock, Context, Effect, Layer, Schema, Stream } from "effect";
import {
  LlmEmptyResponse,
  LlmMalformedResponse,
  LlmRequestError,
  LlmTimeoutError,
} from "../errors/llm.js";
import type { Runtime } from "../schema/enums.js";
import { makeLoopDetector } from "./loop-detector.js";

// ── Public types ────────────────────────────────────────────────────────────

/** One chat completion request. */
export interface CompletionParams {
  /** Which runtime (selects port). */
  readonly runtime: Runtime;
  /** Artifact string passed as the `model` field in the OpenAI request. */
  readonly model: string;
  /** Prompt identity used only to tag errors (never sent over the wire). */
  readonly promptName: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature: number;
  readonly maxTokens: number;
  /** Optional per-request timeout in seconds. Omit to rely on HTTP defaults. */
  readonly timeoutSec?: number;
  /**
   * Sampler repetition penalty. Omitted entirely when undefined, so a
   * configuration that does not set it produces the exact request body (and
   * `configHash`) it did before this knob existed.
   */
  readonly repetitionPenalty?: number;
  /** How many recent tokens the penalty considers. Ignored when no penalty is set. */
  readonly repetitionContextSize?: number;
}

/** Decoded response body from a successful completion. */
export interface CompletionResult {
  /** Generated final-answer text (no thinking). */
  readonly output: string;
  /**
   * Separated reasoning when the runtime exposes it as a distinct field
   * (`reasoning_content` from llamacpp `--reasoning-format deepseek`,
   * `reasoning` from mlx_lm.server). `null` when the runtime did not
   * separate reasoning out of the answer; in that case, downstream code
   * must apply the inline-strip path (`stripThinkingTags`) to recover any
   * thinking inlined into `output`.
   */
  readonly reasoning: string | null;
  readonly promptTokens: number;
  readonly generationTokens: number;
  /**
   * Tokens/sec reported by the server's `timings` block (llamacpp emits these;
   * mlx_lm.server omits the whole block). `null` means "server did not report"
   * — callers must decide whether to derive a value from wall time or record
   * zero explicitly. Do not coerce `null` to `0` at the decode site; that
   * hides the MLX-vs-llamacpp signal.
   */
  readonly promptTps: number | null;
  readonly generationTps: number | null;
  /** Server-reported stop reason ("stop" | "length" | …), or `null` if unreported. */
  readonly finishReason: string | null;
}

/** Service interface. */
export interface ChatCompletionService {
  readonly complete: (
    params: CompletionParams,
  ) => Effect.Effect<
    CompletionResult,
    LlmRequestError | LlmTimeoutError | LlmMalformedResponse | LlmEmptyResponse
  >;
}

export class ChatCompletion extends Context.Tag("llm/ChatCompletion")<
  ChatCompletion,
  ChatCompletionService
>() {}

// ── Wire schema ─────────────────────────────────────────────────────────────

const UsageSchema = Schema.Struct({
  prompt_tokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  completion_tokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
});

const TimingsSchema = Schema.Struct({
  prompt_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  predicted_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const PORTS: Record<Runtime, number> = {
  llamacpp: 18080,
  mlx: 18081,
  omlx: 18082,
};

const endpointUrl = (runtime: Runtime): string =>
  `http://127.0.0.1:${PORTS[runtime]}/v1/chat/completions`;

/**
 * llama.cpp and the MLX servers spell the repetition knobs differently, so the
 * same configuration value has to be rendered per runtime. Returns an empty
 * object when unset — the body must stay byte-identical to its pre-knob shape
 * for configurations that don't opt in.
 */
const penaltyFields = (p: CompletionParams): Record<string, number> => {
  if (p.repetitionPenalty === undefined) return {};
  const ctx = p.repetitionContextSize;
  return p.runtime === "llamacpp"
    ? { repeat_penalty: p.repetitionPenalty, ...(ctx === undefined ? {} : { repeat_last_n: ctx }) }
    : {
        repetition_penalty: p.repetitionPenalty,
        ...(ctx === undefined ? {} : { repetition_context_size: ctx }),
      };
};

const buildBody = (p: CompletionParams) => ({
  model: p.model,
  messages: [
    { role: "system", content: p.systemPrompt },
    { role: "user", content: p.userPrompt },
  ],
  temperature: p.temperature,
  max_tokens: p.maxTokens,
  stream: true,
  // mlx_lm reads `stream_options["include_usage"]` without guarding the key,
  // so it must always be present — and without it no usage block is emitted
  // in stream mode at all (server.py::handle_completion).
  stream_options: { include_usage: true },
  ...penaltyFields(p),
});

/**
 * One server-sent chunk. Every field is optional because servers disagree
 * about which of them appear on which chunk: the MLX servers emit `usage`
 * only on a trailing chunk (and only when asked via `stream_options`), while
 * llama.cpp appends its `timings` block at the end.
 */
const StreamChunkSchema = Schema.Struct({
  choices: Schema.optional(
    Schema.Array(
      Schema.Struct({
        delta: Schema.optional(
          Schema.Struct({
            content: Schema.optional(Schema.NullOr(Schema.String)),
            reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
            reasoning: Schema.optional(Schema.NullOr(Schema.String)),
          }),
        ),
        finish_reason: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
  usage: Schema.optional(UsageSchema),
  timings: Schema.optional(TimingsSchema),
});

const decodeStreamChunk = Schema.decodeUnknownOption(StreamChunkSchema);

/** Marker used to unwind the stream the moment a loop is proven. */
const LOOP_DETECTED = Symbol.for("llm/loop-detected");

/**
 * Read an SSE completion stream, accumulating answer and reasoning text and
 * watching for degenerate repetition. Returns as soon as the server finishes
 * *or* the generation is proven stuck — the latter cancels the request, which
 * is the entire point: a stuck generation otherwise runs to the full token
 * budget, and in the archive that cost 346s per item to produce nothing.
 */
const consumeStream = (
  params: CompletionParams,
  response: { readonly stream: Stream.Stream<Uint8Array, unknown> },
): Effect.Effect<CompletionResult, LlmMalformedResponse> =>
  Effect.gen(function* () {
    let content = "";
    let reasoning = "";
    let sawReasoning = false;
    let finishReason: string | null = null;
    let promptTokens: number | null = null;
    let generationTokens: number | null = null;
    let promptTps: number | null = null;
    let generationTps: number | null = null;
    let looped = false;
    const detector = makeLoopDetector();

    const handleLine = (line: string): Effect.Effect<void, typeof LOOP_DETECTED> => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return Effect.void;
      const payload = trimmed.slice(5).trim();
      if (payload.length === 0 || payload === "[DONE]") return Effect.void;
      const decoded = decodeStreamChunk(JSON.parse(payload) as unknown);
      if (decoded._tag === "None") return Effect.void;
      const chunk = decoded.value;
      if (chunk.usage !== undefined) {
        promptTokens = chunk.usage.prompt_tokens;
        generationTokens = chunk.usage.completion_tokens;
      }
      if (chunk.timings !== undefined) {
        promptTps = chunk.timings.prompt_per_second;
        generationTps = chunk.timings.predicted_per_second;
      }
      const choice = chunk.choices?.[0];
      if (choice === undefined) return Effect.void;
      if (choice.finish_reason != null) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (delta === undefined) return Effect.void;
      const think = delta.reasoning_content ?? delta.reasoning;
      if (think != null && think.length > 0) {
        reasoning += think;
        sawReasoning = true;
      }
      if (delta.content != null && delta.content.length > 0) content += delta.content;
      // Reasoning is where runaways happen, but score them together: a model
      // repeating itself in the answer is just as stuck.
      const advanced = (think ?? "") + (delta.content ?? "");
      if (advanced.length > 0 && detector.push(advanced)) {
        looped = true;
        return Effect.fail(LOOP_DETECTED);
      }
      return Effect.void;
    };

    yield* response.stream.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach(handleLine),
      // A proven loop is a successful early exit, not an error.
      Effect.catchAll((cause) =>
        cause === LOOP_DETECTED
          ? Effect.void
          : Effect.fail(
              new LlmMalformedResponse({
                model: params.model,
                promptName: params.promptName,
                body: `stream read failed: ${String(cause).slice(0, 500)}`,
              }),
            ),
      ),
    );

    // Token counts are load-bearing: efficiency metrics and the
    // budget-exhaustion signal both read them. A runtime that streams without
    // reporting usage must fail loudly rather than silently record zeros.
    if (!looped && (promptTokens === null || generationTokens === null)) {
      return yield* Effect.fail(
        new LlmMalformedResponse({
          model: params.model,
          promptName: params.promptName,
          body:
            "streamed response carried no usage block — the runtime ignored " +
            "stream_options.include_usage, so token counts would be silently zero",
        }),
      );
    }

    // Match the non-streaming contract exactly: trim both sides, and treat
    // whitespace-only reasoning as absent rather than present-but-blank.
    const trimmedContent = content.trim();
    const trimmedReasoning = reasoning.trim();

    return {
      output: trimmedContent,
      reasoning: sawReasoning && trimmedReasoning.length > 0 ? trimmedReasoning : null,
      promptTokens: promptTokens ?? 0,
      // An aborted stream never receives the trailing usage block, so token
      // counts are genuinely unmeasured here. They stay 0 and `stopReason`
      // is "loop" — the pair is the signal that these numbers are absent
      // rather than observed. Counting delta chunks instead was measured
      // against a live server and came up ~9% short of the real count, so it
      // would be a plausible-looking wrong number, which is worse than none.
      generationTokens: generationTokens ?? 0,
      promptTps,
      generationTps,
      finishReason: looped ? "loop" : finishReason,
    } satisfies CompletionResult;
  });

// ── Layer ───────────────────────────────────────────────────────────────────

const makeService = (client: HttpClient.HttpClient): ChatCompletionService => ({
  complete: (params) =>
    Effect.gen(function* () {
      const url = endpointUrl(params.runtime);
      const body = buildBody(params);

      const startMs = yield* Clock.currentTimeMillis;
      yield* Effect.logDebug(
        `POST ${url} temp=${params.temperature} max_tokens=${params.maxTokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      // `HttpClientRequest.bodyJson` yields `HttpBody.HttpBodyError` if the
      // body can't be encoded; our body is plain JSON-safe so this is an
      // infallible path in practice, but the type system forces us to handle
      // it. We collapse any encode failure into `LlmRequestError` — a
      // malformed body we constructed is a client-side request problem.
      const request = yield* HttpClientRequest.post(url).pipe(
        HttpClientRequest.bodyJson(body),
        Effect.mapError(
          (cause) =>
            new LlmRequestError({
              model: params.model,
              promptName: params.promptName,
              cause: `body encoding failed: ${String(cause)}`,
            }),
        ),
      );

      const httpError = (cause: HttpClientError) =>
        new LlmRequestError({
          model: params.model,
          promptName: params.promptName,
          cause: cause.message ?? String(cause),
        });

      // Issue the request and read the body on non-2xx so server errors
      // surface the actual reason. Notably, `mlx_lm.server` returns 404 with
      // `{"error": "<exception message>"}` whenever generation throws (see
      // `server.py::handle_completion`); using `filterStatusOk` would hide
      // that behind a bare "StatusCode" mapping. Network/transport failures
      // still flow through `httpError`.
      const exec = client.execute(request).pipe(
        Effect.mapError(httpError),
        Effect.flatMap((resp) =>
          resp.status >= 200 && resp.status < 300
            ? Effect.succeed(resp)
            : resp.text.pipe(
                Effect.orElseSucceed(() => "<unreadable body>"),
                Effect.flatMap((body) =>
                  Effect.fail(
                    new LlmRequestError({
                      model: params.model,
                      promptName: params.promptName,
                      cause: `HTTP ${resp.status}: ${body.slice(0, 2000)}`,
                    }),
                  ),
                ),
              ),
        ),
      );

      const executed =
        params.timeoutSec === undefined
          ? exec
          : exec.pipe(
              Effect.timeoutFail({
                duration: `${params.timeoutSec * 1000} millis`,
                onTimeout: () =>
                  new LlmTimeoutError({
                    model: params.model,
                    promptName: params.promptName,
                    timeoutSec: params.timeoutSec as number,
                  }),
              }),
            );

      const response = yield* executed.pipe(
        Effect.tapError((err) =>
          Effect.gen(function* () {
            const endMs = yield* Clock.currentTimeMillis;
            const elapsed = ((endMs - startMs) / 1000).toFixed(1);
            const tag = (err as { readonly _tag?: string })._tag ?? "unknown";
            yield* Effect.logDebug(`error after ${elapsed}s: ${tag}`).pipe(
              Effect.annotateLogs("scope", "chat"),
            );
          }),
        ),
      );

      const result = yield* consumeStream(params, response);

      if (result.output.length === 0 && result.reasoning === null) {
        return yield* Effect.fail(
          new LlmEmptyResponse({
            model: params.model,
            promptName: params.promptName,
          }),
        );
      }

      const endMs = yield* Clock.currentTimeMillis;
      const elapsed = ((endMs - startMs) / 1000).toFixed(1);
      yield* Effect.logDebug(
        result.finishReason === "loop"
          ? `aborted after ${elapsed}s: generation was repeating itself`
          : `response 200 in ${elapsed}s, prompt_tokens=${result.promptTokens} gen_tokens=${result.generationTokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      return result;
    }),
});

/**
 * Layer constructing a {@link ChatCompletion} service on top of the ambient
 * `HttpClient`. In production, provide `NodeHttpClient.layer` (or the C2
 * server-lifecycle layer which composes that); in tests, provide a mock
 * client via `Layer.succeed(HttpClient.HttpClient, …)`.
 */
export const ChatCompletionLive: Layer.Layer<ChatCompletion, never, HttpClient.HttpClient> =
  Layer.effect(
    ChatCompletion,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      return makeService(client);
    }),
  );
