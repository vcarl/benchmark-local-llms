import { createHash } from "node:crypto";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { type AdmiralLogEntryWire, internBlob, makeMapper, stepMapper } from "./events.js";

const initialState = () => ({
  seen: new Set<string>(),
  tick: 0,
  cumulativeIn: 0,
  cumulativeOut: 0,
  blobPool: new Map<string, unknown>(),
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
      detail: { usage: { input: 100, output: 30 }, response: "I will check the market." },
    });
    state = r1.state;
    if (r1.outcome.kind !== "event") return;
    expect(r1.outcome.event.event).toBe("turn_end");
    expect(r1.outcome.event.data["totalTokensIn"]).toBe(100);
    expect(r1.outcome.event.data["totalTokensOut"]).toBe(30);
    expect(r1.outcome.event.data["response"]).toBe("I will check the market.");
    expect(r1.outcome.event.data["usage"]).toEqual({ input: 100, output: 30 });

    const r2 = stepMapper(state, {
      id: 11,
      type: "llm_call",
      detail: { usage: { input: 50, output: 20 } },
    });
    if (r2.outcome.kind !== "event") return;
    expect(r2.outcome.event.data["totalTokensIn"]).toBe(150);
    expect(r2.outcome.event.data["totalTokensOut"]).toBe(50);
  });

  it("dedups identical context.messages across turns into the blob pool", () => {
    // Two llm_call turns. Turn 1 sends one message; turn 2 re-sends the same
    // message plus a new one. The pool should grow only when the content
    // genuinely changes — turn 1 → 1 entry, turn 2 → 2 entries — and the
    // messagesRef arrays should overlap on the shared hash. Mirrors the
    // production admiral shape where messages live under `data.context`.
    const m1 = { role: "user", content: "hi" };
    const m2 = { role: "assistant", content: "hello" };

    let state = initialState();
    const r1 = stepMapper(state, {
      id: 100,
      type: "llm_call",
      detail: {
        usage: { input: 1, output: 1 },
        context: { messageCount: 1, estimatedTokens: 5, systemPromptTokens: 100, messages: [m1] },
      },
    });
    state = r1.state;
    if (r1.outcome.kind !== "event") return;
    const ctx1 = r1.outcome.event.data["context"] as Record<string, unknown>;
    const refs1 = ctx1["messagesRef"] as string[];
    expect(refs1).toHaveLength(1);
    expect("messages" in ctx1).toBe(false);
    expect(ctx1["messageCount"]).toBe(1);
    expect(state.blobPool.size).toBe(1);

    const r2 = stepMapper(state, {
      id: 101,
      type: "llm_call",
      detail: {
        usage: { input: 1, output: 1 },
        context: {
          messageCount: 2,
          estimatedTokens: 10,
          systemPromptTokens: 100,
          messages: [m1, m2],
        },
      },
    });
    state = r2.state;
    if (r2.outcome.kind !== "event") return;
    const ctx2 = r2.outcome.event.data["context"] as Record<string, unknown>;
    const refs2 = ctx2["messagesRef"] as string[];
    expect(refs2).toHaveLength(2);
    // Shared first message: same hash across turns.
    expect(refs2[0]).toBe(refs1[0]);
    // Pool grew by exactly one new entry.
    expect(state.blobPool.size).toBe(2);
  });

  it("passes turn_end through unchanged when context is absent", () => {
    const result = stepMapper(initialState(), {
      id: 300,
      type: "llm_call",
      detail: { usage: { input: 1, output: 0 } },
    });
    if (result.outcome.kind !== "event") return;
    expect("context" in result.outcome.event.data).toBe(false);
    expect("messagesRef" in result.outcome.event.data).toBe(false);
    expect(result.state.blobPool.size).toBe(0);
  });

  it("passes turn_end through unchanged when context has no messages array", () => {
    const result = stepMapper(initialState(), {
      id: 301,
      type: "llm_call",
      detail: {
        usage: { input: 1, output: 0 },
        context: { messageCount: 0, estimatedTokens: 0, systemPromptTokens: 100 },
      },
    });
    if (result.outcome.kind !== "event") return;
    const ctx = result.outcome.event.data["context"] as Record<string, unknown>;
    expect("messagesRef" in ctx).toBe(false);
    expect("messages" in ctx).toBe(false);
    expect(result.state.blobPool.size).toBe(0);
  });

  it("hashes via canonical JSON: identical content with shuffled keys hits the cache", () => {
    // internBlob is exported for direct testing — confirms the canonical
    // hashing matches commit 1's migration script (full SHA-256 hex over
    // stable-keyed JSON), so production-emitted refs line up with migrated
    // archive refs.
    const state = initialState();
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    const r1 = internBlob(state, a);
    const r2 = internBlob(r1.state, b);
    expect(r1.hash).toBe(r2.hash);
    expect(r2.state.blobPool.size).toBe(1);
    // Sanity: the hash is the SHA-256 hex of canonical JSON.
    const expected = createHash("sha256").update('{"x":1,"y":2}').digest("hex");
    expect(r1.hash).toBe(expected);
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

  it("drops notification, system, server_message", () => {
    for (const type of ["notification", "system", "server_message"]) {
      const r = stepMapper(initialState(), { id: type, type });
      expect(r.outcome.kind).toBe("skipped");
      if (r.outcome.kind !== "skipped") return;
      expect(r.outcome.type).toBe(type);
    }
  });

  it("maps llm_thought entries with summary and detail body preserved", () => {
    const r = stepMapper(initialState(), {
      id: 50,
      type: "llm_thought",
      summary: "considering market prices",
      detail: { text: "Prices in Sol-3 are up 15% on iron ore...", confidence: 0.8 },
    });
    expect(r.outcome.kind).toBe("event");
    if (r.outcome.kind !== "event") return;
    expect(r.outcome.event.event).toBe("llm_thought");
    expect(r.outcome.event.data["summary"]).toBe("considering market prices");
    expect(r.outcome.event.data["text"]).toBe("Prices in Sol-3 are up 15% on iron ore...");
    expect(r.outcome.event.data["confidence"]).toBe(0.8);
  });

  it("ticks monotonically across all entry types — even skipped ones consume a tick", () => {
    let state = initialState();
    const types: Array<AdmiralLogEntryWire> = [
      { id: 1, type: "system" },
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

  it("exposes the finalized blob pool via mapper.pool", async () => {
    // After streaming two llm_call entries that share their message, the pool
    // should carry exactly one unique message — confirms cross-entry dedup
    // through the Ref-backed mapper.
    const m1 = { role: "user", content: "go" };
    const ctx = (messageCount: number) => ({
      messageCount,
      estimatedTokens: 5,
      systemPromptTokens: 100,
      messages: [m1],
    });
    const pool = await Effect.runPromise(
      Effect.gen(function* () {
        const m = yield* makeMapper();
        yield* m.step({
          id: 1,
          type: "llm_call",
          detail: { usage: { input: 1, output: 1 }, context: ctx(1) },
        });
        yield* m.step({
          id: 2,
          type: "llm_call",
          detail: { usage: { input: 1, output: 1 }, context: ctx(1) },
        });
        return yield* m.pool;
      }),
    );
    expect(pool.size).toBe(1);
  });
});
