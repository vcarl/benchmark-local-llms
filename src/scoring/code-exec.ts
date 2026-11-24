/**
 * `code_exec` scorer — runs the model's Python output against a test file
 * in the isolated runner (`sandbox.ts`) and returns 1.0 on pass, 0.0 on fail.
 *
 * Concatenates generated code with the scenario's test_code plus an
 * "ALL_TESTS_PASSED" marker, feeds it to `python3 -` in the sandbox, and
 * classifies the outcome by exit status + marker presence.
 *
 * Submitted code that outlives its budget scores 0 like code that raises.
 * Errors that represent tool failures (runner unavailable, a sandbox fault)
 * bubble up as typed errors; `scoreOrFold` folds them into a `scorer_error` 0.
 */
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { CodeExecFailed, ScorerSpawnFailed } from "../errors/index.js";
import { extractCode } from "./extract-code.js";
import { runSandboxed } from "./sandbox.js";
import { asFormatFlaw, type PromptScore } from "./score-result.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const TESTS_PASSED_MARKER = "ALL_TESTS_PASSED";
/** SIGKILL: the memory limit, or a payload that ignored the timeout's SIGTERM. */
const KILLED_EXIT = 137;

const buildProgram = (extracted: string, testCode: string): string =>
  `${extracted}\n\n${testCode}\nprint('${TESTS_PASSED_MARKER}')\n`;

const escapeRegExp = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/**
 * Submission mode: the first ```<lang> fenced block, as asked. Any looser
 * reading is a format flaw: the text after the tag on a ```<lang> fence line
 * (through the closing fence), else the first unlabeled fence, else the whole
 * trimmed output. Bound as a Python string, never run.
 */
export const extractSubmission = (
  output: string,
  lang: string,
): { readonly text: string; readonly formatFlaw: boolean } => {
  const tag = escapeRegExp(lang);
  const fenced = new RegExp(`\`\`\`${tag}[ \\t]*\\r?\\n([\\s\\S]*?)\`\`\``).exec(output)?.[1];
  if (fenced !== undefined) return { text: fenced.trim(), formatFlaw: false };
  const loose =
    new RegExp(`\`\`\`${tag}[ \\t]+(\\S[\\s\\S]*?)\`\`\``).exec(output) ??
    /```[ \t]*\r?\n([\s\S]*?)```/.exec(output);
  return { text: (loose?.[1] ?? output).trim(), formatFlaw: true };
};

/**
 * `SUBMISSION = <literal>`. A JSON string literal is a valid Python 3 str
 * literal (same escapes; non-ASCII passes through raw), so no hand quoting.
 */
const bindSubmission = (submission: string): string => `SUBMISSION = ${JSON.stringify(submission)}`;

const classifyFailure = (stdout: string, stderr: string, exitCode: number): string => {
  if (exitCode === KILLED_EXIT) return "killed: memory limit or ignored timeout";
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
  /** Submission mode: bind the output's `<lang>` block to `SUBMISSION` instead of executing it. */
  readonly submission?: string | undefined;
}

/**
 * Score a model output against its paired test code. Returns a `PromptScore`
 * with 1.0 on pass / 0.0 on fail (a passing submission read through a looser
 * fallback is a format flaw), and a details string describing the outcome.
 */
export const scoreCodeExec = (
  output: string,
  testCode: string,
  options: CodeExecOptions = {},
): Effect.Effect<
  PromptScore,
  CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const lang = options.submission;
    const sub = lang === undefined ? undefined : extractSubmission(output, lang);
    const scored = yield* runSandboxed({
      command: ["python3", "-"],
      stdin: buildProgram(
        sub === undefined ? extractCode(output) : bindSubmission(sub.text),
        testCode,
      ),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }).pipe(
      Effect.map(
        ({ stdout, stderr, exitCode }): PromptScore =>
          exitCode === 0 && stdout.includes(TESTS_PASSED_MARKER)
            ? { kind: "prompt", score: 1.0, details: "all tests passed" }
            : { kind: "prompt", score: 0.0, details: classifyFailure(stdout, stderr, exitCode) },
      ),
      // Submitted code that ran past its budget failed at runtime, like one that raised.
      Effect.catchTag("CodeExecTimeout", (e) =>
        Effect.succeed<PromptScore>({
          kind: "prompt",
          score: 0.0,
          details: `timed out after ${e.timeoutSec}s`,
        }),
      ),
    );
    return sub?.formatFlaw === true ? asFormatFlaw(scored, `no \`\`\`${lang} block`) : scored;
  });
