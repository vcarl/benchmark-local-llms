/**
 * `code_exec` scorer — runs the model's Python output against a test file
 * in a sandboxed subprocess and returns 1.0 on pass, 0.0 on fail.
 *
 * Mirrors `runner.py:run_code_with_tests`: concatenates generated code with
 * the scenario's test_code plus a "ALL_TESTS_PASSED" marker, runs it via
 * `python3 -c`, and classifies the outcome by exit status + marker presence.
 *
 * Errors that represent tool failures (subprocess launch failure, timeout)
 * bubble up as typed errors; the run loop decides whether they're fatal
 * or produce a 0 score with an error note.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect, Stream } from "effect";
import { CodeExecFailed, CodeExecTimeout } from "../errors/index.js";
import { extractCode } from "./extract-code.js";
import type { Score } from "./score-result.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const TESTS_PASSED_MARKER = "ALL_TESTS_PASSED";

const buildProgram = (extracted: string, testCode: string): string =>
  `${extracted}\n\n${testCode}\nprint('${TESTS_PASSED_MARKER}')\n`;

const classifyFailure = (stdout: string, stderr: string): string => {
  const lines = stderr.trim().split(/\r?\n/);
  const last = lines[lines.length - 1] ?? "";
  const truncated = last.slice(0, 120);
  if (stderr.includes("AssertionError")) return `assertion failed: ${truncated}`;
  if (stderr.includes("SyntaxError")) return `syntax error: ${truncated}`;
  if (stderr.includes("NameError")) return `name error: ${truncated}`;
  if (truncated.length > 0) return `failed: ${truncated}`;
  const stdoutSnippet = stdout.slice(0, 120);
  return `failed: ${stdoutSnippet}`;
};

export interface CodeExecOptions {
  readonly timeoutMs?: number;
  readonly pythonBin?: string;
}

/**
 * Score a model output against its paired test code. Returns a `Score` with
 * 1.0 on pass / 0.0 on fail, and a details string describing the outcome.
 */
export const scoreCodeExec = (
  output: string,
  testCode: string,
  options: CodeExecOptions = {},
): Effect.Effect<Score, CodeExecTimeout | CodeExecFailed, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pythonBin = options.pythonBin ?? "python3";
    const extracted = extractCode(output);
    const program = buildProgram(extracted, testCode);

    const cmd = Command.make(pythonBin, "-c", program);

    const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes);

    const collect = Effect.scoped(
      Effect.gen(function* () {
        const process = yield* Command.start(cmd);
        const stdoutP = Stream.runCollect(process.stdout).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const stderrP = Stream.runCollect(process.stderr).pipe(
          Effect.map((chunks) => Array.from(chunks).map(decode).join("")),
        );
        const [stdout, stderr, exitCode] = yield* Effect.all([stdoutP, stderrP, process.exitCode], {
          concurrency: "unbounded",
        });
        return { stdout, stderr, exitCode };
      }),
    );

    const raced = yield* Effect.timeout(collect, timeoutMs).pipe(
      Effect.map((ok) => ({ tag: "ok" as const, ...ok })),
      Effect.catchTag("TimeoutException", () => Effect.succeed({ tag: "timeout" as const })),
      Effect.catchAll((cause) =>
        Effect.succeed({ tag: "launch-fail" as const, cause: String(cause) }),
      ),
    );

    if (raced.tag === "timeout") {
      return yield* Effect.fail(new CodeExecTimeout({ timeoutSec: timeoutMs / 1000 }));
    }
    if (raced.tag === "launch-fail") {
      return yield* Effect.fail(new CodeExecFailed({ exitCode: -1, stderr: raced.cause }));
    }

    const { stdout, stderr, exitCode } = raced;
    if (exitCode === 0 && stdout.includes(TESTS_PASSED_MARKER)) {
      return { score: 1.0, details: "all tests passed" };
    }
    return { score: 0.0, details: classifyFailure(stdout, stderr) };
  });
