import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
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

  it("returns expected score even when scorer writes to stderr (no deadlock)", () =>
    withScript(
      // Writes ~4 KB to stderr while also printing score JSON to stdout.
      // Before the concurrent-drain fix, this could deadlock if stderr filled
      // its pipe buffer before the harness started reading it.
      `${[
        "import sys, json",
        "d = json.load(sys.stdin)",
        "sys.stderr.write('x' * 4096)",
        "sys.stderr.flush()",
        "print(json.dumps({'score': 0.75}))",
      ].join("\n")}\n`,
      (path) =>
        scoreCustom("anything", path, {}).pipe(
          Effect.tap((s) => Effect.sync(() => expect(s.score).toBeCloseTo(0.75))),
        ),
    ));
});
