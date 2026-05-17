import { NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { fixturePath } from "./__fixtures__/test-helpers.js";
import { computePromptHash } from "./hashing.js";
import { loadPromptCorpus } from "./prompt-corpus.js";
import { SystemPromptRegistry } from "./system-prompts.js";

const run = <A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(eff);

/** Registry matching `__fixtures__/system-prompts.yaml`, provided directly. */
const registryLayer = Layer.succeed(SystemPromptRegistry, {
  direct: "You are a helpful assistant. Be concise.",
  cot: "You are a helpful assistant. Think step by step.",
  code_direct: "You are a Python code generator. Output only the function.",
});

const envLayer = Layer.merge(NodeFileSystem.layer, registryLayer);

describe("loadPromptCorpus", () => {
  it("decodes exact_match, constraint, and code_exec entries into the canonical corpus shape", async () => {
    const exit = await run(loadPromptCorpus(fixturePath("prompts")).pipe(Effect.provide(envLayer)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const byName = new Map(exit.value.map((e) => [e.name, e]));

    const math = byName.get("math_multiply_cot");
    expect(math).toBeDefined();
    if (!math) return;
    expect(math.category).toBe("math");
    expect(math.tier).toBe(2);
    expect(math.system.key).toBe("cot");
    expect(math.scorer).toEqual({
      type: "exact_match",
      expected: "4183",
      extract: "ANSWER:\\s*(\\d[\\d,]*)",
    });
    expect(math.promptHash).toBe(computePromptHash(math.promptText, math.system.text));

    const haiku = byName.get("constraint_haiku");
    expect(haiku).toBeDefined();
    if (!haiku) return;
    expect(haiku.scorer.type).toBe("constraint");
    if (haiku.scorer.type === "constraint") {
      expect(haiku.scorer.constraints).toHaveLength(2);
      expect(haiku.scorer.constraints[0]).toMatchObject({
        check: "line_count",
        name: "three_lines",
        count: 3,
      });
    }

    const code = byName.get("code_is_palindrome");
    expect(code).toBeDefined();
    if (!code) return;
    expect(code.scorer.type).toBe("code_exec");
    if (code.scorer.type === "code_exec") {
      expect(code.scorer.testCode).toContain('is_palindrome("racecar")');
      expect(code.scorer.testCode).toContain('is_palindrome("hello")');
    }
  });

  it("fails with UnknownSystemPrompt when a prompt references an unknown system key", async () => {
    const exit = await run(
      loadPromptCorpus(fixturePath("prompts-unknown-system")).pipe(Effect.provide(envLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const body = JSON.stringify(exit.cause);
    expect(body).toContain("UnknownSystemPrompt");
    expect(body).toContain("nonexistent_key");
  });

  it("fails with UnknownConstraintCheck when a constraint has an unknown check discriminator", async () => {
    const exit = await run(
      loadPromptCorpus(fixturePath("prompts-unknown-check")).pipe(Effect.provide(envLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const body = JSON.stringify(exit.cause);
    expect(body).toContain("UnknownConstraintCheck");
    expect(body).toContain("not_a_real_check");
  });

  it("fails with ConfigError listing both files when two prompts share a name", async () => {
    const exit = await run(
      loadPromptCorpus(fixturePath("prompts-duplicate")).pipe(Effect.provide(envLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const body = JSON.stringify(exit.cause);
    expect(body).toContain("ConfigError");
    expect(body).toContain("duplicate prompt name");
    expect(body).toContain("a.yaml");
    expect(body).toContain("b.yaml");
  });

  it("decodes tags when present and leaves them undefined when absent", async () => {
    const exit = await run(loadPromptCorpus(fixturePath("prompts")).pipe(Effect.provide(envLayer)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const byName = new Map(exit.value.map((e) => [e.name, e]));

    const math = byName.get("math_multiply_cot");
    expect(math).toBeDefined();
    if (!math) return;
    expect(math.tags).toEqual(["TODO", "math-reasoning"]);

    const haiku = byName.get("constraint_haiku");
    expect(haiku).toBeDefined();
    if (!haiku) return;
    expect(haiku.tags).toBeUndefined();
  });

  it("excludes system-prompts.yaml and the scenarios/ subdir from the prompt list", async () => {
    // The prompts/ fixture dir contains a scenarios/ subdir; readDirectory
    // should return it as an entry, but it doesn't end in .yaml, so it is
    // excluded by the filter. This test guards against a future change that
    // uses a recursive walk and accidentally picks up scenario YAMLs.
    const exit = await run(loadPromptCorpus(fixturePath("prompts")).pipe(Effect.provide(envLayer)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const names = exit.value.map((e) => e.name);
    expect(names).not.toContain("bootstrap_grind");
  });
});
