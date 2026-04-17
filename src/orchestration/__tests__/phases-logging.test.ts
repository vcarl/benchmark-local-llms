import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import type { ChatCompletionService } from "../../llm/chat-completion.js";
import { ChatCompletion } from "../../llm/chat-completion.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { RunStats } from "../../schema/run-manifest.js";
import { runPromptPhase, truncateError } from "../phases.js";
import type { RunModelInput } from "../run-model.js";
import { emptyAggregate, type ModelAggregate } from "../summary.js";

const fakeChat = (): ChatCompletionService => ({
  complete: () =>
    Effect.succeed({
      output: "hello",
      promptTokens: 10,
      generationTokens: 20,
      promptTps: 140,
      generationTps: 18,
    }),
});

const chatLayer = Layer.succeed(ChatCompletion, fakeChat());

const failingChat = (cause: unknown): ChatCompletionService => ({
  // Cast via `never` — `runPrompt` only stringifies the cause, so we can
  // inject any shape without breaking the declared error channel.
  complete: () => Effect.fail(cause as never),
});

const prompt: PromptCorpusEntry = {
  name: "code_4",
  system: { name: "s", text: "be helpful" },
  promptText: "hi",
  promptHash: "h",
  scorer: { type: "exact_match", expected: "hello" },
} as unknown as PromptCorpusEntry;

const baseInput = (): RunModelInput => ({
  manifest: {
    schemaVersion: 1,
    runId: "r1",
    startedAt: "2026-04-17T00:00:00Z",
    finishedAt: null,
    interrupted: false,
    artifact: "art",
    model: "qwen3.5-9b",
    runtime: "mlx",
    quant: "Q4_K_M",
    env: {
      hostname: "h",
      platform: "darwin-arm64",
      runtimeVersion: "u",
      nodeVersion: "u",
      benchmarkGitSha: "u",
    },
    temperatures: [0.7],
    promptCorpus: {},
    scenarioCorpus: {},
    stats: {
      totalPrompts: 1,
      totalExecutions: 0,
      completed: 0,
      skippedCached: 0,
      errors: 0,
      totalWallTimeSec: 0,
    },
  },
  archivePath: "/tmp/archive.jsonl",
  prompts: [prompt],
  scenarios: [],
  temperatures: [0.7],
  archiveDir: "/tmp",
  fresh: true,
  maxTokens: 16,
  noSave: true,
});

describe("prompt phase logging", () => {
  it("emits an INF line with prompt name, temp, tokens, tps, wall time", async () => {
    const sink: string[] = [];
    const statsRef = await Effect.runPromise(Ref.make<RunStats>(baseInput().manifest.stats));
    const aggRef = await Effect.runPromise(Ref.make<ModelAggregate>(emptyAggregate()));
    await Effect.runPromise(
      runPromptPhase(baseInput(), statsRef, aggRef).pipe(
        Effect.provide(Layer.merge(captureLogs(sink, LogLevel.Info), chatLayer)),
        Effect.provide(NodeContext.layer),
      ),
    );
    const line = sink.find((l) => l.includes("prompt 1/1"));
    expect(line).toBeDefined();
    expect(line).toContain("code_4 @0.7 \u2192");
    expect(line).toContain("20 gen tok");
    expect(line).toContain("18.0 tps gen");
    expect(line).toContain("140.0 tps prompt");
  });

  it("emits an ERROR line for failing prompts with error truncated to 200 chars + …", async () => {
    // 250-char string pushed into the chat cause; `runPrompt` slices it to 200
    // via `stringifyLlmError`, and the ERROR-log `truncateError` is a no-op at
    // exactly 200 chars (so the emitted line won't carry `…`). This verifies
    // the integration wiring: log contains `ERROR:` followed by the first 200
    // chars of the cause.
    const longCause = "A".repeat(250);
    const sink: string[] = [];
    const statsRef = await Effect.runPromise(Ref.make<RunStats>(baseInput().manifest.stats));
    const aggRef = await Effect.runPromise(Ref.make<ModelAggregate>(emptyAggregate()));
    await Effect.runPromise(
      runPromptPhase(baseInput(), statsRef, aggRef).pipe(
        Effect.provide(
          Layer.merge(
            captureLogs(sink, LogLevel.Info),
            Layer.succeed(ChatCompletion, failingChat(longCause)),
          ),
        ),
        Effect.provide(NodeContext.layer),
      ),
    );
    const line = sink.find((l) => l.includes("prompt 1/1") && l.includes("ERROR:"));
    expect(line).toBeDefined();
    expect(line).toContain(`ERROR: ${"A".repeat(200)}`);
    // 200 chars exactly → no ellipsis in the log line.
    expect(line).not.toContain("\u2026");
  });
});

describe("truncateError", () => {
  it("returns the input unchanged when <= 200 chars", () => {
    expect(truncateError("short")).toBe("short");
    expect(truncateError("A".repeat(200))).toBe("A".repeat(200));
  });

  it("truncates to 200 chars and appends … when longer", () => {
    const input = `${"A".repeat(200)}TAIL`;
    const out = truncateError(input);
    expect(out).toBe(`${"A".repeat(200)}\u2026`);
    expect(out.endsWith("\u2026")).toBe(true);
    // 200 A's + 1 ellipsis code-point = 201 code-points.
    expect([...out].length).toBe(201);
  });
});
