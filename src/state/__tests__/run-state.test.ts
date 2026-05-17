import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option, TestClock, TestContext } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import {
  clearRunState,
  generateRunId,
  loadRunState,
  STATE_FILE_NAME,
  saveRunState,
} from "../run-state.js";

const provideAll = <A, E>(
  eff: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Effect.Effect<A, E, never> => eff.pipe(Effect.provide(NodeContext.layer));

describe("run-state", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("loadRunState returns None when no state file exists", async () => {
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("saveRunState writes JSON; loadRunState reads it back", async () => {
    await Effect.runPromise(
      provideAll(
        saveRunState(dir, { runId: "r-2026-04-25-abcdef", createdAt: "2026-04-25T12:00:00.000Z" }),
      ),
    );
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.runId).toBe("r-2026-04-25-abcdef");
      expect(result.value.createdAt).toBe("2026-04-25T12:00:00.000Z");
    }
  });

  it("clearRunState removes the file", async () => {
    await Effect.runPromise(
      provideAll(saveRunState(dir, { runId: "r-x", createdAt: "2026-04-25T12:00:00.000Z" })),
    );
    await Effect.runPromise(provideAll(clearRunState(dir)));
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("clearRunState is a no-op when no state file exists", async () => {
    await Effect.runPromise(provideAll(clearRunState(dir)));
  });

  it("loadRunState returns None when the state file is corrupt JSON", async () => {
    await fs.writeFile(path.join(dir, STATE_FILE_NAME), "not json{");
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("loadRunState returns None when the state file is shape-invalid", async () => {
    await fs.writeFile(path.join(dir, STATE_FILE_NAME), JSON.stringify({ foo: "bar" }));
    const result = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(result)).toBe(true);
  });

  it("generateRunId produces r-YYYY-MM-DD-NNNNNN format", async () => {
    const id = await Effect.runPromise(generateRunId());
    expect(id).toMatch(/^r-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
  });

  it("generateRunId date prefix matches the clock", async () => {
    const program = Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-15T03:14:00.000Z"));
      return yield* generateRunId();
    });
    const id = await Effect.runPromise(program.pipe(Effect.provide(TestContext.TestContext)));
    expect(id.startsWith("r-2026-08-15-")).toBe(true);
  });
});
