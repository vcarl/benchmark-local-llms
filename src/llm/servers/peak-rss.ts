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
 * Returned by `trackPeakRss`. Contains:
 *
 * - `peakRssKb` — reader effect for the current peak in KB. Returns 0 until
 *   the first successful sample; treat 0 as "unknown".
 * - `sampleNow` — fires a single immediate sample into the same backing Ref.
 *   Call this right after the server becomes healthy (model + KV cache loaded)
 *   so even benchmark runs shorter than the 30s poll interval record a
 *   non-zero peak.
 */
export interface PeakRssTracker {
  readonly peakRssKb: Effect.Effect<number>;
  readonly sampleNow: Effect.Effect<void, never, CommandExecutor.CommandExecutor>;
}

/**
 * Fork a scoped poller that records the maximum RSS observed for `pid`.
 * Returns a `PeakRssTracker` with:
 *
 * - `peakRssKb` — current peak in KB (0 until first sample).
 * - `sampleNow` — one immediate tick into the same Ref; call it right after
 *   `waitForHealthy` so short runs still capture a reading.
 *
 * The periodic loop's first tick fires after `intervalMs` (not immediately),
 * which is intentional — the immediate reading is taken via `sampleNow` at
 * the meaningful moment (model loaded), not at spawn time when RSS is low.
 */
export const trackPeakRss = (
  pid: number,
  intervalMs: number,
): Effect.Effect<PeakRssTracker, never, CommandExecutor.CommandExecutor | Scope.Scope> =>
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

    return {
      peakRssKb: Ref.get(peak),
      sampleNow: tick,
    };
  });
