/**
 * llama.cpp server supervisor. Spawns `llama-server`, waits for /health,
 * forks the exit watcher, and terminates on scope close.
 *
 * Invocation mirrors `runner.py::start_llamacpp_server` (lines 335-350):
 *   llama-server
 *     -m <artifact>
 *     --host 127.0.0.1
 *     --port <port>
 *     --cache-type-k q8_0
 *     --cache-type-v q8_0
 *     --reasoning-format auto
 *     --jinja
 *     [-c <ctxSize>]
 *     [--chat-template-file <path>]
 *
 * `--jinja` is pinned unconditionally so a future llama.cpp default flip can't
 * silently change prompt rendering; it must precede `--chat-template-file`,
 * which llama.cpp only treats as arbitrary Jinja when `--jinja` is set first.
 *
 * `--reasoning-format auto` makes llama-server parse the model's native
 * thinking dialect (`<think>…</think>`, `[THINK]…[/THINK]`, …), strip it out
 * of `content`, and expose it on the separate `reasoning_content` field — so
 * the stored answer is clean and the chain-of-thought is preserved separately.
 * Verified empirically against Magistral (`[THINK]` dialect): with `auto`,
 * `content` carries no thinking tags and no stray `</s>`. The prior value
 * `none` left the chain-of-thought inline in `content`, which leaked reasoning
 * markers into the stored output. Runtimes that do NOT separate reasoning
 * natively (notably `mlx_lm.server`) are handled by the receive-path fallback
 * in `src/scoring/strip-thinking.ts`.
 *
 * The prototype's log tee to /tmp/testbench-llamacpp.log is intentionally
 * dropped — Effect's logger captures the interesting lifecycle events, and
 * the subprocess stdout/stderr streams are available on the handle for
 * callers that want them. Adding a file log is a trivial follow-up if the
 * CLI layer wants it.
 */
import { Command, type CommandExecutor, type HttpClient } from "@effect/platform";
import { Effect } from "effect";
import type {
  HealthCheckTimeout,
  ServerSpawnError,
  TemplateVerificationError,
} from "../../errors/index.js";
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
  /**
   * Absolute path to a vendored jinja chat template. When set, the server
   * is launched with `--chat-template-file <path>` (`--jinja` is always
   * passed; see {@link buildArgs}). Needed for
   * official `mistralai/*-GGUF` artifacts that ship without an embedded
   * template; omitted for runtimes that use their embedded template.
   */
  readonly chatTemplatePath?: string;
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
    "--cache-type-k",
    "q8_0",
    "--cache-type-v",
    "q8_0",
    "--reasoning-format",
    "auto",
    // Always pin --jinja so a future llama.cpp default flip can't silently
    // change prompt rendering. Must precede --chat-template-file below, which
    // llama.cpp only treats as arbitrary Jinja when --jinja is set first.
    "--jinja",
  ];
  if (cfg.ctxSize !== undefined) {
    base.push("-c", String(cfg.ctxSize));
  }
  if (cfg.chatTemplatePath !== undefined) {
    base.push("--chat-template-file", cfg.chatTemplatePath);
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
  ServerSpawnError | HealthCheckTimeout | TemplateVerificationError,
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
      // After health, verify the chat template via /props + /apply-template.
      verifyTemplate: { runtime: "llamacpp", port },
    });
  });
