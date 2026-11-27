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
import { Command, type CommandExecutor, HttpClient, HttpClientRequest } from "@effect/platform";
import { Clock, Deferred, Duration, Effect, Exit, Fiber, Stream } from "effect";
import { deregisterSubprocess, registerSubprocess } from "../../cli/subprocess-registry.js";
import {
  type HealthCheckTimeout,
  ModelLoadError,
  ServerSpawnError,
  type TemplateVerificationError,
} from "../../errors/index.js";
import type { Runtime } from "../../schema/enums.js";
import { waitForHealthy } from "./health.js";
import { trackPeakRss } from "./peak-rss.js";
import { type ProcessHealthMonitor, watchProcess } from "./process-health.js";
import { type VerifyTemplateArgs, verifyTemplate } from "./template-verification.js";

const PEAK_RSS_POLL_MS = 30_000;

/** Server output lines kept for {@link ModelLoadError} `logTail`. */
const LOG_TAIL_LINES = 40;

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
  onLine: (line: string) => Effect.Effect<void>,
): Effect.Effect<void> =>
  stream.pipe(
    Stream.decodeText("utf-8"),
    Stream.splitLines,
    Stream.runForEach((line) =>
      line.length === 0
        ? Effect.void
        : Effect.zipRight(
            onLine(line),
            Effect.logInfo(line).pipe(Effect.annotateLogs("scope", runtime)),
          ),
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
  /**
   * Current peak RSS observed for the subprocess, in KB. Backed by a
   * scoped poller that samples every 30s. Returns 0 until the first
   * successful sample — treat 0 as "unknown" rather than "zero bytes".
   */
  readonly peakRssKb: Effect.Effect<number>;
  /**
   * Fold one immediate RSS reading into the same peak. The supervisor already
   * fires this once when the server reports healthy, which is the moment the
   * weights are resident for llamacpp and mlx. A runtime that loads lazily
   * (omlx) must call it again once the model is actually in memory, or a run
   * shorter than the 30s poll interval records only the pre-load footprint.
   */
  readonly sampleNow: Effect.Effect<void, never, CommandExecutor.CommandExecutor>;
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
  /**
   * When set, run a chat-template verification gate after the server is
   * healthy and BEFORE the handle is returned. A verification fault aborts
   * boot with `TemplateVerificationError`. Model-server callers (llamacpp,
   * mlx) populate this; the game/admiral HTTP servers that reuse this
   * supervisor omit it (they expose no template endpoints), so they are
   * never subject to the gate.
   */
  readonly verifyTemplate?: VerifyTemplateArgs;
  /**
   * When set, prove the model loaded and generates before the handle is
   * returned: after health and template verification, POST a `max_tokens: 1`
   * chat completion naming `model`. A non-2xx answer, no answer within
   * `timeoutSec`, or a server output line matching `fatalOutput` fails boot
   * with `ModelLoadError`. Health alone cannot prove this: `mlx_lm.server`
   * and oMLX answer `/v1/models` before (or regardless of) the weight load.
   */
  readonly warmup?: {
    readonly model: string;
    readonly timeoutSec: number;
    /** A server output line that proves the load failed; fails boot at once. */
    readonly fatalOutput?: RegExp;
  };
}

/** POST a one-token completion; any failure or timeout is a `ModelLoadError`. */
const warmupRequest = (
  runtime: Runtime,
  port: number,
  warmup: NonNullable<SuperviseParams["warmup"]>,
): Effect.Effect<void, ModelLoadError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const fail = (reason: string) => new ModelLoadError({ runtime, reason });
    const request = yield* HttpClientRequest.post(
      `http://127.0.0.1:${port}/v1/chat/completions`,
    ).pipe(
      HttpClientRequest.bodyJson({
        model: warmup.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      Effect.mapError((err) => fail(`could not encode the warmup request: ${String(err)}`)),
    );
    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError((err) => fail(`warmup request failed: ${String(err)}`)));
    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
      return yield* fail(
        `warmup completion returned HTTP ${response.status}: ${body.slice(0, 500)}`,
      );
    }
  }).pipe(
    Effect.scoped,
    Effect.timeoutFail({
      duration: Duration.seconds(warmup.timeoutSec),
      onTimeout: () =>
        new ModelLoadError({
          runtime,
          reason: `warmup completion did not answer within ${warmup.timeoutSec}s; the model never finished loading`,
        }),
    }),
  );

/**
 * Spawn a server subprocess, wait for it to become healthy, and fork a
 * background process-health monitor. The returned handle is scoped: when
 * the surrounding scope closes, we escalate termination.
 */
export const superviseServer = (
  params: SuperviseParams,
): Effect.Effect<
  ServerHandle,
  ServerSpawnError | HealthCheckTimeout | TemplateVerificationError | ModelLoadError,
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

    const pid = proc.pid as unknown as number;
    // Register with the process-level safety net before we do anything else
    // that could fail. If the parent dies ungracefully (SIGHUP, crash,
    // closed pipe), Effect finalizers won't run, but the safety net handler
    // will still fire and tear the child down.
    yield* Effect.sync(() => registerSubprocess(pid));

    const spawnedMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`starting ${params.runtime} on :${params.port} (pid=${proc.pid})`).pipe(
      Effect.annotateLogs("scope", "llm-server"),
    );

    // Forward subprocess stderr + stdout to the Effect logger at Info so
    // users see model-load progress and boot errors by default. Fibers are
    // scoped so they die with the supervisor; they do NOT block health
    // checks or downstream work. Stream failures are swallowed inside the
    // helper — a broken log pipe never fails the server.
    // Every line also lands in a bounded tail (attached to a ModelLoadError)
    // and is checked against the warmup's fatal pattern.
    const logTail: string[] = [];
    const fatal = yield* Deferred.make<never, ModelLoadError>();
    const fatalOutput = params.warmup?.fatalOutput;
    const onLine = (line: string): Effect.Effect<void> =>
      Effect.suspend(() => {
        logTail.push(line);
        if (logTail.length > LOG_TAIL_LINES) logTail.shift();
        return fatalOutput?.test(line) === true
          ? Deferred.fail(
              fatal,
              new ModelLoadError({
                runtime: params.runtime,
                reason: `server reported a fatal error while loading the model: ${line}`,
              }),
            ).pipe(Effect.asVoid)
          : Effect.void;
      });
    yield* Effect.forkScoped(forwardSubprocessStream(proc.stderr, params.runtime, onLine));
    yield* Effect.forkScoped(forwardSubprocessStream(proc.stdout, params.runtime, onLine));

    // Must be set up before the shutdown finalizer so the finalizer can
    // read the peak for its log line. The poll fiber itself is scoped and
    // will be interrupted on scope close; the backing Ref survives, so
    // reading peak from inside or after the finalizer is safe.
    const { peakRssKb, sampleNow } = yield* trackPeakRss(pid, PEAK_RSS_POLL_MS);

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

        const peakKb = yield* peakRssKb;
        if (peakKb > 0) {
          const peakMib = (peakKb / 1024).toFixed(0);
          yield* Effect.logInfo(`peak RSS ${peakMib} MiB (${peakKb} KB)`).pipe(
            Effect.annotateLogs("scope", "llm-server"),
          );
        }

        // Graceful path succeeded: the safety net no longer needs to track
        // this pid. On interrupted/aborted finalizer runs we leave the pid
        // registered — the safety net will clean up instead.
        yield* Effect.sync(() => deregisterSubprocess(pid));
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

    // Capture an immediate RSS sample now that the model and KV cache are
    // loaded. The periodic poller sleeps BEFORE its first tick, so without
    // this call a benchmark run shorter than 30s would leave peakRssKb = 0.
    yield* sampleNow;

    // Template-verification gate. Runs only when the caller supplied a
    // descriptor (model servers do; the game/admiral HTTP servers do not). A
    // fault here aborts boot through the same typed channel as a spawn
    // failure, so a silent template fault becomes a loud abort instead of a
    // corrupted score. The surrounding scope is still open, so the
    // graceful-shutdown finalizer tears the subprocess down on failure.
    if (params.verifyTemplate !== undefined) {
      yield* verifyTemplate(params.verifyTemplate);
    }

    // Load gate. Whichever settles first wins: the one-token completion, a
    // fatal output line, or the process dying. The traceback that explains a
    // fatal line follows it, so the tail is read after a short settle.
    if (params.warmup !== undefined) {
      yield* Effect.logInfo(`warming ${params.warmup.model} (1-token load check)`).pipe(
        Effect.annotateLogs("scope", "llm-server"),
      );
      yield* warmupRequest(params.runtime, params.port, params.warmup).pipe(
        Effect.raceFirst(Deferred.await(fatal)),
        Effect.raceFirst(Deferred.await(monitor.exited)),
        Effect.catchTag("ModelLoadError", (e) =>
          Effect.sleep(Duration.millis(500)).pipe(
            Effect.zipRight(
              Effect.fail(
                new ModelLoadError({
                  runtime: e.runtime,
                  reason: e.reason,
                  logTail: logTail.join("\n"),
                }),
              ),
            ),
          ),
        ),
      );
      // Weights are resident now, including on runtimes that load lazily.
      yield* sampleNow;
      yield* Effect.logInfo("warmed").pipe(Effect.annotateLogs("scope", "llm-server"));
    }

    return {
      runtime: params.runtime,
      port: params.port,
      pid: proc.pid as unknown as number,
      monitor,
      peakRssKb,
      sampleNow,
    };
  });
