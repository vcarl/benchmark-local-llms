import { describe, expect, it } from "vitest";
import { stripThinkingTags } from "./strip-thinking.js";

describe("stripThinkingTags — DeepSeek <think> blocks", () => {
  it("separates a closed think block into reasoning + output", () => {
    const r = stripThinkingTags("<think>let me reason about this</think>\n\nThe answer is 42.");
    expect(r.output).toBe("The answer is 42.");
    expect(r.reasoning).toBe("let me reason about this");
    expect(r.error).toBeNull();
  });

  it("separates a multi-line think block", () => {
    const r = stripThinkingTags("<think>\nstep 1\nstep 2\nstep 3\n</think>   \nFinal output here.");
    expect(r.output).toBe("Final output here.");
    expect(r.reasoning).toBe("\nstep 1\nstep 2\nstep 3\n");
    expect(r.error).toBeNull();
  });

  it("returns reasoning=null when there is no think block", () => {
    const r = stripThinkingTags("plain answer");
    expect(r.output).toBe("plain answer");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("treats orphaned </think> without an opener as no-tag passthrough", () => {
    const r = stripThinkingTags("answer text </think> trailing");
    expect(r.output).toBe("answer text </think> trailing");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("only consumes up to the first </think> (matches prior behavior)", () => {
    const r = stripThinkingTags("prefix text <think>a</think> middle <think>b</think> suffix");
    expect(r.output).toBe("middle <think>b</think> suffix");
    // reasoning captures everything before the first </think>, including the
    // pre-tag prefix, since the tag wasn't anchored to start. This mirrors
    // the existing regex (^.*?</think>).
    expect(r.reasoning).toBe("prefix text <think>a");
    expect(r.error).toBeNull();
  });

  it("returns error=thinking_truncated when <think> opens with no </think>", () => {
    const r = stripThinkingTags("<think>I was reasoning when the budget ran ou");
    expect(r.output).toBe("");
    expect(r.reasoning).toBe("I was reasoning when the budget ran ou");
    expect(r.error).toBe("thinking_truncated");
  });

  it("treats a multi-line unclosed think block the same way", () => {
    const r = stripThinkingTags("<think>\nfirst, I'll consider…\nthen I'll");
    expect(r.output).toBe("");
    expect(r.reasoning).toBe("\nfirst, I'll consider…\nthen I'll");
    expect(r.error).toBe("thinking_truncated");
  });
});

describe("stripThinkingTags — Harmony (gpt-oss) channels", () => {
  it("extracts final body to output, analysis body to reasoning, terminated by <|end|>", () => {
    const input =
      "<|channel|>analysis<|message|>thinking...<|end|>" +
      "<|channel|>final<|message|>the final answer<|end|>";
    const r = stripThinkingTags(input);
    expect(r.output).toBe("the final answer");
    expect(r.reasoning).toBe("thinking...");
    expect(r.error).toBeNull();
  });

  it("extracts final body terminated by <|return|>", () => {
    const input =
      "<|channel|>analysis<|message|>scratch<|end|>" +
      "<|channel|>final<|message|>computed: 7<|return|>";
    const r = stripThinkingTags(input);
    expect(r.output).toBe("computed: 7");
    expect(r.reasoning).toBe("scratch");
    expect(r.error).toBeNull();
  });

  it("extracts final body when terminator is end-of-string", () => {
    const r = stripThinkingTags("<|channel|>final<|message|>trailing answer no terminator");
    expect(r.output).toBe("trailing answer no terminator");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("strips leftover harmony control tokens after extraction", () => {
    const r = stripThinkingTags("<|channel|>final<|message|><|start|>hello<|mid|> world<|end|>");
    expect(r.output).toBe("hello world");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });

  it("preserves inner whitespace but trims ends on output and reasoning", () => {
    const r = stripThinkingTags("<|channel|>final<|message|>   answer with pad   <|end|>");
    expect(r.output).toBe("answer with pad");
  });
});

describe("stripThinkingTags — combined / edge cases", () => {
  it("harmony extraction takes precedence then think strip still runs on the body", () => {
    const r = stripThinkingTags("<|channel|>final<|message|><think>hidden</think>visible<|end|>");
    expect(r.output).toBe("visible");
    expect(r.reasoning).toBe("hidden");
    expect(r.error).toBeNull();
  });

  it("trims surrounding whitespace on a plain string", () => {
    const r = stripThinkingTags("   answer   ");
    expect(r.output).toBe("answer");
    expect(r.reasoning).toBeNull();
    expect(r.error).toBeNull();
  });
});
