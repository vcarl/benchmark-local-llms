/**
 * HTTP client for Admiral's profile/provider API
 * (mirrors `admiral_runner.py::_api`, lines 114-131, plus the typed wrappers
 * around lines 134-193).
 *
 * Endpoints exposed:
 *   - PUT  /api/providers                    — configure_provider
 *   - POST /api/profiles                     — create_profile -> { id }
 *   - POST /api/profiles/:id/connect         — connect / disconnect (action)
 *   - DELETE /api/profiles/:id               — delete_profile
 *
 * Every non-2xx response is surfaced as `AdmiralApiError` with the endpoint,
 * status, and (truncated) body. Network failures are also funnelled into
 * `AdmiralApiError` (the prototype catches them, but here we want them
 * typed so the scenario loop can decide whether to bail or carry on).
 */
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Effect, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import { AdmiralApiError } from "../../errors/index.js";

const ProfileCreateResponse = Schema.Struct({
  id: Schema.String,
});

const decodeProfileCreate = Schema.decodeUnknown(ProfileCreateResponse);

export interface AdmiralClientConfig {
  /** Base URL for Admiral, e.g. `http://127.0.0.1:3031`. */
  readonly baseUrl: string;
}

export interface ConfigureProviderInput {
  /** Provider id Admiral uses internally — always `"custom"` for local LLMs. */
  readonly id: string;
  readonly baseUrl: string;
  readonly apiKey: string;
}

export interface CreateProfileInput {
  readonly name: string;
  readonly username: string;
  readonly password: string;
  /**
   * Bare model identifier (e.g. `mlx-community/Qwen2.5-7B-Instruct-4bit`).
   * Admiral pairs this with `provider` internally when resolving the model —
   * we send it bare in the `model` field so the OpenAI-compat request body
   * Admiral ships to a local llamacpp/mlx server has the actual repo id (no
   * `custom/` prefix), which mlx_lm.server otherwise rejects with a 404
   * "Repo id must be in the form 'repo_name' or 'namespace/repo_name'".
   */
  readonly model: string;
  readonly serverUrl: string;
  readonly directive: string;
  readonly connectionMode: string;
  readonly provider: string;
}

const wrapHttpError = (endpoint: string) => (cause: HttpClientError) =>
  new AdmiralApiError({
    endpoint,
    status: 0,
    body: cause.message ?? String(cause),
  });

const wrapParseError = (endpoint: string, status: number) => (cause: ParseError) =>
  new AdmiralApiError({
    endpoint,
    status,
    body: `schema decode failed: ${cause.message ?? String(cause)}`,
  });

/**
 * Issue a request and translate non-2xx into `AdmiralApiError` with the
 * response body for diagnostics.
 */
const request = (
  client: HttpClient.HttpClient,
  endpoint: string,
  req: HttpClientRequest.HttpClientRequest,
): Effect.Effect<HttpClientResponse.HttpClientResponse, AdmiralApiError> =>
  client.execute(req).pipe(
    Effect.mapError(wrapHttpError(endpoint)),
    Effect.flatMap((resp) => {
      if (resp.status >= 200 && resp.status < 300) {
        return Effect.succeed(resp);
      }
      return resp.text.pipe(
        Effect.orElseSucceed(() => "<no body>"),
        Effect.flatMap((body) =>
          Effect.fail(
            new AdmiralApiError({
              endpoint,
              status: resp.status,
              body: body.slice(0, 400),
            }),
          ),
        ),
      );
    }),
  );

const jsonRequest = (
  client: HttpClient.HttpClient,
  endpoint: string,
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown> | undefined,
): Effect.Effect<HttpClientResponse.HttpClientResponse, AdmiralApiError> =>
  Effect.gen(function* () {
    const builder =
      method === "POST"
        ? HttpClientRequest.post(endpoint)
        : method === "PUT"
          ? HttpClientRequest.put(endpoint)
          : HttpClientRequest.del(endpoint);
    const finalReq =
      body === undefined
        ? builder
        : yield* HttpClientRequest.bodyJson(builder, body).pipe(
            Effect.mapError(
              (cause) =>
                new AdmiralApiError({
                  endpoint,
                  status: 0,
                  body: `body encoding failed: ${String(cause)}`,
                }),
            ),
          );
    return yield* request(client, endpoint, finalReq);
  });

export interface AdmiralClient {
  /** Configure Admiral's LLM provider (custom = local llm-server). */
  readonly configureProvider: (
    input: ConfigureProviderInput,
  ) => Effect.Effect<void, AdmiralApiError>;
  /** Create a profile and return its id. */
  readonly createProfile: (input: CreateProfileInput) => Effect.Effect<string, AdmiralApiError>;
  /** Connect: instructs Admiral to start the LLM agent loop for a profile. */
  readonly connectProfile: (profileId: string) => Effect.Effect<void, AdmiralApiError>;
  /** Disconnect (the prototype swallows errors here; we keep them typed). */
  readonly disconnectProfile: (profileId: string) => Effect.Effect<void, AdmiralApiError>;
  /** Delete a profile. */
  readonly deleteProfile: (profileId: string) => Effect.Effect<void, AdmiralApiError>;
}

export const makeAdmiralClient = (
  cfg: AdmiralClientConfig,
): Effect.Effect<AdmiralClient, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const configureProvider: AdmiralClient["configureProvider"] = (input) => {
      const endpoint = `${cfg.baseUrl}/api/providers`;
      return jsonRequest(client, endpoint, "PUT", {
        id: input.id,
        base_url: input.baseUrl,
        api_key: input.apiKey,
      }).pipe(Effect.asVoid);
    };

    const createProfile: AdmiralClient["createProfile"] = (input) => {
      const endpoint = `${cfg.baseUrl}/api/profiles`;
      return Effect.gen(function* () {
        const resp = yield* jsonRequest(client, endpoint, "POST", {
          name: input.name,
          username: input.username,
          password: input.password,
          provider: input.provider,
          // Wire convention: Admiral expects the bare model id and combines
          // it with `provider` internally as `${provider}/${model}` when
          // dispatching to pi-ai (see admiral src/server/lib/agent.ts where
          // it calls resolveModel(`${profile.provider}/${profile.model}`)).
          // The previous `${provider}/${model}` we sent here resulted in a
          // double-prefixed `custom/custom/<repo>` reaching mlx_lm.server,
          // which rejects it with HTTP 404 because the repo id has too
          // many path segments.
          model: input.model,
          directive: input.directive,
          server_url: input.serverUrl,
          connection_mode: input.connectionMode,
        });
        const json: unknown = yield* resp.json.pipe(
          Effect.mapError(
            () =>
              new AdmiralApiError({
                endpoint,
                status: resp.status,
                body: "<response body was not valid JSON>",
              }),
          ),
        );
        const decoded = yield* decodeProfileCreate(json).pipe(
          Effect.mapError(wrapParseError(endpoint, resp.status)),
        );
        return decoded.id;
      });
    };

    const connectProfile: AdmiralClient["connectProfile"] = (profileId) => {
      const endpoint = `${cfg.baseUrl}/api/profiles/${profileId}/connect`;
      return jsonRequest(client, endpoint, "POST", {
        action: "connect_llm",
      }).pipe(Effect.asVoid);
    };

    const disconnectProfile: AdmiralClient["disconnectProfile"] = (profileId) => {
      const endpoint = `${cfg.baseUrl}/api/profiles/${profileId}/connect`;
      return jsonRequest(client, endpoint, "POST", {
        action: "disconnect",
      }).pipe(Effect.asVoid);
    };

    const deleteProfile: AdmiralClient["deleteProfile"] = (profileId) => {
      const endpoint = `${cfg.baseUrl}/api/profiles/${profileId}`;
      return jsonRequest(client, endpoint, "DELETE", undefined).pipe(Effect.asVoid);
    };

    return {
      configureProvider,
      createProfile,
      connectProfile,
      disconnectProfile,
      deleteProfile,
    };
  });
