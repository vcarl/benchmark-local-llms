import { Data } from "effect";

/**
 * Admiral + game session errors from requirements §3.1. Raised by the game
 * orchestration layer (phase C3). `CutoffTripped` is intentionally NOT in
 * this list — cutoff trips are expected terminations returned as values, not
 * errors (see §3.1 note and §5.5).
 */

/** The game fixture did not reset cleanly before the session. */
export class GameFixtureResetError extends Data.TaggedError("GameFixtureResetError")<{
  readonly fixture: string;
  readonly cause: string;
}> {}

/**
 * The credentials returned by Admiral don't include the player ID this run
 * expects. `availableIds` is surfaced to help operator debugging.
 */
export class GameCredentialMismatch extends Data.TaggedError("GameCredentialMismatch")<{
  readonly expectedId: string;
  readonly availableIds: readonly string[];
}> {}

/** Non-2xx response from an Admiral API endpoint. */
export class AdmiralApiError extends Data.TaggedError("AdmiralApiError")<{
  readonly endpoint: string;
  readonly status: number;
  readonly body: string;
}> {}

/** The per-scenario GameServer subprocess failed to start or died mid-session. */
export class GameServerError extends Data.TaggedError("GameServerError")<{
  readonly scenarioName: string;
  readonly cause: string;
}> {}
