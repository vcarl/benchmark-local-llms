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
  /**
   * Canned stderr lines the process "emits" once stderr is consumed. Each
   * string becomes one byte chunk; `\n` is appended if missing so the
   * supervisor's `splitLines` pipeline yields the line cleanly. Defaults
   * to an empty stream for backward compatibility.
   */
  readonly stderrLines?: ReadonlyArray<string>;
  /** Same shape as `stderrLines`, for stdout. */
  readonly stdoutLines?: ReadonlyArray<string>;
}

export interface MockCommandLog {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** Environment overrides applied via `Command.env`, as a plain record. */
  readonly env: Readonly<Record<string, string>>;
  readonly signalsReceived: ReadonlyArray<string>;
  /** Resolves once the caller has observed the process exit. */
  readonly exited: Deferred.Deferred<number, never>;
}

export interface MockRun {
  readonly log: MockCommandLog;
  /** Force the process to exit immediately with the given code. */
  readonly forceExit: (code: number) => Effect.Effect<void>;
}

const textEncoder = new TextEncoder();

/**
 * Build a byte stream from an array of text lines. Each line is emitted as
 * one Uint8Array chunk with a trailing `\n` (added only if the line doesn't
 * already end in a newline). Used to simulate `stderr`/`stdout` output from
 * a subprocess so the supervisor's line-forwarding pipeline has real bytes
 * to decode.
 */
const cannedByteStream = (lines: ReadonlyArray<string> | undefined): Stream.Stream<Uint8Array> => {
  if (lines === undefined || lines.length === 0) return Stream.empty;
  const chunks = lines.map((l) => textEncoder.encode(l.endsWith("\n") ? l : `${l}\n`));
  return Stream.fromIterable(chunks);
};

const buildMockProcess = (
  cmdString: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>>,
  spec: MockProcessSpec,
  runs: Array<MockRun>,
): Effect.Effect<CommandExecutor.Process, never, import("effect/Scope").Scope> =>
  Effect.gen(function* () {
    const exited = yield* Deferred.make<number, never>();
    const signalsReceived: string[] = [];
    const log: MockCommandLog = {
      command: cmdString,
      args,
      env,
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
      stderr: cannedByteStream(spec.stderrLines),
      stdin: Sink.drain,
      stdout: cannedByteStream(spec.stdoutLines),
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
): { bin: string; args: ReadonlyArray<string>; env: Readonly<Record<string, string>> } => {
  // `Command.make` builds a StandardCommand with `{ command, args, env }`
  // readable shape; `env` is an entry-iterable HashMap, which is exactly how
  // the real node executor reads it. Use `any` narrowly to read it; the
  // platform exports type guards but no shape accessor.
  const c = cmd as unknown as {
    command: string;
    args: ReadonlyArray<string>;
    env?: Iterable<readonly [string, string]>;
  };
  return {
    bin: c.command,
    args: c.args ?? [],
    env: c.env === undefined ? {} : Object.fromEntries(c.env),
  };
};

export interface MockExecutorHandle {
  readonly layer: Layer.Layer<CommandExecutor.CommandExecutor>;
  readonly runs: Array<MockRun>;
}

/**
 * Build a mock `CommandExecutor` layer. `spec` controls how every spawn
 * behaves; pass `"alive"` for a well-behaved daemon or an object to
 * schedule an exit. Spawned processes are pushed to `runs` in order.
 *
 * `ps` commands (used by the RSS poller) are NOT pushed to `runs` and
 * return an immediately-exited process with empty stdout, causing
 * `sampleRssKb` to skip the sample via its `catchAll` handler.
 */
export const makeMockExecutor = (spec: MockProcessSpec): MockExecutorHandle => {
  const runs: Array<MockRun> = [];
  const executor = CommandExecutor.makeExecutor((cmd) =>
    Effect.gen(function* () {
      const { bin, args, env } = extractCommandPieces(cmd);
      if (bin === "ps") {
        // RSS poller: return a minimal process with empty stdout so
        // sampleRssKb gets a null sample (skip this tick). Not tracked in runs.
        const exited = yield* Deferred.make<number, never>();
        yield* Deferred.succeed(exited, 1);
        const psProc: CommandExecutor.Process = {
          [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
          pid: CommandExecutor.ProcessId(0),
          exitCode: Effect.map(Deferred.await(exited), (c) => CommandExecutor.ExitCode(c)),
          isRunning: Effect.succeed(false),
          kill: (_signal) => Effect.void,
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          toJSON() {
            return { _tag: "MockPsProcess" };
          },
          [Inspectable.NodeInspectSymbol]() {
            return { _tag: "MockPsProcess" };
          },
        };
        return psProc;
      }
      return yield* buildMockProcess(bin, args, env, spec, runs);
    }),
  );
  return {
    layer: Layer.succeed(CommandExecutor.CommandExecutor, executor),
    runs,
  };
};

/**
 * Like `makeMockExecutor` but intercepts `ps` commands and returns a process
 * whose stdout contains `rssKb` (as a decimal string). All other commands
 * are handled by `buildMockProcess` as usual.
 *
 * Used for testing `peakRssKb` — the RSS poller calls `Command.string` on a
 * `ps -o rss= -p <pid>` invocation, which reads from `process.stdout`.
 */
export const makeMockExecutorWithRss = (
  spec: MockProcessSpec,
  rssKb: number,
): MockExecutorHandle => {
  const runs: Array<MockRun> = [];
  const encoder = new TextEncoder();
  const executor = CommandExecutor.makeExecutor((cmd) =>
    Effect.gen(function* () {
      const { bin, args, env } = extractCommandPieces(cmd);
      if (bin === "ps") {
        // Return a minimal process whose stdout yields the RSS value.
        const rssBytes = encoder.encode(`${rssKb}\n`);
        const exited = yield* Deferred.make<number, never>();
        yield* Deferred.succeed(exited, 0);
        const psProc: CommandExecutor.Process = {
          [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
          pid: CommandExecutor.ProcessId(0),
          exitCode: Effect.map(Deferred.await(exited), (c) => CommandExecutor.ExitCode(c)),
          isRunning: Effect.succeed(false),
          kill: (_signal) => Effect.void,
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(rssBytes),
          toJSON() {
            return { _tag: "MockPsProcess" };
          },
          [Inspectable.NodeInspectSymbol]() {
            return { _tag: "MockPsProcess" };
          },
        };
        return psProc;
      }
      return yield* buildMockProcess(bin, args, env, spec, runs);
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

/**
 * Like `startHealthyServer` but also answers the chat-template verification
 * routes a healthy llama-server exposes: `GET /props` (returns a non-empty
 * `chat_template`) and `POST /apply-template` (echoes a clean prompt that
 * threads the probe sentinel through with no unrendered Jinja). Any other path
 * (notably the `/v1/models` health probe) returns 200 "ok" as before.
 *
 * Used by llamacpp tests so the supervisor's template gate passes against a
 * realistic happy-path server.
 */
export const startHealthyTemplateServer = (): Promise<TestHttpServer> =>
  new Promise((resolve) => {
    let hits = 0;
    const server: Server = createServer((req, res) => {
      hits += 1;
      const json = (body: unknown) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      };
      if (req.method === "GET" && req.url === "/props") {
        json({ chat_template: "<|im_start|>{{ messages }}<|im_end|>" });
        return;
      }
      if (req.method === "POST" && req.url === "/apply-template") {
        req.on("data", () => {});
        req.on("end", () =>
          json({
            prompt:
              "<|im_start|>system\nYou are a helpful assistant.\n<|im_start|>user\nPROBE_TEMPLATE_CHECK_XYZZY<|im_end|>",
          }),
        );
        return;
      }
      if (req.method === "POST" && req.url === "/tokenize") {
        req.on("data", () => {});
        // Distinct leading token ids → no double-BOS warning.
        req.on("end", () => json({ tokens: [1, 2, 3] }));
        return;
      }
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
