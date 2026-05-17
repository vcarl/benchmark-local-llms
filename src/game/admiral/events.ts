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
 *   llm_call         | turn_end           | cumulative input/output tokens
 *   error            | error              |
 *   connection       | connection         |
 *   llm_thought      | (dropped)
 *   notification     | (dropped)
 *   system           | (dropped)
 *   server_message   | (dropped)
 */
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
}

const initialState = (): MapperState => ({
  seen: new Set<string>(),
  tick: 0,
  cumulativeIn: 0,
  cumulativeOut: 0,
});

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
      return {
        outcome: {
          kind: "event",
          event: {
            event: "turn_end",
            tick,
            ts,
            data: { totalTokensIn: cumulativeIn, totalTokensOut: cumulativeOut },
          },
        },
        state: { ...baseState, cumulativeIn, cumulativeOut },
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
      // llm_thought, notification, system, server_message, anything else
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
    return { step, state };
  });
