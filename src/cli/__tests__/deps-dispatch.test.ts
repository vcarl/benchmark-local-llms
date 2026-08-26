/**
 * `makeLlmServerFactory` must dispatch exhaustively over `Runtime`. Each
 * branch pre-checks the local model cache before spawning anything, so an
 * artifact that is definitely not cached fails with a `ServerSpawnError`
 * tagged with that branch's runtime — which is exactly the observable that
 * proves the dispatch landed in the right place, with no subprocess spawned.
 */
import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../schema/model.js";
import { makeLlmServerFactory, makeRunDeps } from "../deps.js";

const UNCACHED = "bench-test-nonexistent-org/bench-test-nonexistent-model";

const runtimeOf = async (model: ModelConfig): Promise<string> => {
  const factory = makeLlmServerFactory();
  const exit = await Effect.runPromise(
    Effect.scoped(factory(model)).pipe(
      Effect.provide(NodeContext.layer),
      Effect.provide(FetchHttpClient.layer),
      Effect.either,
    ),
  );
  expect(exit._tag).toBe("Left");
  if (exit._tag !== "Left") throw new Error("expected a typed failure");
  const err = exit.left as { readonly _tag: string; readonly runtime: string };
  expect(err._tag).toBe("ServerSpawnError");
  return err.runtime;
};

describe("makeLlmServerFactory dispatch", () => {
  it("routes runtime: llamacpp to the llama.cpp path", async () => {
    expect(await runtimeOf({ artifact: UNCACHED, runtime: "llamacpp", quant: "Q4_K_M" })).toBe(
      "llamacpp",
    );
  });

  it("routes runtime: mlx to the mlx path", async () => {
    expect(await runtimeOf({ artifact: UNCACHED, runtime: "mlx" })).toBe("mlx");
  });

  it("routes runtime: omlx to the omlx path", async () => {
    expect(await runtimeOf({ artifact: UNCACHED, runtime: "omlx" })).toBe("omlx");
  });
});

describe("makeRunDeps runtimeVersion", () => {
  it.each(["llamacpp", "mlx", "omlx"] as const)("probes %s without failing", async (runtime) => {
    const deps = makeRunDeps({});
    const version = await Effect.runPromise(
      deps.runtimeVersion(runtime).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });
});
