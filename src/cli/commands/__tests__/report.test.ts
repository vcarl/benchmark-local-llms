import { describe, expect, it } from "vitest";
import { FileIOError } from "../../../errors/index.js";
import { isMissingArchiveDirError, missingArchiveDirHint } from "../report.js";

describe("isMissingArchiveDirError", () => {
  it("matches ENOENT from read-archive-dir", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "read-archive-dir",
      cause:
        "SystemError: NotFound: FileSystem.readDirectory (./benchmark-archive): ENOENT: no such file or directory",
    });
    expect(isMissingArchiveDirError(err)).toBe(true);
  });

  it("does not match other read-archive-dir failures", () => {
    const err = new FileIOError({
      path: "./benchmark-archive",
      operation: "read-archive-dir",
      cause: "EACCES: permission denied",
    });
    expect(isMissingArchiveDirError(err)).toBe(false);
  });

  it("does not match ENOENT from other operations", () => {
    const err = new FileIOError({
      path: "./webapp/src/data/data.js",
      operation: "write",
      cause: "ENOENT: no such file or directory",
    });
    expect(isMissingArchiveDirError(err)).toBe(false);
  });
});

describe("missingArchiveDirHint", () => {
  it("embeds the archive directory path and names ./bench migrate", () => {
    const hint = missingArchiveDirHint("./benchmark-archive");
    expect(hint).toContain("./benchmark-archive");
    expect(hint).toContain("./bench migrate");
    expect(hint).toContain("--archive-dir");
  });
});
