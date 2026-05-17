import { describe, expect, it } from "vitest";
import { stripThinkingTags, extractThinkBlock } from "./strip-thinking";

describe("stripThinkingTags", () => {
  it("strips a leading <think>...</think> block", () => {
    expect(stripThinkingTags("<think>hmm</think>\n\nanswer is 4")).toBe("answer is 4");
  });
  it("returns text as-is when no tags", () => {
    expect(stripThinkingTags("plain answer")).toBe("plain answer");
  });
  it("pulls the final harmony channel body when present", () => {
    const text = "<|channel|>final<|message|>ok<|end|>";
    expect(stripThinkingTags(text)).toBe("ok");
  });
});

describe("extractThinkBlock", () => {
  it("returns the inner text of a <think> block", () => {
    expect(extractThinkBlock("<think>reasoning here</think>\nfinal")).toBe("reasoning here");
  });
  it("returns null when no <think> block", () => {
    expect(extractThinkBlock("just an answer")).toBeNull();
  });
});

describe("extractThinkBlock — additional formats", () => {
  it("extracts the analysis channel from a Harmony output", () => {
    const text =
      "<|channel|>analysis<|message|>weighing options<|end|>" +
      "<|channel|>final<|message|>the answer is 7<|end|>";
    expect(extractThinkBlock(text)).toBe("weighing options");
  });

  it("extracts the analysis channel even when no <|end|> follows (next channel terminates)", () => {
    const text =
      "<|channel|>analysis<|message|>still thinking" +
      "<|channel|>final<|message|>done";
    expect(extractThinkBlock(text)).toBe("still thinking");
  });

  it("returns the leading text before a bare </think> when no opening <think> exists", () => {
    expect(extractThinkBlock("hmm let me think\n</think>\n\nanswer is 4"))
      .toBe("hmm let me think");
  });

  it("prefers <think>...</think> over a bare leading </think>", () => {
    // If a complete pair exists, use it — even if a stray </think> is also present.
    expect(extractThinkBlock("<think>real reasoning</think>\nfinal"))
      .toBe("real reasoning");
  });

  it("returns null when text has no reasoning markers at all", () => {
    expect(extractThinkBlock("just a plain answer with no markers")).toBeNull();
  });
});

describe("extractThinkBlock — empty reasoning coalesces to null", () => {
  it("returns null for an empty <think></think> pair", () => {
    expect(extractThinkBlock("<think></think>\nfinal")).toBeNull();
  });

  it("returns null for an empty Harmony analysis channel", () => {
    expect(extractThinkBlock("<|channel|>analysis<|message|><|end|>")).toBeNull();
  });

  it("returns null for whitespace-only reasoning", () => {
    expect(extractThinkBlock("<think>   \n  </think>\nfinal")).toBeNull();
  });
});
