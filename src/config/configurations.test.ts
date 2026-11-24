import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { loadConfigurations } from "./configurations.js";
import { loadSystemPrompts, SystemPromptRegistry } from "./system-prompts.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const registry = Layer.succeed(SystemPromptRegistry, {
  direct: "Be concise.",
} as Record<string, string>);

const writeTmp = (body: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/configs.yaml`;
    yield* fs.writeFileString(path, body);
    return path;
  });

describe("loadConfigurations", () => {
  it("resolves system prompt text", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const path = yield* writeTmp(
          `- id: c1\n  artifact: a\n  runtime: mlx\n  temperature: 0.7\n  systemPrompt: direct\n  maxTokens: 100\n`,
        );
        const [cfg, ...rest] = yield* loadConfigurations(path);
        expect(rest).toHaveLength(0);
        expect(cfg?.systemPromptText).toBe("Be concise.");
      }),
    ).pipe(Effect.provide(Layer.mergeAll(NodeContext.layer, registry)), Effect.runPromise));

  it("stamps chatTemplateDigest from the template file's content, and only when set", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const base = `  artifact: a\n  runtime: llamacpp\n  temperature: 0.7\n  systemPrompt: direct\n  maxTokens: 100\n`;
        const p = yield* writeTmp(
          `- id: t\n${base}  chatTemplate: mistral-v7-tekken\n- id: n\n${base}`,
        );
        const [withT, without] = yield* loadConfigurations(p);
        const content = yield* fs.readFileString(
          path.join(repoRoot, "templates", "mistral-v7-tekken.jinja"),
        );
        expect(withT?.chatTemplateDigest).toBe(createHash("sha256").update(content).digest("hex"));
        expect(without !== undefined && "chatTemplateDigest" in without).toBe(false);

        const bad = yield* writeTmp(`- id: b\n${base}  chatTemplate: no-such-template\n`);
        const err = yield* Effect.flip(loadConfigurations(bad));
        expect(err._tag).toBe("ConfigError");
      }),
    ).pipe(Effect.provide(Layer.mergeAll(NodeContext.layer, registry)), Effect.runPromise));
});

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
