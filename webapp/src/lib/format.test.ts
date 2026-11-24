import { describe, expect, it } from "vitest";
import { formatCount, formatItemTiming } from "./format";

describe("formatCount", () => {
  it("prints whole counts as-is and resampled (fractional) counts to one decimal", () => {
    expect(formatCount(47)).toBe("47");
    expect(formatCount(47.6000001)).toBe("47.6");
  });
});

describe("formatItemTiming", () => {
  it("shows TTFT, the prefill/decode split, decode rate, cache and draft use", () => {
    expect(
      formatItemTiming({
        wall_sec: 12.34,
        prompt_tokens: 1024,
        generation_tokens: 400,
        ttft_ms: 1210,
        prefill_ms: 800,
        decode_ms: 10_000,
        source: "server",
        cached_prompt_tokens: 512,
        draft_tokens: 6,
        draft_accepted_tokens: 4,
      }),
    ).toBe(
      "12.3s wall · TTFT 1.21s · prefill 0.80s · decode 10.0s (40.0 tok/s) · server timings · 1024 prompt tok (512 cached) · 400 gen tok · draft 4/6 accepted",
    );
  });

  it("degrades to wall time and tokens on lines recorded before timing capture", () => {
    expect(formatItemTiming({ wall_sec: 3, prompt_tokens: 10, generation_tokens: 5 })).toBe(
      "3.0s wall · 10 prompt tok · 5 gen tok",
    );
  });
});
