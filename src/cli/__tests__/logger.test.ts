import {
  Cause,
  FiberId,
  FiberRefs,
  HashMap,
  List,
  type Logger,
  LogLevel,
  type LogSpan,
} from "effect";
import { describe, expect, it } from "vitest";
import { formatLogLine } from "../logger.js";

const makeOptions = (args: {
  message: string;
  level: LogLevel.LogLevel;
  annotations?: ReadonlyArray<readonly [string, unknown]>;
  date?: Date;
}): Logger.Logger.Options<unknown> => ({
  fiberId: FiberId.none,
  logLevel: args.level,
  message: args.message,
  cause: Cause.empty,
  context: FiberRefs.unsafeMake(new Map()),
  spans: List.empty<LogSpan.LogSpan>(),
  annotations: HashMap.fromIterable(args.annotations ?? []),
  date: args.date ?? new Date("2026-04-17T15:07:42.000Z"),
});

describe("formatLogLine", () => {
  it("renders HH:MM:SS level scope | message with annotations", () => {
    const line = formatLogLine(
      makeOptions({
        message: "prompt 3/40 code_4 @0.7 → 127 gen tok, 18.3 tps gen, 142 tps prompt, 6.9s",
        level: LogLevel.Info,
        annotations: [
          ["scope", "prompt"],
          ["model", "qwen3.5-9b"],
          ["runtime", "mlx"],
        ],
      }),
    );
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} INF prompt \| prompt 3\/40 code_4 @0.7/);
    expect(line).toContain("model=qwen3.5-9b");
    expect(line).toContain("runtime=mlx");
    expect(line).not.toContain("scope="); // scope is consumed into the prefix
  });

  it("uses DBG/WRN/ERR for non-info levels", () => {
    const dbg = formatLogLine(makeOptions({ message: "x", level: LogLevel.Debug }));
    const wrn = formatLogLine(makeOptions({ message: "x", level: LogLevel.Warning }));
    const err = formatLogLine(makeOptions({ message: "x", level: LogLevel.Error }));
    expect(dbg).toContain(" DBG ");
    expect(wrn).toContain(" WRN ");
    expect(err).toContain(" ERR ");
  });

  it("falls back to 'app' scope when the scope annotation is missing", () => {
    const line = formatLogLine(makeOptions({ message: "hello", level: LogLevel.Info }));
    expect(line).toMatch(/INF app \| hello$/);
  });

  it("escapes annotation values containing spaces by quoting", () => {
    const line = formatLogLine(
      makeOptions({
        message: "m",
        level: LogLevel.Info,
        annotations: [["note", "has spaces"]],
      }),
    );
    expect(line).toContain(`note="has spaces"`);
  });
});
