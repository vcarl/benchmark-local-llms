import { describe, expect, it } from "vitest";
import type { ResolvedConfiguration } from "../../../config/configurations.js";
import type { PromptCorpusEntry } from "../../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../../schema/scenario.js";
import {
  formatModelLine,
  formatModelList,
  formatPromptLine,
  formatPromptList,
  formatScenarioLine,
} from "../list.js";

const cfg = (
  id: string,
  artifact: string,
  runtime: "llamacpp" | "mlx",
  quant?: string,
  active?: boolean,
): ResolvedConfiguration =>
  ({
    id,
    artifact,
    runtime,
    quant,
    temperature: 0.7,
    systemPrompt: "default",
    maxTokens: 4096,
    active,
    systemPromptText: "x",
    configHash: "h",
  }) as ResolvedConfiguration;

const prompt = (
  name: string,
  category: string,
  tier: number,
  systemKey: string,
): PromptCorpusEntry =>
  ({
    name,
    category,
    tier,
    system: { key: systemKey, text: "" },
    promptText: "",
    scorer: { type: "exact_match", expected: "", extract: "." },
    promptHash: "h",
  }) as unknown as PromptCorpusEntry;

const scenario = (name: string, tier: number): ScenarioCorpusEntry =>
  ({
    name,
    fixture: "fx",
    players: [],
    scorer: "noop",
    scorerParams: {},
    cutoffs: { wallClockSec: 60, totalTokens: 1000, toolCalls: 10 },
    tier,
    scenarioMd: "",
    scenarioHash: "h",
  }) as unknown as ScenarioCorpusEntry;

describe("formatModelLine", () => {
  it("renders id  artifact  runtime  quant  active", () => {
    expect(formatModelLine(cfg("qwen-72b-llamacpp", "qwen-72b.gguf", "llamacpp", "Q4_K_M"))).toBe(
      "qwen-72b-llamacpp\tqwen-72b.gguf\tllamacpp\tQ4_K_M\ttrue",
    );
  });

  it("uses '-' for absent quant and 'false' for active: false", () => {
    expect(
      formatModelLine(cfg("mistral-mlx", "mlx-community/mistral", "mlx", undefined, false)),
    ).toBe("mistral-mlx\tmlx-community/mistral\tmlx\t-\tfalse");
  });
});

describe("formatModelList", () => {
  it("joins rows with newlines", () => {
    const out = formatModelList([
      cfg("a-llamacpp", "a.gguf", "llamacpp", "Q4"),
      cfg("b-mlx", "b", "mlx"),
    ]);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("a-llamacpp\ta.gguf\tllamacpp\tQ4\ttrue");
    expect(out).toContain("b-mlx\tb\tmlx\t-\ttrue");
  });
});

describe("formatPromptLine", () => {
  it("renders name  category  tier", () => {
    expect(formatPromptLine(prompt("math_direct", "math", 1, "cot"))).toBe(
      "math_direct\tmath\ttier1",
    );
  });
});

describe("formatScenarioLine", () => {
  it("renders with <scenario> placeholder in the category column", () => {
    expect(formatScenarioLine(scenario("pvp_skirmish", 2))).toBe("pvp_skirmish\t<scenario>\ttier2");
  });
});

describe("formatPromptList", () => {
  it("groups prompts by category (sorted) then appends a Scenarios section", () => {
    const out = formatPromptList(
      [
        prompt("z_one", "math", 1, "cot"),
        prompt("a_two", "code", 2, "code"),
        prompt("b_one", "math", 1, "cot"),
      ],
      [scenario("pvp", 2), scenario("coop", 1)],
    );
    const lines = out.split("\n");
    // code prompts first (sorted category), then math prompts
    expect(lines[0]).toContain("a_two\tcode");
    expect(lines[1]).toContain("b_one\tmath");
    expect(lines[2]).toContain("z_one\tmath");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("# Scenarios");
    expect(lines[5]).toContain("coop");
    expect(lines[6]).toContain("pvp");
  });

  it("omits scenarios section when there are none", () => {
    const out = formatPromptList([prompt("m", "math", 1, "cot")], []);
    expect(out).toBe("m\tmath\ttier1");
  });

  it("omits blank separator when no prompts", () => {
    const out = formatPromptList([], [scenario("s1", 1)]);
    expect(out.split("\n")[0]).toBe("# Scenarios");
  });
});
