import { HttpClient, type HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Effect, Exit, Layer, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../cli/__tests__/log-capture.js";
import {
  LlmEmptyResponse,
  LlmMalformedResponse,
  LlmRequestError,
  LlmTimeoutError,
} from "../errors/llm.js";
import { ChatCompletion, ChatCompletionLive, type CompletionParams } from "./chat-completion.js";

/**
 * Mock HttpClient layer. The `handler` receives the outgoing request and
 * returns either a `Response` (mapped to an `HttpClientResponse`) or an
 * Effect that can fail with a transport-level error. This mirrors how the
 * real FetchHttpClient dispatches requests.
 */
const mockClient = (
  handler: (req: HttpClientRequest.HttpClientRequest) => Effect.Effect<Response, never> | Response,
): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((req) => {
      const r = handler(req);
      const respEffect = Effect.isEffect(r) ? r : Effect.succeed(r);
      return Effect.map(respEffect, (webResp) => HttpClientResponse.fromWeb(req, webResp));
    }),
  );

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const baseParams = (overrides: Partial<CompletionParams> = {}): CompletionParams => ({
  runtime: "llamacpp",
  model: "test-model",
  promptName: "math_multiply_direct",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "What is 2 + 2?",
  temperature: 0.7,
  maxTokens: 128,
  ...overrides,
});

describe("ChatCompletion", () => {
  it("POSTs to llamacpp port 18080 with OpenAI-compatible body and decodes the response", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;

    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          capturedUrl = req.url;
          // body is an HttpBody; read its .text() if available
          const body = req.body;
          if (body._tag === "Uint8Array" || body._tag === "Raw") {
            const bytes = body._tag === "Uint8Array" ? body.body : new Uint8Array();
            capturedBody = JSON.parse(new TextDecoder().decode(bytes));
          }
          return jsonResponse({
            choices: [{ message: { content: "The answer is 4." } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            timings: { prompt_per_second: 120.5, predicted_per_second: 42.25 },
          });
        }),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));

    expect(capturedUrl).toBe("http://127.0.0.1:18080/v1/chat/completions");
    expect(capturedBody).toMatchObject({
      model: "test-model",
      temperature: 0.7,
      max_tokens: 128,
      stream: false,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is 2 + 2?" },
      ],
    });
    expect(result).toEqual({
      output: "The answer is 4.",
      promptTokens: 10,
      generationTokens: 5,
      promptTps: 120.5,
      generationTps: 42.25,
    });
  });

  it("POSTs to MLX port 18081 when runtime is mlx", async () => {
    let capturedUrl = "";
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          capturedUrl = req.url;
          return jsonResponse({
            choices: [{ message: { content: "hi" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          });
        }),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams({ runtime: "mlx" }));
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(capturedUrl).toBe("http://127.0.0.1:18081/v1/chat/completions");
    // MLX doesn't emit `timings`; we surface that as `null` rather than
    // silently coercing to 0 so the caller can derive a sane fallback.
    expect(result.promptTps).toBeNull();
    expect(result.generationTps).toBeNull();
    expect(result.output).toBe("hi");
  });

  it("propagates temperature and maxTokens into the request body", async () => {
    let capturedBody: { temperature?: number; max_tokens?: number } = {};
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          const body = req.body;
          if (body._tag === "Uint8Array") {
            capturedBody = JSON.parse(new TextDecoder().decode(body.body));
          }
          return jsonResponse({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          });
        }),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams({ temperature: 0.3, maxTokens: 2048 }));
    });

    await Effect.runPromise(Effect.provide(program, layer));
    expect(capturedBody.temperature).toBe(0.3);
    expect(capturedBody.max_tokens).toBe(2048);
  });

  it("wraps reasoning_content in <think>...</think> when content is empty", async () => {
    // Matches the Python prototype behaviour: some llama-server builds split
    // reasoning into `message.reasoning_content` and leave `content` empty.
    // The scoring layer's thinking-tag stripper expects <think>...</think>.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [
              {
                message: {
                  content: "",
                  reasoning_content: "hmm let me think… the answer is 4",
                },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 9 },
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.output).toBe("<think>hmm let me think… the answer is 4</think>");
  });

  it("wraps mlx_lm's `reasoning` field in <think>...</think> when content is empty", async () => {
    // mlx_lm.server exposes reasoning on `message.reasoning` (not
    // `reasoning_content`). Verified against a live server with
    // DeepSeek-R1-0528-Qwen3-8B-4bit.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [{ message: { content: "", reasoning: "thinking it through" } }],
            usage: { prompt_tokens: 3, completion_tokens: 9 },
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.output).toBe("<think>thinking it through</think>");
  });

  it("preserves both reasoning and visible content when both are populated", async () => {
    // When `reasoning_content` (or mlx_lm's `reasoning`) co-exists with
    // non-empty `content`, the archive must capture both — otherwise the
    // thought trace is lost on any reasoning-model run that also produced
    // a visible answer. We prepend `<think>…</think>` so the downstream
    // stripper yields the same scored answer.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [
              {
                message: {
                  content: "12",
                  reasoning: "7 + 5 = 12, user wants just the number",
                },
              },
            ],
            usage: { prompt_tokens: 16, completion_tokens: 200 },
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.output).toBe("<think>7 + 5 = 12, user wants just the number</think>\n\n12");
  });

  it("maps non-2xx HTTP status to LlmRequestError", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(mockClient(() => new Response("internal boom", { status: 500 }))),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const err = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(err).toBeInstanceOf(LlmRequestError);
      if (err instanceof LlmRequestError) {
        expect(err.model).toBe("test-model");
        expect(err.promptName).toBe("math_multiply_direct");
        expect(err.cause).toMatch(/500|StatusCode|internal boom/);
      }
    }
  });

  it("maps transport failure (connection refused) to LlmRequestError", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(mockClient(() => Effect.succeed(Response.error()))),
    );

    // An error Response throws on .json(); treat as transport error.
    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(LlmRequestError);
    }
  });

  it("maps malformed JSON (missing choices[]) to LlmMalformedResponse", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(mockClient(() => jsonResponse({ no: "choices here" }))),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(LlmMalformedResponse);
    }
  });

  it("maps an empty message object (no content, no reasoning) to LlmEmptyResponse", async () => {
    // mlx_lm.server legitimately omits `content` when the whole response was
    // reasoning, so a missing `content` is no longer a malformed response —
    // only a missing `message` key would be. If `content`, `reasoning_content`,
    // and `reasoning` are all absent/empty, the result is an empty response.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [{ message: {} }],
            usage: { prompt_tokens: 1, completion_tokens: 0 },
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(LlmEmptyResponse);
    }
  });

  it("maps empty content (no reasoning fallback) to LlmEmptyResponse", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [{ message: { content: "   " } }],
            usage: { prompt_tokens: 1, completion_tokens: 0 },
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(LlmEmptyResponse);
    }
  });

  it("respects per-request timeout and fails with LlmTimeoutError", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(
          () =>
            // Never-resolving response simulates a hung server.
            Effect.never as Effect.Effect<Response, never>,
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams({ timeoutSec: 0.05 }));
    });

    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(LlmTimeoutError);
      if (exit.cause.error instanceof LlmTimeoutError) {
        expect(exit.cause.error.timeoutSec).toBe(0.05);
      }
    }
  });

  it("surfaces null promptTps/generationTps when the `timings` block is absent", async () => {
    // Regression guard for the MLX-reports-zero-tps bug: we must NOT silently
    // coerce missing timings to 0 inside the decode path. Returning `null`
    // keeps the signal visible so `runPrompt` can compute a wall-time fallback.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 7, completion_tokens: 3 },
            // no `timings`
          }),
        ),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result).toEqual({
      output: "ok",
      promptTokens: 7,
      generationTokens: 3,
      promptTps: null,
      generationTps: null,
    });
  });

  it("emits DBG lines around a successful request", async () => {
    const sink: string[] = [];
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          jsonResponse({
            choices: [{ message: { content: "hi" } }],
            usage: { prompt_tokens: 4, completion_tokens: 2 },
          }),
        ),
      ),
    );
    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });
    await Effect.runPromise(
      Effect.provide(program, layer).pipe(Effect.provide(captureLogs(sink, LogLevel.Debug))),
    );
    expect(sink.some((l) => /DBG.*chat.*POST http:\/\/127\.0\.0\.1:18080/.test(l))).toBe(true);
    expect(sink.some((l) => /DBG.*chat.*response 200 in \d/.test(l))).toBe(true);
    expect(sink.some((l) => /prompt_tokens=4.*gen_tokens=2/.test(l))).toBe(true);
  });

  it("emits DBG error line on request failure", async () => {
    const sink: string[] = [];
    const layer = ChatCompletionLive.pipe(
      Layer.provide(mockClient(() => new Response("nope", { status: 500 }))),
    );
    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });
    await Effect.runPromiseExit(
      Effect.provide(program, layer).pipe(Effect.provide(captureLogs(sink, LogLevel.Debug))),
    );
    expect(sink.some((l) => /DBG.*chat.*error after \d/.test(l))).toBe(true);
  });
});
