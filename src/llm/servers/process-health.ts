/**
 * Background process-health monitoring (requirements §5.2).
 *
 * A long-running LLM server can die mid-session (OOM kill, kernel panic,
 * Python exception). Without a watchdog, every subsequent chat request
 * stalls on connect/timeout — the exact bug the Python prototype hit with
 * dead MLX subprocesses. This module forks a fiber that awaits
 * `process.exitCode` and signals a `Deferred` when the process dies, so
 * callers can race their requests against it and fail fast.
 *
 * The error surfaced on unexpected exit is a `ServerSpawnError` tagged with
 * `reason: "server exited unexpectedly: <code>"`. Once `src/errors/server.ts`
 * gains a dedicated `ServerExitedError` (flagged in the task return summary),
 * swap this out — none of the return types here need to change shape.
 */
import type { CommandExecutor } from "@effect/platform";
import { Deferred, Effect, Exit } from "effect";
import { ServerSpawnError } from "../../errors/index.js";
import type { Runtime } from "../../schema/enums.js";

export interface ProcessHealthMonitor {
  /**
   * A `Deferred` that stays pending while the process is alive, and fails
   * with a `ServerSpawnError` tagged with the exit code once the process
   * exits. Use with `Effect.race` / `Deferred.await` in request paths.
   */
  readonly exited: Deferred.Deferred<never, ServerSpawnError>;
  /**
   * Quick probe for callers that want a boolean check without racing — true
   * iff the monitor has not yet observed an exit.
   */
  readonly isAlive: Effect.Effect<boolean>;
}

/**
 * Fork a background fiber that awaits `process.exitCode` and fails the
 * returned deferred if the process exits unexpectedly. The fiber is
 * attached to the current scope and interrupted on scope close (at which
 * point a normal shutdown has already progressed — the deferred will
 * already be pending-forever-and-interrupted).
 */
export const watchProcess = (
  proc: CommandExecutor.Process,
  runtime: Runtime,
): Effect.Effect<ProcessHealthMonitor, never, import("effect/Scope").Scope> =>
  Effect.gen(function* () {
    const exited = yield* Deferred.make<never, ServerSpawnError>();

    // Background watcher: await exitCode, translate into a typed failure.
    // TODO(errors): once ServerExitedError exists in src/errors/server.ts,
    // replace this ServerSpawnError with the dedicated variant.
    const watcher = Effect.gen(function* () {
      const outcome = yield* Effect.exit(proc.exitCode);
      // If we get here during a normal shutdown, the deferred may already
      // be completed/interrupted — Deferred.fail on a done deferred is a
      // no-op, so this is safe.
      const err = Exit.match(outcome, {
        onFailure: (cause) =>
          new ServerSpawnError({
            runtime,
            reason: `server exited unexpectedly (await failure): ${String(cause)}`,
          }),
        onSuccess: (code) =>
          new ServerSpawnError({
            runtime,
            reason: `server exited unexpectedly: code=${String(code)}`,
          }),
      });
      yield* Deferred.fail(exited, err);
    });

    yield* Effect.forkScoped(watcher);

    const isAlive = Effect.map(Deferred.isDone(exited), (done) => !done);

    return { exited, isAlive };
  });
