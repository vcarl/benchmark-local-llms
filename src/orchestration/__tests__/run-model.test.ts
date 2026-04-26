/**
 * Integration tests for `runModel`. Archive I/O is real (tempdir-backed),
 * everything else (ChatCompletion, servers, Admiral, gameserver) is mocked.
 *
 * We assert on the archive file on disk: header envelope, result lines, and
 * finalized trailer. Direct state is inspected where relevant (e.g. the
 * trailer's `interrupted` flag after `Fiber.interrupt`).
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit, Fiber, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openManifest } from "../../archive/__tests__/fixtures.js";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { LlmRequestError } from "../../errors/index.js";
import { ChatCompletion } from "../../llm/chat-completion.js";
import { ExecutionResult, RunManifest } from "../../schema/index.js";
import { runModel } from "../run-model.js";
import {
  agentEvent,
  fakeDeps,
  fakeGameSessionFactory,
  inertHttpClientLayer,
  makeChatCompletionMock,
  makeTempDir,
  readArchiveLines,
  removeDir,
  sampleExistingResult,
  samplePromptExact,
  sampleScenario,
} from "./fixtures.js";

const runtimeLayer = Layer.mergeAll(NodeContext.layer, inertHttpClientLayer);

const baseManifest = (overrides: Partial<Parameters<typeof openManifest>[0]> = {}) =>
  openManifest({
    artifact: "art-1",
    model: "Test Model",
    runtime: "mlx",
    quant: "4bit",
    temperatures: [0.3, 0.7],
    ...overrides,
  });

const decodeManifest = Schema.decodeUnknownSync(RunManifest);
const decodeResult = Schema.decodeUnknownSync(ExecutionResult);

describe("runModel — prompt phase", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("happy path: 2 prompts × 2 temperatures produces 4 results + finalized manifest", async () => {
    const archivePath = path.join(dir, "run.jsonl");
    const manifest = baseManifest({
      runId: "run-1",
      temperatures: [0.3, 0.7],
      promptCorpus: {
        p1: samplePromptExact({ name: "p1" }),
        p2: samplePromptExact({ name: "p2", promptHash: "hash-p2" }),
      },
      scenarioCorpus: {},
    });

    const { layer: chatLayer } = makeChatCompletionMock({});

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [
            samplePromptExact({ name: "p1" }),
            samplePromptExact({ name: "p2", promptHash: "hash-p2" }),
          ],
          scenarios: [],
          temperatures: [0.3, 0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(Effect.provide(chatLayer), Effect.provide(runtimeLayer)),
    );

    expect(outcome.interrupted).toBe(false);
    expect(outcome.stats.completed).toBe(4);
    expect(outcome.stats.totalExecutions).toBe(4);
    expect(outcome.stats.errors).toBe(0);

    const lines = await readArchiveLines(archivePath);
    // Header + 4 results = 5 lines
    expect(lines.length).toBe(5);

    const header = decodeManifest(JSON.parse(lines[0] ?? "{}"));
    expect(header.finishedAt).not.toBeNull();
    expect(header.interrupted).toBe(false);
    expect(header.stats.completed).toBe(4);
    expect(header.stats.totalExecutions).toBe(4);

    const results = lines.slice(1).map((l) => decodeResult(JSON.parse(l)));
    const names = results.map((r) => `${r.promptName}@${r.temperature}`).sort();
    expect(names).toEqual(["p1@0.3", "p1@0.7", "p2@0.3", "p2@0.7"]);
    for (const r of results) {
      expect(r.runId).toBe("run-1");
      expect(r.error).toBeNull();
    }
  });

  it("folds an LLM error into the result line; loop continues to next prompt", async () => {
    const archivePath = path.join(dir, "run.jsonl");
    const manifest = baseManifest({
      runId: "run-err",
      temperatures: [0.7],
      promptCorpus: {
        p1: samplePromptExact({ name: "p1" }),
        p2: samplePromptExact({ name: "p2", promptHash: "hash-p2" }),
      },
      scenarioCorpus: {},
    });
    const { layer: chatLayer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "fail",
        error: new LlmRequestError({ model: "m", promptName: "p1", cause: "boom" }),
      },
    });

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [
            samplePromptExact({ name: "p1" }),
            samplePromptExact({ name: "p2", promptHash: "hash-p2" }),
          ],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(Effect.provide(chatLayer), Effect.provide(runtimeLayer)),
    );

    expect(outcome.stats.errors).toBe(1);
    expect(outcome.stats.completed).toBe(1);

    const lines = await readArchiveLines(archivePath);
    const results = lines.slice(1).map((l) => decodeResult(JSON.parse(l)));
    const byName = new Map(results.map((r) => [r.promptName, r]));
    expect(byName.get("p1")?.error).toContain("LlmRequestError");
    expect(byName.get("p2")?.error).toBeNull();
  });

  it("same-runId cache hit (resume): skips execution and carries result into the new archive", async () => {
    // Seed a prior archive sharing the run-id we're about to execute under —
    // this models a resumed run picking up a previously-completed cell.
    const priorPath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          priorPath,
          openManifest({ artifact: "art-1", runId: "shared-run" }),
        );
        yield* appendResult(
          priorPath,
          sampleExistingResult({
            runId: "shared-run",
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
            output: "prior-output",
            error: null,
          }),
        );
      }).pipe(Effect.provide(runtimeLayer)),
    );

    const archivePath = path.join(dir, "new.jsonl");
    const manifest = baseManifest({
      runId: "shared-run",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });
    const mock = makeChatCompletionMock({});

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );

    expect(outcome.stats.skippedCached).toBe(1);
    expect(mock.log.calls.length).toBe(0);

    const lines = await readArchiveLines(archivePath);
    expect(lines.length).toBe(2);
    const carried = decodeResult(JSON.parse(lines[1] ?? "{}"));
    expect(carried.output).toBe("prior-output");
    expect(carried.runId).toBe("shared-run");
  });

  it("different-runId archive does not produce a cache hit", async () => {
    // A passing result exists for the same (artifact, prompt, hash, temp), but
    // under a different run-id — Task 3 cache scoping should skip it.
    const priorPath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          priorPath,
          openManifest({ artifact: "art-1", runId: "old-run" }),
        );
        yield* appendResult(
          priorPath,
          sampleExistingResult({
            runId: "old-run",
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
            output: "prior-output",
            error: null,
          }),
        );
      }).pipe(Effect.provide(runtimeLayer)),
    );

    const archivePath = path.join(dir, "new.jsonl");
    const manifest = baseManifest({
      runId: "new-run",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });
    const mock = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "new-output",
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 1,
          generationTps: 1,
        },
      },
    });

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );

    expect(outcome.stats.skippedCached).toBe(0);
    expect(outcome.stats.completed).toBe(1);
    expect(mock.log.calls.length).toBe(1);
  });

  it("fresh=true disables cache even when a matching prior result exists", async () => {
    const priorPath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          priorPath,
          openManifest({ artifact: "art-1", runId: "prior-run" }),
        );
        yield* appendResult(
          priorPath,
          sampleExistingResult({
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
            output: "prior-output",
            error: null,
          }),
        );
      }).pipe(Effect.provide(runtimeLayer)),
    );

    const archivePath = path.join(dir, "new.jsonl");
    const manifest = baseManifest({
      runId: "fresh-run",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });
    const mock = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "new-output",
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 1,
          generationTps: 1,
        },
      },
    });

    await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: true,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps(),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );

    expect(mock.log.calls.length).toBe(1);
    const lines = await readArchiveLines(archivePath);
    const result = decodeResult(JSON.parse(lines[1] ?? "{}"));
    expect(result.output).toBe("new-output");
  });

  it("noSave=true runs the loop but does not write any archive file", async () => {
    const archivePath = path.join(dir, "run-nosave.jsonl");
    const manifest = baseManifest({
      runId: "nosave-run",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });
    const mock = makeChatCompletionMock({});

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: true,
        },
        fakeDeps(),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );

    expect(outcome.stats.totalExecutions).toBe(1);
    // File should not exist.
    const existed = await fsp
      .access(archivePath)
      .then(() => true)
      .catch(() => false);
    expect(existed).toBe(false);
  });

  it("scenariosOnly=true skips the prompt phase entirely", async () => {
    const archivePath = path.join(dir, "run.jsonl");
    const manifest = baseManifest({
      runId: "scen-only",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: { s1: sampleScenario({ name: "s1" }) },
    });
    const mock = makeChatCompletionMock({});

    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [samplePromptExact({ name: "p1" })],
          scenarios: [sampleScenario({ name: "s1" })],
          temperatures: [0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
          scenariosOnly: true,
        },
        fakeDeps({
          gameSession: fakeGameSessionFactory({
            events: [agentEvent("turn_end", { totalTokensIn: 10, totalTokensOut: 5 })],
          }),
        }),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );

    expect(mock.log.calls.length).toBe(0);
    expect(outcome.stats.totalExecutions).toBe(1); // just the scenario
  });
});

describe("runModel — scenario phase", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("scenarios run only at the first temperature", async () => {
    const archivePath = path.join(dir, "run.jsonl");
    const manifest = baseManifest({
      runId: "run-sc",
      temperatures: [0.3, 0.7],
      promptCorpus: {},
      scenarioCorpus: { s1: sampleScenario({ name: "s1" }) },
    });
    const mock = makeChatCompletionMock({});
    const outcome = await Effect.runPromise(
      runModel(
        {
          manifest,
          archivePath,
          prompts: [],
          scenarios: [sampleScenario({ name: "s1" })],
          temperatures: [0.3, 0.7],
          archiveDir: dir,
          fresh: false,
          maxTokens: 256,
          noSave: false,
        },
        fakeDeps({
          gameSession: fakeGameSessionFactory({
            events: [agentEvent("turn_end", { totalTokensIn: 5, totalTokensOut: 5 })],
          }),
        }),
      ).pipe(Effect.provide(mock.layer), Effect.provide(runtimeLayer)),
    );
    // Exactly one scenario execution, not two.
    expect(outcome.stats.totalExecutions).toBe(1);
    const lines = await readArchiveLines(archivePath);
    const results = lines.slice(1).map((l) => decodeResult(JSON.parse(l)));
    expect(results.length).toBe(1);
    expect(results[0]?.temperature).toBe(0.3);
    expect(results[0]?.scenarioName).toBe("s1");
  });
});

describe("runModel — interrupt", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("writes trailer with interrupted=true when the fiber is interrupted mid-run", async () => {
    const archivePath = path.join(dir, "run-interrupt.jsonl");
    const manifest = baseManifest({
      runId: "run-int",
      temperatures: [0.7],
      promptCorpus: { p1: samplePromptExact({ name: "p1" }) },
      scenarioCorpus: {},
    });

    // Stub that never completes — runPrompt will hang until interrupted.
    const stallingLayer = Layer.succeed(ChatCompletion, {
      complete: () => Effect.never,
    });

    const program = runModel(
      {
        manifest,
        archivePath,
        prompts: [samplePromptExact({ name: "p1" })],
        scenarios: [],
        temperatures: [0.7],
        archiveDir: dir,
        fresh: false,
        maxTokens: 256,
        noSave: false,
      },
      fakeDeps(),
    ).pipe(Effect.provide(stallingLayer), Effect.provide(runtimeLayer));

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(program);
        // Let the fiber start, then interrupt.
        yield* Effect.sleep("50 millis");
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }),
    );

    // The outer gen succeeds (returning the Exit). But the inner runModel
    // fiber terminated via interruption — read back the archive and check
    // the finalizer wrote interrupted=true.
    expect(Exit.isSuccess(exit)).toBe(true);

    // Small wait for finalizer completion.
    await new Promise((r) => setTimeout(r, 50));

    const text = await fsp.readFile(archivePath, "utf8");
    const firstLine = text.split("\n")[0] ?? "";
    const decoded = decodeManifest(JSON.parse(firstLine));
    expect(decoded.interrupted).toBe(true);
    expect(decoded.finishedAt).not.toBeNull();
  });
});
