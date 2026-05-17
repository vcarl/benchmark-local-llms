/**
 * Admiral profile lifecycle as a Scope (requirements §5.1):
 *   acquire: configure provider → create profile → connect
 *   release: disconnect → delete
 *
 * If any acquire step fails AFTER `create profile` succeeds, the partial
 * state must still be torn down. We achieve that by attaching the disconnect
 * + delete finalizers to the scope as soon as the profile id is known —
 * `acquireRelease` ensures finalizers fire even when the surrounding effect
 * fails after the resource is acquired.
 *
 * Mirrors `game_session.py::run_game_session`'s try/finally block (lines
 * 117-256) which manually orders disconnect + delete on the way out.
 */
import { Effect } from "effect";
import type { AdmiralApiError } from "../../errors/index.js";
import type { AdmiralClient, ConfigureProviderInput, CreateProfileInput } from "./client.js";

export interface ProfileSessionConfig {
  readonly provider: ConfigureProviderInput;
  readonly profile: CreateProfileInput;
}

export interface AdmiralProfileHandle {
  readonly profileId: string;
}

/**
 * Acquire an Admiral profile within the current scope. The release path runs
 * `disconnect` then `delete`; failures during teardown are logged and
 * swallowed (the prototype does the same — once the run is done we want
 * cleanup to be best-effort).
 *
 * The lifecycle order:
 *   1. configure_provider — idempotent, no scope finalizer needed
 *   2. create_profile — register a delete finalizer immediately
 *   3. connect_profile — register a disconnect finalizer immediately
 *
 * If step 3 fails the profile still exists; the finalizers will delete it.
 */
export const acquireProfile = (
  client: AdmiralClient,
  config: ProfileSessionConfig,
): Effect.Effect<AdmiralProfileHandle, AdmiralApiError, import("effect/Scope").Scope> =>
  Effect.gen(function* () {
    yield* client.configureProvider(config.provider);

    const profileId = yield* client.createProfile(config.profile);

    // Register the delete finalizer NOW — even if connect fails, we still
    // need to remove the orphaned profile.
    yield* Effect.addFinalizer(() =>
      client
        .deleteProfile(profileId)
        .pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning(
              `Admiral profile ${profileId} delete failed: ${JSON.stringify(cause)}`,
            ),
          ),
        ),
    );

    yield* client.connectProfile(profileId);

    // Disconnect runs BEFORE delete due to LIFO finalizer order.
    yield* Effect.addFinalizer(() =>
      client
        .disconnectProfile(profileId)
        .pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning(
              `Admiral profile ${profileId} disconnect failed: ${JSON.stringify(cause)}`,
            ),
          ),
        ),
    );

    return { profileId };
  });
