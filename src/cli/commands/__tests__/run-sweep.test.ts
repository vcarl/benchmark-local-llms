/**
 * Integration test for `runSweep` — the exported core of the run command.
 *
 * Writes a minimal temp fixture (configs.yaml + system-prompts.yaml + two
 * challenge YAMLs), runs `runSweep` with fakeDeps + okStub for ChatCompletion,
 * and asserts that one `att-*.jsonl` per cell is written and the returned
 * grid string contains both config ids.
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeTempDir,
  okStub,
  removeDir,
} from "../../../orchestration/__tests__/fixtures.js";
import { runSweep } from "../run.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeDir(dir);
});

const SYSTEM_PROMPTS_YAML = `
direct: Be concise.
`;

const CONFIGS_YAML = `
- id: cfg-a
  artifact: fake/model-a
  runtime: mlx
  temperature: 0.0
  systemPrompt: direct
  maxTokens: 128

- id: cfg-b
  artifact: fake/model-b
  runtime: mlx
  temperature: 0.0
  systemPrompt: direct
  maxTokens: 128
`;

const CHALLENGE_ALPHA_YAML = `
id: alpha
version: 1
passThreshold: 0.5
items:
  - name: math_two_plus_two
    category: math
    tier: 1
    prompt: "What is 2+2? Reply with just the number."
    scorer: exact_match
    expected: "4"
    extract: "(\\\\d+)"
`;

const CHALLENGE_BETA_YAML = `
id: beta
version: 1
passThreshold: 0.5
items:
  - name: math_three_plus_three
    category: math
    tier: 1
    prompt: "What is 3+3? Reply with just the number."
    scorer: exact_match
    expected: "6"
    extract: "(\\\\d+)"
`;

it("runs the full cross product and writes one archive per cell", async () => {
  const challengesDir = path.join(dir, "challenges");
  const archiveDir = path.join(dir, "archive");
  await fsp.mkdir(challengesDir);
  await fsp.mkdir(archiveDir);

  const systemPromptsFile = path.join(dir, "system-prompts.yaml");
  const configsFile = path.join(dir, "configs.yaml");
  await fsp.writeFile(systemPromptsFile, SYSTEM_PROMPTS_YAML);
  await fsp.writeFile(configsFile, CONFIGS_YAML);
  await fsp.writeFile(path.join(challengesDir, "alpha.yaml"), CHALLENGE_ALPHA_YAML);
  await fsp.writeFile(path.join(challengesDir, "beta.yaml"), CHALLENGE_BETA_YAML);

  const m = okStub();
  const grid = await Effect.runPromise(
    runSweep(
      {
        configsPattern: undefined,
        challengesPattern: undefined,
        challengesDir,
        configsFile,
        systemPromptsFile,
        archiveDir,
        output: path.join(dir, "webapp", "src", "data"),
        noCache: false,
        noReport: true,
      },
      fakeDeps() as never,
    ).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  // Grid should contain both config ids
  expect(grid).toContain("cfg-a");
  expect(grid).toContain("cfg-b");

  // One archive per cell: 2 configs × 2 challenges = 4 archives
  const files = await fsp.readdir(archiveDir);
  const archives = files.filter((f) => f.endsWith(".jsonl"));
  expect(archives).toHaveLength(4);
});

it("fails fast when no challenges are found", async () => {
  const emptyDir = path.join(dir, "empty-challenges");
  await fsp.mkdir(emptyDir);
  await fsp.writeFile(path.join(dir, "system-prompts.yaml"), SYSTEM_PROMPTS_YAML);
  await fsp.writeFile(path.join(dir, "configs.yaml"), CONFIGS_YAML);

  const m = okStub();
  await expect(
    Effect.runPromise(
      runSweep(
        {
          configsPattern: undefined,
          challengesPattern: undefined,
          challengesDir: emptyDir,
          configsFile: path.join(dir, "configs.yaml"),
          systemPromptsFile: path.join(dir, "system-prompts.yaml"),
          archiveDir: dir,
          output: path.join(dir, "webapp", "src", "data"),
          noCache: false,
          noReport: true,
        },
        fakeDeps() as never,
      ).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    ),
  ).rejects.toThrow();
});
