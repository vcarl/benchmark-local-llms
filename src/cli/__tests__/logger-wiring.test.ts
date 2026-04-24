import { Effect, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "./log-capture.js";

describe("log capture helper", () => {
  it("captures info lines above the min level", async () => {
    const sink: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo("hello").pipe(Effect.annotateLogs("scope", "test"));
        yield* Effect.logDebug("hidden").pipe(Effect.annotateLogs("scope", "test"));
      }).pipe(Effect.provide(captureLogs(sink, LogLevel.Info))),
    );
    expect(sink.length).toBe(1);
    expect(sink[0]).toContain("INF test | hello");
  });

  it("captures debug when min level is debug", async () => {
    const sink: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo("hello").pipe(Effect.annotateLogs("scope", "test"));
        yield* Effect.logDebug("detail").pipe(Effect.annotateLogs("scope", "test"));
      }).pipe(Effect.provide(captureLogs(sink, LogLevel.Debug))),
    );
    expect(sink.length).toBe(2);
    expect(sink[1]).toContain("DBG test | detail");
  });
});
