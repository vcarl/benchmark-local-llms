import { describe, expect, it } from "vitest";
import { stripThinkingTags } from "./strip-thinking.js";

describe("stripThinkingTags — DeepSeek <think> blocks", () => {
  it("strips a simple leading think block", () => {
    const input = "<think>let me reason about this</think>\n\nThe answer is 42.";
    expect(stripThinkingTags(input)).toBe("The answer is 42.");
  });

  it("strips multi-line think block with inner newlines", () => {
    const input = "<think>\nstep 1\nstep 2\nstep 3\n</think>   \nFinal output here.";
    expect(stripThinkingTags(input)).toBe("Final output here.");
  });

  it("leaves output untouched when there is no think block", () => {
    expect(stripThinkingTags("plain answer")).toBe("plain answer");
  });

  it("only strips the first think-block region (everything up to first </think>)", () => {
    // Python behavior: `^.*?</think>` with DOTALL + sub() — the regex matches
    // from start of string up through the first `</think>`, non-greedily,
    // removing everything preceding the first close tag.
    const input = "prefix text <think>a</think> middle <think>b</think> suffix";
    expect(stripThinkingTags(input)).toBe("middle <think>b</think> suffix");
  });
});

describe("stripThinkingTags — Harmony (gpt-oss) channels", () => {
  it("extracts the final channel body terminated by <|end|>", () => {
    const input =
      "<|channel|>analysis<|message|>thinking...<|end|>" +
      "<|channel|>final<|message|>the final answer<|end|>";
    expect(stripThinkingTags(input)).toBe("the final answer");
  });

  it("extracts the final channel body terminated by <|return|>", () => {
    const input =
      "<|channel|>analysis<|message|>scratch<|end|>" +
      "<|channel|>final<|message|>computed: 7<|return|>";
    expect(stripThinkingTags(input)).toBe("computed: 7");
  });

  it("extracts the final channel body when terminator is end-of-string", () => {
    const input = "<|channel|>final<|message|>trailing answer no terminator";
    expect(stripThinkingTags(input)).toBe("trailing answer no terminator");
  });

  it("strips leftover harmony control tokens after extraction", () => {
    const input = "<|channel|>final<|message|><|start|>hello<|mid|> world<|end|>";
    expect(stripThinkingTags(input)).toBe("hello world");
  });

  it("preserves inner whitespace but trims ends", () => {
    const input = "<|channel|>final<|message|>   answer with pad   <|end|>";
    expect(stripThinkingTags(input)).toBe("answer with pad");
  });
});

describe("stripThinkingTags — combined / edge cases", () => {
  it("harmony extraction takes precedence then think strip still runs", () => {
    // Unusual but defensible: extracted harmony body still containing <think>.
    const input = "<|channel|>final<|message|><think>hidden</think>visible<|end|>";
    expect(stripThinkingTags(input)).toBe("visible");
  });

  it("trims surrounding whitespace on a plain string", () => {
    expect(stripThinkingTags("   answer   ")).toBe("answer");
  });
});
