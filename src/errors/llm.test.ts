import { describe, expect, it } from "vitest";
import { LlmEmptyResponse, LlmMalformedResponse, LlmRequestError, LlmTimeoutError } from "./llm.js";

describe("LlmRequestError", () => {
  it("carries tag and fields", () => {
    const e = new LlmRequestError({
      model: "Qwen 3 32B",
      promptName: "math_mul",
      cause: "ECONNREFUSED",
    });
    expect(e._tag).toBe("LlmRequestError");
    expect(e.model).toBe("Qwen 3 32B");
    expect(e.promptName).toBe("math_mul");
    expect(e.cause).toBe("ECONNREFUSED");
  });
});

describe("LlmTimeoutError", () => {
  it("carries tag and fields", () => {
    const e = new LlmTimeoutError({
      model: "Gemma",
      promptName: "code_is_palindrome",
      timeoutSec: 600,
    });
    expect(e._tag).toBe("LlmTimeoutError");
    expect(e.timeoutSec).toBe(600);
  });
});

describe("LlmMalformedResponse", () => {
  it("carries tag and fields", () => {
    const e = new LlmMalformedResponse({
      model: "Test",
      promptName: "p",
      body: "not json",
    });
    expect(e._tag).toBe("LlmMalformedResponse");
    expect(e.body).toBe("not json");
  });
});

describe("LlmEmptyResponse", () => {
  it("carries tag and fields", () => {
    const e = new LlmEmptyResponse({ model: "Test", promptName: "p" });
    expect(e._tag).toBe("LlmEmptyResponse");
  });
});
