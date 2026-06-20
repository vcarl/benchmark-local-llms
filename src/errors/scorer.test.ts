import { describe, expect, it } from "vitest";
import {
  CodeExecFailed,
  CodeExecTimeout,
  ConstraintEvalError,
  ScorerNotFound,
  ScorerSpawnFailed,
} from "./scorer.js";

describe("ScorerNotFound", () => {
  it("carries tag and scorerName", () => {
    const e = new ScorerNotFound({ scorerName: "mystery_scorer" });
    expect(e._tag).toBe("ScorerNotFound");
    expect(e.scorerName).toBe("mystery_scorer");
  });
});

describe("ConstraintEvalError", () => {
  it("carries tag and fields", () => {
    const e = new ConstraintEvalError({
      constraintName: "has_keys",
      check: "json_has_keys",
      cause: "not an object",
    });
    expect(e._tag).toBe("ConstraintEvalError");
    expect(e.check).toBe("json_has_keys");
  });
});

describe("CodeExecTimeout", () => {
  it("carries tag and timeoutSec", () => {
    const e = new CodeExecTimeout({ timeoutSec: 10 });
    expect(e._tag).toBe("CodeExecTimeout");
    expect(e.timeoutSec).toBe(10);
  });
});

describe("CodeExecFailed", () => {
  it("carries tag, exitCode, and stderr", () => {
    const e = new CodeExecFailed({
      exitCode: 1,
      stderr: "AssertionError",
    });
    expect(e._tag).toBe("CodeExecFailed");
    expect(e.exitCode).toBe(1);
    expect(e.stderr).toBe("AssertionError");
  });
});

describe("ScorerSpawnFailed", () => {
  it("carries tag, binary, and cause", () => {
    const e = new ScorerSpawnFailed({
      binary: "definitely-not-a-real-binary-xyz",
      cause: "ENOENT",
    });
    expect(e._tag).toBe("ScorerSpawnFailed");
    expect(e.binary).toBe("definitely-not-a-real-binary-xyz");
    expect(e.cause).toBe("ENOENT");
  });
});
