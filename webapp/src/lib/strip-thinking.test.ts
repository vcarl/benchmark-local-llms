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
