/**
 * Tolerant parse for stored scorer-content blobs. A now-fixed serializer bug
 * (pre-74c10cd `stableStringify`) wrote the optional `caseSensitive` field as
 * the bare token `undefined` for the `set_match`/`ordered_match` scorers, e.g.
 *   {"caseSensitive":undefined,"expected":[...],"vocabulary":[...]}
 * which is invalid JSON, so reconstruction throws and the affected attempts
 * never get drilldown detail files. The serializer now omits the key entirely;
 * this recovers the handful of already-archived corrupt blobs to match.
 */
import { Effect } from "effect";

const tryParse = (s: string): Effect.Effect<unknown, unknown> =>
  Effect.try(() => JSON.parse(s) as unknown);

/** Strip `"<key>":undefined` properties so the blob matches the fixed serializer. */
const sanitize = (raw: string): string =>
  raw
    // Drop `"<key>":undefined` segments (with any trailing comma).
    .replace(/"[^"]+"\s*:\s*undefined\s*,?/g, "")
    // Clean a dangling comma left before a closing brace/bracket.
    .replace(/,(\s*[}\]])/g, "$1");

/**
 * Parse a stored scorer-content blob, tolerating the legacy `:undefined`
 * corruption. Valid JSON takes the untouched happy path. Only on a parse
 * failure do we strip any property whose value is the bare `undefined` token —
 * dropping the key entirely (NOT setting it to null, which the scorer schema's
 * `optional(boolean)` would reject) — and retry. If the sanitized string still
 * fails to parse, the ORIGINAL error is surfaced so unrelated corruption is not
 * masked.
 */
export const parseScorerContentTolerant = (raw: string): unknown =>
  Effect.runSync(
    tryParse(raw).pipe(
      Effect.catchAll((originalError) =>
        tryParse(sanitize(raw)).pipe(Effect.catchAll(() => Effect.fail(originalError))),
      ),
    ),
  );
