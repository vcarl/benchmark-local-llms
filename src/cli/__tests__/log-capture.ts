/**
 * Test helper: build a `Layer` that replaces the default logger with one
 * that writes each formatted line into a caller-supplied array. Combined with
 * `Logger.minimumLogLevel`, it lets tests assert the log stream at arbitrary
 * levels without touching stderr.
 */
import { Layer, Logger, LogLevel } from "effect";
import { formatLogLine } from "../logger.js";

export const captureLogs = (
  sink: Array<string>,
  minLevel: LogLevel.LogLevel = LogLevel.Debug,
): Layer.Layer<never> => {
  const capture = Logger.make<unknown, void>((options) => {
    sink.push(formatLogLine(options));
  });
  const replace = Logger.replace(Logger.defaultLogger, capture);
  const min = Logger.minimumLogLevel(minLevel);
  return Layer.merge(replace, min);
};
