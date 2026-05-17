/**
 * Custom logger for llm-bench. Writes a compact one-line format to stderr at
 * a minimum level controlled by the `--verbose` flag. See
 * `docs/superpowers/specs/2026-04-17-stdout-observability-design.md` for the
 * format contract.
 *
 * Allowed to use `console.error` — this module lives under `src/cli/` which
 * `scripts/lint-strict.sh` whitelists.
 */
import { Cause, HashMap, Layer, Logger, LogLevel } from "effect";

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const formatTimestamp = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

const LEVEL_TAG: Record<string, string> = {
  All: "ALL",
  Fatal: "FTL",
  Error: "ERR",
  Warning: "WRN",
  Info: "INF",
  Debug: "DBG",
  Trace: "TRC",
  None: "NON",
};

const levelTag = (level: LogLevel.LogLevel): string => LEVEL_TAG[level._tag] ?? level._tag;

const stringifyAnnotation = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const renderAnnotation = (key: string, value: unknown): string => {
  const str = stringifyAnnotation(value);
  if (/[\s"=]/.test(str)) {
    return `${key}="${str.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${str}`;
};

/**
 * Exposed for testing. The real logger (below) formats each log entry with
 * this function and writes to stderr.
 *
 * Recognized special annotation: `scope` is consumed into the prefix (it
 * controls the `scope | ` section before the message). Everything else is
 * appended as ` k=v` after the message.
 */
export const formatLogLine = (options: Logger.Logger.Options<unknown>): string => {
  const ts = formatTimestamp(options.date);
  const tag = levelTag(options.logLevel);
  const annotationEntries = Array.from(HashMap.entries(options.annotations));
  const scopeEntry = annotationEntries.find(([k]) => k === "scope");
  const scope = scopeEntry !== undefined ? stringifyAnnotation(scopeEntry[1]) : "app";
  const remaining = annotationEntries
    .filter(([k]) => k !== "scope")
    .map(([k, v]) => renderAnnotation(k, v))
    .join(" ");
  const message = typeof options.message === "string" ? options.message : String(options.message);
  // Multi-line messages (e.g. the end-of-model summary block) are pre-formatted
  // blocks; appending `k=v` to their last line scrambles the layout. Render
  // those as-is and let the caller include any annotation-like content it
  // wants inside the block body.
  const suffix = remaining.length > 0 && !message.includes("\n") ? ` ${remaining}` : "";
  // Unhandled failures surfaced by NodeRuntime.runMain arrive with an empty
  // message and the real info in `cause`. Without this, all we'd print is
  // `ERR app |` with no body.
  const causeStr = Cause.isEmpty(options.cause) ? "" : `\n${Cause.pretty(options.cause)}`;
  return `${ts} ${tag} ${scope} | ${message}${suffix}${causeStr}`;
};

const stderrLogger = Logger.make<unknown, void>((options) => {
  // Writing to stderr via console.error. The `lint-strict.sh` allowlist
  // permits this inside `src/cli/`.
  console.error(formatLogLine(options));
});

/**
 * Build a logger layer that replaces the default logger with our compact
 * stderr formatter and sets the minimum log level based on `verbose`.
 *
 * Unset → `LogLevel.Info`. Set → `LogLevel.Debug`.
 */
export const makeLoggerLayer = (verbose: boolean): Layer.Layer<never> =>
  Layer.mergeAll(
    // `defaultLogger` is what Effect registers in test / direct-runPromise
    // contexts. `@effect/platform`'s runMain swaps it for `prettyLoggerDefault`
    // before our layer runs — so we target both. Each `replace` is a
    // remove+add; whichever wasn't present no-ops the remove, and HashSet
    // dedupes the add. Result: only `stderrLogger` + `tracerLogger` remain.
    Logger.replace(Logger.defaultLogger, stderrLogger),
    Logger.replace(Logger.prettyLoggerDefault, stderrLogger),
    Logger.minimumLogLevel(verbose ? LogLevel.Debug : LogLevel.Info),
  );
