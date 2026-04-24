import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PromptCorpusEntry, SystemPrompt } from "./prompt.js";

const roundTrip = <A, I>(schema: Schema.Schema<A, I>, value: A): A => {
  const encoded = Schema.encodeSync(schema)(value);
  const json = JSON.stringify(encoded);
  const parsed = JSON.parse(json);
  return Schema.decodeUnknownSync(schema)(parsed);
};

describe("SystemPrompt", () => {
  it("round-trips", () => {
    const v: SystemPrompt = {
      key: "cot",
      text: "You are a helpful assistant. Think step by step.",
    };
    expect(roundTrip(SystemPrompt, v)).toEqual(v);
  });
});

describe("PromptCorpusEntry", () => {
  it("round-trips an exact_match entry", () => {
    const v: PromptCorpusEntry = {
      name: "math_multiply_cot",
      category: "math",
      tier: 2,
      system: { key: "cot", text: "Think step by step." },
      promptText: "What is 47 * 89?",
      scorer: {
        type: "exact_match",
        expected: "4183",
        extract: "ANSWER:\\s*(\\d+)",
      },
      promptHash: "abc123def456",
    };
    expect(roundTrip(PromptCorpusEntry, v)).toEqual(v);
  });

  it("round-trips a constraint entry", () => {
    const v: PromptCorpusEntry = {
      name: "json_recipe",
      category: "constraint",
      tier: 1,
      system: { key: "direct", text: "Be concise." },
      promptText: "Return a JSON object.",
      scorer: {
        type: "constraint",
        constraints: [
          { check: "valid_json", name: "parses" },
          { check: "json_has_keys", name: "keys", keys: ["name", "steps"] },
        ],
      },
      promptHash: "111222333444",
    };
    expect(roundTrip(PromptCorpusEntry, v)).toEqual(v);
  });

  it("round-trips a code_exec entry", () => {
    const v: PromptCorpusEntry = {
      name: "code_is_palindrome",
      category: "code",
      tier: 1,
      system: { key: "code_direct", text: "Output only the function." },
      promptText: "Write is_palindrome.",
      scorer: {
        type: "code_exec",
        testCode: "assert is_palindrome('racecar') == True",
      },
      promptHash: "deadbeefcafe",
    };
    expect(roundTrip(PromptCorpusEntry, v)).toEqual(v);
  });

  it("round-trips an entry with tags", () => {
    const v: PromptCorpusEntry = {
      name: "math_multiply_cot",
      category: "math",
      tier: 2,
      system: { key: "cot", text: "Think step by step." },
      promptText: "What is 47 * 89?",
      scorer: {
        type: "exact_match",
        expected: "4183",
        extract: "ANSWER:\\s*(\\d+)",
      },
      promptHash: "abc123def456",
      tags: ["foo", "bar"],
    };
    expect(roundTrip(PromptCorpusEntry, v)).toEqual(v);
  });
});
