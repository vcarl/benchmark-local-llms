import { describe, expect, it } from "vitest";
import { SseConnectionError, SseIdleTimeout, SseParseError } from "./sse.js";

describe("SseConnectionError", () => {
  it("carries tag and fields", () => {
    const e = new SseConnectionError({
      profileId: "prof-abc",
      cause: "stream closed",
    });
    expect(e._tag).toBe("SseConnectionError");
    expect(e.profileId).toBe("prof-abc");
    expect(e.cause).toBe("stream closed");
  });
});

describe("SseIdleTimeout", () => {
  it("carries tag and idleSec", () => {
    const e = new SseIdleTimeout({ profileId: "prof-abc", idleSec: 120 });
    expect(e._tag).toBe("SseIdleTimeout");
    expect(e.idleSec).toBe(120);
  });
});

describe("SseParseError", () => {
  it("carries tag and rawLine", () => {
    const e = new SseParseError({
      profileId: "prof-abc",
      rawLine: "data: not-json",
    });
    expect(e._tag).toBe("SseParseError");
    expect(e.rawLine).toBe("data: not-json");
  });
});
