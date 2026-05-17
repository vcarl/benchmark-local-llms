/**
 * Admiral log entry → AgentEvent mapping (requirements §5.4).
 *
 * Mirrors `admiral_runner.py::AdmiralLogStream._map_entry` exactly — we must
 * preserve event ordering and dedup behaviour byte-for-byte so the F2 archive
 * re-score migration produces the same output as the Python prototype.
 *
 * Mapping table (§5.4):
 *   Admiral type     | AgentEvent.event   | Notes
 *   tool_call        | tool_call          | tool name from detail.tool / detail.name / summary
 *   tool_result      | tool_result        | success path
 *   tool_result(err) | tool_error         | detail.status === "error" or "error" in summary
 *   llm_call         | turn_end           | cumulative input/output tokens; detail body passed through alongside totals
 *   error            | error              |
 *   connection       | connection         |
 *   llm_thought      | llm_thought        | summary + detail body preserved for diagnostics
 *   notification     | (dropped)
 *   system           | (dropped)
 *   server_message   | (dropped)
 */
import { createHash } from "node:crypto";
import { Effect, Option, Ref, Schema } from "effect";
import type { AgentEvent } from "../../schema/execution.js";

/**
 * Wire schema for one Admiral log entry as delivered on the SSE `data:` line.
 * The prototype tolerates a wide range of shapes: `id` may be number or
 * string (or absent), `detail` may be a JSON string or object, `usage` lives
 * inside `detail`. We schema-decode loosely (`Schema.Unknown`) and pull
 * fields by hand so a single oddly-shaped payload doesn't kill the stream.
 */
export const AdmiralLogEntryWire = Schema.Struct({
  id: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  type: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.Unknown),
});
export type AdmiralLogEntryWire = typeof AdmiralLogEntryWire.Type;

/** Cumulative token totals carried across `llm_call` events. */
export interface TokenAccumulator {
  readonly cumulativeIn: number;
  readonly cumulativeOut: number;
}

/** Outcome of mapping one wire entry: a typed event, or skip with reason. */
export type MapOutcome =
  | { readonly kind: "event"; readonly event: AgentEvent }
  | { readonly kind: "duplicate"; readonly id: string }
  | { readonly kind: "skipped"; readonly type: string };

interface MapperState {
  readonly seen: Set<string>;
  readonly tick: number;
  readonly cumulativeIn: number;
  readonly cumulativeOut: number;
  /**
   * Per-row blob pool used to dedup `messages` payloads inside
   * `turn_end.data.context`. A `Map` for ordered iteration in tests; the
   * caller serializes to a plain `Record` at emit time.
   */
  readonly blobPool: Map<string, unknown>;
}

const initialState = (): MapperState => ({
  seen: new Set<string>(),
  tick: 0,
  cumulativeIn: 0,
  cumulativeOut: 0,
  blobPool: new Map<string, unknown>(),
});

/**
 * Stable JSON encoding: object keys sorted ascending, no whitespace. Arrays
 * keep input order. Identical to the one used by the one-shot migration
 * script in commit 1 so production-emitted hashes match migrated archives.
 */
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(",")}}`;
};

const hashBlob = (value: unknown): string =>
  createHash("sha256").update(canonicalize(value)).digest("hex");

/**
 * Intern `value` into `state.blobPool`. Returns the existing hash on cache
 * hit; otherwise extends the pool with a fresh entry. The returned state
 * shares the same pool instance — we mutate the Map in place because each
 * `stepMapper` call already builds a fresh state object and the pool is
 * tied to that state's lifecycle.
 */
export const internBlob = (
  state: MapperState,
  value: unknown,
): { readonly hash: string; readonly state: MapperState } => {
  const hash = hashBlob(value);
  if (state.blobPool.has(hash)) return { hash, state };
  const next = new Map(state.blobPool);
  next.set(hash, value);
  return { hash, state: { ...state, blobPool: next } };
};

/**
 * Coerce `detail` (JSON string or object or undefined) to a plain record.
 *
 * The Python prototype accepts both: SQLite-stored entries arrive as JSON
 * strings, in-memory entries arrive as dicts. We mirror that tolerance.
 *
 * Lint disallows try/catch so we route the parse through `Effect.try` and
 * pull the result back out synchronously — `JSON.parse` is pure and never
 * suspends, so `runSync` is safe here.
 */
const coerceDetail = (raw: unknown): Record<string, unknown> => {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const parseAttempt = Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: () => raw,
    }).pipe(Effect.orElseSucceed(() => raw as unknown));
    const parsed = Effect.runSync(parseAttempt);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { raw };
  }
  return { raw };
};

const idToString = (id: AdmiralLogEntryWire["id"]): Option.Option<string> => {
  if (id === undefined) return Option.none();
  return Option.some(typeof id === "number" ? String(id) : id);
};

const stringFromDetail = (
  detail: Record<string, unknown>,
  ...keys: ReadonlyArray<string>
): string => {
  for (const k of keys) {
    const v = detail[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
};

const intFromUsage = (usage: unknown, key: string): number => {
  if (!usage || typeof usage !== "object") return 0;
  const v = (usage as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
};

interface MapResult {
  readonly outcome: MapOutcome;
  readonly state: MapperState;
}

/**
 * Pure (state, entry) -> (outcome, state) reducer. Used by the mapper
 * factory below; exposed for unit tests so we can drive it without
 * standing up a Ref.
 */
export const stepMapper = (state: MapperState, entry: AdmiralLogEntryWire): MapResult => {
  const idOpt = idToString(entry.id);
  if (Option.isSome(idOpt) && state.seen.has(idOpt.value)) {
    return {
      outcome: { kind: "duplicate", id: idOpt.value },
      state,
    };
  }

  const seen = Option.match(idOpt, {
    onNone: () => state.seen,
    onSome: (id) => {
      const next = new Set(state.seen);
      next.add(id);
      return next;
    },
  });

  const ts = entry.timestamp ?? "";
  const summary = entry.summary ?? "";
  const type = entry.type ?? "";
  const detail = coerceDetail(entry.detail);
  const tick = state.tick + 1;

  const baseState: MapperState = { ...state, seen, tick };

  switch (type) {
    case "tool_call": {
      const tool = stringFromDetail(detail, "tool", "name") || summary || "?";
      return {
        outcome: {
          kind: "event",
          event: {
            event: "tool_call",
            tick,
            ts,
            data: { tool, ...detail },
          },
        },
        state: baseState,
      };
    }
    case "tool_result": {
      const tool = stringFromDetail(detail, "tool", "name") || summary || "?";
      const status = stringFromDetail(detail, "status");
      const isError = status === "error" || summary.toLowerCase().includes("error");
      return {
        outcome: {
          kind: "event",
          event: {
            event: isError ? "tool_error" : "tool_result",
            tick,
            ts,
            data: { tool, ...detail },
          },
        },
        state: baseState,
      };
    }
    case "llm_call": {
      const usage = detail["usage"];
      const cumulativeIn = state.cumulativeIn + intFromUsage(usage, "input");
      const cumulativeOut = state.cumulativeOut + intFromUsage(usage, "output");

      // Dedup `detail.context.messages` into the row-scoped blob pool. The
      // admiral runner emits context as `{ messageCount, estimatedTokens,
      // systemPromptTokens, messages }` — only `messages` is volume-heavy
      // (97% of event bytes on long scenarios). Rewrite context in place
      // to replace `messages` with `messagesRef: string[]`. Other context
      // fields pass through unchanged. If `context` is absent or has no
      // `messages` array, the detail is passed through verbatim.
      const rawContext = detail["context"];
      let nextState: MapperState = baseState;
      let rewrittenDetail: Record<string, unknown> = detail;

      if (
        rawContext !== null &&
        typeof rawContext === "object" &&
        !Array.isArray(rawContext) &&
        Array.isArray((rawContext as Record<string, unknown>)["messages"])
      ) {
        const ctx = rawContext as Record<string, unknown>;
        const messages = ctx["messages"] as ReadonlyArray<unknown>;
        const refs: string[] = [];
        for (const msg of messages) {
          const r = internBlob(nextState, msg);
          nextState = r.state;
          refs.push(r.hash);
        }
        const { messages: _drop, ...ctxRest } = ctx;
        const newContext = { ...ctxRest, messagesRef: refs };
        rewrittenDetail = { ...detail, context: newContext };
      }

      return {
        outcome: {
          kind: "event",
          event: {
            event: "turn_end",
            tick,
            ts,
            data: {
              ...rewrittenDetail,
              totalTokensIn: cumulativeIn,
              totalTokensOut: cumulativeOut,
            },
          },
        },
        state: { ...nextState, cumulativeIn, cumulativeOut },
      };
    }
    case "llm_thought": {
      return {
        outcome: {
          kind: "event",
          event: {
            event: "llm_thought",
            tick,
            ts,
            data: { summary, ...detail },
          },
        },
        state: baseState,
      };
    }
    case "error": {
      return {
        outcome: {
          kind: "event",
          event: {
            event: "error",
            tick,
            ts,
            data: { summary, ...detail },
          },
        },
        state: baseState,
      };
    }
    case "connection": {
      return {
        outcome: {
          kind: "event",
          event: {
            event: "connection",
            tick,
            ts,
            data: { summary },
          },
        },
        state: baseState,
      };
    }
    default:
      // notification, system, server_message, anything else
      // — drop, but still consume the id so we don't accept it later.
      return {
        outcome: { kind: "skipped", type },
        state: baseState,
      };
  }
};

export interface EntryMapper {
  /**
   * Step a single decoded wire entry through the mapper. Returns either an
   * `AgentEvent` to emit, a duplicate marker (already seen `id`), or a
   * skipped-type marker.
   */
  readonly step: (entry: AdmiralLogEntryWire) => Effect.Effect<MapOutcome>;
  /** For tests: read the running state. */
  readonly state: Effect.Effect<MapperState>;
  /**
   * Snapshot the finalized blob pool when the stream completes. Callers
   * convert this to a plain `Record<string, unknown>` for the archive row's
   * `blobPool` field. Returned as a `ReadonlyMap` to preserve insertion order
   * (matches `Map` iteration semantics used by tests).
   */
  readonly pool: Effect.Effect<ReadonlyMap<string, unknown>>;
}

/**
 * Factory: build a stateful mapper backed by a `Ref`. One instance per SSE
 * connection — re-opening the connection should NOT share dedup state with
 * a stale stream.
 */
export const makeMapper = (): Effect.Effect<EntryMapper> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<MapperState>(initialState());
    const step = (entry: AdmiralLogEntryWire): Effect.Effect<MapOutcome> =>
      Ref.modify(ref, (state) => {
        const result = stepMapper(state, entry);
        return [result.outcome, result.state] as const;
      });
    const state: Effect.Effect<MapperState> = Ref.get(ref);
    const pool: Effect.Effect<ReadonlyMap<string, unknown>> = Effect.map(
      Ref.get(ref),
      (s) => s.blobPool as ReadonlyMap<string, unknown>,
    );
    return { step, state, pool };
  });
