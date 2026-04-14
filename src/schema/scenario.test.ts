import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CutoffConfig, PlayerDef, ScenarioCorpusEntry } from "./scenario.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("PlayerDef", () => {
  it("round-trips an llm-controlled player", () => {
    const v: PlayerDef = { id: "player1", controlledBy: "llm" };
    expect(roundTrip(PlayerDef, v)).toEqual(v);
  });

  it("round-trips an npc-controlled player", () => {
    const v: PlayerDef = { id: "opponent", controlledBy: "npc" };
    expect(roundTrip(PlayerDef, v)).toEqual(v);
  });

  it("rejects unknown controlledBy values", () => {
    expect(() => Schema.decodeUnknownSync(PlayerDef)({ id: "x", controlledBy: "human" })).toThrow();
  });
});

describe("CutoffConfig", () => {
  it("round-trips", () => {
    const v: CutoffConfig = {
      wallClockSec: 600,
      totalTokens: 20000,
      toolCalls: 50,
    };
    expect(roundTrip(CutoffConfig, v)).toEqual(v);
  });
});

describe("ScenarioCorpusEntry", () => {
  it("round-trips a full scenario", () => {
    const v: ScenarioCorpusEntry = {
      name: "bootstrap_grind",
      fixture: "starter",
      players: [
        { id: "alpha", controlledBy: "llm" },
        { id: "npc1", controlledBy: "npc" },
      ],
      scorer: "bootstrap_grind",
      scorerParams: { targetCredits: 1000 },
      cutoffs: { wallClockSec: 900, totalTokens: 32000, toolCalls: 100 },
      tier: 2,
      scenarioMd: "# Directive\n\nMake money.",
      scenarioHash: "abcdef012345",
    };
    expect(roundTrip(ScenarioCorpusEntry, v)).toEqual(v);
  });

  it("round-trips with empty players list and empty params", () => {
    const v: ScenarioCorpusEntry = {
      name: "navigation_route",
      fixture: "galaxy_small",
      players: [],
      scorer: "navigation_route",
      scorerParams: {},
      cutoffs: { wallClockSec: 300, totalTokens: 8000, toolCalls: 30 },
      tier: 1,
      scenarioMd: "",
      scenarioHash: "0123456789ab",
    };
    expect(roundTrip(ScenarioCorpusEntry, v)).toEqual(v);
  });
});
