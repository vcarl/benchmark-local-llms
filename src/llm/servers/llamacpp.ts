/**
 * llama.cpp server supervisor. Spawns `llama-server`, waits for /health,
 * forks the exit watcher, and terminates on scope close.
 *
 * Invocation mirrors `runner.py::start_llamacpp_server` (lines 335-350):
 *   llama-server
 *     -m <artifact>
 *     --host 127.0.0.1
 *     --port <port>
 *     --verbose
 *     --cache-type-k q8_0
 *     --cache-type-v q8_0
 *     --reasoning-format none
 *     [-c <ctxSize>]
 *
 * The prototype's log tee to /tmp/testbench-llamacpp.log is intentionally
 * dropped — Effect's logger captures the interesting lifecycle events, and
 * the subprocess stdout/stderr streams are available on the handle for
 * callers that want them. Adding a file log is a trivial follow-up if the
 * CLI layer wants it.
 */
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Effect } from "effect";
import type { HealthCheckTimeout, ServerSpawnError } from "../../errors/index.js";
import { type ServerHandle, superviseServer } from "./supervisor.js";

export const LLAMACPP_DEFAULT_PORT = 18080;

export interface LlamacppConfig {
  /** Absolute path to the .gguf file resolved by the model-config layer. */
  readonly artifactPath: string;
  /** TCP port to bind. Defaults to 18080 (matches prototype). */
  readonly port?: number;
  /** Optional context window override. */
  readonly ctxSize?: number;
  /** Path to the `llama-server` binary. Defaults to `llama-server` on PATH. */
  readonly binPath?: string;
  /** Seconds to allow for /health to respond 200. Default 300. */
  readonly healthTimeoutSec?: number;
  /** Extra CLI args appended after the built-in flags. */
  readonly extraArgs?: ReadonlyArray<string>;
}

const buildArgs = (cfg: LlamacppConfig, port: number): ReadonlyArray<string> => {
  const base: string[] = [
    "-m",
    cfg.artifactPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--verbose",
    "--cache-type-k",
    "q8_0",
    "--cache-type-v",
    "q8_0",
    "--reasoning-format",
    "none",
  ];
  if (cfg.ctxSize !== undefined) {
    base.push("-c", String(cfg.ctxSize));
  }
  if (cfg.extraArgs) {
    base.push(...cfg.extraArgs);
  }
  return base;
};

/**
 * Acquire a running `llama-server` within the current scope. Resolves when
 * /health responds 200; fails fast if the process exits during boot.
 */
export const llamacppServer = (
  cfg: LlamacppConfig,
): Effect.Effect<
  ServerHandle,
  ServerSpawnError | HealthCheckTimeout,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const port = cfg.port ?? LLAMACPP_DEFAULT_PORT;
    const bin = cfg.binPath ?? "llama-server";
    const command = Command.make(bin, ...buildArgs(cfg, port));
    return yield* superviseServer({
      runtime: "llamacpp",
      port,
      command,
      healthUrl: `http://127.0.0.1:${port}/v1/models`,
      ...(cfg.healthTimeoutSec !== undefined ? { healthTimeoutSec: cfg.healthTimeoutSec } : {}),
    });
  });
