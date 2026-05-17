/**
 * Peak-RSS tracker for a supervised server subprocess.
 *
 * Why this shape rather than wrapping with `/usr/bin/time -l`: macOS `time`
 * does not forward SIGTERM to the wrapped child. Swapping the supervisor's
 * launch command for `time -l <server>` would leak the server on shutdown
 * because our finalizer signals the wrapper, not the child. Polling `ps`
 * from a scoped fiber keeps the existing signal path intact.
 *
 * Granularity is 30s — peak memory for an LLM server is the sustained
 * model + KV cache footprint, not a transient spike, so a coarse interval
 * captures the interesting value without extra spawns.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect, Ref, type Scope } from "effect";

const sampleRssKb = (
  pid: number,
): Effect.Effect<number | null, never, CommandExecutor.CommandExecutor> =>
  Command.string(Command.make("ps", "-o", "rss=", "-p", String(pid))).pipe(
    Effect.map((out) => {
      const kb = Number.parseInt(out.trim(), 10);
      return Number.isFinite(kb) && kb > 0 ? kb : null;
    }),
    // pid gone, ps missing, malformed output — all treated as "skip this tick".
    Effect.catchAll(() => Effect.succeed(null)),
  );

/**
 * Fork a scoped poller that records the maximum RSS observed for `pid`.
 * Returns a reader effect for the current peak (KB). Peak is 0 until the
 * first successful sample; callers can treat 0 as "unknown".
 *
 * The first sample fires after `intervalMs` — not immediately — so short
 * test runs that share a mock `CommandExecutor` with the supervisor never
 * tick through the poller.
 */
export const trackPeakRss = (
  pid: number,
  intervalMs: number,
): Effect.Effect<Effect.Effect<number>, never, CommandExecutor.CommandExecutor | Scope.Scope> =>
  Effect.gen(function* () {
    const peak = yield* Ref.make(0);

    const tick = Effect.gen(function* () {
      const sample = yield* sampleRssKb(pid);
      if (sample !== null) {
        yield* Ref.update(peak, (prev) => (sample > prev ? sample : prev));
      }
    });

    const loop = Effect.forever(Effect.zipRight(Effect.sleep(intervalMs), tick));
    yield* Effect.forkScoped(loop);

    return Ref.get(peak);
  });
