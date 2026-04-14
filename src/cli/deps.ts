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
import type { HttpClient } from "@effect/platform";
import type { Effect, Scope } from "effect";
import { Effect as EffectModule } from "effect";
import { makeAdmiralClient } from "../game/admiral/client.js";
import { admiralServer } from "../game/admiral/server.js";
import { makeGameAdminClient } from "../game/server/admin-client.js";
import { gameServer } from "../game/server/game-server.js";
import { llamacppServer } from "../llm/servers/llamacpp.js";
import { mlxServer } from "../llm/servers/mlx.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type {
  AdmiralFactory,
  AdmiralHandle,
  GameSessionDeps,
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
 * Dispatch llmServer factory on `model.runtime`. Returns a fresh ServerHandle
 * acquired inside the caller's scope.
 *
 * Note on the cast: the orchestration factory signature narrows `R` to
 * `HttpClient | Scope`, but the concrete supervisors also require a
 * `CommandExecutor` (to spawn the subprocess). `CommandExecutor` is supplied
 * by `NodeContext.layer` at the CLI boundary, so the service is present at
 * runtime; the narrowing is a structural under-specification in the factory
 * type. Flagged in the deliverable notes for a follow-up patch that widens
 * the factory type to include `CommandExecutor`.
 */
export const makeLlmServerFactory = (): LlmServerFactory => (model: ModelConfig) => {
  const eff =
    model.runtime === "llamacpp"
      ? llamacppServer({
          artifactPath: model.artifact,
          ...(model.ctxSize !== undefined ? { ctxSize: model.ctxSize } : {}),
        })
      : mlxServer({ artifactPath: model.artifact });
  return eff as unknown as Effect.Effect<
    ServerHandle,
    unknown,
    HttpClient.HttpClient | Scope.Scope
  >;
};

const newAdminToken = (): string => randomBytes(16).toString("hex");

export const makeAdmiralFactory =
  (admiralDir: string | undefined): AdmiralFactory =>
  () => {
    const eff = EffectModule.gen(function* () {
      if (admiralDir === undefined) {
        return yield* EffectModule.die(
          new Error(
            "admiral-dir is required when running scenarios. Pass --admiral-dir or set --scenarios none.",
          ),
        );
      }
      const handle = yield* admiralServer({ admiralDir });
      const client = yield* makeAdmiralClient({ baseUrl: handle.baseUrl });
      return { baseUrl: handle.baseUrl, client };
    });
    return eff as unknown as Effect.Effect<
      AdmiralHandle,
      unknown,
      HttpClient.HttpClient | Scope.Scope
    >;
  };

export const makeGameSessionFactory =
  (gameServerBinary: string | undefined): GameSessionFactory =>
  (_scenario, admiral) => {
    const eff = EffectModule.gen(function* () {
      if (gameServerBinary === undefined) {
        return yield* EffectModule.die(
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
    return eff as unknown as Effect.Effect<
      GameSessionDeps,
      unknown,
      HttpClient.HttpClient | Scope.Scope
    >;
  };

export const makeRunDeps = (input: MakeRunDepsInput): RunModelDeps => ({
  llmServer: makeLlmServerFactory(),
  admiral: makeAdmiralFactory(input.admiralDir),
  gameSession: makeGameSessionFactory(input.gameServerBinary),
});
