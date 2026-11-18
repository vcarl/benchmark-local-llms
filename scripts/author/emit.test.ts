import { describe, expect, it } from "vitest";
import { decimalPattern, percentNearMiss, regexItem, slipNearMiss } from "./emit.js";

const matches = (value: number, text: string): boolean =>
  new RegExp(decimalPattern(value)).test(text);

describe("decimalPattern", () => {
  it("accepts plain and comma-grouped integer parts", () => {
    expect(matches(15230.38, "15230.38")).toBe(true);
    expect(matches(15230.38, "$15,230.38")).toBe(true);
    expect(matches(1234567.5, "1,234,567.50")).toBe(true);
  });
  it("rejects a different value or a longer number containing the digits", () => {
    expect(matches(15230.38, "15,230.39")).toBe(false);
    expect(matches(15230.38, "115,230.38")).toBe(false);
    expect(matches(15230.38, "1,15,230.38")).toBe(false);
    expect(matches(15230.38, "15230.381")).toBe(false);
    expect(matches(15230.38, "5230.38")).toBe(false);
  });
  it("keeps leading-zero and trailing-zero tolerance", () => {
    expect(matches(0.5, ".5")).toBe(true);
    expect(matches(0.5, "0.50")).toBe(true);
    expect(matches(0.5, "0.55")).toBe(false);
    expect(matches(386.66, "$386.66")).toBe(true);
  });
});

describe("near misses", () => {
  const hit = (pattern: string, text: string) => new RegExp(pattern).test(text);

  it("percentNearMiss requires the percent sign and the scaled value", () => {
    const { pattern, slip, credit } = percentNearMiss(0.0508);
    expect([slip, credit]).toEqual(["percent-for-decimal", 0.5]);
    expect(hit(pattern, "about 5.08%")).toBe(true);
    expect(hit(pattern, "5.08 %")).toBe(true);
    expect(hit(pattern, "5.08")).toBe(false);
    expect(hit(pattern, "15.08%")).toBe(false);
    expect(hit(percentNearMiss(0.75).pattern, "75%")).toBe(true);
    expect(hit(percentNearMiss(0.75).pattern, "75.0%")).toBe(true);
    expect(hit(percentNearMiss(0.75).pattern, "175%")).toBe(false);
  });

  it("slipNearMiss is omitted when the slip value equals the key", () => {
    expect(slipNearMiss("truncated", 0.5, 0.5)).toEqual([]);
    const [n] = slipNearMiss("truncated", 0.571429, 0.571428);
    expect(n && hit(n.pattern, "0.571428")).toBe(true);
  });

  it("regexItem refuses a near miss that matches its own prompt", () => {
    const item = (prompt: string) =>
      regexItem({
        name: "n",
        category: "c",
        tier: 1,
        prompt,
        pattern: decimalPattern(0.4),
        label: "equals 0.4",
        why: "w",
        nearMisses: [percentNearMiss(0.4)],
      });
    expect(item("Server aims left. As a decimal?").item["nearMisses"]).toHaveLength(1);
    expect(() => item("Server wins 40% of rallies. As a decimal?")).toThrow(/matches its own prompt/);
  });
});
