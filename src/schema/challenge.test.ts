import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Challenge } from "./challenge.js";

describe("Challenge", () => {
  it("decodes items with and without a scorer override", () => {
    const v = {
      id: "instruction-following",
      version: 1,
      passThreshold: 0.8,
      items: [
        { prompt: "json-output", scorer: { type: "constraint", constraints: [] } },
        { prompt: "word-count-limit" },
      ],
    };
    expect(Schema.decodeUnknownSync(Challenge)(v).items).toHaveLength(2);
  });
});
