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

/**
 * Build a server-sent-event body the way a real completion server streams one:
 * per-token delta chunks, then (when asked) a trailing usage chunk, then
 * `[DONE]`. `completion` is the non-streaming shape these tests were written
 * against, translated so they keep asserting on behaviour rather than wire
 * format.
 */
const sseResponse = (completion: {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  finish_reason?: string | null;
  usage?: { prompt_tokens: number; completion_tokens: number };
  timings?: { prompt_per_second: number; predicted_per_second: number };
  omitUsage?: boolean;
}): Response => {
  const lines: string[] = [];
  const delta: Record<string, string> = {};
  if (completion.content != null) delta["content"] = completion.content;
  if (completion.reasoning_content != null)
    delta["reasoning_content"] = completion.reasoning_content;
  if (completion.reasoning != null) delta["reasoning"] = completion.reasoning;
  lines.push(`data: ${JSON.stringify({ choices: [{ delta }] })}`);
  lines.push(
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: completion.finish_reason ?? "stop" }],
    })}`,
  );
  if (completion.omitUsage !== true) {
    const tail: Record<string, unknown> = {
      usage: completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
    };
    if (completion.timings !== undefined) tail["timings"] = completion.timings;
    lines.push(`data: ${JSON.stringify(tail)}`);
  }
  lines.push("data: [DONE]");
  return new Response(`${lines.join("\n\n")}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
};

/** Stream a body verbatim — for malformed-stream cases. */
const rawStreamResponse = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
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
          return sseResponse({
            content: "The answer is 4.",
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
      stream: true,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is 2 + 2?" },
      ],
    });
    expect(result).toEqual({
      output: "The answer is 4.",
      reasoning: null,
      promptTokens: 10,
      generationTokens: 5,
      promptTps: 120.5,
      generationTps: 42.25,
      finishReason: "stop",
      timing: expect.any(Object),
    });
  });

  it("POSTs to MLX port 18081 when runtime is mlx", async () => {
    let capturedUrl = "";
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          capturedUrl = req.url;
          return sseResponse({
            content: "hi",
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
          return sseResponse({
            content: "ok",
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

  it("sends seed when set and omits it otherwise", async () => {
    const bodies: Array<{ seed?: number }> = [];
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          const body = req.body;
          if (body._tag === "Uint8Array")
            bodies.push(JSON.parse(new TextDecoder().decode(body.body)));
          return sseResponse({ content: "ok", usage: { prompt_tokens: 1, completion_tokens: 1 } });
        }),
      ),
    );
    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      yield* chat.complete(baseParams({ seed: 1234 }));
      yield* chat.complete(baseParams());
    });
    await Effect.runPromise(Effect.provide(program, layer));
    expect(bodies[0]?.seed).toBe(1234);
    expect(bodies[1] && "seed" in bodies[1]).toBe(false);
  });

  it("captures reasoning_content as result.reasoning when content is empty", async () => {
    // Some llama-server builds (`--reasoning-format deepseek`) split
    // reasoning into `message.reasoning_content` and leave `content` empty.
    // The chat-completion service surfaces that body verbatim on
    // `result.reasoning`; downstream code is responsible for any further
    // handling (the scoring path treats it as separated thinking).
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          sseResponse({
            content: "",
            reasoning_content: "hmm let me think… the answer is 4",
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
    expect(result.output).toBe("");
    expect(result.reasoning).toBe("hmm let me think… the answer is 4");
  });

  it("captures mlx_lm's `reasoning` field as result.reasoning when content is empty", async () => {
    // mlx_lm.server exposes reasoning on `message.reasoning` (not
    // `reasoning_content`). Verified against a live server with
    // DeepSeek-R1-0528-Qwen3-8B-4bit.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          sseResponse({
            content: "",
            reasoning: "thinking it through",
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
    expect(result.output).toBe("");
    expect(result.reasoning).toBe("thinking it through");
  });

  it("preserves reasoning and content as separate fields when both are populated", async () => {
    // When `reasoning_content` (or mlx_lm's `reasoning`) co-exists with
    // non-empty `content`, the archive must capture both — otherwise the
    // thought trace is lost on any reasoning-model run that also produced
    // a visible answer. We surface both verbatim on `CompletionResult` so
    // downstream consumers can record/score them independently.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          sseResponse({
            content: "12",
            reasoning: "7 + 5 = 12, user wants just the number",
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
    expect(result.output).toBe("12");
    expect(result.reasoning).toBe("7 + 5 = 12, user wants just the number");
  });

  it("maps non-2xx HTTP status to LlmRequestError with status + body", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(
          () =>
            new Response(JSON.stringify({ error: "tokenizer template failed" }), { status: 404 }),
        ),
      ),
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
        expect(err.cause).toContain("HTTP 404");
        expect(err.cause).toContain("tokenizer template failed");
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
      Layer.provide(
        mockClient(() => rawStreamResponse('data: {"totally": "unexpected"}\n\ndata: [DONE]\n\n')),
      ),
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
        mockClient(() => sseResponse({ usage: { prompt_tokens: 1, completion_tokens: 0 } })),
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
          sseResponse({
            content: "   ",
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
          sseResponse({
            content: "ok",
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
      reasoning: null,
      promptTokens: 7,
      generationTokens: 3,
      promptTps: null,
      generationTps: null,
      finishReason: "stop",
      timing: expect.any(Object),
    });
  });

  it("without `timings`, measures decode tok/s from the stream after the first token", async () => {
    // Prefill (the wait before the first token) is excluded: 4 more tokens
    // over the ~200 ms between the first and last content frames ≈ 20 tok/s.
    const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
    const frames: [number, string][] = [
      [300, frame({ choices: [{ delta: { content: "a" } }] })],
      [100, frame({ choices: [{ delta: { content: "b" } }] })],
      [100, frame({ choices: [{ delta: { content: "c" } }] })],
      [0, frame({ choices: [{ delta: {}, finish_reason: "stop" }] })],
      [0, frame({ usage: { prompt_tokens: 7, completion_tokens: 5 } })],
      [0, "data: [DONE]\n\n"],
    ];
    const body = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        for (const [ms, f] of frames) {
          if (ms > 0) await new Promise((r) => setTimeout(r, ms));
          ctrl.enqueue(new TextEncoder().encode(f));
        }
        ctrl.close();
      },
    });
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(
          () =>
            new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        ),
      ),
    );
    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams({ runtime: "mlx" }));
    });
    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.promptTps).toBeNull();
    expect(result.generationTps).toBeGreaterThan(12);
    expect(result.generationTps).toBeLessThan(21);
  });

  it("emits DBG lines around a successful request", async () => {
    const sink: string[] = [];
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          sseResponse({
            content: "hi",
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

  /**
   * The repetition knobs are the one place a configuration silently changes
   * what the model generates, so these lock down both halves of the contract:
   * the runtime-specific spelling, and the fact that an unset knob leaves the
   * request body exactly as it was.
   */
  const captureBody = (params: CompletionParams) =>
    Effect.gen(function* () {
      let captured: Record<string, unknown> = {};
      const layer = ChatCompletionLive.pipe(
        Layer.provide(
          mockClient((req) => {
            const body = req.body;
            if (body._tag === "Uint8Array") {
              captured = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
            }
            return sseResponse({
              content: "ok",
              finish_reason: "length",
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            });
          }),
        ),
      );
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(params);
        }),
        layer,
      );
      return { captured, result };
    });

  it("sends no repetition fields when the configuration does not set them", async () => {
    const { captured } = await Effect.runPromise(captureBody(baseParams()));
    expect(captured).not.toHaveProperty("repeat_penalty");
    expect(captured).not.toHaveProperty("repetition_penalty");
    expect(captured).not.toHaveProperty("repeat_last_n");
    expect(captured).not.toHaveProperty("repetition_context_size");
  });

  it("spells the repetition penalty llama.cpp's way for llamacpp", async () => {
    const { captured } = await Effect.runPromise(
      captureBody(baseParams({ repetitionPenalty: 1.1, repetitionContextSize: 64 })),
    );
    expect(captured).toMatchObject({ repeat_penalty: 1.1, repeat_last_n: 64 });
    expect(captured).not.toHaveProperty("repetition_penalty");
  });

  it("spells the repetition penalty the MLX way for mlx and omlx", async () => {
    for (const runtime of ["mlx", "omlx"] as const) {
      const { captured } = await Effect.runPromise(
        captureBody(
          baseParams({
            runtime,
            repetitionPenalty: 1.15,
            repetitionContextSize: 32,
          }),
        ),
      );
      expect(captured).toMatchObject({
        repetition_penalty: 1.15,
        repetition_context_size: 32,
      });
      expect(captured).not.toHaveProperty("repeat_penalty");
    }
  });

  it("maps the presence window to each runtime's knob", async () => {
    const { captured: mlx } = await Effect.runPromise(
      captureBody(baseParams({ runtime: "mlx", presencePenalty: 1.5, presenceContextSize: 4096 })),
    );
    expect(mlx).toMatchObject({ presence_penalty: 1.5, presence_context_size: 4096 });
    expect(mlx).not.toHaveProperty("repetition_context_size");

    // llama.cpp windows every penalty with repeat_last_n.
    const { captured: llama } = await Effect.runPromise(
      captureBody(baseParams({ presencePenalty: 1.5, presenceContextSize: 4096 })),
    );
    expect(llama).toMatchObject({ presence_penalty: 1.5, repeat_last_n: 4096 });
    expect(llama).not.toHaveProperty("repeat_penalty");
    expect(llama).not.toHaveProperty("presence_context_size");

    // No presence penalty, no window.
    const { captured: bare } = await Effect.runPromise(
      captureBody(baseParams({ runtime: "mlx", presenceContextSize: 4096 })),
    );
    expect(bare).not.toHaveProperty("presence_context_size");
  });

  it("sends no top_p/top_k/min_p when the configuration does not set them", async () => {
    const { captured } = await Effect.runPromise(captureBody(baseParams()));
    for (const k of ["top_p", "top_k", "min_p", "presence_penalty"])
      expect(captured).not.toHaveProperty(k);
  });

  it("sends top_p, top_k and min_p under the same names for every runtime", async () => {
    for (const runtime of ["llamacpp", "mlx", "omlx"] as const) {
      const { captured } = await Effect.runPromise(
        captureBody(
          baseParams({
            runtime,
            topP: 0.9,
            topK: 40,
            minP: 0.05,
            presencePenalty: 1.5,
          }),
        ),
      );
      expect(captured).toMatchObject({
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        presence_penalty: 1.5,
      });
    }
  });

  it("sends chat_template_kwargs only when the configuration sets them", async () => {
    const { captured: unset } = await Effect.runPromise(captureBody(baseParams()));
    expect(unset).not.toHaveProperty("chat_template_kwargs");
    const { captured } = await Effect.runPromise(
      captureBody(
        baseParams({ runtime: "omlx", chatTemplateKwargs: { reasoning_effort: "high" } }),
      ),
    );
    expect(captured).toMatchObject({ chat_template_kwargs: { reasoning_effort: "high" } });
  });

  it("sends prior conversation turns between the system and the user message", async () => {
    const history = [
      { role: "user" as const, content: "t1?" },
      { role: "assistant" as const, content: "42" },
    ];
    const { captured } = await Effect.runPromise(captureBody(baseParams({ history })));
    expect(captured["messages"]).toEqual([
      { role: "system", content: baseParams().systemPrompt },
      ...history,
      { role: "user", content: baseParams().userPrompt },
    ]);
  });

  it("reports the server's finish_reason so a budget-exhausted answer is distinguishable", async () => {
    const { result } = await Effect.runPromise(captureBody(baseParams()));
    expect(result.finishReason).toBe("length");
  });

  it("aborts a generation that is provably repeating itself", async () => {
    // The archive shape: a model that never stops repeating burns its whole
    // token budget to produce nothing. Cutting it short is the point.
    let chunksServed = 0;
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() => {
          const lines: string[] = [];
          // Enough distinct words to clear the detector's minimum, then a loop.
          for (let i = 0; i < 420; i += 1) {
            lines.push(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: `w${i} ` } }] })}`,
            );
          }
          for (let i = 0; i < 2000; i += 1) {
            lines.push(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "an upstream " } }] })}`,
            );
          }
          lines.push(
            `data: ${JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 9999 } })}`,
          );
          lines.push("data: [DONE]");
          chunksServed = lines.length;
          return rawStreamResponse(`${lines.join("\n\n")}\n\n`);
        }),
      ),
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams());
        }),
        layer,
      ),
    );
    expect(chunksServed).toBeGreaterThan(2000);
    expect(result.finishReason).toBe("loop");
    // Aborted before the trailing usage chunk, so counts are absent, not zero-
    // as-observed. `stopReason` is what marks them unmeasured.
    expect(result.generationTokens).toBe(0);
    expect(result.reasoning).toContain("an upstream");
  });

  it("does not abort long reasoning that never repeats", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() => {
          const lines: string[] = [];
          for (let i = 0; i < 4000; i += 1) {
            lines.push(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: `tok${i} ` } }] })}`,
            );
          }
          lines.push(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })}`,
          );
          lines.push(
            `data: ${JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 4000 } })}`,
          );
          lines.push("data: [DONE]");
          return rawStreamResponse(`${lines.join("\n\n")}\n\n`);
        }),
      ),
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams());
        }),
        layer,
      ),
    );
    expect(result.finishReason).toBe("length");
    expect(result.generationTokens).toBe(4000);
  });

  it("refuses a streamed response that carries no usage block", async () => {
    // Silently recording zero tokens would corrupt every efficiency metric,
    // so a runtime that ignores stream_options must fail loudly instead.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(mockClient(() => sseResponse({ content: "hi", omitUsage: true }))),
    );
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams());
        }),
        layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("reassembles content split across many delta chunks", async () => {
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() => {
          const lines = ["The ", "answer ", "is ", "4."].map(
            (c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}`,
          );
          lines.push(
            `data: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 4 } })}`,
          );
          lines.push("data: [DONE]");
          return rawStreamResponse(`${lines.join("\n\n")}\n\n`);
        }),
      ),
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams());
        }),
        layer,
      ),
    );
    expect(result.output).toBe("The answer is 4.");
  });

  it("announces the abort at INFO so the server's broken-pipe traceback is explicable", async () => {
    const sink: string[] = [];
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() => {
          const lines: string[] = [];
          for (let i = 0; i < 420; i += 1) {
            lines.push(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: `w${i} ` } }] })}`,
            );
          }
          for (let i = 0; i < 2000; i += 1) {
            lines.push(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "an upstream " } }] })}`,
            );
          }
          lines.push("data: [DONE]");
          return rawStreamResponse(`${lines.join("\n\n")}\n\n`);
        }),
      ),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatCompletion;
        return yield* chat.complete(baseParams());
      }).pipe(Effect.provide(layer), Effect.provide(captureLogs(sink, LogLevel.Info))),
    );
    const line = sink.find((l) => l.includes("loop detected"));
    expect(line).toBeDefined();
    expect(line).toContain("math_multiply_direct");
    expect(line).toContain("12-word window");
    expect(line).toContain("broken pipe");
  });

  it("skips a malformed frame instead of dying on it", async () => {
    // An exception inside the stream reader is a defect, not a failure, so it
    // would bypass the error channel entirely and take the whole item with it.
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient(() =>
          rawStreamResponse(
            `${[
              `data: ${JSON.stringify({ choices: [{ delta: { content: "The " } }] })}`,
              "data: {this is not json",
              `data: ${JSON.stringify({ choices: [{ delta: { content: "answer." } }] })}`,
              `data: ${JSON.stringify({ usage: { prompt_tokens: 2, completion_tokens: 2 } })}`,
              "data: [DONE]",
            ].join("\n\n")}\n\n`,
          ),
        ),
      ),
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams());
        }),
        layer,
      ),
    );
    expect(result.output).toBe("The answer.");
    expect(result.generationTokens).toBe(2);
  });

  // ── Per-request timing, one fixture per runtime's SSE shape ──────────────
  //
  // Frames arrive on real timers: 150 ms before the first token (prefill as
  // the client sees it), then 100 ms per further frame.
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const completeWith = (
    runtime: CompletionParams["runtime"],
    frames: ReadonlyArray<readonly [number, string]>,
  ) =>
    Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const chat = yield* ChatCompletion;
          return yield* chat.complete(baseParams({ runtime }));
        }),
        ChatCompletionLive.pipe(
          Layer.provide(
            mockClient(
              () =>
                new Response(
                  new ReadableStream<Uint8Array>({
                    async start(ctrl) {
                      for (const [ms, f] of frames) {
                        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
                        ctrl.enqueue(new TextEncoder().encode(f));
                      }
                      ctrl.close();
                    },
                  }),
                  { status: 200, headers: { "Content-Type": "text/event-stream" } },
                ),
            ),
          ),
        ),
      ),
    ).then((r) => {
      if (r.timing === undefined) throw new Error("live service must always set timing");
      return { ...r, timing: r.timing };
    });

  it("llama.cpp: keeps the final `timings` block (server source) and measures TTFT", async () => {
    // llama-server's stream: deltas, a finish frame, then the final chunk with
    // usage and `timings` (server_slot_stats::to_json in server-common.cpp).
    const result = await completeWith("llamacpp", [
      [150, frame({ choices: [{ delta: { reasoning_content: "hm" } }] })],
      [100, frame({ choices: [{ delta: { content: "4" } }] })],
      [0, frame({ choices: [{ delta: {}, finish_reason: "stop" }] })],
      [
        0,
        frame({
          choices: [],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 2,
            prompt_tokens_details: { cached_tokens: 32 },
          },
          timings: {
            cache_n: 32,
            prompt_n: 8,
            prompt_ms: 12.5,
            prompt_per_token_ms: 1.5625,
            prompt_per_second: 640,
            predicted_n: 2,
            predicted_ms: 95.25,
            predicted_per_token_ms: 47.625,
            predicted_per_second: 21,
            draft_n: 6,
            draft_n_accepted: 4,
          },
        }),
      ],
      [0, "data: [DONE]\n\n"],
    ]);
    const { ttftMs, ...rest } = result.timing;
    expect(ttftMs).toBeGreaterThanOrEqual(140);
    expect(ttftMs).toBeLessThan(400);
    expect(rest).toEqual({
      timingSource: "server",
      prefillMs: 12.5,
      decodeMs: 95.25,
      prefillTokens: 8,
      cachedPromptTokens: 32,
      draftTokens: 6,
      draftAcceptedTokens: 4,
    });
  });

  it("llama.cpp: no draft fields when speculative decoding is off", async () => {
    const result = await completeWith("llamacpp", [
      [0, frame({ choices: [{ delta: { content: "4" } }] })],
      [
        0,
        frame({
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 9, completion_tokens: 1 },
          timings: {
            cache_n: 0,
            prompt_n: 9,
            prompt_ms: 20,
            prompt_per_second: 450,
            predicted_n: 1,
            predicted_ms: 0.5,
            predicted_per_second: 2000,
          },
        }),
      ],
      [0, "data: [DONE]\n\n"],
    ]);
    expect(result.timing).not.toHaveProperty("draftTokens");
    expect(result.timing).not.toHaveProperty("draftAcceptedTokens");
    expect(result.timing.cachedPromptTokens).toBe(0);
  });

  it("mlx_lm: prefill is TTFT, decode is first-to-last frame, cached tokens from usage", async () => {
    // mlx_lm.server: `reasoning` deltas, then content, then a trailing usage
    // chunk with prompt_tokens_details.cached_tokens and no `timings`.
    const result = await completeWith("mlx", [
      [150, frame({ choices: [{ delta: { reasoning: "hm" } }] })],
      [100, frame({ choices: [{ delta: { content: "4" } }] })],
      [100, frame({ choices: [{ delta: { content: "." }, finish_reason: "stop" }] })],
      [
        0,
        frame({
          choices: [],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 3,
            prompt_tokens_details: { cached_tokens: 24 },
          },
        }),
      ],
      [0, "data: [DONE]\n\n"],
    ]);
    const t = result.timing;
    expect(t.timingSource).toBe("client");
    expect(t.ttftMs).toBeGreaterThanOrEqual(140);
    expect(t.prefillMs).toBe(t.ttftMs);
    expect(t.decodeMs).toBeGreaterThanOrEqual(180);
    expect(t.decodeMs).toBeLessThan(450);
    expect(t.cachedPromptTokens).toBe(24);
    expect(t).not.toHaveProperty("prefillTokens");
  });

  it("oMLX: same client split; reads cached tokens and ignores its usage timing extension", async () => {
    // oMLX: `reasoning_content` deltas; the usage chunk carries
    // prompt_tokens_details plus its own (seconds, 2-dp) timing extension.
    const result = await completeWith("omlx", [
      [150, frame({ choices: [{ delta: { reasoning_content: "hm" } }] })],
      [100, frame({ choices: [{ delta: { content: "4" } }] })],
      [0, frame({ choices: [{ delta: {}, finish_reason: "stop" }] })],
      [
        0,
        frame({
          choices: [],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 2,
            total_tokens: 42,
            prompt_tokens_details: { cached_tokens: 0 },
            time_to_first_token: 0.15,
            total_time: 0.25,
            prompt_eval_duration: 0.15,
            generation_duration: 0.1,
          },
        }),
      ],
      [0, "data: [DONE]\n\n"],
    ]);
    const t = result.timing;
    expect(t.timingSource).toBe("client");
    expect(t.ttftMs).toBeGreaterThanOrEqual(140);
    expect(t.prefillMs).toBe(t.ttftMs);
    expect(t.decodeMs).toBeGreaterThanOrEqual(90);
    expect(t.cachedPromptTokens).toBe(0);
  });

  it("omits decode time and cached tokens when the stream cannot supply them", async () => {
    // One content frame, no prompt_tokens_details: nothing to measure decode over.
    const result = await completeWith("mlx", [
      [0, frame({ choices: [{ delta: { content: "4" }, finish_reason: "stop" }] })],
      [0, frame({ usage: { prompt_tokens: 3, completion_tokens: 1 } })],
      [0, "data: [DONE]\n\n"],
    ]);
    expect(result.timing.ttftMs).toBeTypeOf("number");
    expect(result.timing).not.toHaveProperty("decodeMs");
    expect(result.timing).not.toHaveProperty("cachedPromptTokens");
  });
});
