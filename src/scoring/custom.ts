import { Command, type CommandExecutor } from "@effect/platform";
import { Cause, Effect, Option, Stream } from "effect";
import { CodeExecFailed, CodeExecTimeout, ScorerSpawnFailed } from "../errors/index.js";
import type { PromptScore } from "./score-result.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes);

/**
 * Run a challenge-supplied scorer script. Contract: harness writes
 * `{ output, ...meta }` as JSON to stdin; script prints `{ score, breakdown? }`
 * JSON to stdout. Non-zero exit or unparseable stdout -> CodeExecFailed.
 */
export const scoreCustom = (
  output: string,
  scriptPath: string,
  meta: Record<string, unknown>,
  options: { timeoutMs?: number; pythonBin?: string } = {},
): Effect.Effect<
  PromptScore,
  CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pythonBin = options.pythonBin ?? "python3";
    const stdin = JSON.stringify({ output, ...meta });
    const cmd = Command.make(pythonBin, scriptPath).pipe(Command.feed(stdin));

    const collect = Effect.scoped(
      Effect.gen(function* () {
        const process = yield* Command.start(cmd);
        const stdoutP = Stream.runCollect(process.stdout).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const stderrP = Stream.runCollect(process.stderr).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const [out, err, exitCode] = yield* Effect.all([stdoutP, stderrP, process.exitCode], {
          concurrency: "unbounded",
        });
        return { out, err, exitCode };
      }),
    );

    const raced = yield* Effect.timeout(collect, timeoutMs).pipe(
      Effect.map((ok) => ({ tag: "ok" as const, ...ok })),
      Effect.catchTag("TimeoutException", () => Effect.succeed({ tag: "timeout" as const })),
      Effect.catchAllCause((cause) => {
        // Detect spawn failure: platform raises SystemError{reason:"NotFound"} when
        // the interpreter binary is missing from PATH (ENOENT). We must branch here
        // before String(cause) destroys the structured error shape.
        const failure = Cause.failureOption(cause);
        if (Option.isSome(failure)) {
          const e = failure.value as { _tag?: string; reason?: string };
          if (e._tag === "SystemError" && e.reason === "NotFound") {
            return Effect.fail(new ScorerSpawnFailed({ binary: pythonBin, cause: String(e) }));
          }
          return Effect.succeed({ tag: "fail" as const, cause: String(failure.value) });
        }
        // Defect or interrupt — re-raise so scoped cleanup and fiber interruption
        // propagate correctly. Do NOT fold into CodeExecFailed.
        // Cast to Cause<never>: we know this branch has no typed failure (it's a
        // Die or Interrupt), so casting avoids widening the typed error channel.
        return Effect.failCause(cause as Cause.Cause<never>);
      }),
    );

    if (raced.tag === "timeout")
      return yield* Effect.fail(new CodeExecTimeout({ timeoutSec: timeoutMs / 1000 }));
    if (raced.tag === "fail")
      return yield* Effect.fail(new CodeExecFailed({ exitCode: -1, stderr: raced.cause }));
    if (raced.exitCode !== 0)
      return yield* Effect.fail(
        new CodeExecFailed({ exitCode: raced.exitCode, stderr: raced.err.slice(0, 200) }),
      );

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raced.out) as { score: number; breakdown?: unknown },
      catch: () =>
        new CodeExecFailed({
          exitCode: 0,
          stderr: `unparseable scorer output: ${raced.out.slice(0, 120)}`,
        }),
    });
    const score = Math.max(0, Math.min(1, Number(parsed.score)));
    return { kind: "prompt", score, details: `custom: ${score}` };
  });
