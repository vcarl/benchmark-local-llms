import { describe, expect, it } from "vitest";
import {
  parseChallengeHash,
  buildChallengeUniverse,
  computeCoverage,
  isIncompleteCoverage,
} from "./coverage";
import type { BenchmarkResult } from "./data";

const rec = (o: Partial<BenchmarkResult>): BenchmarkResult => ({
  config_id: "cfg", config_hash: "ch", artifact: "qwen", runtime: "llamacpp",
  quant: "q4", temperature: 0, system_prompt: "concise", max_tokens: 512,
  challenge_id: "code", challenge_version: 1, attempt_id: "att-cfg-hash-1", finished_at: "t",
  score: 1, passed: true, generation_tokens: 100, wall_time_sec: 2,
  item_count: 1, passed_items: 1, peak_memory_gb: 0, generation_tps: 0, prompt_tps: 0,
  ...o,
});

describe("parseChallengeHash", () => {
  it("extracts the third dash-segment (challenge content hash)", () => {
    expect(parseChallengeHash("att-aaaaaaaaaaaa-bbbbbbbbbbbb-1719700000")).toBe("bbbbbbbbbbbb");
  });

  it("ignores the numeric timestamp tail", () => {
    expect(parseChallengeHash("att-cfg1-chalX-9999999999")).toBe("chalX");
    expect(parseChallengeHash("att-cfg1-chalX-1")).toBe("chalX");
  });
});

describe("buildChallengeUniverse", () => {
  it("canonical version = highest challenge_version seen", () => {
    const u = buildChallengeUniverse([
      rec({ challenge_id: "A", challenge_version: 1, attempt_id: "att-c-hA1-1", item_count: 5 }),
      rec({ challenge_id: "A", challenge_version: 2, attempt_id: "att-c-hA2-2", item_count: 7 }),
    ]);
    const a = u.challenges.get("A");
    expect(a?.version).toBe(2);
    expect(a?.hash).toBe("hA2");
    expect(a?.itemCount).toBe(7);
  });

  it("ties on version are broken by latest finished_at", () => {
    const u = buildChallengeUniverse([
      rec({ challenge_id: "B", challenge_version: 1, attempt_id: "att-c-old-1", item_count: 3, finished_at: "2026-06-20T09:00:00" }),
      rec({ challenge_id: "B", challenge_version: 1, attempt_id: "att-c-new-2", item_count: 4, finished_at: "2026-06-20T11:00:00" }),
    ]);
    const b = u.challenges.get("B");
    expect(b?.hash).toBe("new");
    expect(b?.itemCount).toBe(4);
  });

  it("totalItems = Σ canonical item_count over all challenges", () => {
    const u = buildChallengeUniverse([
      rec({ challenge_id: "A", challenge_version: 2, attempt_id: "att-c-hA2-2", item_count: 7 }),
      rec({ challenge_id: "A", challenge_version: 1, attempt_id: "att-c-hA1-1", item_count: 5 }),
      rec({ challenge_id: "B", challenge_version: 1, attempt_id: "att-c-hB-1", item_count: 4 }),
    ]);
    expect(u.challenges.size).toBe(2);
    expect(u.totalItems).toBe(11); // A canonical 7 + B 4
  });
});

describe("computeCoverage", () => {
  const universe = buildChallengeUniverse([
    rec({ challenge_id: "A", attempt_id: "att-x-hA-1", item_count: 10 }),
    rec({ challenge_id: "B", attempt_id: "att-x-hB-1", item_count: 10 }),
    rec({ challenge_id: "C", attempt_id: "att-x-hC-1", item_count: 10 }),
  ]);

  it("counts canonical-hash attempts as covered, never-run + stale as missing", () => {
    const cov = computeCoverage(
      [
        rec({ config_hash: "cfg", challenge_id: "A", attempt_id: "att-cfg-hA-1", item_count: 10, passed_items: 8 }),
        // B ran at a STALE (non-canonical) hash → missing, excluded from numerator
        rec({ config_hash: "cfg", challenge_id: "B", attempt_id: "att-cfg-STALE-1", item_count: 10, passed_items: 9 }),
        // C never run
      ],
      universe,
    );
    expect(cov.covered).toBe(1);
    expect(cov.total).toBe(3);
    expect(cov.missing).toEqual(["B", "C"]);
    expect(cov.numeratorPassedItems).toBe(8); // only A's canonical attempt
    expect(cov.denominatorItems).toBe(30);
  });

  it("does not double-count re-runs of the same canonical challenge (latest wins)", () => {
    const cov = computeCoverage(
      [
        rec({ config_hash: "cfg", challenge_id: "A", attempt_id: "att-cfg-hA-1", item_count: 10, passed_items: 4, finished_at: "2026-06-20T09:00:00" }),
        rec({ config_hash: "cfg", challenge_id: "A", attempt_id: "att-cfg-hA-2", item_count: 10, passed_items: 7, finished_at: "2026-06-20T11:00:00" }),
      ],
      universe,
    );
    expect(cov.covered).toBe(1);
    expect(cov.numeratorPassedItems).toBe(7); // latest only, not 4+7
  });

  it("flags incomplete coverage only when covered < total", () => {
    expect(isIncompleteCoverage({ coveredChallenges: 104, totalChallenges: 171 })).toBe(true);
    expect(isIncompleteCoverage({ coveredChallenges: 171, totalChallenges: 171 })).toBe(false);
    // Degenerate empty universe is not "incomplete".
    expect(isIncompleteCoverage({ coveredChallenges: 0, totalChallenges: 0 })).toBe(false);
  });

  it("full coverage at canonical hash: every challenge covered, none missing", () => {
    const cov = computeCoverage(
      [
        rec({ config_hash: "cfg", challenge_id: "A", attempt_id: "att-cfg-hA-1", item_count: 10, passed_items: 10 }),
        rec({ config_hash: "cfg", challenge_id: "B", attempt_id: "att-cfg-hB-1", item_count: 10, passed_items: 5 }),
        rec({ config_hash: "cfg", challenge_id: "C", attempt_id: "att-cfg-hC-1", item_count: 10, passed_items: 0 }),
      ],
      universe,
    );
    expect(cov.covered).toBe(3);
    expect(cov.missing).toEqual([]);
    expect(cov.numeratorPassedItems).toBe(15);
  });
});
