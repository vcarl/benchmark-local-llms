import { Command, CommandExecutor } from "@effect/platform";
import { Deferred, Effect, Exit, Inspectable, Layer, LogLevel, Sink, Stream } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { superviseServer } from "./supervisor.js";
import {
  httpClientLayer,
  makeFailingExecutor,
  makeMockExecutor,
  startHealthyServer,
  startUnhealthyServer,
  type TestHttpServer,
} from "./test-mocks.js";

describe("superviseServer", () => {
  let ts: TestHttpServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("spawns, waits for health, and returns a handle with pid + port", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive", pid: 123 });

    const acquired = await Effect.runPromise(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("fake-bin", "--model", "x"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 2,
          healthPollMs: 25,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    expect(acquired.port).toBe(ts.port);
    expect(acquired.pid).toBe(123);
    expect(acquired.runtime).toBe("llamacpp");
    expect(mock.runs.length).toBe(1);
    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (run) {
      expect(run.log.command).toBe("fake-bin");
      expect(run.log.args).toEqual(["--model", "x"]);
    }
  });

  it("sends SIGTERM to the process when the scope closes", async () => {
    ts = await startHealthyServer();
    const port = ts.port;
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* superviseServer({
            runtime: "llamacpp",
            port,
            command: Command.make("fake-bin"),
            healthUrl: `http://127.0.0.1:${port}/health`,
            healthTimeoutSec: 2,
            healthPollMs: 25,
          });
          // Scope closes here once this effect returns.
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (run) {
      expect(run.log.signalsReceived).toContain("SIGTERM");
    }
  });

  it("fails with ServerSpawnError when the executor cannot start the process", async () => {
    ts = await startHealthyServer();
    const failing = makeFailingExecutor("ENOENT: llama-server not found");

    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("missing-bin"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 2,
          healthPollMs: 25,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(failing, httpClientLayer))),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("ServerSpawnError");
    }
  });

  it("fails with HealthCheckTimeout when /health never becomes ready", async () => {
    ts = await startUnhealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("fake-bin"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 1,
          healthPollMs: 25,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("HealthCheckTimeout");
    }
    // Should have still attempted SIGTERM cleanup.
    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (run) {
      expect(run.log.signalsReceived).toContain("SIGTERM");
    }
  });

  it("fails fast with ServerSpawnError when the process exits during boot", async () => {
    ts = await startUnhealthyServer();
    const mock = makeMockExecutor({ behaviour: { exitAfterMs: 150, code: 1 } });

    const started = Date.now();
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        superviseServer({
          runtime: "mlx",
          port: ts.port,
          command: Command.make("python3"),
          // Very long health budget — if the race works, we fail in ~150ms.
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 30,
          healthPollMs: 25,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );
    const elapsed = Date.now() - started;

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("ServerSpawnError");
    }
    expect(elapsed).toBeLessThan(5000);
  });

  it("exposes an isAlive probe that flips false after unexpected exit", async () => {
    ts = await startHealthyServer();
    const port = ts.port;
    const mock = makeMockExecutor({ behaviour: "alive" });

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* superviseServer({
            runtime: "llamacpp",
            port,
            command: Command.make("fake-bin"),
            healthUrl: `http://127.0.0.1:${port}/health`,
            healthTimeoutSec: 2,
            healthPollMs: 25,
          });
          const aliveBefore = yield* handle.monitor.isAlive;
          // Force unexpected exit via the test handle.
          const run = mock.runs[0];
          if (!run) {
            return yield* Effect.die("no run recorded");
          }
          yield* run.forceExit(1);
          // Wait for the watcher fiber to observe the exit.
          const exitErr = yield* Deferred.await(handle.monitor.exited).pipe(
            Effect.catchAll((e) => Effect.succeed(e)),
          );
          const aliveAfter = yield* handle.monitor.isAlive;
          return { aliveBefore, aliveAfter, exitErr };
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    expect(result.aliveBefore).toBe(true);
    expect(result.aliveAfter).toBe(false);
    expect(JSON.stringify(result.exitErr)).toContain("ServerSpawnError");
    expect(JSON.stringify(result.exitErr)).toContain("server exited unexpectedly");
  });

  it("allows callers to race in-flight work against the process-exit deferred", async () => {
    ts = await startHealthyServer();
    const port = ts.port;
    const mock = makeMockExecutor({ behaviour: "alive" });

    const outcome = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* superviseServer({
            runtime: "llamacpp",
            port,
            command: Command.make("fake-bin"),
            healthUrl: `http://127.0.0.1:${port}/health`,
            healthTimeoutSec: 2,
            healthPollMs: 25,
          });

          // Simulate a request that would sleep for a while.
          const fakeRequest = Effect.sleep(2_000).pipe(Effect.as("done" as const));

          // Kick the server over before the request would have finished.
          const run = mock.runs[0];
          if (!run) {
            return yield* Effect.die("no run recorded");
          }
          yield* run.forceExit(1);
          // Let the watcher fiber observe the exit and fail the Deferred.
          yield* Effect.sleep(30);

          // `raceFirst` surfaces whichever result (success OR failure)
          // lands first, which is exactly what the request path wants:
          // "fail immediately when the server dies".
          const raced = yield* Effect.exit(
            Effect.raceFirst(fakeRequest, Deferred.await(handle.monitor.exited)),
          );
          return raced;
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    expect(Exit.isFailure(outcome)).toBe(true);
    if (Exit.isFailure(outcome)) {
      expect(JSON.stringify(outcome.cause)).toContain("ServerSpawnError");
    }
  });

  it("logs 'starting' and 'healthy' INF lines on successful boot", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive", pid: 777 });
    const sink: string[] = [];
    await Effect.runPromise(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("fake-bin"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 2,
          healthPollMs: 25,
        }),
      ).pipe(
        Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer)),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    expect(sink.some((l) => l.includes(`starting llamacpp on :${ts?.port} (pid=777)`))).toBe(true);
    expect(sink.some((l) => l.match(/healthy in \d/))).toBe(true);
  });

  it("logs 'stopping' + 'escalating to SIGKILL' when graceful shutdown does not bring down the process", async () => {
    ts = await startHealthyServer();
    const sink: string[] = [];

    // Build a mock executor whose kill("SIGTERM") never resolves — forces
    // the graceful-timeout path so escalation fires. SIGKILL resolves
    // immediately so the finalizer can complete within the test budget.
    const exitedDeferred = Deferred.unsafeMake<number, never>(undefined as never);
    const neverTermProc: CommandExecutor.Process = {
      [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
      pid: CommandExecutor.ProcessId(9999),
      exitCode: Effect.map(Deferred.await(exitedDeferred), (c) => CommandExecutor.ExitCode(c)),
      isRunning: Effect.map(Deferred.isDone(exitedDeferred), (done) => !done),
      kill: (signal) => {
        if (signal === "SIGKILL") {
          return Effect.sync(() => {
            Deferred.unsafeDone(exitedDeferred, Effect.succeed(137));
          });
        }
        // SIGTERM: never resolves — simulates an unresponsive process
        return Effect.never;
      },
      stderr: Stream.empty,
      stdin: Sink.drain,
      stdout: Stream.empty,
      toJSON() {
        return { _tag: "MockProcess", pid: 9999 };
      },
      [Inspectable.NodeInspectSymbol]() {
        return { _tag: "MockProcess", pid: 9999 };
      },
    };
    const executor = CommandExecutor.makeExecutor(() => Effect.succeed(neverTermProc));
    const neverTermLayer = Layer.succeed(CommandExecutor.CommandExecutor, executor);

    await Effect.runPromise(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("fake-bin"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 2,
          healthPollMs: 25,
          gracefulShutdownSec: 1,
        }),
      ).pipe(
        Effect.provide(Layer.mergeAll(neverTermLayer, httpClientLayer)),
        Effect.provide(captureLogs(sink, LogLevel.Info)),
      ),
    );
    expect(sink.some((l) => l.includes("stopping (SIGTERM, 1s grace)"))).toBe(true);
    expect(sink.some((l) => l.includes("escalating to SIGKILL"))).toBe(true);
  });

  it("at debug level, logs proc.isRunning and exit-path elapsed", async () => {
    ts = await startHealthyServer();
    const sink: string[] = [];
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        superviseServer({
          runtime: "llamacpp",
          port: ts.port,
          command: Command.make("fake-bin"),
          healthUrl: `http://127.0.0.1:${ts.port}/health`,
          healthTimeoutSec: 2,
          healthPollMs: 25,
          gracefulShutdownSec: 1,
        }),
      ).pipe(
        Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer)),
        Effect.provide(captureLogs(sink, LogLevel.Debug)),
      ),
    );
    expect(sink.some((l) => l.includes("proc.isRunning=true before SIGTERM"))).toBe(true);
    expect(sink.some((l) => l.match(/exit \(SIGTERM→SIGKILL path\) completed in \d/))).toBe(true);
  });
});
