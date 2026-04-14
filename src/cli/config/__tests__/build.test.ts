import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../../schema/model.js";
import type { PromptCorpusEntry } from "../../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../../schema/scenario.js";
import { buildRunLoopConfig, filterScenarios, parseTemperatures, type RunFlags } from "../build.js";

const makeScenario = (name: string): ScenarioCorpusEntry =>
  ({
    name,
    fixture: "fx",
    players: [{ id: "p1", controlledBy: "llm" }],
    scorer: "noop",
    scorerParams: {},
    cutoffs: { wallClockSec: 60, totalTokens: 1000, toolCalls: 10 },
    tier: 1,
    scenarioMd: "",
    scenarioHash: "h",
  }) as ScenarioCorpusEntry;

const baseFlags: RunFlags = {
  maxTokens: 8096,
  scenarios: "all",
  noSave: false,
  fresh: false,
  temperatures: [0.7],
  archiveDir: "./benchmark-archive",
  scenariosOnly: false,
};

describe("parseTemperatures", () => {
  it("defaults to [0.7] on empty/undefined input", () => {
    expect(parseTemperatures(undefined)).toEqual([0.7]);
    expect(parseTemperatures("")).toEqual([0.7]);
  });

  it("parses a single value", () => {
    expect(parseTemperatures("0.9")).toEqual([0.9]);
  });

  it("parses a comma-separated list", () => {
    expect(parseTemperatures("0.7,1.0")).toEqual([0.7, 1.0]);
  });

  it("ignores whitespace and blank tokens", () => {
    expect(parseTemperatures(" 0.1 , 0.2 , ")).toEqual([0.1, 0.2]);
  });

  it("returns null on an unparseable token", () => {
    expect(parseTemperatures("0.7,not-a-number")).toBeNull();
  });
});

describe("filterScenarios", () => {
  const corpus = [
    makeScenario("pvp_skirmish"),
    makeScenario("coop_defense"),
    makeScenario("pvp_siege"),
  ];

  it("returns everything on 'all'", () => {
    expect(filterScenarios(corpus, "all").map((s) => s.name)).toEqual([
      "pvp_skirmish",
      "coop_defense",
      "pvp_siege",
    ]);
  });

  it("returns nothing on 'none'", () => {
    expect(filterScenarios(corpus, "none")).toEqual([]);
  });

  it("substring-filters by scenario name", () => {
    expect(filterScenarios(corpus, "pvp").map((s) => s.name)).toEqual([
      "pvp_skirmish",
      "pvp_siege",
    ]);
  });
});

describe("buildRunLoopConfig", () => {
  const makeModel = (name: string): ModelConfig => ({ artifact: name, runtime: "mlx" });
  const makePrompt = (name: string): PromptCorpusEntry =>
    ({ name }) as unknown as PromptCorpusEntry;

  it("wires flags through, defaulting optionals", () => {
    const config = buildRunLoopConfig({
      flags: baseFlags,
      models: [makeModel("m1")],
      promptCorpus: [makePrompt("p1")],
      scenarioCorpus: [makeScenario("s1")],
      systemPrompts: { cot: "think" },
    });

    expect(config.maxTokens).toBe(8096);
    expect(config.fresh).toBe(false);
    expect(config.noSave).toBe(false);
    expect(config.scenariosOnly).toBe(false);
    expect(config.temperatures).toEqual([0.7]);
    expect(config.scenarioCorpus).toHaveLength(1);
    expect(config.promptCorpus).toHaveLength(1);
    expect(config.models).toHaveLength(1);
  });

  it("passes --fresh and --no-save through", () => {
    const config = buildRunLoopConfig({
      flags: { ...baseFlags, fresh: true, noSave: true },
      models: [],
      promptCorpus: [],
      scenarioCorpus: [],
      systemPrompts: {},
    });
    expect(config.fresh).toBe(true);
    expect(config.noSave).toBe(true);
  });

  it("empties the scenario corpus when filter is 'none'", () => {
    const config = buildRunLoopConfig({
      flags: { ...baseFlags, scenarios: "none" },
      models: [],
      promptCorpus: [],
      scenarioCorpus: [makeScenario("s1")],
      systemPrompts: {},
    });
    expect(config.scenarioCorpus).toEqual([]);
  });

  it("sets modelNameFilter when provided", () => {
    const config = buildRunLoopConfig({
      flags: { ...baseFlags, modelName: "qwen" },
      models: [],
      promptCorpus: [],
      scenarioCorpus: [],
      systemPrompts: {},
    });
    expect(config.modelNameFilter).toBe("qwen");
  });

  it("sets idleTimeoutSec only when provided", () => {
    const withIdle = buildRunLoopConfig({
      flags: { ...baseFlags, idleTimeoutSec: 90 },
      models: [],
      promptCorpus: [],
      scenarioCorpus: [],
      systemPrompts: {},
    });
    expect(withIdle.idleTimeoutSec).toBe(90);

    const without = buildRunLoopConfig({
      flags: baseFlags,
      models: [],
      promptCorpus: [],
      scenarioCorpus: [],
      systemPrompts: {},
    });
    expect(without.idleTimeoutSec).toBeUndefined();
  });
});
