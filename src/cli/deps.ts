/**
 * Production wiring for {@link RunModelDeps}. The three factories the run
 * loop takes (llmServer, admiral, gameSession) are assembled here from the
 * concrete module imports: C2 server supervisors, C3 admiral + game-session
 * modules, and the scope plumbing that keeps subprocesses alive for as long
 * as the run-loop's scope stays open.
 *
 * Kept separate from {@link runCommand} so the wiring can be unit-tested
 * without launching `@effect/cli` parsers, and so that the handler in
 * `run.ts` stays focused on flag normalization + logging.
 *
 * Note: the admiral & gameserver paths are runtime-optional — a run that
 * passes `--scenarios none` never asks for them. We still accept them here
 * up-front and fail cleanly if a scenario phase needs a path that isn't
 * configured.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";
import { Effect } from "effect";
import { makeAdmiralClient } from "../game/admiral/client.js";
import { admiralServer } from "../game/admiral/server.js";
import { makeGameAdminClient } from "../game/server/admin-client.js";
import { gameServer } from "../game/server/game-server.js";
import { llamacppServer } from "../llm/servers/llamacpp.js";
import { mlxServer } from "../llm/servers/mlx.js";
import { resolveLlamacppGguf } from "../llm/servers/resolve-gguf.js";
import { resolveMlxModel } from "../llm/servers/resolve-mlx.js";
import type {
  AdmiralFactory,
  GameSessionFactory,
  LlmServerFactory,
  RunModelDeps,
} from "../orchestration/run-model.js";
import type { ModelConfig } from "../schema/model.js";

export interface MakeRunDepsInput {
  /** Admiral checkout dir; required when `scenarioCorpus` is non-empty. */
  readonly admiralDir?: string | undefined;
  /** Gameserver binary path; required when `scenarioCorpus` is non-empty. */
  readonly gameServerBinary?: string | undefined;
  /**
   * Optional base URL override for the LLM endpoint Admiral talks to. The
   * Python prototype exposed this via `TESTBENCH_SCENARIO_BASE_URL`; we keep
   * the same env shape below but allow programmatic override for tests.
   */
  readonly scenarioLlmBaseUrl?: string | undefined;
}

/**
 * Resolve the Python interpreter to run `mlx_lm.server` under. `mlx_lm` is
 * typically installed into a venv, not system Python, so defaulting to
 * `python3` on PATH will fail on a machine where that is the Homebrew /
 * system Python without the package. Resolution order:
 *
 *   1. `$VIRTUAL_ENV/bin/python3` if `VIRTUAL_ENV` is set (honours an
 *      activated venv — matches the Python prototype's implicit behaviour,
 *      which used `sys.executable` and therefore inherited activation).
 *   2. `~/llm-env/bin/python3` if present (the path `benchmarking-guide.md`
 *      documents as the canonical venv location).
 *   3. Fallback to `python3` on PATH — if the user knows what they're doing,
 *      they can provide `mlx_lm` some other way.
 */
const resolveMlxPython = (): string => {
  const virtualEnv = process.env["VIRTUAL_ENV"];
  if (virtualEnv !== undefined && virtualEnv.length > 0) {
    const candidate = joinPath(virtualEnv, "bin", "python3");
    if (existsSync(candidate)) return candidate;
  }
  const convention = joinPath(homedir(), "llm-env", "bin", "python3");
  if (existsSync(convention)) return convention;
  return "python3";
};

/**
 * Dispatch llmServer factory on `model.runtime`.
 *
 * Both runtimes pre-check the HuggingFace cache and fail with a
 * ServerSpawnError if the model isn't already downloaded — `./bench run` is
 * a pure-execution phase, so downloading happens via an explicit out-of-tool
 * step.
 *
 * llamacpp: resolve artifact + quant to a local `.gguf` file (mirrors
 * runner.py:238 `resolve_llamacpp_gguf`). `llama-server -m` wants a path.
 *
 * mlx: resolve artifact to a local snapshot directory. `mlx_lm.server
 * --model` accepts either a HF repo id or a local path; handing it a local
 * path skips the implicit `snapshot_download()` roundtrip mlx_lm otherwise
 * makes. The Python interpreter is resolved via {@link resolveMlxPython} so
 * an activated or conventionally-located venv is picked up automatically.
 */
export const makeLlmServerFactory = (): LlmServerFactory => (model: ModelConfig) => {
  if (model.runtime === "llamacpp") {
    return Effect.gen(function* () {
      if (model.quant === undefined) {
        return yield* Effect.die(
          new Error(`llamacpp model ${model.artifact} is missing required 'quant' field`),
        );
      }
      const artifactPath = yield* resolveLlamacppGguf(model.artifact, model.quant);
      return yield* llamacppServer({
        artifactPath,
        ...(model.ctxSize !== undefined ? { ctxSize: model.ctxSize } : {}),
      });
    });
  }
  return Effect.gen(function* () {
    const artifactPath = yield* resolveMlxModel(model.artifact);
    return yield* mlxServer({ artifactPath, pythonBin: resolveMlxPython() });
  });
};

const newAdminToken = (): string => randomBytes(16).toString("hex");

export const makeAdmiralFactory =
  (admiralDir: string | undefined): AdmiralFactory =>
  () =>
    Effect.gen(function* () {
      if (admiralDir === undefined) {
        return yield* Effect.die(
          new Error(
            "admiral-dir is required when running scenarios. Pass --admiral-dir or set --scenarios none.",
          ),
        );
      }
      const handle = yield* admiralServer({ admiralDir });
      const client = yield* makeAdmiralClient({ baseUrl: handle.baseUrl });
      return { baseUrl: handle.baseUrl, client };
    });

export const makeGameSessionFactory =
  (gameServerBinary: string | undefined): GameSessionFactory =>
  (_scenario, admiral) =>
    Effect.gen(function* () {
      if (gameServerBinary === undefined) {
        return yield* Effect.die(
          new Error(
            "game-server-binary is required when running scenarios. Pass --game-server-binary or set --scenarios none.",
          ),
        );
      }
      const adminToken = newAdminToken();
      const handle = yield* gameServer({ binaryPath: gameServerBinary, adminToken });
      const admin = yield* makeGameAdminClient({
        baseUrl: handle.baseUrl,
        adminToken: handle.adminToken,
      });
      return {
        gameServerBaseUrl: handle.baseUrl,
        admiral: admiral.client,
        admin,
      };
    });

export const makeRunDeps = (input: MakeRunDepsInput): RunModelDeps => ({
  llmServer: makeLlmServerFactory(),
  admiral: makeAdmiralFactory(input.admiralDir),
  gameSession: makeGameSessionFactory(input.gameServerBinary),
});
