/**
 * HTTP client for the gameserver's benchmark admin API
 * (port of `game_admin.py::AdminClient`, lines 18-60).
 *
 * Endpoints:
 *   - POST /api/admin/benchmark/reset            — reset to a fixture
 *   - GET  /api/admin/benchmark/player-stats?player_id=… — player stats snapshot
 *
 * Authentication: `Authorization: Bearer <admin_token>` on every call.
 */
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Effect, Schema } from "effect";
import { GameCredentialMismatch, GameFixtureResetError } from "../../errors/index.js";

const PlayerCredential = Schema.Struct({
  username: Schema.optional(Schema.String),
  password: Schema.optional(Schema.String),
  empire: Schema.optional(Schema.String),
  player_id: Schema.optional(Schema.String),
});
export type PlayerCredential = typeof PlayerCredential.Type;

const ResetResponse = Schema.Struct({
  players: Schema.optional(Schema.Array(PlayerCredential)),
});

const decodeReset = Schema.decodeUnknown(ResetResponse);

const PlayerStats = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});
const decodeStats = Schema.decodeUnknown(PlayerStats);

export interface GameAdminClientConfig {
  readonly baseUrl: string;
  readonly adminToken: string;
}

const wrapHttp = (fixture: string) => (cause: HttpClientError) =>
  new GameFixtureResetError({
    fixture,
    cause: cause.message ?? String(cause),
  });

const wrapStatsHttp = (cause: HttpClientError) =>
  new GameFixtureResetError({
    fixture: "<player-stats>",
    cause: cause.message ?? String(cause),
  });

export interface GameAdminClient {
  /**
   * Reset the gameserver to the named fixture and return all player
   * credentials.
   */
  readonly reset: (
    fixture: string,
  ) => Effect.Effect<ReadonlyArray<PlayerCredential>, GameFixtureResetError>;
  /**
   * Resolve the credential matching the given expected id (matched against
   * either `username` or `player_id`). Fails with `GameCredentialMismatch`
   * if no candidate matches.
   */
  readonly resolveCredential: (
    creds: ReadonlyArray<PlayerCredential>,
    expectedId: string,
  ) => Effect.Effect<PlayerCredential, GameCredentialMismatch>;
  /** Player stats at end-of-session — returned to the scenario layer for scoring. */
  readonly getPlayerStats: (
    playerId: string,
  ) => Effect.Effect<Record<string, unknown>, GameFixtureResetError>;
}

export const makeGameAdminClient = (
  cfg: GameAdminClientConfig,
): Effect.Effect<GameAdminClient, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const auth = (req: HttpClientRequest.HttpClientRequest) =>
      HttpClientRequest.setHeader(req, "Authorization", `Bearer ${cfg.adminToken}`);

    const reset: GameAdminClient["reset"] = (fixture) =>
      Effect.gen(function* () {
        const url = `${cfg.baseUrl}/api/admin/benchmark/reset`;
        const req = yield* HttpClientRequest.post(url).pipe(
          HttpClientRequest.bodyJson({ fixture }),
          Effect.mapError(
            (cause) =>
              new GameFixtureResetError({
                fixture,
                cause: `body encoding failed: ${String(cause)}`,
              }),
          ),
        );
        const resp = yield* client.execute(auth(req)).pipe(
          Effect.mapError(wrapHttp(fixture)),
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.mapError((cause) =>
            cause._tag === "GameFixtureResetError"
              ? cause
              : new GameFixtureResetError({
                  fixture,
                  cause: `non-2xx: ${String(cause.message ?? cause)}`,
                }),
          ),
        );
        const json: unknown = yield* resp.json.pipe(
          Effect.mapError(
            () =>
              new GameFixtureResetError({
                fixture,
                cause: "<response body was not valid JSON>",
              }),
          ),
        );
        const decoded = yield* decodeReset(json).pipe(
          Effect.mapError(
            (cause) =>
              new GameFixtureResetError({
                fixture,
                cause: `schema decode failed: ${cause.message ?? String(cause)}`,
              }),
          ),
        );
        return decoded.players ?? [];
      });

    const resolveCredential: GameAdminClient["resolveCredential"] = (creds, expectedId) => {
      for (const c of creds) {
        if (c.username === expectedId || c.player_id === expectedId) {
          return Effect.succeed(c);
        }
      }
      const availableIds = creds.flatMap((c) => {
        const ids: string[] = [];
        if (c.username) ids.push(c.username);
        if (c.player_id) ids.push(c.player_id);
        return ids;
      });
      return Effect.fail(new GameCredentialMismatch({ expectedId, availableIds }));
    };

    const getPlayerStats: GameAdminClient["getPlayerStats"] = (playerId) =>
      Effect.gen(function* () {
        const url = `${cfg.baseUrl}/api/admin/benchmark/player-stats?player_id=${encodeURIComponent(playerId)}`;
        const req = HttpClientRequest.get(url);
        const resp = yield* client.execute(auth(req)).pipe(
          Effect.mapError(wrapStatsHttp),
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.mapError((cause) =>
            cause._tag === "GameFixtureResetError"
              ? cause
              : new GameFixtureResetError({
                  fixture: "<player-stats>",
                  cause: `non-2xx: ${String(cause.message ?? cause)}`,
                }),
          ),
        );
        const json: unknown = yield* resp.json.pipe(
          Effect.mapError(
            () =>
              new GameFixtureResetError({
                fixture: "<player-stats>",
                cause: "<response body was not valid JSON>",
              }),
          ),
        );
        return yield* decodeStats(json).pipe(
          Effect.mapError(
            (cause) =>
              new GameFixtureResetError({
                fixture: "<player-stats>",
                cause: `schema decode failed: ${cause.message ?? String(cause)}`,
              }),
          ),
        );
      });

    return { reset, resolveCredential, getPlayerStats };
  });
