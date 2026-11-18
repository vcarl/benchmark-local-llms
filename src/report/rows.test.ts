import { describe, expect, it } from "vitest";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import type { LoadedAttempt } from "./load-attempts.js";
import { buildRows, type RowsInput, type SetChallenge } from "./rows.js";

const T = (day: number, sec = 0) => new Date(Date.UTC(2026, 0, day, 0, 0, sec)).toISOString();

const line = (itemId: string, over: Partial<ItemResult> = {}): ItemResult => ({
  itemId,
  promptName: itemId,
  promptHash: `ph-${itemId}`,
  itemHash: `ih-${itemId}`,
  executedAt: T(1, 30),
  promptTokens: 1,
  generationTokens: 1,
  promptTps: 1,
  generationTps: 1,
  peakMemoryGb: 0,
  wallTimeSec: 1,
  output: "o",
  reasoning: null,
  rawOutput: "o",
  error: null,
  score: 1,
  failureKind: null,
  ...over,
});

const attempt = (
  over: Partial<AttemptManifest> & { attemptId: string },
  items: ItemResult[],
): LoadedAttempt => ({
  sourcePath: `/a/${over.attemptId}.jsonl`,
  manifest: {
    schemaVersion: 2,
    startedAt: T(1),
    finishedAt: T(1, 59),
    interrupted: false,
    configId: "cfg",
    configHash: "cfgA",
    artifact: "org/model",
    runtime: "mlx",
    quant: "4bit",
    temperature: 0,
    systemPrompt: "direct",
    maxTokens: 512,
    challengeId: "c1",
    challengeVersion: 1,
    challengeHash: "h1",
    env: {
      hostname: "host",
      platform: "darwin-arm64",
      runtimeVersion: "mlx-lm 1",
      nodeVersion: "v22",
      benchmarkGitSha: "sha1",
    },
    aggregate: { score: 1, passed: true },
    ...over,
  },
  items,
});

const C1: SetChallenge = {
  id: "c1",
  version: 1,
  challengeHash: "h1",
  items: [
    { itemId: "i1", itemHash: "ih-i1", family: "f1", scope: "core" },
    { itemId: "i2", itemHash: "ih-i2", family: "f2", scope: "stretch" },
  ],
};
const C2: SetChallenge = {
  id: "c2",
  version: 1,
  challengeHash: "h2",
  items: [{ itemId: "j1", itemHash: "ih-j1", family: "g1", scope: "core" }],
};

const input = (attempts: LoadedAttempt[], over: Partial<RowsInput> = {}): RowsInput => ({
  attempts,
  challengeSet: [C1, C2],
  dataset: {
    label: "main",
    archiveDir: "a",
    challengesDir: "c",
    release: null,
    version: null,
    errata: [],
  },
  legacyHardware: { id: "local-hw" },
  generatedAt: T(9),
  ...over,
});

const only = (attempts: LoadedAttempt[], over: Partial<RowsInput> = {}) => {
  const { rows } = buildRows(input(attempts, over));
  expect(rows.length).toBe(1);
  return rows[0] as (typeof rows)[number];
};

describe("buildRows selection", () => {
  it("a later single-sample replay never drops earlier resamples", () => {
    const five = [0, 1, 2, 3, 4].map((s) =>
      line("i1", { ...(s === 0 ? {} : { sample: s }), score: s < 2 ? 1 : 0 }),
    );
    const row = only([
      attempt({ attemptId: "att-k5" }, [...five, line("i2")]),
      // Verbatim legacy replay: started on day 5, lines keep their day-1 executedAt.
      attempt({ attemptId: "att-replay", startedAt: T(5), finishedAt: T(5, 1) }, [
        five[0] as ItemResult,
        line("i2"),
      ]),
    ]);
    const cell = row.cells["c1"];
    expect(cell?.status).toBe("scored");
    expect(cell?.samples).toEqual([1, 5]);
    expect(cell?.passed).toBeCloseTo(0.4 + 1);
    expect(cell?.sourceAttempts).toEqual(["att-k5"]);
  });

  it("the most recent execution of an (item, sample) wins", () => {
    const row = only([
      attempt({ attemptId: "att-old" }, [line("i1", { score: 0 }), line("i2", { score: 0 })]),
      attempt({ attemptId: "att-new", startedAt: T(3), finishedAt: T(3, 9) }, [
        line("i1", { executedAt: T(3, 1) }),
        line("i2", { score: 0, executedAt: T(3, 2) }),
      ]),
    ]);
    expect(row.cells["c1"]?.passed).toBe(1);
    expect(row.cells["c1"]?.executedFrom).toBe(T(3, 1));
    expect(row.cells["c1"]?.sourceAttempts).toEqual(["att-new"]);
  });

  it("provenance comes from the executing attempt, not the replay header", () => {
    const row = only([
      attempt({ attemptId: "att-orig" }, [line("i1"), line("i2")]),
      attempt(
        {
          attemptId: "att-replay",
          startedAt: T(5),
          finishedAt: T(5, 1),
          env: {
            platform: "p",
            runtimeVersion: "mlx-lm 9",
            nodeVersion: "v",
            benchmarkGitSha: "sha9",
          },
        },
        [
          line("i1", { cachedFrom: { attemptId: "att-orig", executedAt: T(1, 30) } }),
          line("i2", { cachedFrom: { attemptId: "att-orig", executedAt: T(1, 30) } }),
        ],
      ),
    ]);
    expect(row.cells["c1"]?.runtimeVersions).toEqual(["mlx-lm 1"]);
    expect(row.cells["c1"]?.gitShas).toEqual(["sha1"]);
    expect(row.provenance.mixed).toBe(false);
  });

  it("pools lines at the current itemHash across challenge hashes, and drops retired lines", () => {
    const row = only([
      // Older challenge identity (an item since added); its i1 resample still counts.
      attempt({ attemptId: "att-pre", challengeHash: "h0" }, [
        line("i1"),
        line("i1", { sample: 1, score: 0 }),
      ]),
      attempt({ attemptId: "att-cur", startedAt: T(2), retiredItems: ["gone"] }, [
        line("i1", { executedAt: T(1, 30) }),
        line("i2", { executedAt: T(2, 1) }),
        line("gone", { executedAt: T(2, 2) }),
      ]),
    ]);
    const cell = row.cells["c1"];
    expect(cell?.items).toBe(2);
    expect(cell?.samples).toEqual([1, 2]);
    expect(cell?.passed).toBeCloseTo(0.5 + 1);
  });
});

describe("buildRows cell status and headline", () => {
  it("classifies stale_hash, interrupted, and not_run; missing items count as fails", () => {
    const row = only([
      attempt({ attemptId: "att-stale", challengeHash: "h0" }, [
        line("i1", { itemHash: "ih-old" }),
        line("i2"),
      ]),
      attempt(
        {
          attemptId: "att-int",
          challengeId: "c2",
          challengeHash: "h2",
          interrupted: true,
          finishedAt: null,
        },
        [line("j1", { itemHash: "ih-j1" })],
      ),
    ]);
    expect(row.cells["c1"]?.status).toBe("stale_hash");
    expect(row.cells["c1"]?.passed).toBe(0);
    expect(row.cells["c2"]?.status).toBe("interrupted");
    expect(row.items).toBe(3);
    expect(row.passRate).toBe(0);
    expect(row.completeness).toEqual({ state: "partial", challenges: [0, 2], items: [0, 3] });

    const notRun = only([attempt({ attemptId: "a" }, [line("i1"), line("i2")])]);
    expect(notRun.cells["c2"]?.status).toBe("not_run");
    expect(notRun.passRate).toBeCloseTo(2 / 3);
    expect(notRun.scopes).toEqual({ core: [2, 1], stretch: [1, 1] });
    expect(notRun.families).toEqual({ f1: [1, 1], f2: [1, 1], g1: [1, 0] });
    expect(notRun.se).toBeNull(); // 3 families < 5
  });

  it("mixed when counted lines span runtime versions", () => {
    const row = only([
      attempt({ attemptId: "a1" }, [line("i1"), line("i2")]),
      attempt(
        {
          attemptId: "a2",
          challengeId: "c2",
          challengeHash: "h2",
          env: {
            platform: "p",
            runtimeVersion: "mlx-lm 2",
            nodeVersion: "v",
            benchmarkGitSha: "sha1",
          },
        },
        [line("j1")],
      ),
    ]);
    expect(row.provenance.runtimeVersions).toEqual(["mlx-lm 1", "mlx-lm 2"]);
    expect(row.provenance.mixed).toBe(true);
    expect(row.completeness.state).toBe("complete");
  });

  it("computes the CR1 family SE from SCORING.md at 5+ clusters", () => {
    const items = ["a", "b", "c", "d", "e"].map((x) => ({
      itemId: x,
      itemHash: `ih-${x}`,
      family: x,
      scope: "core" as const,
    }));
    const row = only(
      [
        attempt({ attemptId: "a" }, [
          line("a"),
          line("b"),
          line("c", { score: 0 }),
          line("d", { score: 0 }),
          line("e", { score: 0 }),
        ]),
      ],
      { challengeSet: [{ id: "c1", version: 1, challengeHash: "h1", items }] },
    );
    // p = 0.4; Σ (y − p·n)² = 2·0.36 + 3·0.16 = 1.2; SE = sqrt(5/4 · 1.2) / 5
    expect(row.se).toBeCloseTo(Math.sqrt(1.5) / 5);
  });
});

describe("buildRows rows and variants", () => {
  it("splits rows by the executing machine; legacy attempts take the legacy hardware", () => {
    const hw = {
      cpu: "Apple M5 Max",
      cpuCores: 18,
      memoryGb: 128,
      os: "macOS 27",
    };
    const { rows, hardware } = buildRows(
      input([
        attempt({ attemptId: "legacy" }, [line("i1"), line("i2")]),
        attempt(
          {
            attemptId: "theirs",
            schemaVersion: 3,
            submitter: "alice",
            env: {
              platform: "linux-x64",
              runtimeVersion: "llama.cpp b1",
              nodeVersion: "v",
              benchmarkGitSha: "sha2",
              hardware: hw,
              hardwareId: "hw-theirs",
            },
          },
          [line("i1", { score: 0 }), line("i2")],
        ),
      ]),
    );
    expect(rows.map((r) => [r.hardwareId, r.passed]).sort()).toEqual([
      ["hw-theirs", 1],
      ["local-hw", 2],
    ]);
    expect(rows.find((r) => r.hardwareId === "hw-theirs")?.provenance.submitters).toEqual([
      "alice",
    ]);
    expect(rows.find((r) => r.hardwareId === "local-hw")?.provenance.submitters).toEqual(["local"]);
    expect(hardware["hw-theirs"]).toEqual(hw);
    // Siblings of one config differ only in hardware.
    expect(rows.find((r) => r.hardwareId === "hw-theirs")?.variantLabel).toBe(
      "hw Apple M5 Max 128GB",
    );
  });

  it("variant names only the fields that differ among configs of one artifact", () => {
    const { rows } = buildRows(
      input([
        attempt({ attemptId: "a" }, [line("i1"), line("i2")]),
        attempt({ attemptId: "b", configHash: "cfgB", temperature: 0.7, topK: 20 }, [
          line("i1"),
          line("i2"),
        ]),
        attempt({ attemptId: "c", configHash: "cfgC", artifact: "other/model" }, [line("i1")]),
      ]),
    );
    const by = Object.fromEntries(rows.map((r) => [r.configHash, r]));
    expect(by["cfgA"]?.variant).toEqual({ temperature: "0", topK: "default" });
    expect(by["cfgB"]?.variantLabel).toBe("t0.7 · topK 20");
    expect(by["cfgC"]?.variantLabel).toBe("");
  });

  it("emits the dataset and the challenge set from the input, not the records", () => {
    const out = buildRows(input([attempt({ attemptId: "a" }, [line("i1"), line("i2")])]));
    expect(out.dataset.label).toBe("main");
    expect(out.challengeSet).toEqual([
      { id: "c1", version: 1, hash: "h1", items: 2, scopes: { core: 1, stretch: 1 } },
      { id: "c2", version: 1, hash: "h2", items: 1, scopes: { core: 1 } },
    ]);
  });
});

describe("buildRows model identity and cost", () => {
  it("modelKey groups builds of one model; a configs.yaml override wins", () => {
    const row = only([attempt({ attemptId: "a", artifact: "unsloth/Foo-7B-GGUF" }, [line("i1")])]);
    expect(row.modelKey).toBe("foo-7b");
    expect(row.modelName).toBe("Foo-7B");
    const over = only(
      [attempt({ attemptId: "a", artifact: "unsloth/Foo-7B-GGUF" }, [line("i1")])],
      {
        modelKeys: new Map([["unsloth/Foo-7B-GGUF", "bar"]]),
      },
    );
    expect(over.modelKey).toBe("bar");
  });

  it("a scored cell carries its cost and per-scope families", () => {
    const row = only([
      attempt({ attemptId: "a" }, [
        line("i1", { generationTokens: 10, wallTimeSec: 2, peakMemoryGb: 5, generationTps: 20 }),
        line("i1", {
          sample: 1,
          generationTokens: 30,
          wallTimeSec: 4,
          peakMemoryGb: 7,
          generationTps: 40,
          score: 0,
        }),
        line("i2", { generationTokens: 5, wallTimeSec: 1, peakMemoryGb: 3, generationTps: 30 }),
      ]),
    ]);
    const c = row.cells["c1"];
    expect(c?.cost).toEqual({ tokens: 25, wallSec: 4, peakMemoryGb: 7, genTps: 30 });
    expect(c?.scopeFamilies).toEqual({ core: { f1: [1, 0.5] }, stretch: { f2: [1, 1] } });
    expect(row.cells["c2"]?.cost).toBeNull();
    expect(row.cells["c2"]?.scopeFamilies).toEqual({ core: { g1: [1, 0] } });
  });
});
