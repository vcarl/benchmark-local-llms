import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  fixtureManifest,
  fixturePrompt,
  fixtureResult,
  fixtureScenario,
} from "./__fixtures__/archive-fixtures.js";
import { aggregateArchive } from "./aggregate.js";

describe("aggregateArchive: as-run mode", () => {
  it("scores a prompt result and produces a webapp record", async () => {
    const manifest = fixtureManifest();
    const result = fixtureResult({ output: "the answer is 4183" });
    const out = await Effect.runPromise(
      aggregateArchive({ manifest, results: [result] }, { scoringMode: "as-run" }).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(1);
    expect(rec.prompt_name).toBe("p1");
    expect(rec.category).toBe("math");
    expect(rec.tier).toBe(1);
    expect(rec.prompt_text).toBe("What is 47*89?");
    expect(out.unmatched).toHaveLength(0);
  });

  it("records execution errors as score=0 with error details", async () => {
    const manifest = fixtureManifest();
    const result = fixtureResult({ error: "LLM timeout", output: "" });
    const out = await Effect.runPromise(
      aggregateArchive({ manifest, results: [result] }, { scoringMode: "as-run" }).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(0);
    expect(rec.score_details).toContain("LLM timeout");
  });

  it("scores as 0 (with reason) when a scenario uses an unknown game scorer", async () => {
    const manifest = fixtureManifest({
      scenarios: [fixtureScenario({ scorer: "does_not_exist" })],
    });
    const result = fixtureResult({
      promptName: "s1",
      scenarioName: "s1",
      finalPlayerStats: { stats: {} },
      events: [],
    });
    const out = await Effect.runPromise(
      aggregateArchive({ manifest, results: [result] }, { scoringMode: "as-run" }).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(out.records).toHaveLength(1);
    const rec = out.records[0];
    if (rec === undefined) return;
    expect(rec.score).toBe(0);
    expect(rec.score_details).toContain("ScorerNotFound");
    expect(rec.category).toBe("game");
    expect(rec.prompt_text).toBe("");
  });

  it("collects unmatched records (no corpus entry) without emitting them", async () => {
    const manifest = fixtureManifest();
    const result = fixtureResult({ promptName: "unknown_prompt" });
    const out = await Effect.runPromise(
      aggregateArchive({ manifest, results: [result] }, { scoringMode: "as-run" }).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(out.records).toHaveLength(0);
    expect(out.unmatched).toHaveLength(1);
    expect(out.unmatched[0]?.promptName).toBe("unknown_prompt");
  });

  it("passes scenario fields through to WebappRecord", async () => {
    const scenario = fixtureScenario({ tags: ["long-term-planning", "spatial-reasoning"] });
    const manifest = fixtureManifest({ scenarios: [scenario] });
    const result = fixtureResult({
      promptName: "s1",
      scenarioName: "s1",
      terminationReason: "completed",
      toolCallCount: 47,
      finalPlayerStats: { stats: { score: 100 } },
      events: [],
    });
    const out = await Effect.runPromise(
      aggregateArchive({ manifest, results: [result] }, { scoringMode: "as-run" }).pipe(
        Effect.provide(NodeContext.layer),
      ),
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

describe("aggregateArchive: current mode", () => {
  it("uses the supplied current corpus, ignoring manifest embedding", async () => {
    // Manifest has an exact_match scorer expecting "4183"
    const manifest = fixtureManifest();
    const result = fixtureResult({ output: "the answer is 42" });

    // Current corpus re-maps the same prompt to expect "42" — demonstrates
    // that current-mode routing is honored (score flips from 0 to 1).
    const currentPrompt = fixturePrompt({ name: "p1" });
    const remapped = {
      ...currentPrompt,
      scorer: {
        type: "exact_match" as const,
        expected: "42",
        extract: "(\\d+)",
      },
    };

    const out = await Effect.runPromise(
      aggregateArchive(
        { manifest, results: [result] },
        {
          scoringMode: "current",
          currentPromptCorpus: { p1: remapped },
        },
      ).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records[0]?.score).toBe(1);
  });

  it("treats missing current-corpus entries as unmatched", async () => {
    const manifest = fixtureManifest();
    const result = fixtureResult();
    const out = await Effect.runPromise(
      aggregateArchive(
        { manifest, results: [result] },
        { scoringMode: "current" }, // no corpus supplied
      ).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.records).toHaveLength(0);
    expect(out.unmatched).toHaveLength(1);
  });
});
