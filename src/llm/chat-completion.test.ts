import { HttpClient, type HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
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
    // MLX doesn't always emit `timings`; tps fields fall back to 0.
    expect(result.promptTps).toBe(0);
    expect(result.generationTps).toBe(0);
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

  it("defaults promptTps/generationTps to 0 when timings field is absent", async () => {
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
      promptTps: 0,
      generationTps: 0,
    });
  });
});
