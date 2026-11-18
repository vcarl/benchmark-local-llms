import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { scoreCodeExec } from "./code-exec.js";

describe("scoreCodeExec", () => {
  it("returns 1.0 when the generated code passes the test", async () => {
    const generated = `def add(a, b):\n    return a + b\n`;
    const test = `assert add(2, 3) == 5\n`;
    const out = await Effect.runPromise(
      scoreCodeExec(generated, test).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.kind).toBe("prompt");
    expect(out.score).toBe(1.0);
    expect(out.details).toBe("all tests passed");
  });

  it("returns 0.0 with 'assertion failed' when a test assertion trips", async () => {
    const generated = `def add(a, b):\n    return a + b + 1\n`;
    const test = `assert add(2, 3) == 5\n`;
    const out = await Effect.runPromise(
      scoreCodeExec(generated, test).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.score).toBe(0.0);
    expect(out.details).toMatch(/assertion failed/);
  });

  it("returns 0.0 with 'syntax error' when generated code has a syntax error", async () => {
    const generated = `def add(a, b)\n    return a + b\n`;
    const test = `assert add(2, 3) == 5\n`;
    const out = await Effect.runPromise(
      scoreCodeExec(generated, test).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.score).toBe(0.0);
    expect(out.details).toMatch(/syntax error/);
  });

  it("fails with CodeExecTimeout when execution exceeds the timeout", async () => {
    const generated = `
while True:
    pass
`;
    const test = `pass\n`;
    const exit = await Effect.runPromiseExit(
      scoreCodeExec(generated, test, { timeoutMs: 500 }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("CodeExecTimeout");
    }
  });

  it("extracts code from markdown fences in the output", async () => {
    const generated =
      "Some explanation.\n```python\ndef mul(a, b):\n    return a * b\n```\nThat's it.";
    const test = `assert mul(3, 4) == 12\n`;
    const out = await Effect.runPromise(
      scoreCodeExec(generated, test).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(out.score).toBe(1.0);
  });
});

describe("scoreCodeExec — submission mode", () => {
  const test = `import re\nassert re.fullmatch(SUBMISSION, "2024-01-31")\nassert not re.fullmatch(SUBMISSION, "2024-1-31")\n`;
  const score = (output: string, testCode = test, submission = "regex") =>
    Effect.runPromise(
      scoreCodeExec(output, testCode, { submission }).pipe(Effect.provide(NodeContext.layer)),
    );

  it("binds the fenced block to SUBMISSION without executing it", async () => {
    const out = await score("Pattern:\n```regex\n\\d{4}-\\d{2}-\\d{2}\n```\nThat's it.");
    expect(out.score).toBe(1.0);
  });

  it("prefers the language fence over an earlier unlabeled one", async () => {
    expect((await score("```\nnope\n```\n```regex\n\\d{4}-\\d{2}-\\d{2}\n```")).score).toBe(1.0);
  });

  it("falls back to an unlabeled fence, then the whole trimmed output", async () => {
    expect((await score("```\n\\d{4}-\\d{2}-\\d{2}\n```")).score).toBe(1.0);
    expect((await score("  \\d{4}-\\d{2}-\\d{2}\n")).score).toBe(1.0);
  });

  it("fails when the submission does not satisfy the tests", async () => {
    expect((await score("```regex\n\\d+-\\d+-\\d+\n```")).score).toBe(0.0);
  });

  it("never executes the submission as Python", async () => {
    expect((await score("```regex\nprint('ALL_TESTS_PASSED')\n```")).score).toBe(0.0);
  });

  it("passes quotes, backslashes and non-ASCII through verbatim", async () => {
    const t = `assert SUBMISSION == 'a"b\\\\c\\'d \\u00e9', repr(SUBMISSION)\n`;
    expect((await score("```sql\na\"b\\c'd é\n```", t, "sql")).score).toBe(1.0);
  });
});
