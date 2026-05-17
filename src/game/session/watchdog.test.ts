import { Duration, Effect, Fiber, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../schema/execution.js";
import { makeWatchdog } from "./watchdog.js";

const ev = (
  event: AgentEvent["event"],
  data: Record<string, unknown> = {},
  tick = 0,
): AgentEvent => ({ event, tick, ts: "2026-01-01T00:00:00Z", data });

describe("makeWatchdog", () => {
  it("starts with zeroed counters and no trip", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 1000,
          toolCalls: 10,
        });
        return yield* wd.snapshot;
      }),
    );
    expect(result).toEqual({ toolCallCount: 0, totalTokens: 0, tripped: null });
  });

  it("counts tool_call events and trips on the configured threshold (strictly >)", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 1000,
          toolCalls: 2,
        });
        yield* wd.observe(ev("tool_call"));
        yield* wd.observe(ev("tool_call"));
        const before = yield* wd.tripped;
        yield* wd.observe(ev("tool_call"));
        const after = yield* wd.tripped;
        return { before, after };
      }),
    );
    expect(result.before).toBeNull();
    expect(result.after).toBe("tool_calls");
  });

  it("accumulates totalTokens from turn_end events (sum of in+out, latest sample wins)", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 100,
          toolCalls: 999,
        });
        yield* wd.observe(ev("turn_end", { totalTokensIn: 30, totalTokensOut: 20 }));
        const mid = yield* wd.snapshot;
        yield* wd.observe(ev("turn_end", { totalTokensIn: 70, totalTokensOut: 40 }));
        const after = yield* wd.tripped;
        return { mid, after };
      }),
    );
    expect(result.mid.totalTokens).toBe(50);
    expect(result.after).toBe("tokens");
  });

  it("ignores tool_result events (informational only)", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 1000,
          toolCalls: 1,
        });
        yield* wd.observe(ev("tool_result"));
        yield* wd.observe(ev("tool_result"));
        return yield* wd.snapshot;
      }),
    );
    expect(result.toolCallCount).toBe(0);
    expect(result.tripped).toBeNull();
  });

  it("tripped is sticky once set — subsequent observations cannot change it", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 10,
          toolCalls: 999,
        });
        yield* wd.observe(ev("turn_end", { totalTokensIn: 50, totalTokensOut: 0 }));
        const first = yield* wd.tripped;
        // Even if we observe many tool_calls past the tool_calls threshold,
        // the original trip name persists.
        yield* wd.observe(ev("tool_call"));
        yield* wd.observe(ev("tool_call"));
        const second = yield* wd.tripped;
        return { first, second };
      }),
    );
    expect(result.first).toBe("tokens");
    expect(result.second).toBe("tokens");
  });

  it("tool_calls takes priority over tokens when both cross at once", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 60,
          totalTokens: 5,
          toolCalls: 0,
        });
        // A single tool_call crosses tool_calls; a turn_end on the same tick
        // would also have crossed tokens. We feed the tool_call first to
        // mirror the prototype's "checked first" precedence; running them
        // both before query yields tool_calls.
        yield* wd.observe(ev("tool_call"));
        yield* wd.observe(ev("turn_end", { totalTokensIn: 20, totalTokensOut: 0 }));
        return yield* wd.tripped;
      }),
    );
    expect(result).toBe("tool_calls");
  });

  it("wallClockTimer fires after wallClockSec and marks the watchdog tripped", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 30,
          totalTokens: 1000,
          toolCalls: 100,
        });
        const fiber = yield* Effect.fork(wd.wallClockTimer);
        yield* TestClock.adjust(Duration.seconds(29));
        const before = yield* wd.tripped;
        yield* TestClock.adjust(Duration.seconds(2));
        const reason = yield* Fiber.join(fiber);
        const after = yield* wd.tripped;
        return { before, reason, after };
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
    expect(result.before).toBeNull();
    expect(result.reason).toBe("wall_clock");
    expect(result.after).toBe("wall_clock");
  });

  it("wallClockTimer is interruptible — leaving the scope cancels it cleanly", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const wd = yield* makeWatchdog({
          wallClockSec: 600,
          totalTokens: 1000,
          toolCalls: 100,
        });
        const fiber = yield* Effect.fork(wd.wallClockTimer);
        // Don't advance the clock; immediately interrupt.
        yield* Fiber.interrupt(fiber);
        return yield* wd.tripped;
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
    expect(result).toBeNull();
  });
});
