import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadSelectedChallenges } from "../challenges.js";

const yamlFor = (id: string): string =>
  [
    `id: ${id}`,
    "version: 1",
    "passThreshold: 0.5",
    "items:",
    `  - name: ${id}_item`,
    "    category: logic",
    "    tier: 1",
    `    prompt: what is ${id}?`,
    "    scorer: exact_match",
    `    expected: "${id}"`,
    "    extract: last_line",
    "",
  ].join("\n");

let dir: string;

const run = <A, E>(eff: Effect.Effect<A, E, FileSystem.FileSystem>): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

beforeAll(async () => {
  dir = await run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const d = yield* fs.makeTempDirectory();
      yield* fs.writeFileString(`${d}/math.yaml`, yamlFor("math"));
      yield* fs.writeFileString(`${d}/code.yaml`, yamlFor("code"));
      yield* fs.writeFileString(`${d}/notes.txt`, "ignore me\n");
      return d;
    }),
  );
});

afterAll(async () => {
  await run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(dir, { recursive: true });
    }),
  );
});

it("with no pattern loads every suite, sorted by stem", async () => {
  const selected = await run(loadSelectedChallenges(dir));
  expect(selected.stems).toEqual(["code", "math"]);
  expect(selected.challenges.map((c) => c.stem)).toEqual(["code", "math"]);
  expect(selected.challenges.map((c) => c.resolved.id)).toEqual(["code", "math"]);
});

it("with a glob loads only matching suites", async () => {
  const selected = await run(loadSelectedChallenges(dir, "ma*"));
  expect(selected.stems).toEqual(["math"]);
  expect(selected.challenges.map((c) => c.resolved.id)).toEqual(["math"]);
});

it("with a brace glob loads each named suite", async () => {
  const selected = await run(loadSelectedChallenges(dir, "{code,math}"));
  expect(selected.stems).toEqual(["code", "math"]);
});

it("with a non-matching glob returns empty, without failing", async () => {
  const selected = await run(loadSelectedChallenges(dir, "nope*"));
  expect(selected.stems).toEqual([]);
  expect(selected.challenges).toEqual([]);
});

it("returns stems usable as the matrix grid column axis alongside resolved suites", async () => {
  const selected = await run(loadSelectedChallenges(dir));
  // The grid's column axis is the stem list; it must line up 1:1 and in order
  // with the loaded challenges the matrix runs.
  expect(selected.stems).toEqual(selected.challenges.map((c) => c.stem));
  expect(selected.challenges[0]?.resolved.items.map((i) => i.itemId)).toEqual(["code_item"]);
});
