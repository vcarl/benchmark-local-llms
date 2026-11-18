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
    { itemId: "i1", itemHash: "ih-i1" },
    { itemId: "i2", itemHash: "ih-i2" },
  ],
};
const C2: SetChallenge = {
  id: "c2",
  version: 1,
  challengeHash: "h2",
  items: [{ itemId: "j1", itemHash: "ih-j1" }],
};

const input = (attempts: LoadedAttempt[], over: Partial<RowsInput> = {}): RowsInput => ({
  attempts,
  challengeSet: [C1, C2],
  dataset: { label: "main", archiveDir: "a", challengesDir: "c", release: null, errata: [] },
  generatedAt: T(9),
  ...over,
});

const only = (attempts: LoadedAttempt[], over: Partial<RowsInput> = {}) => {
  const { rows } = buildRows(input(attempts, over));
  expect(rows.length).toBe(1);
  return rows[0] as (typeof rows)[number];
};

describe("buildRows selection", () => {
  it("the most recent execution of an item wins", () => {
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
      // Verbatim replay: started on day 5, lines keep their day-1 executedAt.
      attempt(
        {
          attemptId: "att-replay",
          startedAt: T(5),
          finishedAt: T(5, 1),
          env: {
            hostname: "h",
            platform: "p",
            runtimeVersion: "mlx-lm 9",
            nodeVersion: "v",
            benchmarkGitSha: "sha9",
          },
        },
        [line("i1"), line("i2")],
      ),
    ]);
    expect(row.cells["c1"]?.runtimeVersions).toEqual(["mlx-lm 1"]);
    expect(row.cells["c1"]?.gitShas).toEqual(["sha1"]);
    expect(row.cells["c1"]?.sourceAttempts).toEqual(["att-orig"]);
    expect(row.provenance.mixed).toBe(false);
  });

  it("pools lines at the current itemHash across challenge hashes", () => {
    const row = only([
      // Older challenge identity (an item since added); its i1 line still counts.
      attempt({ attemptId: "att-pre", challengeHash: "h0" }, [line("i1", { score: 0 })]),
      attempt({ attemptId: "att-cur", startedAt: T(2) }, [line("i2", { executedAt: T(2, 1) })]),
    ]);
    const cell = row.cells["c1"];
    expect(cell?.status).toBe("scored");
    expect(cell?.items).toBe(2);
    expect(cell?.samples).toEqual([1, 1]);
    expect(cell?.passed).toBe(1);
    expect(cell?.sourceAttempts).toEqual(["att-cur", "att-pre"]);
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
    expect(notRun.families).toEqual({ "c1/i1": [1, 1], "c1/i2": [1, 1], "c2/j1": [1, 0] });
    expect(notRun.se).toBeNull(); // 3 families < 5
  });

  it("archives without scopes, failure kinds, or machine leave those fields empty", () => {
    const out = buildRows(input([attempt({ attemptId: "a" }, [line("i1"), line("i2")])]));
    const row = out.rows[0];
    expect(row?.hardwareId).toBe("unknown");
    expect(row?.scopes).toEqual({});
    expect(row?.failureKinds).toEqual({});
    expect(row?.nearMissCredit).toBe(0);
    expect(row?.provenance.submitters).toEqual(["local"]);
    expect(row?.provenance.samples).toEqual([1, 1]);
    expect(out.hardware).toEqual({});
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
            hostname: "h",
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

  it("computes the CR1 SE from SCORING.md at 5+ clusters", () => {
    const items = ["a", "b", "c", "d", "e"].map((x) => ({ itemId: x, itemHash: `ih-${x}` }));
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
  it("variant names only the fields that differ among configs of one artifact", () => {
    const { rows } = buildRows(
      input([
        attempt({ attemptId: "a" }, [line("i1"), line("i2")]),
        attempt({ attemptId: "b", configHash: "cfgB", temperature: 0.7 }, [line("i1"), line("i2")]),
        attempt({ attemptId: "c", configHash: "cfgC", artifact: "other/model" }, [line("i1")]),
      ]),
    );
    const by = Object.fromEntries(rows.map((r) => [r.configHash, r]));
    expect(by["cfgA"]?.variant).toEqual({ temperature: "0" });
    expect(by["cfgB"]?.variantLabel).toBe("t0.7");
    expect(by["cfgC"]?.variantLabel).toBe("");
  });

  it("emits the dataset and the challenge set from the input, not the records", () => {
    const out = buildRows(input([attempt({ attemptId: "a" }, [line("i1"), line("i2")])]));
    expect(out.dataset.label).toBe("main");
    expect(out.challengeSet).toEqual([
      { id: "c1", version: 1, hash: "h1", items: 2, scopes: {} },
      { id: "c2", version: 1, hash: "h2", items: 1, scopes: {} },
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

  it("a scored cell carries its cost", () => {
    const row = only([
      attempt({ attemptId: "a" }, [
        line("i1", { generationTokens: 10, wallTimeSec: 2, peakMemoryGb: 5, generationTps: 20 }),
        line("i2", { generationTokens: 5, wallTimeSec: 1, peakMemoryGb: 3, generationTps: 30 }),
      ]),
    ]);
    expect(row.cells["c1"]?.cost).toEqual({ tokens: 15, wallSec: 3, peakMemoryGb: 5, genTps: 25 });
    expect(row.cells["c2"]?.cost).toBeNull();
  });
});
