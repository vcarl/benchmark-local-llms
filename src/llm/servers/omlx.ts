/**
 * oMLX server supervisor. Spawns `omlx serve`, waits for `/v1/models`, warms
 * the model, forks the exit watcher, and terminates on scope close.
 *
 * oMLX (https://github.com/jundot/omlx) is an Apple-Silicon MLX inference
 * server with continuous batching and a paged SSD KV cache. It consumes the
 * same HuggingFace MLX safetensors artifacts as `mlx_lm.server`, so the
 * artifact resolution and the offline chat-template gate are shared with the
 * `mlx` runtime; only the process and the request-side model id differ.
 *
 * Two properties of oMLX shape this module:
 *
 * 1. **It is a multi-model server.** `--model-dir` points at a directory of
 *    model subdirectories, and each first-level subdirectory containing a
 *    `config.json` is registered under its own *leaf* directory name — never
 *    `org/repo`. The bench treats one `ServerHandle` as one model, so we hand
 *    oMLX a per-port staging directory holding exactly one symlink named after
 *    the artifact's leaf, pointing at the resolved HF cache snapshot. That
 *    leaf is also the id the OpenAI `model` field must carry (see
 *    `apiModelId` in `orchestration/run-prompt.ts`).
 *
 * 2. **Weights load lazily, on the first inference request.** `/v1/models`
 *    answers as soon as directory discovery finishes, so a plain health check
 *    would let the multi-minute weight load land inside the first *measured*
 *    prompt. We therefore issue a `max_tokens: 1` warmup completion during
 *    acquisition, and fail the boot if it does not come back.
 *
 * Note: `omlx serve` persists explicitly-passed CLI flags to
 * `~/.omlx/settings.json`. That is oMLX's own behaviour; the bench always
 * passes model-dir/host/port explicitly, so the persisted values are simply
 * overwritten on every boot.
 */
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Command,
  type CommandExecutor,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Duration, Effect } from "effect";
import {
  type HealthCheckTimeout,
  ServerSpawnError,
  type TemplateVerificationError,
} from "../../errors/index.js";
import { resolveMlxModel } from "./resolve-mlx.js";
import { type ServerHandle, superviseServer } from "./supervisor.js";

export const OMLX_DEFAULT_PORT = 18082;

export interface OmlxConfig {
  /** HuggingFace repo id of the MLX artifact, e.g. `mlx-community/Qwen3-32B-4bit`. */
  readonly artifact: string;
  /** TCP port to bind. Defaults to 18082. */
  readonly port?: number;
  /** Path to the `omlx` binary. Defaults to `omlx` on PATH. */
  readonly binPath?: string;
  /** Seconds to allow for `/v1/models` to respond 200. Default 600. */
  readonly healthTimeoutSec?: number;
  /** Extra CLI args appended after the built-in flags. */
  readonly extraArgs?: ReadonlyArray<string>;
  /** HF hub cache root override. Defaults to `~/.cache/huggingface/hub`. */
  readonly cacheRoot?: string;
}

/**
 * Per-port staging directory handed to `omlx serve --model-dir`. Keyed by port
 * so concurrent supervisors on different ports never share a directory.
 */
export const stagingDirFor = (port: number): string => path.join(os.tmpdir(), `bench-omlx-${port}`);

/** The model id oMLX registers for `artifact` — its leaf directory name. */
export const leafModelId = (artifact: string): string => artifact.split("/").at(-1) ?? artifact;

/**
 * Build the single-model staging directory: remove whatever sits at the exact
 * staging path, recreate it, and link `<leaf>` at the resolved snapshot. The
 * removal is a narrow, exact-path delete of a directory this module owns.
 */
const stageModel = (
  snapshotDir: string,
  artifact: string,
  port: number,
): Effect.Effect<string, ServerSpawnError> =>
  Effect.try({
    try: () => {
      const staging = stagingDirFor(port);
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      symlinkSync(snapshotDir, path.join(staging, leafModelId(artifact)), "dir");
      return staging;
    },
    catch: (err) =>
      new ServerSpawnError({
        runtime: "omlx",
        reason: `could not build the omlx staging directory: ${String(err)}`,
      }),
  });

const buildArgs = (cfg: OmlxConfig, stagingDir: string, port: number): ReadonlyArray<string> => {
  const base: string[] = [
    "serve",
    "--model-dir",
    stagingDir,
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
 * Force the lazy weight load with a one-token completion. Any failure —
 * transport, non-2xx, or timeout — aborts acquisition through the same typed
 * channel as a spawn failure, because a server that cannot answer a trivial
 * completion cannot serve the benchmark either.
 */
const warmup = (
  artifact: string,
  port: number,
  timeoutSec: number,
): Effect.Effect<void, ServerSpawnError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const modelId = leafModelId(artifact);
    yield* Effect.logInfo(`warming ${modelId} (lazy weight load)`).pipe(
      Effect.annotateLogs("scope", "omlx"),
    );

    const request = yield* HttpClientRequest.post(
      `http://127.0.0.1:${port}/v1/chat/completions`,
    ).pipe(
      HttpClientRequest.bodyJson({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      Effect.mapError(
        (err) =>
          new ServerSpawnError({
            runtime: "omlx",
            reason: `could not encode the omlx warmup request: ${String(err)}`,
          }),
      ),
    );

    yield* client.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.asVoid,
      Effect.timeoutFail({
        duration: Duration.seconds(timeoutSec),
        onTimeout: () =>
          new ServerSpawnError({
            runtime: "omlx",
            reason: `omlx warmup did not complete within ${timeoutSec}s — the model never finished loading.`,
          }),
      }),
      Effect.mapError((err) =>
        err instanceof ServerSpawnError
          ? err
          : new ServerSpawnError({
              runtime: "omlx",
              reason: `omlx warmup request failed: ${String(err)}`,
            }),
      ),
    );

    yield* Effect.logInfo("warmed").pipe(Effect.annotateLogs("scope", "omlx"));
  });

/**
 * Acquire a running `omlx serve` within the current scope, healthy, template-
 * verified, and warm.
 */
export const omlxServer = (
  cfg: OmlxConfig,
): Effect.Effect<
  ServerHandle,
  ServerSpawnError | HealthCheckTimeout | TemplateVerificationError,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | import("effect/Scope").Scope
> =>
  Effect.gen(function* () {
    const port = cfg.port ?? OMLX_DEFAULT_PORT;
    const bin = cfg.binPath ?? "omlx";
    const healthTimeoutSec = cfg.healthTimeoutSec ?? 600;

    // Same artifacts as the mlx runtime, so the same cache pre-check applies:
    // `./bench run` never downloads, it only serves what is already local.
    const snapshotDir = yield* resolveMlxModel(cfg.artifact, {
      runtime: "omlx",
      ...(cfg.cacheRoot !== undefined ? { cacheRoot: cfg.cacheRoot } : {}),
    });
    const stagingDir = yield* stageModel(snapshotDir, cfg.artifact, port);

    const command = Command.make(bin, ...buildArgs(cfg, stagingDir, port));
    const handle = yield* superviseServer({
      runtime: "omlx",
      port,
      command,
      healthUrl: `http://127.0.0.1:${port}/v1/models`,
      healthTimeoutSec,
      // oMLX exposes no template-inspection endpoint, so verify OFFLINE
      // against the resolved snapshot dir — where tokenizer_config.json /
      // chat_template.jinja live. Same logic as the mlx runtime.
      verifyTemplate: { runtime: "omlx", modelDir: snapshotDir },
    });

    // Health only proves directory discovery finished; weights load on the
    // first inference request. Pay that cost here, not inside a measured prompt.
    yield* warmup(cfg.artifact, port, healthTimeoutSec);

    return handle;
  });
