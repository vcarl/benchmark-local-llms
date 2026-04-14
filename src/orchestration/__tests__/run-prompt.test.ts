import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { LlmRequestError, LlmTimeoutError } from "../../errors/index.js";
import { runPrompt } from "../run-prompt.js";
import { makeChatCompletionMock, sampleModel, samplePromptExact } from "./fixtures.js";

describe("runPrompt", () => {
  it("produces an ExecutionResult on success, with tokens and tps from the completion", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "The answer is 4",
          promptTokens: 42,
          generationTokens: 13,
          promptTps: 95.5,
          generationTps: 30.2,
        },
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.promptName).toBe("p1");
    expect(result.temperature).toBe(0.7);
    expect(result.error).toBeNull();
    expect(result.output).toBe("The answer is 4");
    expect(result.promptTokens).toBe(42);
    expect(result.generationTokens).toBe(13);
    expect(result.promptTps).toBeCloseTo(95.5);
    expect(result.generationTps).toBeCloseTo(30.2);
    expect(result.runtime).toBe("mlx");
    expect(result.runId).toBe("run-1");
    expect(result.promptHash).toBe("hash-p1");
    expect(result.scenarioName).toBeNull();
  });

  it("folds LlmRequestError into a result with error text", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "fail",
        error: new LlmRequestError({
          model: "Test Model",
          promptName: "p1",
          cause: "connection refused",
        }),
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.error).not.toBeNull();
    expect(result.error).toContain("LlmRequestError");
    expect(result.output).toBe("");
    expect(result.promptTokens).toBe(0);
  });

  it("folds LlmTimeoutError into the result, same pattern", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.3": {
        kind: "fail",
        error: new LlmTimeoutError({ model: "m", promptName: "p1", timeoutSec: 5 }),
      },
    });
    const result = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.3,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.error).toContain("LlmTimeoutError");
  });

  it("forwards the requested timeout into completion params", async () => {
    const { layer, log } = makeChatCompletionMock({});
    await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
        timeoutSec: 77,
      }).pipe(Effect.provide(layer)),
    );
    expect(log.calls[0]?.timeoutSec).toBe(77);
  });

  it("stamps displayName from model.name when present, artifact when absent", async () => {
    const { layer } = makeChatCompletionMock({});
    const result1 = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel({ name: "Nickname", artifact: "org/real" }),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result1.model).toBe("Nickname");
    const result2 = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel({ name: undefined, artifact: "org/real" }),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result2.model).toBe("org/real");
  });

  it("peakMemoryGb is stubbed at 0 (subprocess mode eliminated)", async () => {
    // Explicit: the rewrite has no peak-memory source over HTTP.
    const { layer } = makeChatCompletionMock({});
    const result = await Effect.runPromise(
      runPrompt({
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(result.peakMemoryGb).toBe(0);
  });
});
