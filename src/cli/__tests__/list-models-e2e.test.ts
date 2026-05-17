/**
 * End-to-end-ish test for the `list-models` handler: point it at a fixture
 * `models.yaml`, capture stdout, assert the rendered lines match the fixture.
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
  let modelsPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "llm-bench-list-"));
    modelsPath = path.join(tmpDir, "models.yaml");
    writeFileSync(
      modelsPath,
      [
        "- artifact: models/qwen-72b.gguf",
        "  runtime: llamacpp",
        "  name: Qwen 2.5 72B",
        "  quant: Q4_K_M",
        "  temperature: 0.7",
        "- artifact: mlx-community/mistral-7b",
        "  runtime: mlx",
        "  name: Mistral 7B",
        "  temperature: 0.7",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints one line per model with artifact/runtime/quant", async () => {
    const captured: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      captured.push(String(msg));
    });

    const root = Command.make("llm-bench").pipe(Command.withSubcommands([listModelsCommand]));
    const run = Command.run(root, { name: "llm-bench", version: "0.0.0" });
    const exit = await Effect.runPromiseExit(
      // Command.run expects process.argv-style input: first two entries
      // (node bin, script path) are dropped internally.
      run(["node", "cli", "list-models", "--models", modelsPath]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );

    spy.mockRestore();
    expect(exit._tag).toBe("Success");

    // console.log prints the whole block joined by newlines; capture then split.
    const text = captured.join("\n");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("models/qwen-72b.gguf\tllamacpp\tQ4_K_M");
    expect(lines[1]).toBe("mlx-community/mistral-7b\tmlx\t-");
  });
});
