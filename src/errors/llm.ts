import { Data } from "effect";

/**
 * LLM HTTP / API errors from requirements §3.1. Raised by the ChatCompletion
 * service (phase C1). All four carry `model` and `promptName` so the per-prompt
 * loop can record the failure on the right ExecutionResult without needing to
 * thread context through the error path.
 */

/** Network or non-2xx HTTP response. `cause` is a stringified upstream error. */
export class LlmRequestError extends Data.TaggedError("LlmRequestError")<{
  readonly model: string;
  readonly promptName: string;
  readonly cause: string;
}> {}

/** The request did not complete within the per-prompt timeout (default 600s). */
export class LlmTimeoutError extends Data.TaggedError("LlmTimeoutError")<{
  readonly model: string;
  readonly promptName: string;
  readonly timeoutSec: number;
}> {}

/** Response body did not match the OpenAI-compatible chat completion shape. */
export class LlmMalformedResponse extends Data.TaggedError("LlmMalformedResponse")<{
  readonly model: string;
  readonly promptName: string;
  readonly body: string;
}> {}

/**
 * Response was well-formed but the assistant message had no content. Distinct
 * from a malformed response so we can decide separately whether to retry vs
 * record-and-skip.
 */
export class LlmEmptyResponse extends Data.TaggedError("LlmEmptyResponse")<{
  readonly model: string;
  readonly promptName: string;
}> {}
