import { CommandExecutor, FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ScorerSpawnFailed } from "../errors/index.js";
import { scoreCustom } from "./custom.js";

const withScript = <A, E>(
  body: string,
  run: (path: string) => Effect.Effect<A, E, NodeContext.NodeContext>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const path = `${dir}/scorer.py`;
      yield* fs.writeFileString(path, body);
      return yield* run(path);
    }),
  ).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);

describe("scoreCustom", () => {
  it("returns the score the script prints", () =>
    withScript(
      "import sys, json\nd = json.load(sys.stdin)\nprint(json.dumps({'score': 1.0 if d['output']=='ok' else 0.0}))\n",
      (path) =>
        scoreCustom("ok", path, {}).pipe(
          Effect.tap((s) => Effect.sync(() => expect(s.score).toBe(1.0))),
        ),
    ));

  it("surfaces ScorerSpawnFailed when the interpreter binary does not exist", () =>
    Effect.gen(function* () {
      const result = yield* scoreCustom(
        "hello",
        "/nonexistent/scorer.py",
        {},
        {
          pythonBin: "definitely-not-a-real-binary-xyz",
        },
      ).pipe(Effect.flip);
      expect(result._tag).toBe("ScorerSpawnFailed");
      expect(result instanceof ScorerSpawnFailed).toBe(true);
    }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise));

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

    const exit = await scoreCustom("anything", "/some/scorer.py", {}).pipe(
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
