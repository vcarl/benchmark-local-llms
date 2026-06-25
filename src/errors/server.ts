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

/**
 * The server booted and passed health, but its chat template failed
 * verification — e.g. llama-server fell back to ChatML because the GGUF
 * shipped no template, or the rendered prompt still contains raw Jinja
 * (the template never executed). A verification failure aborts boot so a
 * silent template fault becomes a loud abort instead of a corrupted score.
 *
 * Surfaced through the same typed channel as `ServerSpawnError` so the boot
 * path can treat a bad template like any other failed spawn.
 */
export class TemplateVerificationError extends Data.TaggedError("TemplateVerificationError")<{
  readonly runtime: Runtime;
  readonly reason: string;
}> {}
