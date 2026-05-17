/**
 * Tests for the SSE consumer. We never stand up a real HTTP server here —
 * `eventsFromBytes` lets us inject the raw byte stream directly and exercise
 * the parse/decode/timeout pipeline in isolation.
 */
import { Chunk, Effect, Exit, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { eventsFromBytes } from "./sse.js";

const enc = new TextEncoder();
const bytes = (...lines: ReadonlyArray<string>): ReadonlyArray<Uint8Array> =>
  lines.map((l) => enc.encode(l));

const collect = <A, E>(s: Stream.Stream<A, E>): Effect.Effect<ReadonlyArray<A>, E> =>
  Stream.runCollect(s).pipe(Effect.map((c) => Chunk.toReadonlyArray(c)));

describe("eventsFromBytes", () => {
  it("decodes a sequence of well-formed data: lines into AgentEvents", async () => {
    const lines = bytes(
      'data: {"id": 1, "type": "tool_call", "timestamp": "t", "detail": {"tool": "fly"}}\n',
      'data: {"id": 2, "type": "llm_call", "timestamp": "t", "detail": {"usage": {"input": 5, "output": 3}}}\n',
    );
    const result = await Effect.runPromise(
      collect(
        eventsFromBytes({
          profileId: "p",
          body: Stream.fromIterable(lines),
          idleSec: 60,
        }),
      ),
    );
    expect(result.map((e) => e.event)).toEqual(["tool_call", "turn_end"]);
    expect(result[1]?.data["totalTokensIn"]).toBe(5);
    expect(result[1]?.data["totalTokensOut"]).toBe(3);
  });

  it("skips comments, blank lines, and event-type lines", async () => {
    const lines = bytes(
      ":heartbeat\n",
      "\n",
      "event: log\n",
      'data: {"id": 1, "type": "tool_call", "detail": {"tool": "scan"}}\n',
    );
    const result = await Effect.runPromise(
      collect(
        eventsFromBytes({
          profileId: "p",
          body: Stream.fromIterable(lines),
          idleSec: 60,
        }),
      ),
    );
    expect(result.length).toBe(1);
    expect(result[0]?.event).toBe("tool_call");
  });

  it("dedups by entry id even when the prefix is repeated", async () => {
    const lines = bytes(
      'data: {"id": 7, "type": "tool_call", "detail": {"tool": "x"}}\n',
      'data: {"id": 7, "type": "tool_call", "detail": {"tool": "x"}}\n',
      'data: {"id": 8, "type": "tool_call", "detail": {"tool": "y"}}\n',
    );
    const result = await Effect.runPromise(
      collect(
        eventsFromBytes({
          profileId: "p",
          body: Stream.fromIterable(lines),
          idleSec: 60,
        }),
      ),
    );
    expect(result.length).toBe(2);
    expect(result.map((e) => e.data["tool"])).toEqual(["x", "y"]);
  });

  it("fails fast with SseParseError on malformed JSON inside data:", async () => {
    const lines = bytes(
      'data: {"id": 1, "type": "tool_call", "detail": {"tool": "x"}}\n',
      "data: not-json\n",
    );
    const exit = await Effect.runPromiseExit(
      collect(
        eventsFromBytes({
          profileId: "p",
          body: Stream.fromIterable(lines),
          idleSec: 60,
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("SseParseError");
  });

  it("fails with SseIdleTimeout when no chunk arrives within the idle window", async () => {
    // A stream that emits nothing (and never finishes) should hit idle.
    const idleStream: Stream.Stream<Uint8Array, never> = Stream.never;
    const exit = await Effect.runPromiseExit(
      collect(
        eventsFromBytes({
          profileId: "p",
          // safe widen — never stream cannot fail
          body: idleStream as Stream.Stream<
            Uint8Array,
            import("../../errors/index.js").SseConnectionError
          >,
          idleSec: 0.05,
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("SseIdleTimeout");
  });

  it("propagates an SseConnectionError from the underlying body stream", async () => {
    const failing = Stream.fail(
      new (await import("../../errors/index.js")).SseConnectionError({
        profileId: "p",
        cause: "ECONNREFUSED",
      }),
    );
    const exit = await Effect.runPromiseExit(
      collect(
        eventsFromBytes({
          profileId: "p",
          body: failing,
          idleSec: 60,
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("SseConnectionError");
  });
});
