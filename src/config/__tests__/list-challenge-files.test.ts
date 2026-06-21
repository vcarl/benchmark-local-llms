import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listChallengeFiles } from "../challenges.js";

let dir: string;

beforeAll(async () => {
  dir = await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const d = yield* fs.makeTempDirectory();
      yield* fs.writeFileString(`${d}/math.yaml`, "id: math\n");
      yield* fs.writeFileString(`${d}/code.yaml`, "id: code\n");
      yield* fs.writeFileString(`${d}/notes.txt`, "ignore me\n");
      return d;
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});

afterAll(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(dir, { recursive: true });
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});

it("lists *.yaml stems sorted, ignoring non-yaml", async () => {
  const files = await Effect.runPromise(
    listChallengeFiles(dir).pipe(Effect.provide(NodeContext.layer)),
  );
  expect(files.map((f) => f.stem)).toEqual(["code", "math"]);
  expect(files[0]?.path).toBe(`${dir}/code.yaml`);
});
