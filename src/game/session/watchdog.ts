/**
 * Cutoff watchdog (requirements §5.5).
 *
 * Tracks running counts of `tool_call` events and cumulative `turn_end` token
 * usage, exposes a sticky `tripped()` query, and supplies a wall-clock fiber
 * that can be raced against the main session work (§3.3) so the wall-clock
 * cutoff fires even when the SSE stream stops producing events.
 *
 * Mirrors `cutoff_watchdog.py`:
 *   - tool_call -> increment toolCallCount
 *   - turn_end  -> totalTokens = totalTokensIn + totalTokensOut
 *   - tripped() check order: tool_calls > tokens > wall_clock (sticky)
 *
 * The watchdog is built around a `Ref` so observe + tripped are atomic, and
 * an Effect-returning `wallClockTimer` so the wall-clock cutoff lives on its
 * own fiber rather than being polled.
 */
import { Duration, Effect, Ref } from "effect";
import type { TerminationReason } from "../../schema/enums.js";
import type { AgentEvent } from "../../schema/execution.js";
import type { CutoffConfig } from "../../schema/scenario.js";

export interface WatchdogState {
  readonly toolCallCount: number;
  readonly totalTokens: number;
  readonly tripped: TerminationReason | null;
}

export interface CutoffWatchdog {
  /** Push an Admiral SSE event into the watchdog state machine. */
  readonly observe: (event: AgentEvent) => Effect.Effect<void>;
  /** Sticky: returns the first cutoff name that tripped, or null. */
  readonly tripped: Effect.Effect<TerminationReason | null>;
  /** Snapshot of the running counters + tripped state. */
  readonly snapshot: Effect.Effect<WatchdogState>;
  /**
   * An Effect that sleeps for `wallClockSec` and then succeeds with
   * `"wall_clock"`. Fork this and race it against the main session loop.
   * Marks the watchdog tripped before returning so subsequent calls to
   * `tripped` are consistent.
   */
  readonly wallClockTimer: Effect.Effect<TerminationReason>;
}

interface InternalState {
  toolCallCount: number;
  totalTokens: number;
  tripped: TerminationReason | null;
}

const initialState = (): InternalState => ({
  toolCallCount: 0,
  totalTokens: 0,
  tripped: null,
});

/**
 * Compute the next sticky `tripped` value. Check order matches the Python
 * prototype: tool_calls > tokens > wall_clock. Once set, the value never
 * changes — callers must respect that stickiness.
 */
const computeTripped = (state: InternalState, cutoffs: CutoffConfig): TerminationReason | null => {
  if (state.tripped !== null) return state.tripped;
  if (state.toolCallCount > cutoffs.toolCalls) return "tool_calls";
  if (state.totalTokens > cutoffs.totalTokens) return "tokens";
  return null;
};

/** Read totalTokensIn / totalTokensOut from a turn_end event's data payload. */
const readTokenUsage = (data: Readonly<Record<string, unknown>>): number => {
  const inRaw = data["totalTokensIn"];
  const outRaw = data["totalTokensOut"];
  const inN = typeof inRaw === "number" ? inRaw : 0;
  const outN = typeof outRaw === "number" ? outRaw : 0;
  return inN + outN;
};

/**
 * Construct a watchdog wired to the given cutoffs. Internal state lives in
 * a `Ref` so concurrent observe / tripped calls are linearizable.
 */
export const makeWatchdog = (cutoffs: CutoffConfig): Effect.Effect<CutoffWatchdog> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<InternalState>(initialState());

    const observe = (event: AgentEvent): Effect.Effect<void> =>
      Ref.update(ref, (state) => {
        let next = state;
        if (event.event === "tool_call") {
          next = { ...next, toolCallCount: next.toolCallCount + 1 };
        } else if (event.event === "turn_end") {
          next = { ...next, totalTokens: readTokenUsage(event.data) };
        }
        const tripped = computeTripped(next, cutoffs);
        return tripped === next.tripped ? next : { ...next, tripped };
      });

    const tripped: Effect.Effect<TerminationReason | null> = Effect.map(
      Ref.get(ref),
      (state) => state.tripped,
    );

    const snapshot: Effect.Effect<WatchdogState> = Effect.map(Ref.get(ref), (state) => ({
      toolCallCount: state.toolCallCount,
      totalTokens: state.totalTokens,
      tripped: state.tripped,
    }));

    const wallClockTimer: Effect.Effect<TerminationReason> = Effect.gen(function* () {
      yield* Effect.sleep(Duration.seconds(cutoffs.wallClockSec));
      yield* Ref.update(ref, (state) =>
        state.tripped === null ? { ...state, tripped: "wall_clock" as const } : state,
      );
      return "wall_clock" as const;
    });

    return { observe, tripped, snapshot, wallClockTimer };
  });
