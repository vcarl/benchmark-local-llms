import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Challenge } from "./challenge.js";

describe("Challenge", () => {
  it("decodes inline items across scorer variants", () => {
    const v = {
      id: "instruction-following",
      version: 1,
      passThreshold: 0.8,
      items: [
        {
          name: "json-output",
          category: "constraint",
          tier: 1,
          prompt: "emit json",
          scorer: "constraint",
          constraints: [],
        },
        {
          name: "two-plus-two",
          category: "math",
          tier: 1,
          prompt: "what is 2+2?",
          scorer: "exact_match",
          expected: "4",
          extract: "(\\d+)",
        },
      ],
    };
    expect(Schema.decodeUnknownSync(Challenge)(v).items).toHaveLength(2);
  });

  it("rejects an item missing a scorer-required field (exact_match without extract)", () => {
    const v = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        { name: "a", category: "math", tier: 1, prompt: "q", scorer: "exact_match", expected: "4" },
      ],
    };
    expect(() => Schema.decodeUnknownSync(Challenge)(v)).toThrow();
  });

  it("does not carry a system field onto decoded items", () => {
    const v = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        {
          name: "a",
          category: "math",
          tier: 1,
          prompt: "q",
          system: "default",
          scorer: "exact_match",
          expected: "4",
          extract: "(\\d+)",
        },
      ],
    };
    const item = Schema.decodeUnknownSync(Challenge)(v).items[0];
    expect(item).toBeDefined();
    expect(item && "system" in item).toBe(false);
  });
});
