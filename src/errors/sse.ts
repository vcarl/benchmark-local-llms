import { Data } from "effect";

/**
 * SSE stream errors from requirements §3.1/§3.3. The Python prototype silently
 * treated closed streams and unparseable frames as "session completed"; here
 * each failure mode is a distinct tag the scenario loop can react to.
 */

/** Underlying HTTP/SSE connection closed or failed to open. */
export class SseConnectionError extends Data.TaggedError("SseConnectionError")<{
  readonly profileId: string;
  readonly cause: string;
}> {}

/**
 * No event arrived within the configured idle window. This is the structural
 * replacement for the Python prototype's STALL_WARN that could never fire
 * during a blocked `readline()` — see §3.3.
 */
export class SseIdleTimeout extends Data.TaggedError("SseIdleTimeout")<{
  readonly profileId: string;
  readonly idleSec: number;
}> {}

/** A frame arrived but the payload wasn't valid JSON / expected shape. */
export class SseParseError extends Data.TaggedError("SseParseError")<{
  readonly profileId: string;
  readonly rawLine: string;
}> {}
