import { CommandExecutor } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { NodeContext } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ScorerSpawnFailed } from "../errors/index.js";
import { scoreCustom } from "./custom.js";

const withScript = <A, E>(
  source: string,
  run: (source: string) => Effect.Effect<A, E, NodeContext.NodeContext>,
) => run(source).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);

describe("scoreCustom", () => {
  it("returns the score the script prints", () =>
    withScript(
      "import sys, json\nd = json.load(sys.stdin)\nprint(json.dumps({'score': 1.0 if d['output']=='ok' else 0.0}))\n",
      (path) =>
        scoreCustom("ok", path, {}).pipe(
          Effect.tap((s) => Effect.sync(() => expect(s.score).toBe(1.0))),
        ),
    ));

  it("runs the script in the sandbox: non-root, no network, read-only root", () =>
    withScript(
      `${[
        "import sys, json, os, socket",
        "d = json.load(sys.stdin)",
        "assert os.getuid() == 65534",
        "try:",
        "    socket.create_connection(('1.1.1.1', 53), timeout=2)",
        "    sys.exit('network reachable')",
        "except OSError:",
        "    pass",
        "try:",
        "    open('/scorer.py', 'w')",
        "    sys.exit('root writable')",
        "except OSError:",
        "    pass",
        "print(json.dumps({'score': 0.5}))",
      ].join("\n")}\n`,
      (path) =>
        scoreCustom("x", path, {}).pipe(
          Effect.tap((s) => Effect.sync(() => expect(s.score).toBe(0.5))),
        ),
    ));

  it("surfaces ScorerSpawnFailed when the docker binary does not exist", async () => {
    const missingDocker = Layer.succeed(
      CommandExecutor.CommandExecutor,
      CommandExecutor.makeExecutor(() =>
        Effect.fail(new SystemError({ reason: "NotFound", module: "Command", method: "spawn" })),
      ),
    );
    const result = await scoreCustom("hello", "print(1)", {}).pipe(
      Effect.flip,
      Effect.provide(missingDocker),
      Effect.runPromise,
    );
    expect(result._tag).toBe("ScorerSpawnFailed");
    expect(result instanceof ScorerSpawnFailed).toBe(true);
  });

  it("defect inside collect propagates as die, not CodeExecFailed", async () => {
    // Regression: catchAllCause previously folded every non-typed-failure cause
    // (defects included) into Effect.succeed({ tag: "fail" }), which would
    // convert an internal defect into a CodeExecFailed typed error, suppressing
    // the actual failure and hiding bugs. The fix re-raises non-failure causes
    // with Effect.failCause so defects surface as defects.
    //
    // We induce a defect deterministically by providing a CommandExecutor whose
    // start() calls Effect.die — this causes a Cause.Die inside the collect
    // scope, which catchAllCause intercepts. With the old swallow bug the exit
    // would be a CodeExecFailed typed failure; with the fix it is a Die.
    const DEFECT = new Error("deliberate-die-for-test");
    const dyingExecutorLayer = Layer.succeed(
      CommandExecutor.CommandExecutor,
      CommandExecutor.makeExecutor(() => Effect.die(DEFECT)),
    );

    const exit = await scoreCustom("anything", "print(1)", {}).pipe(
      Effect.provide(dyingExecutorLayer),
      Effect.exit,
      Effect.runPromise,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      // Must be a Die (defect), NOT a typed Fail (which would indicate
      // the old swallow-into-CodeExecFailed behavior).
      expect(Cause.isDie(exit.cause)).toBe(true);
      expect(Cause.isFailure(exit.cause)).toBe(false);
    }
  });

  it("returns expected score even when scorer writes to stderr (no deadlock)", () =>
    withScript(
      // Writes 128 KB to stderr while also printing score JSON to stdout.
      // Before the concurrent-drain fix, this would deadlock because 128 KB
      // exceeds the typical ~64 KB OS pipe buffer and the sequential drain
      // would block forever waiting for stdout while stderr was full.
      `${[
        "import sys, json",
        "d = json.load(sys.stdin)",
        "sys.stderr.write('x' * 131072)",
        "sys.stderr.flush()",
        "print(json.dumps({'score': 0.75}))",
      ].join("\n")}\n`,
      (path) =>
        scoreCustom("anything", path, {}).pipe(
          Effect.tap((s) => Effect.sync(() => expect(s.score).toBeCloseTo(0.75))),
        ),
    ));
});
