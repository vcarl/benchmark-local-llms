import { describe, expect, it } from "vitest";
import { classifyItems, cueBaseline, priority } from "./classify.js";

describe("priority rubric", () => {
  it("P1 only for production + all users + no workaround", () => {
    expect(priority({ production: true, allUsers: true, workaround: false })).toBe("P1");
    expect(priority({ production: true, allUsers: false, workaround: false })).toBe("P2");
    expect(priority({ production: true, allUsers: true, workaround: true })).toBe("P3");
    expect(priority({ production: false, allUsers: true, workaround: false })).toBe("P3");
  });
});

describe("cueBaseline", () => {
  const cues = { a: ["refund"], b: ["charge", "log in"] };
  it("counts whole-word-prefix cue hits per label, case-insensitively", () => {
    expect(cueBaseline("I was Charged twice; please log in.", cues)).toEqual({ a: 0, b: 2 });
    expect(cueBaseline("No refunds, no discharge.", cues)).toEqual({ a: 1, b: 0 });
  });
});

describe("item names", () => {
  it("suffix every seed, including _s0", () => {
    for (const g of classifyItems()) expect(g.authored.item["name"]).toMatch(/_s\d+$/);
  });
});
