/**
 * Direct unit tests for the process-health watcher fiber. The supervisor
 * tests exercise it integrated with real spawn+health plumbing; these
 * tests pin down the Deferred/isAlive contract in isolation.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Deferred, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { watchProcess } from "./process-health.js";
import { makeMockExecutor } from "./test-mocks.js";

const withMockProcess = <A>(
  behaviour: "alive" | { exitAfterMs: number; code: number },
  body: (
    proc: CommandExecutor.Process,
    runs: ReturnType<typeof makeMockExecutor>["runs"],
  ) => Effect.Effect<A, unknown, import("effect/Scope").Scope>,
): Effect.Effect<A, unknown, never> => {
  const mock = makeMockExecutor({ behaviour });
  return Effect.scoped(
    Effect.gen(function* () {
      const proc = yield* Command.start(Command.make("fake"));
      return yield* body(proc, mock.runs);
    }),
  ).pipe(Effect.provide(Layer.mergeAll(mock.layer)));
};

describe("watchProcess", () => {
  it("leaves the Deferred pending while the process stays alive", async () => {
    const stillPending = await Effect.runPromise(
      withMockProcess("alive", (proc) =>
        Effect.gen(function* () {
          const monitor = yield* watchProcess(proc, "llamacpp");
          // Wait a little; the watcher must not complete during this window.
          yield* Effect.sleep(80);
          return yield* Deferred.isDone(monitor.exited);
        }),
      ),
    );
    expect(stillPending).toBe(false);
  });

  it("fails the Deferred with ServerSpawnError once the process exits", async () => {
    const outcome = await Effect.runPromise(
      withMockProcess({ exitAfterMs: 30, code: 7 }, (proc) =>
        Effect.gen(function* () {
          const monitor = yield* watchProcess(proc, "mlx");
          const err = yield* Deferred.await(monitor.exited).pipe(
            Effect.catchAll((e) => Effect.succeed(e)),
          );
          const alive = yield* monitor.isAlive;
          return { err, alive };
        }),
      ),
    );
    expect(outcome.alive).toBe(false);
    expect(JSON.stringify(outcome.err)).toContain("ServerSpawnError");
    expect(JSON.stringify(outcome.err)).toContain("code=7");
    expect(JSON.stringify(outcome.err)).toContain("mlx");
  });
});
