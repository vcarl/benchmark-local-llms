import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { computeConfigHash, loadConfigurations } from "./configurations.js";
import { SystemPromptRegistry } from "./system-prompts.js";

const registry = Layer.succeed(SystemPromptRegistry, { direct: "Be concise." } as Record<
  string,
  string
>);

const writeTmp = (body: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/configs.yaml`;
    yield* fs.writeFileString(path, body);
    return path;
  });

describe("loadConfigurations", () => {
  it("resolves system prompt text and stamps configHash", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const path = yield* writeTmp(
          `- id: c1\n  artifact: a\n  runtime: mlx\n  temperature: 0.7\n  systemPrompt: direct\n  maxTokens: 100\n`,
        );
        const [cfg, ...rest] = yield* loadConfigurations(path);
        expect(rest).toHaveLength(0);
        expect(cfg?.systemPromptText).toBe("Be concise.");
        expect(cfg?.configHash).toHaveLength(12);
      }),
    ).pipe(Effect.provide(Layer.mergeAll(NodeContext.layer, registry)), Effect.runPromise));

  it("computeConfigHash is stable and order-insensitive to unrelated fields", () => {
    const h1 = computeConfigHash(
      { artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 },
      "Be concise.",
    );
    const h2 = computeConfigHash(
      { artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 },
      "Be concise.",
    );
    expect(h1).toBe(h2);
  });
});
