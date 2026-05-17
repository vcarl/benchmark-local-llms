/**
 * GameServer process supervisor (requirements §5.2).
 *
 * One per scenario, on an ephemeral port. Mirrors `game_lifecycle.py`:
 *   - allocate_port (bind-to-0, close, return) — same TOCTOU race, same
 *     fix (sequential execution).
 *   - spawn the binary with PORT, ADMIN_API_TOKEN, TICK_RATE=10,
 *     BENCHMARK_MODE=1, DATA_DIR=<binary-parent>/data
 *   - wait for /health (30s budget)
 *   - SIGTERM → wait grace period → SIGKILL on close
 *
 * Reuses the C2 supervisor for the spawn/health/exit-watch plumbing.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Effect } from "effect";
import type { HealthCheckTimeout, ServerSpawnError } from "../../errors/index.js";
import { type ServerHandle, superviseServer } from "../../llm/servers/supervisor.js";

export interface GameServerConfig {
  /** Absolute path to the gameserver binary. */
  readonly binaryPath: string;
  /**
   * Bound port to use. If omitted, a fresh ephemeral port is allocated via
   * the {@link allocateEphemeralPort} helper. Tests should pass an explicit
   * port (typically the port of a fake healthy HTTP server).
   */
  readonly port?: number;
  /** Hex token shared with the test harness via the admin API. */
  readonly adminToken: string;
  /** Tick rate to inject as TICK_RATE env. Default 10 (matches prototype). */
  readonly tickRate?: number;
  /** Health-check budget. Default 30s. */
  readonly healthTimeoutSec?: number;
  /**
   * Override for `DATA_DIR`. Defaults to `dirname(binaryPath) + "/data"`
   * (matches `game_lifecycle.py:55`).
   */
  readonly dataDir?: string;
}

export interface GameServerHandle extends ServerHandle {
  readonly baseUrl: string;
  readonly adminToken: string;
}

/**
 * Bind to port 0, read the assigned port, close the socket, return the
 * port. Mirrors `game_lifecycle.py::allocate_port` — inherently racy, but
 * fine for sequential per-scenario execution.
 */
export const allocateEphemeralPort = Effect.async<number, never>((resume) => {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address() as AddressInfo;
    server.close(() => resume(Effect.succeed(addr.port)));
  });
});

/**
 * Acquire a running gameserver within the current scope. The port is taken
 * from `cfg.port` if set, otherwise allocated fresh.
 */
export const gameServer = (
  cfg: GameServerConfig,
): Effect.Effect<
  GameServerHandle,
  ServerSpawnError | HealthCheckTimeout,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const port = cfg.port ?? (yield* allocateEphemeralPort);
    const baseUrl = `http://127.0.0.1:${port}`;
    const dataDir = cfg.dataDir ?? `${dirname(cfg.binaryPath)}/data`;

    const env: Record<string, string> = {
      PORT: String(port),
      ADMIN_API_TOKEN: cfg.adminToken,
      TICK_RATE: String(cfg.tickRate ?? 10),
      BENCHMARK_MODE: "1",
      DATA_DIR: dataDir,
    };

    const command = Command.make(cfg.binaryPath).pipe(Command.env(env));

    const handle = yield* superviseServer({
      runtime: "llamacpp",
      port,
      command,
      healthUrl: `${baseUrl}/health`,
      healthTimeoutSec: cfg.healthTimeoutSec ?? 30,
    });

    yield* Effect.logInfo(`started on :${port}`).pipe(Effect.annotateLogs("scope", "gameserver"));

    return { ...handle, baseUrl, adminToken: cfg.adminToken };
  });
