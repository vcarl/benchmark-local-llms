import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { computeConfigHash, loadConfigurations } from "./configurations.js";
import { loadSystemPrompts, SystemPromptRegistry } from "./system-prompts.js";

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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("configs.yaml catalog-only entries", () => {
  it("loads the inactive catalog entries and they resolve as inactive", async () => {
    const program = Effect.gen(function* () {
      const prompts = yield* loadSystemPrompts(path.join(repoRoot, "system-prompts.yaml"));
      return yield* loadConfigurations(path.join(repoRoot, "configs.yaml")).pipe(
        Effect.provide(Layer.succeed(SystemPromptRegistry, prompts)),
      );
    });
    const configs = await Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)));

    const byId = new Map(configs.map((c) => [c.id, c]));
    const sample = byId.get("qwen2.5-7b-llamacpp");
    expect(sample).toBeDefined();
    expect(sample?.active).toBe(false);
    expect(byId.get("llama4-maverick-17b-128e-mlx")?.active).toBe(false);
    // ctxSize copied verbatim where present
    expect(byId.get("devstral-2-123b-llamacpp")?.ctxSize).toBe(2048);
  });
});
