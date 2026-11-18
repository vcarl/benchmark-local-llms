import { describe, expect, it } from "vitest";
import type { LoadedAttempt } from "../report/load-attempts.js";
import {
  auditItems,
  defaultAuditOptions,
  latestPerConfig,
  median,
  modalWrong,
  normalizeAnswer,
  type Obs,
  pointBiserial,
  toObservations,
} from "./stats.js";

describe("normalizeAnswer", () => {
  it("takes the last number, stripping thousands commas", () => {
    expect(normalizeAnswer("Step 1: ... so it is $15,230.50.")).toBe("15230.5");
    expect(normalizeAnswer("answer: 42")).toBe("42");
  });
  it("falls back to short lowercased text, or (empty)", () => {
    expect(normalizeAnswer("  Yes ")).toBe("yes");
    expect(normalizeAnswer("")).toBe("(empty)");
  });
});

describe("modalWrong", () => {
  it("counts normalized answers, most common first", () => {
    expect(modalWrong(["is 5", "5.0", "7"], 2)).toEqual([
      { answer: "5", count: 2 },
      { answer: "7", count: 1 },
    ]);
  });
});

describe("pointBiserial / median", () => {
  it("is +1 for perfect separation and null without variance", () => {
    expect(pointBiserial([true, true, false, false], [0.9, 0.8, 0.1, 0.2])).toBeCloseTo(0.99, 1);
    expect(pointBiserial([true, true], [0.1, 0.9])).toBeNull();
  });
  it("median handles odd and even", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

const obs = (configId: string, itemId: string, pass: boolean, output = ""): Obs => ({
  challengeId: "c",
  itemId,
  configId,
  pass,
  output,
});

describe("auditItems", () => {
  // 4 configs; "good" and "hi" separate strong from weak, "bad" is passed by nobody, "easy" by everybody.
  const strong = ["s1", "s2"];
  const weak = ["w1", "w2"];
  const all = [...strong, ...weak];
  const data: Obs[] = [
    ...all.map((c) => obs(c, "bad", false, "answer 9")),
    ...all.map((c) => obs(c, "easy", true)),
    ...all.map((c) => obs(c, "good", strong.includes(c))),
    ...all.map((c) => obs(c, "good2", strong.includes(c))),
    ...all.map((c) => obs(c, "noise", c === "s1" || c === "w1")),
  ];
  const rows = auditItems(data, { ...defaultAuditOptions, minN: 4, edgeTop: 2 });
  const by = (id: string) => rows.find((r) => r.itemId === id);

  it("computes p and spread", () => {
    expect(by("good")?.p).toBe(0.5);
    expect(by("good")?.spread).toBe(0.25);
  });
  it("flags suspect-key with its modal wrong answer", () => {
    expect(by("bad")?.flags).toContain("suspect-key");
    expect(by("bad")?.modalWrong).toEqual([{ answer: "9", count: 4 }]);
    expect(by("easy")?.flags).not.toContain("suspect-key");
  });
  it("flags saturated items among above-median configs", () => {
    expect(by("easy")?.flags).toContain("saturated");
    expect(by("good")?.flags).toContain("saturated");
    expect(by("noise")?.flags).not.toContain("saturated");
  });
  it("flags zero-failure items: every config passed", () => {
    expect(by("easy")?.flags).toContain("zero-failure");
    expect(by("good")?.flags).not.toContain("zero-failure");
  });
  it("flags the most discriminating items as edge", () => {
    expect(by("good")?.flags).toContain("edge");
    expect(by("good2")?.flags).toContain("edge");
    expect(by("noise")?.flags).not.toContain("edge");
  });
});

describe("latestPerConfig", () => {
  const att = (configId: string, startedAt: string, finishedAt: string | null): LoadedAttempt =>
    ({
      sourcePath: "x",
      manifest: { configId, challengeId: "c", startedAt, finishedAt, interrupted: false },
      items: [],
    }) as unknown as LoadedAttempt;
  it("keeps the newest completed attempt per config and challenge", () => {
    const out = latestPerConfig([
      att("a", "1", "2"),
      att("a", "3", "4"),
      att("a", "5", null),
      att("b", "1", "2"),
    ]);
    expect(out.map((a) => `${a.manifest.configId}${a.manifest.startedAt}`).sort()).toEqual([
      "a3",
      "b1",
    ]);
  });
});

describe("toObservations", () => {
  it("skips the lines of retired items", () => {
    const line = (promptName: string) => ({ itemId: promptName, promptName, score: 1, output: "" });
    const a = {
      sourcePath: "x",
      manifest: { configId: "a", challengeId: "c", retiredItems: ["gone"] },
      items: [line("kept"), line("gone")],
    } as unknown as LoadedAttempt;
    expect(toObservations([a]).map((o) => o.itemId)).toEqual(["kept"]);
  });
});
