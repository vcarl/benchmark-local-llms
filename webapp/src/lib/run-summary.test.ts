import { describe, it, expect } from "vitest";
import { normalizeRecord, type BenchmarkResult } from "./data";
import {
  encodeVariant,
  parseVariant,
  recordsForVariant,
  scenariosForVariant,
  summarizeVariant,
  variantOf,
  variantsForModel,
} from "./run-summary";

const mk = (
  over: Parameters<typeof normalizeRecord>[0],
): BenchmarkResult => normalizeRecord({ ...over });

describe("encode/parseVariant", () => {
  it("round-trips a variant", () => {
    const v = { runtime: "mlx", quant: "Q4_K_M", temperature: 0.7 };
    expect(parseVariant(encodeVariant(v))).toEqual(v);
  });

  it("handles empty quant strings", () => {
    const v = { runtime: "mlx", quant: "", temperature: 0.7 };
    expect(encodeVariant(v)).toBe("mlx~~0.7");
    expect(parseVariant("mlx~~0.7")).toEqual(v);
  });

  it("handles quants containing hyphens or underscores", () => {
    const v = { runtime: "llamacpp", quant: "q4-k-m_v2", temperature: 0.3 };
    expect(parseVariant(encodeVariant(v))).toEqual(v);
  });

  it("rejects malformed strings", () => {
    expect(parseVariant("only-two~parts")).toBeNull();
    expect(parseVariant("a~b~c~d")).toBeNull();
    expect(parseVariant("a~b~not-a-number")).toBeNull();
    expect(parseVariant("")).toBeNull();
  });
});

describe("summarizeVariant", () => {
  const key = { runtime: "mlx", quant: "4bit", temperature: 0.7 };

  it("counts pass/fail/error correctly", () => {
    // Only score===1 passes; partial credit (0.7, 0.3) is a fail.
    const recs = [
      mk({ model: "M", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 1, score_details: "ok" }),
      mk({ model: "M", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 0.7, score_details: "ok" }),
      mk({ model: "M", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 0.3, score_details: "ok" }),
      mk({ model: "M", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 0, score_details: "execution error: timeout" }),
    ];
    const s = summarizeVariant(recs, key);
    expect(s.pass).toBe(1);
    expect(s.fail).toBe(2);
    expect(s.error).toBe(1);
    expect(s.recordCount).toBe(4);
  });

  it("computes passRate over scored records only (errors excluded)", () => {
    const recs = [
      mk({ score: 1, score_details: "ok" }),
      mk({ score: 0.5, score_details: "ok" }),
      mk({ score: 0, score_details: "execution error: blah" }),
    ];
    const s = summarizeVariant(recs, key);
    // 1 pass, 1 fail, 1 error → passRate = 1/(1+1) = 0.5
    expect(s.passRate).toBe(0.5);
  });

  it("totals wall_time and generation_tokens", () => {
    const recs = [
      mk({ score: 1, wall_time_sec: 3, generation_tokens: 100 }),
      mk({ score: 1, wall_time_sec: 5, generation_tokens: 200 }),
    ];
    const s = summarizeVariant(recs, key);
    expect(s.totalWallSec).toBe(8);
    expect(s.totalGenerationTokens).toBe(300);
  });

  it("takes max peak_memory_gb across records", () => {
    const recs = [
      mk({ score: 1, peak_memory_gb: 4.5 }),
      mk({ score: 1, peak_memory_gb: 6.2 }),
      mk({ score: 1, peak_memory_gb: 5.8 }),
    ];
    expect(summarizeVariant(recs, key).peakMemoryGb).toBe(6.2);
  });

  it("ignores zero or non-finite tps when averaging", () => {
    const recs = [
      mk({ score: 1, prompt_tps: 100, generation_tps: 50 }),
      mk({ score: 1, prompt_tps: 0, generation_tps: 0 }),
      mk({ score: 1, prompt_tps: 200, generation_tps: 60 }),
    ];
    const s = summarizeVariant(recs, key);
    expect(s.meanPromptTps).toBe(150);
    expect(s.meanGenerationTps).toBe(55);
  });

  it("returns zeros for an empty record list", () => {
    const s = summarizeVariant([], key);
    expect(s.recordCount).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.meanScore).toBe(0);
    expect(s.peakMemoryGb).toBe(0);
  });
});

describe("variantsForModel", () => {
  const data: BenchmarkResult[] = [
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 1, wall_time_sec: 10, generation_tokens: 100 }),
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 0.5, wall_time_sec: 20, generation_tokens: 200 }),
    mk({ model: "A", runtime: "mlx", quant: "Q8_0", temperature: 0.7, score: 0.8 }),
    mk({ model: "A", runtime: "llamacpp", quant: "Q4_K_M", temperature: 0.7, score: 0.9 }),
    mk({ model: "B", runtime: "mlx", quant: "4bit", temperature: 0.7, score: 1 }),
    // Scenario record on the (mlx, 4bit, 0.7) variant — must contribute to
    // wall time and tokens (real cost the variant incurred), but NOT to
    // pass/fail/meanScore math (scenarios use raw `value`, not [0,1] scores).
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, is_scenario: true, score: 1, wall_time_sec: 30, generation_tokens: 50000 }),
  ];

  it("groups records by (runtime, quant, temperature) for the model", () => {
    const variants = variantsForModel(data, "A");
    expect(variants).toHaveLength(3);
  });

  it("excludes scenarios from pass/fail/score math but includes them in wall time and tokens", () => {
    const variants = variantsForModel(data, "A");
    const mlx4 = variants.find(
      (v) => v.key.runtime === "mlx" && v.key.quant === "4bit",
    );
    // recordCount counts every record in the variant (prompts + scenarios)
    expect(mlx4?.recordCount).toBe(3);
    // pass/fail/score is prompt-only: 1 pass (score 1) + 1 fail (score 0.5),
    // scenario doesn't count → meanScore = (1 + 0.5) / 2 = 0.75
    expect(mlx4?.pass).toBe(1);
    expect(mlx4?.fail).toBe(1);
    expect(mlx4?.meanScore).toBeCloseTo(0.75);
    // Wall time and generation tokens roll up across ALL records, including
    // the scenario — that's the cost the variant actually incurred.
    expect(mlx4?.totalWallSec).toBe(60); // 10 + 20 + 30
    expect(mlx4?.totalGenerationTokens).toBe(50300); // 100 + 200 + 50000
  });

  it("orders by mean score descending", () => {
    const variants = variantsForModel(data, "A");
    expect(variants[0].key).toEqual(variantOf(data[3])); // llamacpp Q4_K_M, score 0.9
    expect(variants[1].key.quant).toBe("Q8_0"); // 0.8
    expect(variants[2].key.quant).toBe("4bit"); // mean 0.75 (scenario excluded)
  });

  it("returns [] when no records for the model", () => {
    expect(variantsForModel(data, "missing")).toEqual([]);
  });
});

describe("recordsForVariant", () => {
  const data: BenchmarkResult[] = [
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "p1" }),
    mk({ model: "A", runtime: "mlx", quant: "Q8_0", temperature: 0.7, prompt_name: "p2" }),
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.3, prompt_name: "p3" }),
    mk({ model: "B", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "p4" }),
  ];

  it("returns only records matching the variant tuple", () => {
    const recs = recordsForVariant(data, "A", { runtime: "mlx", quant: "4bit", temperature: 0.7 });
    expect(recs).toHaveLength(1);
    expect(recs[0].prompt_name).toBe("p1");
  });

  it("differentiates on temperature", () => {
    const recs = recordsForVariant(data, "A", { runtime: "mlx", quant: "4bit", temperature: 0.3 });
    expect(recs[0].prompt_name).toBe("p3");
  });
});

describe("scenariosForVariant", () => {
  const data: BenchmarkResult[] = [
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "p1", is_scenario: false }),
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "s1", scenario_name: "s1", is_scenario: true }),
    mk({ model: "A", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "s2", scenario_name: "s2", is_scenario: true }),
    mk({ model: "A", runtime: "mlx", quant: "Q8_0", temperature: 0.7, prompt_name: "s3", scenario_name: "s3", is_scenario: true }),
    mk({ model: "B", runtime: "mlx", quant: "4bit", temperature: 0.7, prompt_name: "s4", scenario_name: "s4", is_scenario: true }),
  ];

  it("returns only scenario records for the variant tuple", () => {
    const recs = scenariosForVariant(data, "A", { runtime: "mlx", quant: "4bit", temperature: 0.7 });
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.scenario_name).sort()).toEqual(["s1", "s2"]);
  });

  it("excludes non-scenario records", () => {
    const recs = scenariosForVariant(data, "A", { runtime: "mlx", quant: "4bit", temperature: 0.7 });
    expect(recs.every((r) => r.is_scenario)).toBe(true);
  });

  it("returns [] when no scenarios match", () => {
    expect(
      scenariosForVariant(data, "A", { runtime: "vllm", quant: "fp16", temperature: 0.7 }),
    ).toEqual([]);
  });
});
