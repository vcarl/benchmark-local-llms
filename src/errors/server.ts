import { Data } from "effect";
import type { Runtime } from "../schema/enums.js";

/**
 * Server lifecycle errors from requirements §3.1. These are raised by the
 * LLM and Admiral server supervisors in phase C2; at phase A they exist
 * only as typed channels imported by downstream modules.
 */

/**
 * The child process failed to start, or exited non-zero before becoming
 * healthy. `logTail` is an optional best-effort snapshot of recent stderr.
 */
export class ServerSpawnError extends Data.TaggedError("ServerSpawnError")<{
  readonly runtime: Runtime;
  readonly reason: string;
  readonly logTail?: string;
}> {}

/** The server process started but `/health` never returned 200 within the window. */
export class HealthCheckTimeout extends Data.TaggedError("HealthCheckTimeout")<{
  readonly url: string;
  readonly timeoutSec: number;
}> {}

/** Port was already bound when we tried to spawn. */
export class PortConflict extends Data.TaggedError("PortConflict")<{
  readonly port: number;
}> {}
