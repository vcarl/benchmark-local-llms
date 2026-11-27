import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit, Fiber } from "effect";
import { describe, expect, it, vi } from "vitest";
import { scoreCodeExec } from "./code-exec.js";
import { classifyFailure } from "./failure-kind.js";
import type { PromptScore } from "./score-result.js";
import { FORMAT_FLAW, FORMAT_FLAW_CREDIT } from "./score-result.js";

const kindOf = (s: PromptScore) =>
  classifyFailure({ score: s.score, error: null, output: "x", reasoning: null }, s);

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

  it("scores a timeout 0 as the code's runtime failure, never a scorer error", async () => {
    const out = await Effect.runPromise(
      scoreCodeExec("while True:\n    pass\n", "pass\n", { timeoutMs: 500 }).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(out).toEqual({ kind: "prompt", score: 0, details: "timed out after 0.5s" });
    expect(kindOf(out)).toBe("wrong");
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
    expect(out.nearMiss).toBeUndefined();
  });

  it("prefers the language fence over an earlier unlabeled one", async () => {
    expect((await score("```\nnope\n```\n```regex\n\\d{4}-\\d{2}-\\d{2}\n```")).score).toBe(1.0);
  });

  it("reads an unlabeled fence, then the whole trimmed output, as format flaws", async () => {
    for (const o of ["```\n\\d{4}-\\d{2}-\\d{2}\n```", "  \\d{4}-\\d{2}-\\d{2}\n"])
      expect(await score(o), o).toMatchObject({ score: FORMAT_FLAW_CREDIT, nearMiss: FORMAT_FLAW });
  });

  it("reads a pattern on the fence line as a format flaw", async () => {
    const out = await score("```regex \\d{4}-\\d{2}-\\d{2}\n```");
    expect(out).toMatchObject({ score: 0.75, nearMiss: "format-flaw" });
    expect(out.details).toContain("format flaw");
    expect(kindOf(out)).toBe("near_miss");
  });

  it("gives a wrong submission 0 whatever its format", async () => {
    const out = await score("```regex \\d+\n```");
    expect(out.score).toBe(0);
    expect(out.nearMiss).toBeUndefined();
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

describe("scoreCodeExec — sandbox isolation", () => {
  const run = (generated: string, test: string, timeoutMs?: number) =>
    scoreCodeExec(generated, test, timeoutMs === undefined ? {} : { timeoutMs }).pipe(
      Effect.provide(NodeContext.layer),
    );
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8" });
  /** Our containers, identified by their unique in-container timeout argument. */
  const containersWithTimeout = (sec: string) =>
    docker("ps", "-a", "--no-trunc", "--filter", "name=bench-scorer-", "--format", "{{.Command}}")
      .split("\n")
      .filter((c) => c.includes(` ${sec} python3`));

  it("has no network", async () => {
    const test = `import socket\ntry:\n    socket.create_connection(("1.1.1.1", 53), timeout=2)\n    raise SystemExit("network reachable")\nexcept OSError:\n    pass\n`;
    expect((await Effect.runPromise(run("pass", test))).score).toBe(1.0);
  });

  it("cannot write outside /tmp, can write inside it", async () => {
    const probe = `/var/tmp/sandbox-probe-${randomUUID()}`;
    const test = `try:\n    open(${JSON.stringify(probe)}, "w")\n    raise SystemExit("wrote outside /tmp")\nexcept OSError:\n    pass\nopen("/tmp/ok", "w").write("x")\n`;
    expect((await Effect.runPromise(run("pass", test))).score).toBe(1.0);
    expect(existsSync(probe)).toBe(false);
  });

  it("runs as a non-root user", async () => {
    const test = `import os\nassert os.getuid() == 65534, os.getuid()\n`;
    expect((await Effect.runPromise(run("pass", test))).score).toBe(1.0);
  });

  it("contains a memory hog as a 0 score", async () => {
    const out = await Effect.runPromise(run("x = bytearray(1 << 30)", "pass"));
    expect(out.score).toBe(0.0);
    expect(out.details).toMatch(/killed/);
  });

  it("contains a fork bomb as a 0 score", async () => {
    const out = await Effect.runPromise(
      run("import os\nwhile True:\n    os.fork()\n", "pass", 3_000),
    );
    expect(out.score).toBe(0.0);
  });

  it("leaves no container behind after a timeout", async () => {
    const out = await Effect.runPromise(run("while True:\n    pass\n", "pass", 1_300));
    expect(out.details).toBe("timed out after 1.3s");
    expect(containersWithTimeout("1.3")).toEqual([]);
  });

  it("removes the container when the scorer is interrupted", async () => {
    const fiber = Effect.runFork(run("import time\ntime.sleep(60)\n", "pass", 29_700));
    await new Promise((r) => setTimeout(r, 2_000));
    expect(containersWithTimeout("29.7")).toHaveLength(1);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(containersWithTimeout("29.7")).toEqual([]);
  });

  it("fails with ScorerSpawnFailed when the Docker daemon is unreachable", async () => {
    vi.stubEnv("DOCKER_HOST", "unix:///nonexistent/docker.sock");
    const exit = await Effect.runPromiseExit(run("pass", "pass"));
    vi.unstubAllEnvs();
    expect(JSON.stringify(Exit.isFailure(exit) && exit.cause)).toContain("ScorerSpawnFailed");
  });
});
