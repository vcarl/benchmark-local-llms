import { describe, expect, it } from "vitest";
import type { AttemptDetailItem } from "./use-attempt-detail";
import type { ChallengeBreakdownRow } from "./pipeline";
import type { BenchmarkResult } from "./data";
import {
  challengeDistribution,
  finishedSpan,
  formatFinishedAt,
  formatWallTime,
  tallyItems,
} from "./debug-metrics";

const item = (over: Partial<AttemptDetailItem>): AttemptDetailItem => ({
  item_id: Math.random().toString(36).slice(2),
  prompt_name: "p",
  prompt_text: "q",
  output: "a",
  reasoning: null,
  score: 0,
  error: null,
  scorer: null,
  ...over,
});

describe("tallyItems", () => {
  it("classifies passed / wrong / errored buckets", () => {
    const items = [
      item({ score: 1 }), // passed
      item({ score: 0.5 }), // passed (score > 0)
      item({ score: 0 }), // wrong
      item({ score: 0, error: "boom" }), // errored, not wrong
      item({ score: 1, error: "still errored" }), // errored, not passed
    ];
    const t = tallyItems(items);
    expect(t.total).toBe(5);
    expect(t.passed).toBe(2);
    expect(t.wrong).toBe(1);
    expect(t.errored).toBe(2);
  });

  it("collects distinct error messages in first-seen order", () => {
    const items = [
      item({ error: "timeout" }),
      item({ error: "oom" }),
      item({ error: "timeout" }),
    ];
    expect(tallyItems(items).errorMessages).toEqual(["timeout", "oom"]);
  });

  it("treats empty-string error as no error (wrong, not errored)", () => {
    const t = tallyItems([item({ score: 0, error: "" })]);
    expect(t.errored).toBe(0);
    expect(t.wrong).toBe(1);
  });

  it("handles an empty item list", () => {
    expect(tallyItems([])).toEqual({
      total: 0,
      passed: 0,
      wrong: 0,
      errored: 0,
      errorMessages: [],
    });
  });
});

describe("formatWallTime", () => {
  it("formats sub-minute, minute, and hour ranges", () => {
    expect(formatWallTime(4.2)).toBe("4.2s");
    expect(formatWallTime(63)).toBe("1m 03s");
    expect(formatWallTime(3720)).toBe("1h 02m");
    expect(formatWallTime(-1)).toBe("—");
  });
});

describe("formatFinishedAt", () => {
  it("falls back to the raw value for unparseable input", () => {
    expect(formatFinishedAt("")).toBe("—");
    expect(formatFinishedAt("not-a-date")).toBe("not-a-date");
  });
});

describe("finishedSpan", () => {
  it("returns earliest and latest non-empty timestamps", () => {
    const span = finishedSpan([
      "2026-06-20T10:00:00Z",
      "2026-06-19T08:00:00Z",
      "2026-06-21T12:00:00Z",
    ]);
    expect(span.earliest).toBe("2026-06-19T08:00:00Z");
    expect(span.latest).toBe("2026-06-21T12:00:00Z");
  });

  it("ignores empty-string timestamps", () => {
    const span = finishedSpan(["", "2026-06-20T10:00:00Z", ""]);
    expect(span.earliest).toBe("2026-06-20T10:00:00Z");
    expect(span.latest).toBe("2026-06-20T10:00:00Z");
  });

  it("returns nulls when no usable timestamps are present", () => {
    expect(finishedSpan([])).toEqual({ earliest: null, latest: null });
    expect(finishedSpan(["", ""])).toEqual({ earliest: null, latest: null });
  });
});

const brow = (over: Partial<ChallengeBreakdownRow>): ChallengeBreakdownRow => ({
  challengeKey: "c@1",
  challengeId: "c",
  challengeVersion: 1,
  attemptId: "a",
  passRate: 0,
  itemCount: 1,
  passedItems: 0,
  record: {} as BenchmarkResult,
  ...over,
});

describe("challengeDistribution", () => {
  it("counts fully-passed / partial / zero and picks best/worst", () => {
    const rows = [
      brow({ challengeKey: "a@1", passRate: 1 }),
      brow({ challengeKey: "b@1", passRate: 0.5 }),
      brow({ challengeKey: "c@1", passRate: 0 }),
      brow({ challengeKey: "d@1", passRate: 1 }),
    ];
    const d = challengeDistribution(rows);
    expect(d.total).toBe(4);
    expect(d.fullyPassed).toBe(2);
    expect(d.partial).toBe(1);
    expect(d.zero).toBe(1);
    expect(d.best?.passRate).toBe(1);
    expect(d.worst?.challengeKey).toBe("c@1");
    expect(d.worst?.passRate).toBe(0);
  });

  it("breaks best/worst ties by challengeKey (lexicographic)", () => {
    const rows = [
      brow({ challengeKey: "z@1", passRate: 1 }),
      brow({ challengeKey: "a@1", passRate: 1 }),
      brow({ challengeKey: "m@1", passRate: 0 }),
      brow({ challengeKey: "b@1", passRate: 0 }),
    ];
    const d = challengeDistribution(rows);
    expect(d.best?.challengeKey).toBe("a@1");
    expect(d.worst?.challengeKey).toBe("b@1");
  });

  it("treats zero-item rows as 0% and keeps them eligible for worst", () => {
    const rows = [
      brow({ challengeKey: "a@1", passRate: 0.7, itemCount: 3, passedItems: 2 }),
      brow({ challengeKey: "b@1", passRate: 0, itemCount: 0, passedItems: 0 }),
    ];
    const d = challengeDistribution(rows);
    expect(d.zero).toBe(1);
    expect(d.partial).toBe(1);
    expect(d.worst?.challengeKey).toBe("b@1");
    expect(d.best?.challengeKey).toBe("a@1");
  });

  it("handles an empty breakdown", () => {
    expect(challengeDistribution([])).toEqual({
      total: 0,
      fullyPassed: 0,
      partial: 0,
      zero: 0,
      best: null,
      worst: null,
    });
  });
});
