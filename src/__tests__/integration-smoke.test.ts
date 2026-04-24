import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeContext, NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { loadModels } from "../config/models.js";
import { loadPromptCorpus } from "../config/prompt-corpus.js";
import { loadScenarioCorpus } from "../config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../config/system-prompts.js";
import type { ExecutionResult } from "../schema/index.js";
import { scoreExecution } from "../scoring/score-result.js";

/**
 * Integration smoke test (Group 2 checkpoint from linked-percolating-barto.md §Review Checkpoints).
 * Proves the B1 loaders + B3 scoring engine + E3/E4/E5 content compose end-to-end:
 *   1. Load system-prompts.yaml via B1
 *   2. Load the real prompt corpus from prompts/
 *   3. Load the real scenario corpus from prompts/scenarios/
 *   4. Load models.yaml
 *   5. Score a synthetic ExecutionResult against a real PromptCorpusEntry
 *
 * No orchestration (no HTTP, no subprocess, no SSE) — this is strictly the
 * YAML-read / data-shape / scoring pipeline.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const promptsDir = path.join(repoRoot, "prompts");
const scenariosDir = path.join(promptsDir, "scenarios");
const systemPromptsPath = path.join(promptsDir, "system-prompts.yaml");
const modelsPath = path.join(repoRoot, "models.yaml");

const run = <A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(eff);

/** Build a registry layer by loading the real system-prompts.yaml. */
const systemPromptRegistryLayer = Layer.effect(
  SystemPromptRegistry,
  loadSystemPrompts(systemPromptsPath),
).pipe(Layer.provide(NodeFileSystem.layer));

describe("integration smoke: YAML -> score pipeline", () => {
  it("loads all corpora and scores a synthetic execution end-to-end", async () => {
    const pipeline = Effect.gen(function* () {
      const systemPrompts = yield* loadSystemPrompts(systemPromptsPath);
      const models = yield* loadModels(modelsPath);
      const prompts = yield* loadPromptCorpus(promptsDir);
      const scenarios = yield* loadScenarioCorpus(scenariosDir);

      // Locate one real prompt variant (math_multiply_direct — exact_match scorer)
      const prompt = prompts.find((p) => p.name === "math_multiply_direct");
      if (prompt === undefined) {
        return yield* Effect.die(
          new Error(`math_multiply_direct not found in corpus (loaded ${prompts.length} prompts)`),
        );
      }

      // Construct an ExecutionResult that should match the exact_match extraction
      const executionResult: ExecutionResult = {
        runId: "smoke_test_run",
        executedAt: new Date().toISOString(),
        promptName: prompt.name,
        temperature: 0.3,
        model: "smoke-test-model",
        runtime: "mlx",
        quant: "Q4_K_M",
        promptTokens: 10,
        generationTokens: 5,
        promptTps: 100,
        generationTps: 50,
        peakMemoryGb: 4,
        wallTimeSec: 1,
        output: "The answer is 4183",
        error: null,
        promptHash: prompt.promptHash,
        scenarioHash: null,
        scenarioName: null,
        terminationReason: null,
        toolCallCount: null,
        finalPlayerStats: null,
        events: null,
      };

      const score = yield* scoreExecution(executionResult, prompt);
      return { systemPrompts, models, prompts, scenarios, score };
    });

    const exit = await run(
      pipeline.pipe(Effect.provide(systemPromptRegistryLayer), Effect.provide(NodeContext.layer)),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const { systemPrompts, models, prompts, scenarios, score } = exit.value;

    // System prompts loaded: at least the keys referenced by loaded prompts
    expect(Object.keys(systemPrompts).length).toBeGreaterThan(0);
    expect(systemPrompts["direct"]).toContain("helpful assistant");

    // Models loaded
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty("artifact");
    expect(models[0]).toHaveProperty("runtime");

    // Prompt corpus non-empty and contains our chosen variant
    expect(prompts.length).toBeGreaterThan(0);

    // Scenario corpus non-empty and parsed all 11 YAMLs
    expect(scenarios.length).toBe(11);
    expect(scenarios.map((s) => s.name)).toContain("bootstrap_grind");

    // Score in [0, 1] with non-empty details — the synthetic output "4183"
    // matches the exact_match expected value, so score should be 1
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1);
    expect(score.score).toBe(1);
    expect(score.details.length).toBeGreaterThan(0);
  });
});
