/**
 * Test-only mock `CommandExecutor` + mock HTTP layer. Lives in the source
 * tree (not __tests__) because vitest's co-located test files need to
 * import it relatively. Consumers should only reach for this from
 * `*.test.ts` files.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type Command, CommandExecutor, FetchHttpClient, type HttpClient } from "@effect/platform";
import { Deferred, Effect, Inspectable, Layer, Sink, Stream } from "effect";

export interface MockProcessSpec {
  /**
   * Desired behaviour after spawn:
   *  - `"alive"` — stays alive forever unless killed.
   *  - `{ exitAfterMs, code }` — schedules an unexpected exit.
   */
  readonly behaviour: "alive" | { readonly exitAfterMs: number; readonly code: number };
  /** Simulated PID returned by the handle. */
  readonly pid?: number;
}

export interface MockCommandLog {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly signalsReceived: ReadonlyArray<string>;
  /** Resolves once the caller has observed the process exit. */
  readonly exited: Deferred.Deferred<number, never>;
}

export interface MockRun {
  readonly log: MockCommandLog;
  /** Force the process to exit immediately with the given code. */
  readonly forceExit: (code: number) => Effect.Effect<void>;
}

const buildMockProcess = (
  cmdString: string,
  args: ReadonlyArray<string>,
  spec: MockProcessSpec,
  runs: Array<MockRun>,
): Effect.Effect<CommandExecutor.Process, never, import("effect/Scope").Scope> =>
  Effect.gen(function* () {
    const exited = yield* Deferred.make<number, never>();
    const signalsReceived: string[] = [];
    const log: MockCommandLog = {
      command: cmdString,
      args,
      get signalsReceived() {
        return signalsReceived;
      },
      exited,
    };

    const forceExit = (code: number) =>
      Effect.gen(function* () {
        yield* Deferred.succeed(exited, code);
      }).pipe(Effect.ignore);

    runs.push({ log, forceExit });

    // Scheduled exit (if configured).
    if (typeof spec.behaviour === "object") {
      const { exitAfterMs, code } = spec.behaviour;
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          yield* Effect.sleep(exitAfterMs);
          yield* Deferred.succeed(exited, code);
        }),
      );
    }

    const proc: CommandExecutor.Process = {
      [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
      pid: CommandExecutor.ProcessId(spec.pid ?? 4242),
      exitCode: Effect.map(Deferred.await(exited), (c) => CommandExecutor.ExitCode(c)),
      isRunning: Effect.map(Deferred.isDone(exited), (done) => !done),
      kill: (signal) =>
        Effect.sync(() => {
          signalsReceived.push(signal ?? "SIGTERM");
          // SIGKILL is always fatal immediately. SIGTERM resolves the
          // deferred after a tick so real-world ordering is plausible.
          if (signal === "SIGKILL") {
            Deferred.unsafeDone(exited, Effect.succeed(137));
          } else {
            Deferred.unsafeDone(exited, Effect.succeed(143));
          }
        }),
      stderr: Stream.empty,
      stdin: Sink.drain,
      stdout: Stream.empty,
      toJSON() {
        return { _tag: "MockProcess", pid: spec.pid ?? 4242 };
      },
      [Inspectable.NodeInspectSymbol]() {
        return { _tag: "MockProcess", pid: spec.pid ?? 4242 };
      },
    };
    return proc;
  });

const extractCommandPieces = (
  cmd: Command.Command,
): { bin: string; args: ReadonlyArray<string> } => {
  // `Command.make` builds a StandardCommand with `{ command, args }`
  // readable shape. Use `any` narrowly to read it; the platform exports
  // type guards but no shape accessor.
  const c = cmd as unknown as { command: string; args: ReadonlyArray<string> };
  return { bin: c.command, args: c.args ?? [] };
};

export interface MockExecutorHandle {
  readonly layer: Layer.Layer<CommandExecutor.CommandExecutor>;
  readonly runs: Array<MockRun>;
}

/**
 * Build a mock `CommandExecutor` layer. `spec` controls how every spawn
 * behaves; pass `"alive"` for a well-behaved daemon or an object to
 * schedule an exit. Spawned processes are pushed to `runs` in order.
 */
export const makeMockExecutor = (spec: MockProcessSpec): MockExecutorHandle => {
  const runs: Array<MockRun> = [];
  const executor = CommandExecutor.makeExecutor((cmd) =>
    Effect.gen(function* () {
      const { bin, args } = extractCommandPieces(cmd);
      return yield* buildMockProcess(bin, args, spec, runs);
    }),
  );
  return {
    layer: Layer.succeed(CommandExecutor.CommandExecutor, executor),
    runs,
  };
};

export interface UnresponsiveMockExecutorHandle {
  readonly layer: Layer.Layer<CommandExecutor.CommandExecutor>;
  readonly pid: number;
}

/**
 * Like `makeMockExecutor({ behaviour: "alive" })` but `kill("SIGTERM")`
 * returns `Effect.never` — the process ignores SIGTERM forever. Useful for
 * testing supervisor escalation paths (SIGTERM grace-period timeout →
 * SIGKILL).
 *
 * `kill("SIGKILL")` resolves normally and marks the process exited.
 */
export const makeUnresponsiveMockExecutor = (pid = 9999): UnresponsiveMockExecutorHandle => {
  const executor = CommandExecutor.makeExecutor(() =>
    Effect.gen(function* () {
      const exited = yield* Deferred.make<number, never>();
      const proc: CommandExecutor.Process = {
        [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
        pid: CommandExecutor.ProcessId(pid),
        exitCode: Effect.map(Deferred.await(exited), (c) => CommandExecutor.ExitCode(c)),
        isRunning: Effect.map(Deferred.isDone(exited), (done) => !done),
        kill: (signal) => {
          if (signal === "SIGKILL") {
            return Effect.sync(() => {
              Deferred.unsafeDone(exited, Effect.succeed(137));
            });
          }
          // SIGTERM: never resolves — simulates an unresponsive process
          return Effect.never;
        },
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout: Stream.empty,
        toJSON() {
          return { _tag: "MockProcess", pid };
        },
        [Inspectable.NodeInspectSymbol]() {
          return { _tag: "MockProcess", pid };
        },
      };
      return proc;
    }),
  );
  return {
    layer: Layer.succeed(CommandExecutor.CommandExecutor, executor),
    pid,
  };
};

/**
 * Build a mock `CommandExecutor` layer whose `start` always fails — used
 * to exercise the `ServerSpawnError` path without needing a missing
 * binary on disk.
 */
export const makeFailingExecutor = (
  reason: string,
): Layer.Layer<CommandExecutor.CommandExecutor> => {
  const executor = CommandExecutor.makeExecutor(() =>
    Effect.fail(
      // Keep this untyped — only the string reason is inspected by the
      // supervisor's mapError.
      { _tag: "SystemError", message: reason } as unknown as never,
    ),
  );
  return Layer.succeed(CommandExecutor.CommandExecutor, executor);
};

// ── HTTP test-server helpers ───────────────────────────────────────────

export interface TestHttpServer {
  readonly port: number;
  readonly close: () => Promise<void>;
  readonly hits: () => number;
}

export const startHealthyServer = (): Promise<TestHttpServer> =>
  new Promise((resolve) => {
    let hits = 0;
    const server: Server = createServer((_req, res) => {
      hits += 1;
      res.statusCode = 200;
      res.end("ok");
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
        hits: () => hits,
      });
    });
  });

export const startUnhealthyServer = (): Promise<TestHttpServer> =>
  new Promise((resolve) => {
    let hits = 0;
    const server: Server = createServer((_req, res) => {
      hits += 1;
      res.statusCode = 503;
      res.end("not yet");
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
        hits: () => hits,
      });
    });
  });

export const httpClientLayer: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer;
