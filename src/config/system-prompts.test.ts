import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit } from "effect";
import { describe, expect, it } from "vitest";
import { loadSystemPrompts } from "./system-prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => path.join(here, "__fixtures__", name);

const run = <A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(eff);

describe("loadSystemPrompts", () => {
  it("decodes a valid system-prompts YAML into a Record<string, string>", async () => {
    const result = await run(
      loadSystemPrompts(fixture("system-prompts.yaml")).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    expect(result.value).toEqual({
      direct: "You are a helpful assistant. Be concise.",
      cot: "You are a helpful assistant. Think step by step.",
      code_direct: "You are a Python code generator. Output only the function.",
    });
  });

  it("fails with SchemaDecodeError when the YAML is not a string map", async () => {
    const result = await run(
      loadSystemPrompts(fixture("system-prompts-not-a-map.yaml")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") return;
    const cause = result.cause;
    expect(JSON.stringify(cause)).toContain("SchemaDecodeError");
  });

  it("fails with YamlParseError when the YAML is malformed", async () => {
    const result = await run(
      loadSystemPrompts(fixture("system-prompts-malformed.yaml")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") return;
    const cause = result.cause;
    expect(JSON.stringify(cause)).toContain("YamlParseError");
  });
});
