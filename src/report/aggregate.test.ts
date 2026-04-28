import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  fixtureManifest,
  fixturePrompt,
  fixtureResult,
  fixtureScenario,
} from "./__fixtures__/archive-fixtures.js";
import { aggregateAll } from "./aggregate.js";

/** Build an archive-shaped input for aggregateAll from a flat results array. */
const makeArchiveWithResults = (
  results: ReturnType<typeof fixtureResult>[],
): { manifest: ReturnType<typeof fixtureManifest>; results: typeof results } => ({
  manifest: fixtureManifest(),
  results,
});

/** Build a PromptCorpusEntry for use in currentPromptCorpus. */
const fixturePromptEntry = (
  overrides: Partial<{ name: string; promptHash: string; tags: string[] }> = {},
): ReturnType<typeof fixturePrompt> => ({
  ...fixturePrompt(),
  name: overrides.name ?? "p1",
  promptHash: overrides.promptHash ?? "hashP",
  tags: overrides.tags,
});

describe("aggregateAll: prompt-side current-corpus filter", () => {
  it("drops result when promptName is absent from current corpus", async () => {
    const archive = makeArchiveWithResults([
      fixtureResult({ promptName: "ghost-prompt", promptHash: "h1" }),
    ]);
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {}, // empty
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.dropped.promptAbsent).toBe(1);
  });

  it("drops result when promptHash differs from current corpus entry", async () => {
    const archive = makeArchiveWithResults([
      fixtureResult({ promptName: "p1", promptHash: "old-hash" }),
    ]);
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "new-hash" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.dropped.promptDrifted).toBe(1);
  });

  it("keeps result whose model is not in current models.yaml", async () => {
    // The aggregator does not consult models.yaml at all.
    const archive = makeArchiveWithResults([
      fixtureResult({ promptName: "p1", promptHash: "hashP", model: "ghost-model" }),
    ]);
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "hashP" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    expect(out.records[0]?.model).toBe("ghost-model");
  });
});

describe("aggregateAll: basic scoring", () => {
  it("scores a prompt result and produces a webapp record", async () => {
    const archive = {
      manifest: fixtureManifest(),
      results: [fixtureResult({ output: "the answer is 4183" })],
    };
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "hashP" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(1);
    expect(rec.prompt_name).toBe("p1");
    expect(rec.category).toBe("math");
    expect(rec.tier).toBe(1);
    expect(rec.prompt_text).toBe("What is 47*89?");
    expect(out.dropped.promptAbsent).toBe(0);
    expect(out.dropped.promptDrifted).toBe(0);
  });

  it("records execution errors as score=0 with error details", async () => {
    const archive = {
      manifest: fixtureManifest(),
      results: [fixtureResult({ error: "LLM timeout", output: "" })],
    };
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "hashP" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(0);
    expect(rec.score_details).toContain("LLM timeout");
  });

  it("scores as 0 (with reason) when a scenario uses an unknown game scorer", async () => {
    const scenario = fixtureScenario({ scorer: "does_not_exist" });
    const archive = {
      manifest: fixtureManifest({ scenarios: [scenario] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: "hashS",
          finalPlayerStats: { stats: {} },
          events: [],
        }),
      ],
    };
    const scenarioCorpus = { s1: { ...scenario } };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: scenarioCorpus,
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(0);
    expect(rec.score_details).toContain("ScorerNotFound");
    expect(rec.category).toBe("game");
    expect(rec.prompt_text).toBe("");
  });

  it("passes scenario fields through to WebappRecord", async () => {
    const scenario = fixtureScenario({ tags: ["long-term-planning", "spatial-reasoning"] });
    const archive = {
      manifest: fixtureManifest({ scenarios: [scenario] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: "hashS",
          terminationReason: "completed",
          toolCallCount: 47,
          finalPlayerStats: { stats: { score: 100 } },
          events: [],
        }),
      ],
    };
    const scenarioCorpus = { s1: { ...scenario } };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: scenarioCorpus,
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.is_scenario).toBe(true);
    expect(rec.scenario_name).toBe("s1");
    expect(rec.category).toBe("game");
    expect(rec.tags).toContain("long-term-planning");
    expect(rec.tags).toContain("spatial-reasoning");
    expect(rec.termination_reason).toBe("completed");
    expect(rec.tool_call_count).toBe(47);
    expect(rec.final_player_stats).toEqual({ stats: { score: 100 } });
  });
});

describe("aggregateAll: tag overlay from current corpus", () => {
  it("uses tags from currentPromptCorpus", async () => {
    const fresh = { ...fixturePrompt(), tags: ["math-reasoning", "arithmetic"] };
    const archive = {
      manifest: fixtureManifest({ prompts: [fixturePrompt()] }),
      results: [fixtureResult({ output: "the answer is 4183" })],
    };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: { p1: fresh },
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    const rec = out.records[0];
    expect(rec).toBeDefined();
    if (rec === undefined) return;
    expect(rec.score).toBe(1);
    expect(rec.tags).toEqual(["math-reasoning", "arithmetic"]);
  });

  it("uses tags from currentScenarioCorpus for scenario records", async () => {
    const fresh = { ...fixtureScenario(), tags: ["long-term-planning"] };
    const archive = {
      manifest: fixtureManifest({ scenarios: [fixtureScenario()] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: "hashS",
          finalPlayerStats: { stats: {} },
          events: [],
        }),
      ],
    };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: { s1: fresh },
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    const rec = out.records[0];
    expect(rec).toBeDefined();
    if (rec === undefined) return;
    expect(rec.tags).toEqual(["long-term-planning"]);
  });
});

describe("aggregateAll: cell-level dedup", () => {
  it("dedups same cell across archives, latest executedAt wins", async () => {
    const olderResult = fixtureResult({
      promptName: "p1",
      promptHash: "h1",
      executedAt: "2026-01-01T00:00:00.000Z",
      output: "old-output",
    });
    const newerResult = fixtureResult({
      promptName: "p1",
      promptHash: "h1",
      executedAt: "2026-01-02T00:00:00.000Z",
      output: "new-output",
    });
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "h1" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [
          { path: "a.jsonl", mtime: new Date(0), data: makeArchiveWithResults([olderResult]) },
          { path: "b.jsonl", mtime: new Date(0), data: makeArchiveWithResults([newerResult]) },
        ],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    expect(out.records[0]?.executed_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("tie-breaks identical executedAt by archive mtime descending", async () => {
    const sameTime = "2026-01-01T00:00:00.000Z";
    const r1 = fixtureResult({
      promptName: "p1",
      promptHash: "h1",
      executedAt: sameTime,
      archiveId: "a",
    });
    const r2 = fixtureResult({
      promptName: "p1",
      promptHash: "h1",
      executedAt: sameTime,
      archiveId: "b",
    });
    const corpus = { p1: fixturePromptEntry({ name: "p1", promptHash: "h1" }) };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [
          { path: "older.jsonl", mtime: new Date(1000), data: makeArchiveWithResults([r1]) },
          { path: "newer.jsonl", mtime: new Date(2000), data: makeArchiveWithResults([r2]) },
        ],
        currentPromptCorpus: corpus,
        currentScenarioCorpus: {},
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(1);
    expect(out.records[0]?.archive_id).toBe("b");
  });
});

describe("aggregateAll: scenario hash filter", () => {
  it("drops corrupt scenario result (scenarioName set but scenarioHash null) as promptDrifted", async () => {
    // A result that has scenarioName !== null but scenarioHash === null is a
    // corrupt/old-format record. scenarioHashMatches must return false explicitly
    // rather than evaluating `null === "hashS"` silently.
    const scenario = fixtureScenario();
    const archive = {
      manifest: fixtureManifest({ scenarios: [scenario] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: null, // corrupt: scenario identified but hash missing
          finalPlayerStats: { stats: {} },
          events: [],
        }),
      ],
    };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: { s1: scenario },
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.dropped.promptDrifted).toBe(1);
    expect(out.dropped.promptAbsent).toBe(0);
  });

  it("drops scenario result when scenarioHash differs from current corpus entry", async () => {
    const scenario = fixtureScenario();
    const archive = {
      manifest: fixtureManifest({ scenarios: [scenario] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: "old-hash",
          finalPlayerStats: { stats: {} },
          events: [],
        }),
      ],
    };
    const driftedScenario = { ...scenario, scenarioHash: "new-hash" };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: { s1: driftedScenario },
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.dropped.promptDrifted).toBe(1);
  });

  it("drops scenario result when scenarioName is absent from current corpus", async () => {
    const scenario = fixtureScenario();
    const archive = {
      manifest: fixtureManifest({ scenarios: [scenario] }),
      results: [
        fixtureResult({
          promptName: "s1",
          scenarioName: "s1",
          scenarioHash: "hashS",
          finalPlayerStats: { stats: {} },
          events: [],
        }),
      ],
    };
    const out = await Effect.runPromise(
      aggregateAll({
        archives: [{ path: "a.jsonl", mtime: new Date(0), data: archive }],
        currentPromptCorpus: {},
        currentScenarioCorpus: {}, // empty
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.dropped.promptAbsent).toBe(1);
  });
});
