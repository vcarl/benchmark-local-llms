import { describe, expect, it } from "vitest";
import { FileIOError, JsonlCorruptLine } from "./io.js";

describe("JsonlCorruptLine", () => {
  it("carries tag, filePath, lineNumber, and rawLine", () => {
    const e = new JsonlCorruptLine({
      filePath: "archive/run.jsonl",
      lineNumber: 42,
      rawLine: "{not json",
    });
    expect(e._tag).toBe("JsonlCorruptLine");
    expect(e.filePath).toBe("archive/run.jsonl");
    expect(e.lineNumber).toBe(42);
    expect(e.rawLine).toBe("{not json");
  });
});

describe("FileIOError", () => {
  it("carries tag, path, operation, and cause", () => {
    const e = new FileIOError({
      path: "webapp/src/data/data.js",
      operation: "write",
      cause: "ENOSPC",
    });
    expect(e._tag).toBe("FileIOError");
    expect(e.operation).toBe("write");
  });
});
