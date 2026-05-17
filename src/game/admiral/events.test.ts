import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { type AdmiralLogEntryWire, makeMapper, stepMapper } from "./events.js";

const initialState = () => ({
  seen: new Set<string>(),
  tick: 0,
  cumulativeIn: 0,
  cumulativeOut: 0,
});

describe("stepMapper", () => {
  it("maps tool_call entries with tool name from detail.tool", () => {
    const result = stepMapper(initialState(), {
      id: 1,
      type: "tool_call",
      timestamp: "2026-01-01T00:00:00Z",
      summary: "fly",
      detail: { tool: "fly_to", args: { system: "Sol" } },
    });
    expect(result.outcome.kind).toBe("event");
    if (result.outcome.kind !== "event") return;
    expect(result.outcome.event.event).toBe("tool_call");
    expect(result.outcome.event.tick).toBe(1);
    expect(result.outcome.event.ts).toBe("2026-01-01T00:00:00Z");
    expect(result.outcome.event.data["tool"]).toBe("fly_to");
    expect(result.outcome.event.data["args"]).toEqual({ system: "Sol" });
  });

  it("falls back to detail.name then summary then '?' for the tool name", () => {
    const fromName = stepMapper(initialState(), {
      id: "a",
      type: "tool_call",
      detail: { name: "scan" },
    });
    if (fromName.outcome.kind !== "event") return;
    expect(fromName.outcome.event.data["tool"]).toBe("scan");

    const fromSummary = stepMapper(initialState(), {
      id: "b",
      type: "tool_call",
      summary: "dock",
    });
    if (fromSummary.outcome.kind !== "event") return;
    expect(fromSummary.outcome.event.data["tool"]).toBe("dock");

    const fallback = stepMapper(initialState(), {
      id: "c",
      type: "tool_call",
    });
    if (fallback.outcome.kind !== "event") return;
    expect(fallback.outcome.event.data["tool"]).toBe("?");
  });

  it("classifies tool_result with status='error' as tool_error", () => {
    const result = stepMapper(initialState(), {
      id: 2,
      type: "tool_result",
      detail: { tool: "fly_to", status: "error", error: "no fuel" },
    });
    if (result.outcome.kind !== "event") return;
    expect(result.outcome.event.event).toBe("tool_error");
  });

  it("classifies tool_result with 'error' in summary as tool_error", () => {
    const result = stepMapper(initialState(), {
      id: 3,
      type: "tool_result",
      summary: "Tool ERROR: cooldown",
      detail: { tool: "scan" },
    });
    if (result.outcome.kind !== "event") return;
    expect(result.outcome.event.event).toBe("tool_error");
  });

  it("classifies a clean tool_result as tool_result", () => {
    const result = stepMapper(initialState(), {
      id: 4,
      type: "tool_result",
      summary: "ok",
      detail: { tool: "scan", status: "success" },
    });
    if (result.outcome.kind !== "event") return;
    expect(result.outcome.event.event).toBe("tool_result");
  });

  it("accumulates llm_call usage into cumulative totalTokensIn/Out", () => {
    let state = initialState();
    const r1 = stepMapper(state, {
      id: 10,
      type: "llm_call",
      detail: { usage: { input: 100, output: 30 } },
    });
    state = r1.state;
    if (r1.outcome.kind !== "event") return;
    expect(r1.outcome.event.event).toBe("turn_end");
    expect(r1.outcome.event.data["totalTokensIn"]).toBe(100);
    expect(r1.outcome.event.data["totalTokensOut"]).toBe(30);

    const r2 = stepMapper(state, {
      id: 11,
      type: "llm_call",
      detail: { usage: { input: 50, output: 20 } },
    });
    if (r2.outcome.kind !== "event") return;
    expect(r2.outcome.event.data["totalTokensIn"]).toBe(150);
    expect(r2.outcome.event.data["totalTokensOut"]).toBe(50);
  });

  it("handles detail-as-JSON-string (SQLite-stored entries)", () => {
    const result = stepMapper(initialState(), {
      id: 20,
      type: "llm_call",
      detail: '{"usage": {"input": 7, "output": 3}}',
    });
    if (result.outcome.kind !== "event") return;
    expect(result.outcome.event.data["totalTokensIn"]).toBe(7);
    expect(result.outcome.event.data["totalTokensOut"]).toBe(3);
  });

  it("maps error and connection types straight through", () => {
    const errEvt = stepMapper(initialState(), {
      id: 30,
      type: "error",
      summary: "boom",
      detail: { code: 500 },
    });
    if (errEvt.outcome.kind !== "event") return;
    expect(errEvt.outcome.event.event).toBe("error");
    expect(errEvt.outcome.event.data["summary"]).toBe("boom");
    expect(errEvt.outcome.event.data["code"]).toBe(500);

    const connEvt = stepMapper(initialState(), {
      id: 31,
      type: "connection",
      summary: "online",
    });
    if (connEvt.outcome.kind !== "event") return;
    expect(connEvt.outcome.event.event).toBe("connection");
    expect(connEvt.outcome.event.data["summary"]).toBe("online");
  });

  it("drops llm_thought, notification, system, server_message", () => {
    for (const type of ["llm_thought", "notification", "system", "server_message"]) {
      const r = stepMapper(initialState(), { id: type, type });
      expect(r.outcome.kind).toBe("skipped");
      if (r.outcome.kind !== "skipped") return;
      expect(r.outcome.type).toBe(type);
    }
  });

  it("ticks monotonically across all entry types — even skipped ones consume a tick", () => {
    let state = initialState();
    const types: Array<AdmiralLogEntryWire> = [
      { id: 1, type: "llm_thought" },
      { id: 2, type: "tool_call", detail: { tool: "x" } },
      { id: 3, type: "system" },
      { id: 4, type: "tool_call", detail: { tool: "y" } },
    ];
    const ticks: number[] = [];
    for (const e of types) {
      const r = stepMapper(state, e);
      state = r.state;
      if (r.outcome.kind === "event") ticks.push(r.outcome.event.tick);
    }
    expect(ticks).toEqual([2, 4]);
  });
});

describe("makeMapper", () => {
  it("dedupes by entry id across calls", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const m = yield* makeMapper();
        const first = yield* m.step({
          id: 1,
          type: "tool_call",
          detail: { tool: "fly" },
        });
        const dup = yield* m.step({
          id: 1,
          type: "tool_call",
          detail: { tool: "fly" },
        });
        const fresh = yield* m.step({
          id: 2,
          type: "tool_call",
          detail: { tool: "scan" },
        });
        return { first, dup, fresh };
      }),
    );
    expect(result.first.kind).toBe("event");
    expect(result.dup.kind).toBe("duplicate");
    expect(result.fresh.kind).toBe("event");
  });

  it("treats numeric and string ids as the same dedup key", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const m = yield* makeMapper();
        const first = yield* m.step({
          id: 42,
          type: "tool_call",
          detail: { tool: "x" },
        });
        const dup = yield* m.step({
          id: "42",
          type: "tool_call",
          detail: { tool: "x" },
        });
        return { first, dup };
      }),
    );
    expect(result.first.kind).toBe("event");
    expect(result.dup.kind).toBe("duplicate");
  });

  it("does not dedup entries without an id", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const m = yield* makeMapper();
        const a = yield* m.step({ type: "tool_call", detail: { tool: "x" } });
        const b = yield* m.step({ type: "tool_call", detail: { tool: "x" } });
        return { a, b };
      }),
    );
    expect(result.a.kind).toBe("event");
    expect(result.b.kind).toBe("event");
  });
});
