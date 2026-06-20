import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIOError } from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { contentDir, readBlob, scorerHash, writeBlob } from "./content-store.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

describe("content-store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cstore-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("scorerHash is deterministic and key-order independent", () => {
    const a = { type: "exact_match", expected: "4", extract: "(\\d+)" } as ScorerConfig;
    const b = { type: "exact_match", extract: "(\\d+)", expected: "4" } as ScorerConfig;
    expect(scorerHash(a)).toBe(scorerHash(b));
    expect(scorerHash(a)).toHaveLength(12);
  });

  it("writeBlob then readBlob round-trips", async () => {
    const exit = await run(
      Effect.gen(function* () {
        yield* writeBlob(dir, "prompts", "ph1", "hello prompt");
        return yield* readBlob(dir, "prompts", "ph1");
      }),
    );
    expect(exit).toStrictEqual(Exit.succeed("hello prompt"));
    expect(contentDir(dir)).toBe(join(dir, "content"));
  });

  it("writeBlob is idempotent (second write keeps identical bytes, no error)", async () => {
    const exit = await run(
      Effect.gen(function* () {
        yield* writeBlob(dir, "scorers", "sh1", '{"type":"exact_match"}');
        yield* writeBlob(dir, "scorers", "sh1", '{"type":"exact_match"}');
        return yield* readBlob(dir, "scorers", "sh1");
      }),
    );
    expect(exit).toStrictEqual(Exit.succeed('{"type":"exact_match"}'));
  });

  it("readBlob of a missing key fails with FileIOError", async () => {
    const exit = await run(readBlob(dir, "system", "nope"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(FileIOError);
    }
  });
});
