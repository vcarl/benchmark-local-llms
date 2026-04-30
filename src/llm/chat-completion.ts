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
 *   counters when the server reports them (llamacpp). `mlx_lm.server` does
 *   not emit a `timings` object, so both tps fields come back as `null`.
 *   The caller (`runPrompt`) is responsible for either deriving `generationTps`
 *   from wall time or recording 0 explicitly — this service does NOT silently
 *   coerce missing timings to 0, because that hides the signal.
 */
import { HttpClient, HttpClientRequest } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Clock, Context, Effect, Layer, Schema } from "effect";
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
  /**
   * Tokens/sec reported by the server's `timings` block (llamacpp emits these;
   * mlx_lm.server omits the whole block). `null` means "server did not report"
   * — callers must decide whether to derive a value from wall time or record
   * zero explicitly. Do not coerce `null` to `0` at the decode site; that
   * hides the MLX-vs-llamacpp signal.
   */
  readonly promptTps: number | null;
  readonly generationTps: number | null;
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
 *   - `reasoning_content` — llama.cpp `--reasoning-format deepseek` strips
 *                          reasoning out of `content` and exposes it here.
 *   - `reasoning`        — `mlx_lm.server` always splits reasoning into this
 *                          field; `content` may be empty (budget hit mid-think)
 *                          or populated (reasoning + visible answer both fit).
 *
 * When a split-reasoning field is populated alongside `content`, both are
 * preserved in the archived output (`<think>…</think>\n\ncontent`) so the
 * archive stays lossless. `extractOutput` rejects the all-empty case with
 * `LlmEmptyResponse` downstream.
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

export const extractOutput = (
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
  const reasoningContent = (first.message.reasoning_content ?? "").trim();
  const reasoning = (first.message.reasoning ?? "").trim();
  // Providers that split reasoning out of `content` use either
  // `reasoning_content` (llama.cpp `--reasoning-format deepseek`) or
  // `reasoning` (mlx_lm.server); never both on the same response. Wrapping
  // the split text in `<think>…</think>` matches what llama.cpp emits with
  // `--reasoning-format none`, so archives stay lossless and the downstream
  // thinking-tag stripper in `src/scoring/strip-thinking.ts` peels it off
  // uniformly regardless of which runtime produced the output.
  const splitReasoning = reasoningContent.length > 0 ? reasoningContent : reasoning;
  if (splitReasoning.length === 0) return content;
  const wrapped = `<think>${splitReasoning}</think>`;
  return content.length === 0 ? wrapped : `${wrapped}\n\n${content}`;
};

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

      const endMs = yield* Clock.currentTimeMillis;
      const elapsed = ((endMs - startMs) / 1000).toFixed(1);
      yield* Effect.logDebug(
        `response 200 in ${elapsed}s, prompt_tokens=${decoded.usage.prompt_tokens} gen_tokens=${decoded.usage.completion_tokens}`,
      ).pipe(Effect.annotateLogs("scope", "chat"));

      // `timings` is an llamacpp-only extension. When absent we return
      // `null` so callers can compute a fallback from wall time (see
      // `runPrompt::makeSuccessResult`). Silently defaulting to 0 here
      // would make MLX runs look like they completed at 0 tokens/sec.
      const timings = decoded.timings;
      return {
        output,
        promptTokens: decoded.usage.prompt_tokens,
        generationTokens: decoded.usage.completion_tokens,
        promptTps: timings === undefined ? null : timings.prompt_per_second,
        generationTps: timings === undefined ? null : timings.predicted_per_second,
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
