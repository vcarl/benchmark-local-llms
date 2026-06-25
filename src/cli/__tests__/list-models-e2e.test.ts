/**
 * End-to-end-ish test for the `list-models` handler: point it at a fixture
 * `configs.yaml` (plus a `system-prompts.yaml` defining every referenced key),
 * capture stdout, assert the rendered lines match the fixture.
 *
 * Runs the real @effect/cli command via `Command.run`, which proves flag
 * parsing + handler wiring + FileSystem layer provisioning all work together.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listModelsCommand } from "../commands/list.js";

describe("list-models subcommand handler (e2e)", () => {
  let tmpDir: string;
  let configsPath: string;
  let systemPromptsPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "llm-bench-list-"));
    configsPath = path.join(tmpDir, "configs.yaml");
    systemPromptsPath = path.join(tmpDir, "system-prompts.yaml");
    writeFileSync(systemPromptsPath, 'default: "You are a helpful assistant."\n');
    writeFileSync(
      configsPath,
      [
        "- id: qwen-72b-llamacpp",
        "  artifact: models/qwen-72b.gguf",
        "  runtime: llamacpp",
        "  quant: Q4_K_M",
        "  temperature: 0.7",
        "  systemPrompt: default",
        "  maxTokens: 4096",
        "- id: mistral-7b-mlx",
        "  artifact: mlx-community/mistral-7b",
        "  runtime: mlx",
        "  temperature: 0.7",
        "  systemPrompt: default",
        "  maxTokens: 4096",
        "  active: false",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints one line per configuration with id/artifact/runtime/quant/active", async () => {
    const captured: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      captured.push(String(msg));
    });

    const root = Command.make("llm-bench").pipe(Command.withSubcommands([listModelsCommand]));
    const run = Command.run(root, { name: "llm-bench", version: "0.0.0" });
    const exit = await Effect.runPromiseExit(
      run([
        "node",
        "cli",
        "list-models",
        "--configs-file",
        configsPath,
        "--system-prompts-file",
        systemPromptsPath,
      ]).pipe(Effect.provide(NodeContext.layer)),
    );

    spy.mockRestore();
    expect(exit._tag).toBe("Success");

    const text = captured.join("\n");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("qwen-72b-llamacpp\tmodels/qwen-72b.gguf\tllamacpp\tQ4_K_M\ttrue");
    expect(lines[1]).toBe("mistral-7b-mlx\tmlx-community/mistral-7b\tmlx\t-\tfalse");
  });
});
