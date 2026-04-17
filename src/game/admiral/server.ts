/**
 * Admiral server supervisor (requirements §5.2).
 *
 * Spawns Admiral with `bun run src/server/index.ts` (mirrors
 * `admiral_runner.py::start_admiral_server`, lines 41-79) on a configurable
 * port (default 3031), waits for `GET /api/health`, and tears down with
 * SIGTERM → SIGKILL on scope close. Reuses C2's `superviseServer` machinery
 * so we get the same exit-watcher + race-against-boot behaviour.
 *
 * Note: C2's `ServerHandle` declares `runtime: Runtime` (`"llamacpp" | "mlx"`)
 * — Admiral isn't a runtime. We could parallel-track Admiral's own handle
 * type but for now we tag it as `"llamacpp"` (it's effectively a daemon for
 * driving an already-running runtime), keeping the unmodified C2 supervisor
 * usable. A follow-up patch can broaden the `Runtime` enum if Admiral wants
 * its own tag.
 */
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Clock, Effect } from "effect";
import type { HealthCheckTimeout, ServerSpawnError } from "../../errors/index.js";
import { type ServerHandle, superviseServer } from "../../llm/servers/supervisor.js";

export const ADMIRAL_DEFAULT_PORT = 3031;

export interface AdmiralServerConfig {
  /** Working directory containing Admiral's `src/server/index.ts`. */
  readonly admiralDir: string;
  /** Port to bind. Defaults to 3031 (matches prototype). */
  readonly port?: number;
  /** Path to the bun binary. Defaults to `bun` on PATH. */
  readonly binPath?: string;
  /** Seconds to wait for /api/health to respond 200. Default 30. */
  readonly healthTimeoutSec?: number;
  /** Optional extra env vars merged onto the bun process. */
  readonly extraEnv?: Readonly<Record<string, string>>;
}

export interface AdmiralServerHandle extends ServerHandle {
  /** Convenience: base URL for the API client. */
  readonly baseUrl: string;
}

/**
 * Acquire a running Admiral server within the current scope.
 *
 * Health check: `GET <baseUrl>/api/health`, default 30s budget per
 * `_wait_for_health(port, timeout=30)` (line 98).
 */
export const admiralServer = (
  cfg: AdmiralServerConfig,
): Effect.Effect<
  AdmiralServerHandle,
  ServerSpawnError | HealthCheckTimeout,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const port = cfg.port ?? ADMIRAL_DEFAULT_PORT;
    const bin = cfg.binPath ?? "bun";
    const baseUrl = `http://127.0.0.1:${port}`;

    const env: Record<string, string> = {
      ...(cfg.extraEnv ?? {}),
      PORT: String(port),
    };

    const command = Command.make(bin, "run", "src/server/index.ts").pipe(
      Command.workingDirectory(cfg.admiralDir),
      Command.env(env),
    );

    const startMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`starting on :${port}`).pipe(Effect.annotateLogs("scope", "admiral"));

    const handle = yield* superviseServer({
      runtime: "llamacpp",
      port,
      command,
      healthUrl: `${baseUrl}/api/health`,
      healthTimeoutSec: cfg.healthTimeoutSec ?? 30,
    });

    const endMs = yield* Clock.currentTimeMillis;
    yield* Effect.logInfo(`healthy in ${((endMs - startMs) / 1000).toFixed(1)}s`).pipe(
      Effect.annotateLogs("scope", "admiral"),
    );

    yield* Effect.addFinalizer(() =>
      Effect.logInfo("stopping").pipe(Effect.annotateLogs("scope", "admiral")),
    );

    return { ...handle, baseUrl };
  });
