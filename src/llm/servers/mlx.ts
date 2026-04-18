/**
 * MLX server supervisor. Spawns `python -m mlx_lm.server`, waits for
 * /health, forks the exit watcher, and terminates on scope close.
 *
 * Invocation mirrors `runner.py::start_mlx_server` (lines 589-598):
 *   python -m mlx_lm.server
 *     --model <artifact>
 *     --host 127.0.0.1
 *     --port <port>
 *
 * Per requirements §1.2 / §9.1 the Python stdin/stdout subprocess protocol
 * is eliminated — MLX is always the HTTP server path. This module is the
 * one and only MLX supervisor.
 */
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Effect } from "effect";
import type { HealthCheckTimeout, ServerSpawnError } from "../../errors/index.js";
import { type ServerHandle, superviseServer } from "./supervisor.js";

export const MLX_DEFAULT_PORT = 18081;

export interface MlxConfig {
  /**
   * HuggingFace model id passed as `--model`. Note: unlike llama.cpp this is
   * an ID/path consumed by `mlx_lm.load`, not a local artifact file.
   */
  readonly artifactPath: string;
  /** TCP port to bind. Defaults to 18081 (matches prototype). */
  readonly port?: number;
  /** Path to the `python3` binary. Defaults to `python3` on PATH. */
  readonly pythonBin?: string;
  /** Seconds to allow for /health to respond 200. Default 600 (MLX loads slow). */
  readonly healthTimeoutSec?: number;
  /** Extra CLI args appended after the built-in flags. */
  readonly extraArgs?: ReadonlyArray<string>;
}

const buildArgs = (cfg: MlxConfig, port: number): ReadonlyArray<string> => {
  const base: string[] = [
    "-m",
    "mlx_lm.server",
    "--model",
    cfg.artifactPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];
  if (cfg.extraArgs) {
    base.push(...cfg.extraArgs);
  }
  return base;
};

/**
 * Acquire a running `mlx_lm.server` within the current scope.
 */
export const mlxServer = (
  cfg: MlxConfig,
): Effect.Effect<
  ServerHandle,
  ServerSpawnError | HealthCheckTimeout,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const port = cfg.port ?? MLX_DEFAULT_PORT;
    const bin = cfg.pythonBin ?? "python3";
    const command = Command.make(bin, ...buildArgs(cfg, port));
    return yield* superviseServer({
      runtime: "mlx",
      port,
      command,
      // `mlx_lm.server` does not serve /health; use the OpenAI-compat route
      // that both llamacpp and mlx implement.
      healthUrl: `http://127.0.0.1:${port}/v1/models`,
      // MLX loads large safetensor files from disk; the prototype uses a
      // 600s budget here (runner.py:600), so match that.
      healthTimeoutSec: cfg.healthTimeoutSec ?? 600,
    });
  });
