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
});
