/**
 * Integration test for `runSweep` — the exported core of the run command.
 *
 * Writes a minimal temp fixture (configs.yaml + system-prompts.yaml + two
 * challenge YAMLs), runs `runSweep` with fakeDeps + okStub for ChatCompletion,
 * and asserts on the sealed bundles and score records in the temp store.
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fakeDeps,
  inertHttpClientLayer,
  makeTempDir,
  okStub,
  removeDir,
} from "../../../orchestration/__tests__/fixtures.js";
import { runSweep, type SweepArgs } from "../run.js";

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

const writeFixture = async (challengesDir: string, challenges: Record<string, string>) => {
  await fsp.mkdir(challengesDir, { recursive: true });
  await fsp.writeFile(path.join(dir, "system-prompts.yaml"), SYSTEM_PROMPTS_YAML);
  await fsp.writeFile(path.join(dir, "configs.yaml"), CONFIGS_YAML);
  for (const [stem, yaml] of Object.entries(challenges)) {
    await fsp.writeFile(path.join(challengesDir, `${stem}.yaml`), yaml);
  }
};

const sweep = async (
  over: Partial<SweepArgs> & Pick<SweepArgs, "challengesDir">,
): Promise<{ grid: string; calls: string[] }> => {
  const m = okStub();
  const grid = await Effect.runPromise(
    runSweep(
      {
        configsPattern: undefined,
        challengesPattern: undefined,
        configsFile: path.join(dir, "configs.yaml"),
        systemPromptsFile: path.join(dir, "system-prompts.yaml"),
        store: path.join(dir, "store"),
        noSkip: false,
        ...over,
      },
      fakeDeps() as never,
    ).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );
  return { grid, calls: m.log.calls.map((c) => c.promptName) };
};

const twoChallenges = { alpha: CHALLENGE_ALPHA_YAML, beta: CHALLENGE_BETA_YAML };

const headerOf = async (bundle: string | undefined) =>
  JSON.parse(
    (await fsp.readFile(path.join(dir, "store", "bundles", bundle ?? ""), "utf8")).split("\n")[0] ??
      "",
  );

it("runs the full cross product and seals one scored bundle per cell", async () => {
  const challengesDir = path.join(dir, "challenges");
  await writeFixture(challengesDir, twoChallenges);
  const { grid } = await sweep({ challengesDir });

  expect(grid).toContain("cfg-a");
  expect(grid).toContain("cfg-b");
  // 2 configs × 2 challenges = 4 bundles, each with its score records
  const bundles = await fsp.readdir(path.join(dir, "store", "bundles"));
  expect(bundles.filter((f) => f.endsWith(".jsonl"))).toHaveLength(4);
  expect((await fsp.readdir(path.join(dir, "store", "scores"))).sort()).toEqual(bundles.sort());
  const header = await headerOf(bundles[0]);
  expect(header.release).toBe("draft");
  expect(header.run.contributor).toBe("local");
});

it("a second sweep skips the executions the store holds; --no-skip executes them", async () => {
  const challengesDir = path.join(dir, "challenges");
  await writeFixture(challengesDir, twoChallenges);
  expect((await sweep({ challengesDir })).calls).toHaveLength(4);
  expect((await sweep({ challengesDir })).calls).toHaveLength(0);
  expect((await sweep({ challengesDir, noSkip: true })).calls).toHaveLength(4);
});

it("names the release of releases/<name>/challenges and refuses release 0", async () => {
  const release = path.join(dir, "releases", "2027.1", "challenges");
  await writeFixture(release, { alpha: CHALLENGE_ALPHA_YAML });
  await sweep({ challengesDir: release, configsPattern: "cfg-a" });
  const [bundle] = await fsp.readdir(path.join(dir, "store", "bundles"));
  expect((await headerOf(bundle)).release).toBe("2027.1");

  const alpha = path.join(dir, "releases", "0", "challenges");
  await writeFixture(alpha, { alpha: CHALLENGE_ALPHA_YAML });
  await expect(sweep({ challengesDir: alpha })).rejects.toThrow(/release 0/);
});

it("refuses an email address as BENCH_CONTRIBUTOR", async () => {
  const challengesDir = path.join(dir, "challenges");
  await writeFixture(challengesDir, twoChallenges);
  process.env["BENCH_CONTRIBUTOR"] = "me@example.com";
  await expect(sweep({ challengesDir })).rejects.toThrow(/public handle/);
  delete process.env["BENCH_CONTRIBUTOR"];
});

it("fails fast when no challenges are found", async () => {
  const emptyDir = path.join(dir, "empty-challenges");
  await writeFixture(emptyDir, {});
  await expect(sweep({ challengesDir: emptyDir })).rejects.toThrow();
});

describe("--samples with --items", () => {
  it("samples only the matched items; the rest run once", async () => {
    const challengesDir = path.join(dir, "challenges");
    await writeFixture(challengesDir, twoChallenges);
    const { calls } = await sweep({
      challengesDir,
      configsPattern: "cfg-a",
      samples: 3,
      items: ["alpha/math_two_*"],
    });
    expect(calls.filter((n) => n === "math_two_plus_two")).toHaveLength(3);
    expect(calls.filter((n) => n === "math_three_plus_three")).toHaveLength(1);
  });

  it("fails fast when an --items pattern matches no item", async () => {
    const challengesDir = path.join(dir, "challenges");
    await writeFixture(challengesDir, twoChallenges);
    await expect(
      sweep({ challengesDir, configsPattern: "cfg-a", samples: 3, items: ["alpha/typo"] }),
    ).rejects.toThrow(/typo/);
  });
});
