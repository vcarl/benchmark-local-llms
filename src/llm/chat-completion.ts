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
 *   counters when the server reports them (llamacpp). `mlx_lm.server` and
 *   oMLX emit no `timings` object: `generationTps` is then measured from the
 *   stream's content-frame arrival times after the first token (decode only,
 *   like llama.cpp's), and `promptTps` comes back `null`. When the stream
 *   cannot measure it either, `generationTps` is `null` and the caller
 *   (`runPrompt`) derives it from wall time or records 0 explicitly — this
 *   service does NOT silently coerce missing timings to 0.
 * - `timing`: TTFT on every runtime, the prefill/decode split, and cached
 *   prompt tokens (see `buildTiming` and ARCHIVE-FORMAT.md § Request timing).
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
import type { ItemTiming } from "../schema/attempt.js";
import type { Runtime } from "../schema/enums.js";
import type { ChatMessage } from "../schema/prompt.js";
import { LOOP_WINDOW_WORDS, makeLoopDetector } from "./loop-detector.js";

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
  /** Prior conversation sent between the system and user messages (multi-turn items). */
  readonly history?: ReadonlyArray<ChatMessage>;
  readonly temperature: number;
  readonly maxTokens: number;
  /** Optional per-request timeout in seconds. Omit to rely on HTTP defaults. */
  readonly timeoutSec?: number;
  /**
   * Sampler repetition penalty. Omitted entirely when undefined, so a
   * configuration that does not set it sends no such field and its config digest
   * omits it.
   */
  readonly repetitionPenalty?: number;
  /** How many recent tokens the penalty considers. Ignored when no penalty is set. */
  readonly repetitionContextSize?: number;
  /** Nucleus sampling cutoff (`top_p`). Omitted from the body when undefined. */
  readonly topP?: number;
  /** Top-k sampling cutoff (`top_k`). Omitted from the body when undefined. */
  readonly topK?: number;
  /** Min-p sampling floor (`min_p`). Omitted from the body when undefined. */
  readonly minP?: number;
  /** Presence penalty (`presence_penalty`). Omitted from the body when undefined. */
  readonly presencePenalty?: number;
  /** How many recent tokens the presence penalty considers. Ignored when no presence penalty is set. */
  readonly presenceContextSize?: number;
  /** Extra chat-template variables (`chat_template_kwargs`). Omitted from the body when undefined. */
  readonly chatTemplateKwargs?: Readonly<Record<string, string | number | boolean>>;
  /** Sampler seed (`seed`, accepted by all three runtimes). Omitted from the body when undefined. */
  readonly seed?: number;
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
   * mlx_lm.server and oMLX omit the whole block). Without `timings`,
   * `generationTps` is the decode rate measured from the stream (tokens after
   * the first over the time between the first and last content frames), and
   * `promptTps` stays `null`. `null` means "not measured" — callers must
   * decide whether to derive a value from wall time or record zero
   * explicitly. Do not coerce `null` to `0` at the decode site.
   */
  readonly promptTps: number | null;
  readonly generationTps: number | null;
  /** Server-reported stop reason ("stop" | "length" | …), or `null` if unreported. */
  readonly finishReason: string | null;
  /**
   * Per-request timing; unmeasured fields are absent (see {@link ItemTiming}).
   * The live service always sets it; optional so stub completions may omit it.
   */
  readonly timing?: ItemTiming;
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
  // Sent by all three runtimes (llama.cpp `usage_json_oaicompat`, mlx_lm
  // `generate_usage_response`, oMLX `PromptTokensDetails`).
  prompt_tokens_details: Schema.optional(
    Schema.Struct({ cached_tokens: Schema.optional(Schema.NullOr(Schema.Number)) }),
  ),
});

/** llama.cpp's `server_slot_stats::to_json` (tools/server/server-common.cpp). */
const TimingsSchema = Schema.Struct({
  prompt_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  predicted_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  cache_n: Schema.optional(Schema.Number),
  prompt_n: Schema.optional(Schema.Number),
  prompt_ms: Schema.optional(Schema.Number),
  predicted_ms: Schema.optional(Schema.Number),
  // Present only when speculative decoding drafted tokens.
  draft_n: Schema.optional(Schema.Number),
  draft_n_accepted: Schema.optional(Schema.Number),
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
 *
 * llama.cpp has a single window, `repeat_last_n`, for the repetition and
 * presence penalties alike (config validation keeps the two sizes equal when
 * both apply); mlx_lm windows each penalty separately.
 */
const penaltyFields = (p: CompletionParams): Record<string, number> => {
  const rp = p.repetitionPenalty;
  const rctx = rp === undefined ? undefined : p.repetitionContextSize;
  const pctx = p.presencePenalty === undefined ? undefined : p.presenceContextSize;
  if (p.runtime === "llamacpp") {
    const window = rctx ?? pctx;
    return {
      ...(rp === undefined ? {} : { repeat_penalty: rp }),
      ...(window === undefined ? {} : { repeat_last_n: window }),
    };
  }
  return {
    ...(rp === undefined ? {} : { repetition_penalty: rp }),
    ...(rctx === undefined ? {} : { repetition_context_size: rctx }),
    ...(pctx === undefined ? {} : { presence_context_size: pctx }),
  };
};

/** `top_p`/`top_k`/`min_p`/`presence_penalty` are spelled identically by all three runtimes. */
const samplerFields = (p: CompletionParams): Record<string, number> => ({
  ...(p.topP === undefined ? {} : { top_p: p.topP }),
  ...(p.topK === undefined ? {} : { top_k: p.topK }),
  ...(p.minP === undefined ? {} : { min_p: p.minP }),
  ...(p.presencePenalty === undefined ? {} : { presence_penalty: p.presencePenalty }),
});

/**
 * The exact `messages` array sent to the chat endpoint: system, history,
 * prompt. A bundle's `messagesDigest` is the digest of this array.
 */
export const chatMessages = (
  p: Pick<CompletionParams, "systemPrompt" | "userPrompt" | "history">,
): ReadonlyArray<ChatMessage | { role: "system"; content: string }> => [
  { role: "system", content: p.systemPrompt },
  ...(p.history ?? []),
  { role: "user", content: p.userPrompt },
];

const buildBody = (p: CompletionParams) => ({
  model: p.model,
  messages: chatMessages(p),
  temperature: p.temperature,
  max_tokens: p.maxTokens,
  stream: true,
  // mlx_lm reads `stream_options["include_usage"]` without guarding the key,
  // so it must always be present — and without it no usage block is emitted
  // in stream mode at all (server.py::handle_completion).
  stream_options: { include_usage: true },
  ...penaltyFields(p),
  ...samplerFields(p),
  ...(p.chatTemplateKwargs === undefined ? {} : { chat_template_kwargs: p.chatTemplateKwargs }),
  ...(p.seed === undefined ? {} : { seed: p.seed }),
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

/**
 * Decode one SSE payload straight from its JSON text. Going through
 * `Schema.parseJson` keeps a malformed frame inside the Option — a bare
 * `JSON.parse` raises on bad input, and an exception raised here is a defect
 * that slips past the error channel and takes the whole item with it.
 */
const decodeStreamFrame = Schema.decodeUnknownOption(Schema.parseJson(StreamChunkSchema));

/** Marker used to unwind the stream the moment a loop is proven. */
const LOOP_DETECTED = Symbol.for("llm/loop-detected");

/**
 * Read an SSE completion stream, accumulating answer and reasoning text and
 * watching for degenerate repetition. Returns as soon as the server finishes
 * *or* the generation is proven stuck — the latter cancels the request, which
 * is the entire point: a stuck generation otherwise runs to the full token
 * budget, and in the archive that cost 346s per item to produce nothing.
 */
/**
 * Decode tok/s measured from the stream: the tokens after the first over the
 * time from the first content frame to the last, so prefill (the wait for the
 * first token) is excluded, as in llama.cpp's `predicted_per_second`. Null
 * when it cannot be measured (fewer than two tokens, or one frame).
 */
const streamDecodeTps = (tokens: number, firstMs: number | null, lastMs: number): number | null =>
  firstMs === null || tokens < 2 || lastMs <= firstMs
    ? null
    : (tokens - 1) / ((lastMs - firstMs) / 1000);

type Timings = typeof TimingsSchema.Type;

/**
 * Assemble {@link ItemTiming}. llama.cpp's `timings` block is the source for
 * prefill/decode when it carries `prompt_ms` and `predicted_ms`; otherwise the
 * client clock: prefill = TTFT (so it includes HTTP and tokenization), decode
 * = first to last content/reasoning frame. Unmeasured fields are omitted.
 */
const buildTiming = (
  startMs: number,
  firstMs: number | null,
  lastMs: number,
  timings: Timings | null,
  usageCached: number | null,
): ItemTiming => {
  const opt = (k: string, v: number | null | undefined) => (v == null ? {} : { [k]: v });
  const ttftMs = firstMs === null ? null : firstMs - startMs;
  const server = timings?.prompt_ms !== undefined && timings.predicted_ms !== undefined;
  return {
    ...opt("ttftMs", ttftMs),
    ...(server
      ? {
          timingSource: "server" as const,
          prefillMs: timings.prompt_ms,
          decodeMs: timings.predicted_ms,
          ...opt("prefillTokens", timings.prompt_n),
        }
      : {
          timingSource: "client" as const,
          ...opt("prefillMs", ttftMs),
          ...opt("decodeMs", firstMs !== null && lastMs > firstMs ? lastMs - firstMs : null),
        }),
    ...opt("cachedPromptTokens", timings?.cache_n ?? usageCached),
    ...opt("draftTokens", timings?.draft_n),
    ...opt("draftAcceptedTokens", timings?.draft_n_accepted),
  };
};

const consumeStream = (
  params: CompletionParams,
  response: { readonly stream: Stream.Stream<Uint8Array, unknown> },
  startMs: number,
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
    let timings: Timings | null = null;
    let usageCached: number | null = null;
    let looped = false;
    // Arrival times of the first and last content frames: decode speed when
    // the server reports no `timings`.
    let firstMs: number | null = null;
    let lastMs = 0;
    const detector = makeLoopDetector();

    const handleLine = (line: string): Effect.Effect<void, typeof LOOP_DETECTED> => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return Effect.void;
      const payload = trimmed.slice(5).trim();
      if (payload.length === 0 || payload === "[DONE]") return Effect.void;
      // Unparseable or unexpected frames are skipped rather than fatal.
      const decoded = decodeStreamFrame(payload);
      if (decoded._tag === "None") return Effect.void;
      const chunk = decoded.value;
      if (chunk.usage !== undefined) {
        promptTokens = chunk.usage.prompt_tokens;
        generationTokens = chunk.usage.completion_tokens;
        usageCached = chunk.usage.prompt_tokens_details?.cached_tokens ?? null;
      }
      if (chunk.timings !== undefined) {
        timings = chunk.timings;
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
      if (advanced.length === 0) return Effect.void;
      return Clock.currentTimeMillis.pipe(
        Effect.flatMap((ms) => {
          firstMs ??= ms;
          lastMs = ms;
          if (!detector.push(advanced)) return Effect.void;
          looped = true;
          // INFO, not debug: cancelling the request makes the server log a
          // BrokenPipeError traceback, and without this line next to it that
          // traceback reads like a crash rather than a deliberate abort.
          return Effect.logInfo(
            `loop detected in ${params.promptName} after ${detector.wordCount()} words ` +
              `(a ${LOOP_WINDOW_WORDS}-word window repeated ${detector.maxRepeats()}x) — ` +
              "cancelling the request; the server may log a broken pipe in response",
          ).pipe(Effect.annotateLogs("scope", "chat"), Effect.zipRight(Effect.fail(LOOP_DETECTED)));
        }),
      );
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
      generationTps: generationTps ?? streamDecodeTps(generationTokens ?? 0, firstMs, lastMs),
      finishReason: looped ? "loop" : finishReason,
      timing: buildTiming(startMs, firstMs, lastMs, timings, usageCached),
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

      const result = yield* consumeStream(params, response, startMs);

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
      yield* (
        result.finishReason === "loop"
          ? Effect.logInfo(`abandoned ${params.promptName} after ${elapsed}s (looping)`)
          : Effect.logDebug(
              `response 200 in ${elapsed}s, prompt_tokens=${result.promptTokens} gen_tokens=${result.generationTokens}`,
            )
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
