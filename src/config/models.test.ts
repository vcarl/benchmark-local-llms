import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit } from "effect";
import { describe, expect, it } from "vitest";
import { loadModels } from "./models.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => path.join(here, "__fixtures__", "models", name);

const run = <A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(eff);

describe("loadModels", () => {
  it("decodes a valid models YAML with mixed runtimes and optional overrides", async () => {
    const result = await run(
      loadModels(fixture("models.yaml")).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    expect(result.value).toHaveLength(3);

    const [mlxOnly, llamacppWithCtx, mlxInactive] = result.value;
    expect(mlxOnly).toEqual({
      artifact: "mlx-community/Qwen3-32B-4bit",
      runtime: "mlx",
      temperature: 0.7,
    });
    expect(llamacppWithCtx).toEqual({
      artifact: "Qwen/Qwen3-32B-GGUF",
      runtime: "llamacpp",
      ctxSize: 16384,
      scenarioCtxSize: 32768,
      temperature: 0.7,
    });
    expect(mlxInactive).toEqual({
      artifact: "mlx-community/DeepSeek-Coder-33B-Instruct-4bit",
      runtime: "mlx",
      name: "DeepSeek Coder 33B",
      active: false,
    });
  });

  it("fails with SchemaDecodeError when a runtime value is not one of the enum literals", async () => {
    const result = await run(
      loadModels(fixture("models-bad-runtime.yaml")).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") return;
    expect(JSON.stringify(result.cause)).toContain("SchemaDecodeError");
  });

  it("rejects active model missing temperature", async () => {
    const result = await run(
      loadModels(fixture("models-active-missing-temperature.yaml")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") return;
    expect(JSON.stringify(result.cause)).toContain("temperature");
  });

  it("accepts inactive model missing temperature", async () => {
    const result = await run(
      loadModels(fixture("models-inactive-missing-temperature.yaml")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(result._tag).toBe("Success");
    if (result._tag !== "Success") return;
    expect(result.value[0]?.temperature).toBeUndefined();
  });
});
