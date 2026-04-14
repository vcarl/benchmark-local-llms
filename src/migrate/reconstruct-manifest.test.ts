import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import type { PrototypeGroup } from "./group-by-model.js";
import type { PrototypeRecord } from "./read-prototype.js";
import { reconstructArchive, resolvePromptName, synthesizeRunId } from "./reconstruct-manifest.js";

const promptEntry = (name: string, promptHash = "h1"): PromptCorpusEntry => ({
  name,
  category: "code",
  tier: 1,
  system: { key: "direct", text: "" },
  promptText: "",
  scorer: { type: "exact_match", expected: "", extract: "" },
  promptHash,
});

const scenarioEntry = (name: string): ScenarioCorpusEntry => ({
  name,
  fixture: "f",
  players: [],
  scorer: "generic",
  scorerParams: {},
  cutoffs: { wallClockSec: 600, totalTokens: 100, toolCalls: 50 },
  tier: 2,
  scenarioMd: "",
  scenarioHash: "shash",
});

describe("resolvePromptName", () => {
  const promptCorpus: Record<string, PromptCorpusEntry> = {
    code_fibonacci_direct: promptEntry("code_fibonacci_direct"),
    code_is_palindrome_direct: promptEntry("code_is_palindrome_direct"),
    code_is_palindrome_tdd: promptEntry("code_is_palindrome_tdd"),
  };
  const scenarioCorpus: Record<string, ScenarioCorpusEntry> = {
    bootstrap_grind: scenarioEntry("bootstrap_grind"),
  };

  it("matches stripped-suffix prototype names to current YAML names", () => {
    expect(
      resolvePromptName("code_fibonacci__t1_direct", promptCorpus, scenarioCorpus, false),
    ).toBe("code_fibonacci_direct");
    expect(
      resolvePromptName("code_is_palindrome__t2_tdd", promptCorpus, scenarioCorpus, false),
    ).toBe("code_is_palindrome_tdd");
  });

  it("matches scenarios directly by name", () => {
    expect(resolvePromptName("bootstrap_grind", promptCorpus, scenarioCorpus, true)).toBe(
      "bootstrap_grind",
    );
  });

  it("falls back to bare-name → _direct", () => {
    expect(resolvePromptName("code_fibonacci", promptCorpus, scenarioCorpus, false)).toBe(
      "code_fibonacci_direct",
    );
  });

  it("returns null for unknown prompt names", () => {
    expect(resolvePromptName("does_not_exist", promptCorpus, scenarioCorpus, false)).toBeNull();
  });
});

const mkGroup = (records: PrototypeRecord[]): PrototypeGroup => ({
  key: { model: "M", runtime: "mlx", quant: "4bit" },
  records,
  sourceFiles: ["/tmp/proto.jsonl"],
  mtimeMs: new Date("2026-03-01T00:00:00.000Z").getTime(),
});

describe("synthesizeRunId", () => {
  it("produces a deterministic ID from group identity", () => {
    const g = mkGroup([]);
    const id = synthesizeRunId(g);
    expect(id).toBe("2026-03-01_m_4bit_migrated");
  });

  it("uses 'noquant' marker when quant is empty", () => {
    const g: PrototypeGroup = { ...mkGroup([]), key: { model: "M", runtime: "mlx", quant: "" } };
    expect(synthesizeRunId(g)).toBe("2026-03-01_m_noquant_migrated");
  });
});

describe("reconstructArchive", () => {
  const promptCorpus = {
    code_fibonacci_direct: promptEntry("code_fibonacci_direct", "HASH_A"),
  };
  const scenarioCorpus = {
    bootstrap_grind: scenarioEntry("bootstrap_grind"),
  };

  it("builds a RunManifest with embedded used corpus entries", async () => {
    const group = mkGroup([
      {
        model: "M",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "code_fibonacci__t1_direct",
        prompt_tokens: 10,
        generation_tokens: 5,
        prompt_tps: 1,
        generation_tps: 1,
        peak_memory_gb: 1,
        wall_time_sec: 1,
        output: "x",
        error: null,
      },
    ]);

    const r = await Effect.runPromise(
      reconstructArchive({
        group,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
      }),
    );
    expect(r.runId).toBe("2026-03-01_m_4bit_migrated");
    expect(r.manifest.env.benchmarkGitSha).toBe("migrated");
    expect(r.manifest.interrupted).toBe(false);
    expect(Object.keys(r.manifest.promptCorpus)).toEqual(["code_fibonacci_direct"]);
    expect(Object.keys(r.manifest.scenarioCorpus)).toEqual([]);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.promptName).toBe("code_fibonacci_direct");
    expect(r.unmatched).toHaveLength(0);
  });

  it("recomputes promptHash from the current corpus when the prototype didn't store one", async () => {
    const group = mkGroup([
      {
        model: "M",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "code_fibonacci__t1_direct",
        prompt_hash: "", // missing
      },
    ]);
    const r = await Effect.runPromise(
      reconstructArchive({
        group,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
      }),
    );
    expect(r.results[0]?.promptHash).toBe("HASH_A");
  });

  it("preserves scenario events and final_state_summary (legacy field name)", async () => {
    const group = mkGroup([
      {
        model: "M",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "bootstrap_grind",
        scenario_name: "bootstrap_grind",
        scenario_hash: "OLD_HASH",
        termination_reason: "wall_clock",
        tool_call_count: 3,
        final_state_summary: { stats: { credits_earned: 100 } },
        events: [
          { event: "tool_call", tick: 1, ts: "2026-01-01T00:00:00Z", data: {} },
          { event: "llm_thought", tick: 2, ts: "2026-01-01T00:00:01Z", data: {} }, // filtered
        ],
      },
    ]);
    const r = await Effect.runPromise(
      reconstructArchive({
        group,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
      }),
    );
    const res = r.results[0];
    expect(res?.scenarioName).toBe("bootstrap_grind");
    expect(res?.finalPlayerStats).toEqual({ stats: { credits_earned: 100 } });
    expect(res?.events).toHaveLength(1);
    expect(res?.events?.[0]?.event).toBe("tool_call");
    expect(res?.scenarioHash).toBe("OLD_HASH");
    expect(res?.terminationReason).toBe("wall_clock");
  });

  it("reports unmatched prompts when no corpus entry is found", async () => {
    const group = mkGroup([
      {
        model: "M",
        runtime: "mlx",
        quant: "4bit",
        prompt_name: "deleted_prompt",
      },
    ]);
    const r = await Effect.runPromise(
      reconstructArchive({
        group,
        currentPromptCorpus: promptCorpus,
        currentScenarioCorpus: scenarioCorpus,
      }),
    );
    expect(r.results).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
    expect(r.unmatched[0]?.promptName).toBe("deleted_prompt");
  });
});
