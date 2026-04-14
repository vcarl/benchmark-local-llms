/**
 * HTTP health-check polling helper for LLM server supervisors.
 *
 * Mirrors `runner.py::_wait_for_server` — polls an endpoint until it responds
 * 200 OK or the timeout elapses. The Python prototype polls `/health` at 1Hz
 * for up to 300s; we default to the same budget but accept config overrides.
 * Both llamacpp and mlx_lm.server expose OpenAI-compat `/v1/models`, but both
 * also expose `/health`, so callers pick the endpoint that fits their runtime.
 */
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Duration, Effect, Schedule } from "effect";
import { HealthCheckTimeout } from "../../errors/index.js";

export interface HealthCheckOptions {
  readonly url: string;
  readonly timeoutSec: number;
  /** Poll interval. Default 250ms — small enough to shave seconds off startup. */
  readonly pollIntervalMs?: number;
}

/**
 * Poll `url` until it returns any 2xx response, or fail with
 * `HealthCheckTimeout` once `timeoutSec` elapses. Transient connection errors
 * (ECONNREFUSED while the server boots) are swallowed and retried.
 */
export const waitForHealthy = (
  options: HealthCheckOptions,
): Effect.Effect<void, HealthCheckTimeout, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const pollIntervalMs = options.pollIntervalMs ?? 250;

    const probe = client
      .get(options.url)
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.asVoid);

    const schedule = Schedule.spaced(Duration.millis(pollIntervalMs));

    // Retry every failure — connection refused, 5xx, 4xx during warmup. The
    // only way out is the outer timeout below.
    const retried = Effect.retry(probe, { schedule });

    yield* Effect.timeout(retried, Duration.seconds(options.timeoutSec)).pipe(
      Effect.catchAll(() =>
        Effect.fail(
          new HealthCheckTimeout({
            url: options.url,
            timeoutSec: options.timeoutSec,
          }),
        ),
      ),
    );
  });
