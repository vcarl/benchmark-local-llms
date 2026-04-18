/**
 * Shared lifecycle machinery for runtime-specific server supervisors.
 *
 * Both the llamacpp and MLX modules reduce to the same shape: build a
 * `Command`, `acquireRelease` a `Process` around it, wait for HTTP health,
 * fork an exit watcher, and on scope close escalate SIGTERM → SIGKILL.
 * Rather than duplicate that logic, `superviseServer` takes the
 * runtime-specific pieces (command factory, health URL, grace period) and
 * returns the assembled `ServerHandle`.
 *
 * Mirrors `runner.py`:
 *   - start_llamacpp_server / stop_llamacpp_server (terminate then kill at 10s)
 *   - start_mlx_server / stop_mlx_server (identical shape)
 */
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Clock, Deferred, Duration, Effect, Exit, Fiber, Stream } from "effect";
import { type HealthCheckTimeout, ServerSpawnError } from "../../errors/index.js";
import type { Runtime } from "../../schema/enums.js";
import { waitForHealthy } from "./health.js";
import { type ProcessHealthMonitor, watchProcess } from "./process-health.js";

/**
 * Forward a subprocess byte stream to the Effect logger at Info level,
 * one log line per line emitted by the process. `runtime` becomes the
 * log `scope` so users can see `llamacpp | starting server...`.
 *
 * `Stream.splitLines` handles chunk boundaries that land mid-line, so
 * we don't have to buffer manually. Empty lines are skipped so we don't
 * spam the logger with blank INF rows between paragraphs of server output.
 *
 * Stream errors are swallowed — a broken pipe should never fail the
 * supervisor or the in-flight request it's protecting.
 */
const forwardSubprocessStream = <E>(
  stream: Stream.Stream<Uint8Array, E>,
  runtime: Runtime,
): Effect.Effect<void> =>
  stream.pipe(
    Stream.decodeText("utf-8"),
    Stream.splitLines,
    Stream.runForEach((line) =>
      line.length === 0
        ? Effect.void
        : Effect.logInfo(line).pipe(Effect.annotateLogs("scope", runtime)),
    ),
    Effect.ignore,
  );

/**
 * Runtime-agnostic handle returned once a server is spawned + healthy.
 * Downstream modules (ChatCompletion client in C1, scenario loop in C3/C4)
 * read `port` to build the base URL and hold `monitor.exited` for
 * fast-failure racing on in-flight requests.
 */
export interface ServerHandle {
  readonly runtime: Runtime;
  readonly port: number;
  readonly pid: number;
  readonly monitor: ProcessHealthMonitor;
}

export interface SuperviseParams {
  readonly runtime: Runtime;
  readonly port: number;
  /** Fully-built command (binary + args). */
  readonly command: Command.Command;
  /** URL polled for liveness, typically `http://127.0.0.1:<port>/health`. */
  readonly healthUrl: string;
  /** Max seconds to wait for healthy. Default 300s (matches prototype). */
  readonly healthTimeoutSec?: number;
  /** Poll interval for health probes (ms). */
  readonly healthPollMs?: number;
  /**
   * Seconds to wait after SIGTERM before escalating to SIGKILL. Default 10s
   * (matches `runner.py:stop_llamacpp_server` / `stop_mlx_server`).
   */
  readonly gracefulShutdownSec?: number;
}

/**
 * Spawn a server subprocess, wait for it to become healthy, and fork a
 * background process-health monitor. The returned handle is scoped: when
 * the surrounding scope closes, we escalate termination.
 */
export const superviseServer = (
  params: SuperviseParams,
): Effect.Effect<
  ServerHandle,
  ServerSpawnError | HealthCheckTimeout,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const gracefulShutdownSec = params.gracefulShutdownSec ?? 10;

    // Spawn. A PlatformError becomes a typed ServerSpawnError.
    const proc = yield* Command.start(params.command).pipe(
      Effect.mapError(
        (err) =>
          new ServerSpawnError({
            runtime: params.runtime,
            reason: `failed to spawn: ${String(err)}`,
          }),
      ),
    );

    const spawnedMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`starting ${params.runtime} on :${params.port} (pid=${proc.pid})`).pipe(
      Effect.annotateLogs("scope", "llm-server"),
    );

    // Forward subprocess stderr + stdout to the Effect logger at Info so
    // users see model-load progress and boot errors by default. Fibers are
    // scoped so they die with the supervisor; they do NOT block health
    // checks or downstream work. Stream failures are swallowed inside the
    // helper — a broken log pipe never fails the server.
    yield* Effect.forkScoped(forwardSubprocessStream(proc.stderr, params.runtime));
    yield* Effect.forkScoped(forwardSubprocessStream(proc.stdout, params.runtime));

    // Install graceful-shutdown finalizer BEFORE health wait — if health
    // times out mid-boot, we still escalate cleanly. This finalizer runs
    // before Command.start's own finalizer (LIFO order), so by the time
    // the platform finalizer sees the process it's already dead.
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const running = yield* proc.isRunning.pipe(Effect.orElseSucceed(() => false));
        yield* Effect.logDebug(`proc.isRunning=${running} before SIGTERM`).pipe(
          Effect.annotateLogs("scope", "llm-server"),
        );
        if (!running) return;

        yield* Effect.logInfo(`stopping (SIGTERM, ${gracefulShutdownSec}s grace)`).pipe(
          Effect.annotateLogs("scope", "llm-server"),
        );
        const finalizerStartMs = yield* Clock.currentTimeMillis;

        // `proc.kill(sig)` in @effect/platform-node-shared sends the signal
        // AND awaits process exit in the same effect. If the process ignores
        // SIGTERM, the await blocks forever. Bound with a timeout so the
        // escalation path is actually reachable.
        //
        // Finalizers run in an uninterruptible region by default. `Effect.timeout`
        // cancels via interruption, so the inner kill effect must be made
        // interruptible here — otherwise the timeout fires but the await
        // keeps running, and the finalizer hangs indefinitely when a server
        // (e.g. llama-server with a full stderr pipe) doesn't respond to SIGTERM.
        const graceful = yield* Effect.timeout(
          proc.kill("SIGTERM").pipe(Effect.ignore),
          Duration.seconds(gracefulShutdownSec),
        ).pipe(
          Effect.map(() => true as const),
          Effect.catchTag("TimeoutException", () => Effect.succeed(false as const)),
          Effect.interruptible,
        );
        if (!graceful) {
          yield* Effect.logInfo("escalating to SIGKILL").pipe(
            Effect.annotateLogs("scope", "llm-server"),
          );
          // Same shape for SIGKILL: bound the whole thing (signal + wait) with
          // a short timeout so the overall finalizer can't stall indefinitely
          // on a truly unkillable process (defensive; SIGKILL should complete
          // within ms once the kernel delivers it).
          yield* Effect.timeout(
            proc.kill("SIGKILL").pipe(Effect.ignore),
            Duration.seconds(gracefulShutdownSec),
          ).pipe(Effect.ignore, Effect.interruptible);
        }

        const finalizerEndMs = yield* Clock.currentTimeMillis;
        const exitElapsed = ((finalizerEndMs - finalizerStartMs) / 1000).toFixed(1);
        yield* Effect.logDebug(
          `exit finalizer completed in ${exitElapsed}s (graceful=${graceful})`,
        ).pipe(Effect.annotateLogs("scope", "llm-server"));
      }),
    );

    const monitor = yield* watchProcess(proc, params.runtime);

    // Wait for health. If the process crashes mid-boot, we want to fail
    // fast with a ServerSpawnError instead of waiting out the whole
    // health-check budget — so race the health probe against the monitor.
    const healthProbe = waitForHealthy({
      url: params.healthUrl,
      timeoutSec: params.healthTimeoutSec ?? 300,
      ...(params.healthPollMs !== undefined ? { pollIntervalMs: params.healthPollMs } : {}),
    });

    const exitWatch = Deferred.await(monitor.exited);

    yield* Effect.raceWith(healthProbe, exitWatch, {
      onSelfDone: (exit, exitFiber) =>
        Effect.zipRight(
          Fiber.interrupt(exitFiber),
          Exit.match(exit, {
            onFailure: (cause) => Effect.failCause(cause),
            onSuccess: () => Effect.void,
          }),
        ),
      onOtherDone: (exit, healthFiber) =>
        // Server crashed during boot — interrupt the health poller and
        // surface the ServerSpawnError the monitor emitted.
        Effect.zipRight(
          Fiber.interrupt(healthFiber),
          Exit.match(exit, {
            onFailure: (cause) => Effect.failCause(cause),
            onSuccess: () =>
              Effect.fail(
                new ServerSpawnError({
                  runtime: params.runtime,
                  reason: "server exited during boot",
                }),
              ),
          }),
        ),
    });

    const healthyMs = yield* Clock.currentTimeMillis;
    const elapsedSec = ((healthyMs - spawnedMs) / 1000).toFixed(1);
    yield* Effect.logInfo(`healthy in ${elapsedSec}s`).pipe(
      Effect.annotateLogs("scope", "llm-server"),
    );

    return {
      runtime: params.runtime,
      port: params.port,
      pid: proc.pid as unknown as number,
      monitor,
    };
  });
