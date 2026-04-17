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
 * Response parsing mirrors `runner.py::_chat_completion`:
 * - `choices[0].message.content` is the generated text.
 * - When `content` is empty and `reasoning_content` is present (some
 *   llama-server builds split reasoning out), the reasoning is wrapped in
 *   `<think>…</think>` so the scoring layer's thinking-tag stripper sees a
 *   consistent shape.
 * - `usage.prompt_tokens`/`usage.completion_tokens` → tokens counters.
 * - `timings.prompt_per_second`/`timings.predicted_per_second` → tps
 *   counters. MLX doesn't emit `timings` in its OpenAI-compatible output;
 *   both tps fields fall back to `0` in that case.
 */
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Context, Effect, Layer, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  LlmEmptyResponse,
  LlmMalformedResponse,
  LlmRequestError,
  LlmTimeoutError,
} from "../errors/llm.js";
import type { Runtime } from "../schema/enums.js";

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
}

/** Decoded response body from a successful completion. */
export interface CompletionResult {
  /** Generated text. Thinking-tag stripping is NOT applied here — see §4.1. */
  readonly output: string;
  readonly promptTokens: number;
  readonly generationTokens: number;
  /** Tokens/sec reported by the server (llamacpp `timings`); `0` if absent. */
  readonly promptTps: number;
  readonly generationTps: number;
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

/**
 * Minimal decoder for the OpenAI-compatible chat completion response. We
 * only pull the fields we actually use downstream — extra fields pass through
 * untouched.
 *
 * All three text-carrying fields are optional because different backends
 * split the model output differently:
 *   - `content`          — classic OpenAI shape, llama.cpp with
 *                          `--reasoning-format none` puts everything here.
 *   - `reasoning_content` — some llama.cpp builds split reasoning out here.
 *   - `reasoning`        — `mlx_lm.server` splits reasoning into this field
 *                          and omits `content` entirely when the whole
 *                          response was reasoning (e.g. Qwen chat template).
 *
 * At least one must be non-empty — `extractOutput` enforces that; a response
 * with none populated is surfaced as `LlmEmptyResponse` downstream.
 */
const MessageSchema = Schema.Struct({
  content: Schema.optional(Schema.NullOr(Schema.String)),
  reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
  reasoning: Schema.optional(Schema.NullOr(Schema.String)),
});

const ChoiceSchema = Schema.Struct({
  message: MessageSchema,
});

const UsageSchema = Schema.Struct({
  prompt_tokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  completion_tokens: Schema.optionalWith(Schema.Number, { default: () => 0 }),
});

const TimingsSchema = Schema.Struct({
  prompt_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  predicted_per_second: Schema.optionalWith(Schema.Number, { default: () => 0 }),
});

const ChatResponseSchema = Schema.Struct({
  choices: Schema.Array(ChoiceSchema),
  usage: Schema.optionalWith(UsageSchema, {
    default: () => ({ prompt_tokens: 0, completion_tokens: 0 }),
  }),
  timings: Schema.optional(TimingsSchema),
});

const decodeChatResponse = Schema.decodeUnknown(ChatResponseSchema);

// ── Helpers ─────────────────────────────────────────────────────────────────

const PORTS: Record<Runtime, number> = {
  llamacpp: 18080,
  mlx: 18081,
};

const endpointUrl = (runtime: Runtime): string =>
  `http://127.0.0.1:${PORTS[runtime]}/v1/chat/completions`;

const buildBody = (p: CompletionParams) => ({
  model: p.model,
  messages: [
    { role: "system", content: p.systemPrompt },
    { role: "user", content: p.userPrompt },
  ],
  temperature: p.temperature,
  max_tokens: p.maxTokens,
  stream: false,
});

const extractOutput = (
  choices: ReadonlyArray<{
    readonly message: {
      readonly content?: string | null | undefined;
      readonly reasoning_content?: string | null | undefined;
      readonly reasoning?: string | null | undefined;
    };
  }>,
): string => {
  if (choices.length === 0) return "";
  const first = choices[0];
  if (first === undefined) return "";
  const content = (first.message.content ?? "").trim();
  if (content.length > 0) return content;
  // Both reasoning fields get wrapped in <think>…</think> so that the
  // downstream thinking-tag stripper in `src/scoring/strip-thinking.ts`
  // removes them uniformly regardless of which runtime produced the output.
  const reasoningContent = (first.message.reasoning_content ?? "").trim();
  if (reasoningContent.length > 0) return `<think>${reasoningContent}</think>`;
  const reasoning = (first.message.reasoning ?? "").trim();
  if (reasoning.length > 0) return `<think>${reasoning}</think>`;
  return "";
};

// ── Layer ───────────────────────────────────────────────────────────────────

const makeService = (client: HttpClient.HttpClient): ChatCompletionService => ({
  complete: (params) =>
    Effect.gen(function* () {
      const url = endpointUrl(params.runtime);
      const body = buildBody(params);

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

      // Issue the request + guard on 2xx status. `filterStatusOk` turns
      // non-2xx into a `ResponseError` with `reason: "StatusCode"`.
      const exec = client
        .execute(request)
        .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.mapError(httpError));

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

      const response = yield* executed;

      // Pull the body as JSON. `.json` fails with a `ResponseError`
      // (`reason: "Decode"`) on non-JSON bodies; we map that to
      // `LlmMalformedResponse` and preserve the raw text when possible.
      const rawJson: unknown = yield* response.json.pipe(
        Effect.mapError(
          () =>
            new LlmMalformedResponse({
              model: params.model,
              promptName: params.promptName,
              body: "<response body was not valid JSON>",
            }),
        ),
      );

      const decoded = yield* decodeChatResponse(rawJson).pipe(
        Effect.mapError(
          (cause: ParseError) =>
            new LlmMalformedResponse({
              model: params.model,
              promptName: params.promptName,
              body: `schema decode failed: ${cause.message ?? String(cause)}`,
            }),
        ),
      );

      const output = extractOutput(decoded.choices);
      if (output.length === 0) {
        return yield* Effect.fail(
          new LlmEmptyResponse({
            model: params.model,
            promptName: params.promptName,
          }),
        );
      }

      return {
        output,
        promptTokens: decoded.usage.prompt_tokens,
        generationTokens: decoded.usage.completion_tokens,
        promptTps: decoded.timings?.prompt_per_second ?? 0,
        generationTps: decoded.timings?.predicted_per_second ?? 0,
      } satisfies CompletionResult;
    }),
});

/**
 * Layer constructing a {@link ChatCompletion} service on top of the ambient
 * `HttpClient`. In production, provide `FetchHttpClient.layer` (or the C2
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
