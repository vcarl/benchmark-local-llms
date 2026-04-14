/**
 * SSE consumer for Admiral's `/api/profiles/:id/logs?stream=true` endpoint
 * (requirements §1.5 / §3.3 / §5.4).
 *
 * The Python prototype consumes the stream with `urlopen().readline()` which
 * blocks forever if the connection goes idle, defeating every cutoff. We
 * structure the stream so that:
 *   1. The body comes in as `Stream<Uint8Array>` from `@effect/platform`.
 *   2. We decode to text, split lines, and accumulate `data:` lines into
 *      JSON payloads (Admiral emits one JSON object per `data:` line).
 *   3. We schema-decode each payload to {@link AdmiralLogEntryWire} — a
 *      decode failure surfaces as `SseParseError` and is fail-closed.
 *   4. The mapper translates each entry to an `AgentEvent` (or drops it).
 *   5. `Stream.timeoutFail` enforces an idle timeout: if no chunk arrives
 *      for `idleSec` seconds we fail with `SseIdleTimeout`. This is the
 *      structural fix for the readline-blocks-forever bug.
 *
 * The result is `Stream<AgentEvent, SseConnectionError | SseParseError | SseIdleTimeout>`.
 */
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Duration, Effect, Schema, Stream } from "effect";
import { SseConnectionError, SseIdleTimeout, SseParseError } from "../../errors/index.js";
import type { AgentEvent } from "../../schema/execution.js";
import { AdmiralLogEntryWire, type EntryMapper, makeMapper } from "./events.js";

const DATA_PREFIX = "data:";

const decodeWire = Schema.decodeUnknown(AdmiralLogEntryWire);

/**
 * Parse `data:` lines into JSON payloads. SSE comments (`:foo`), event-type
 * lines, and blank separators are skipped. The prototype only ever consumes
 * `data: <json>` lines.
 *
 * Returns one of:
 *   - `{ kind: "json", value }` — payload ready for schema decode
 *   - `{ kind: "skip" }`        — non-data line (comment, blank, event:)
 *   - `{ kind: "parse_error", rawLine }` — `data:` line whose body wasn't JSON
 */
type ParseStep =
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "skip" }
  | { readonly kind: "parse_error"; readonly rawLine: string };

const parseLine = (line: string): ParseStep => {
  const trimmedRight = line.replace(/\r$/, "");
  if (!trimmedRight.startsWith(DATA_PREFIX)) {
    return { kind: "skip" };
  }
  // Strip "data:" plus optional single leading space (per SSE spec).
  const body = trimmedRight.slice(DATA_PREFIX.length).replace(/^ /, "").trim();
  if (body.length === 0) return { kind: "skip" };
  // JSON.parse throws — wrap via Effect.try and pull the result back out.
  // The parse is pure and synchronous, so runSync is safe.
  const attempt = Effect.runSync(
    Effect.try({
      try: () => JSON.parse(body) as unknown,
      catch: () => null,
    }).pipe(Effect.option),
  );
  if (attempt._tag === "None") {
    return { kind: "parse_error", rawLine: trimmedRight };
  }
  return { kind: "json", value: attempt.value };
};

export interface SseStreamParams {
  /** Admiral profile id whose log stream we're consuming. */
  readonly profileId: string;
  /** Base URL for the Admiral server, e.g. `http://127.0.0.1:3031`. */
  readonly admiralBaseUrl: string;
  /** Idle timeout in seconds — fail with `SseIdleTimeout` after this gap. */
  readonly idleSec: number;
}

export interface SseStreamFromBodyParams {
  readonly profileId: string;
  /** Pre-built byte stream — for tests that want to inject raw frames. */
  readonly body: Stream.Stream<Uint8Array, SseConnectionError>;
  readonly idleSec: number;
}

/**
 * Build the parsed event stream from a raw byte stream + an `EntryMapper`.
 * Factored out from {@link consumeAdmiralSse} so tests can drive it with
 * fake bytes via {@link Stream.fromIterable}.
 */
const eventsFromBody = (
  params: SseStreamFromBodyParams,
  mapper: EntryMapper,
): Stream.Stream<AgentEvent, SseConnectionError | SseParseError | SseIdleTimeout> => {
  const { profileId, body, idleSec } = params;

  return body.pipe(
    Stream.decodeText("utf-8"),
    Stream.splitLines,
    Stream.timeoutFail<SseIdleTimeout>(
      () => new SseIdleTimeout({ profileId, idleSec }),
      Duration.seconds(idleSec),
    ),
    // For each line: parse → schema decode → map → maybe emit AgentEvent.
    Stream.mapEffect((line) =>
      Effect.gen(function* () {
        const parsed = parseLine(line);
        if (parsed.kind === "skip") return [] as ReadonlyArray<AgentEvent>;
        if (parsed.kind === "parse_error") {
          return yield* Effect.fail(new SseParseError({ profileId, rawLine: parsed.rawLine }));
        }
        const entry = yield* decodeWire(parsed.value).pipe(
          Effect.mapError(
            () =>
              new SseParseError({
                profileId,
                rawLine: JSON.stringify(parsed.value).slice(0, 400),
              }),
          ),
        );
        const outcome = yield* mapper.step(entry);
        if (outcome.kind === "event") return [outcome.event];
        return [];
      }),
    ),
    Stream.flattenIterables,
  );
};

/**
 * Open the Admiral SSE log stream for a profile and yield mapped
 * {@link AgentEvent}s. The HTTP connection is opened lazily by `Stream`
 * consumption; closing the consumer (scope close, race interrupt) closes
 * the underlying response.
 */
export const consumeAdmiralSse = (
  params: SseStreamParams,
): Stream.Stream<
  AgentEvent,
  SseConnectionError | SseParseError | SseIdleTimeout,
  HttpClient.HttpClient
> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const url = `${params.admiralBaseUrl}/api/profiles/${params.profileId}/logs?stream=true`;
      const request = HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeader("Accept", "text/event-stream"),
      );
      const exec = client.execute(request).pipe(
        Effect.mapError(
          (cause) =>
            new SseConnectionError({
              profileId: params.profileId,
              cause: cause.message ?? String(cause),
            }),
        ),
      );
      const body: Stream.Stream<Uint8Array, SseConnectionError> = HttpClientResponse.stream(
        exec,
      ).pipe(
        Stream.mapError(
          (cause) =>
            new SseConnectionError({
              profileId: params.profileId,
              cause: cause.message ?? String(cause),
            }),
        ),
      );
      const mapper = yield* makeMapper();
      return eventsFromBody({ profileId: params.profileId, body, idleSec: params.idleSec }, mapper);
    }),
  );

/**
 * Test entry-point: build a parsed event stream from arbitrary bytes
 * without involving HttpClient. Test code constructs the byte stream with
 * `Stream.fromIterable` (or `Stream.async` for timing-sensitive cases) and
 * gets back the same `Stream<AgentEvent, …>` shape the production path
 * exposes.
 */
export const eventsFromBytes = (
  params: SseStreamFromBodyParams,
): Stream.Stream<AgentEvent, SseConnectionError | SseParseError | SseIdleTimeout> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const mapper = yield* makeMapper();
      return eventsFromBody(params, mapper);
    }),
  );
