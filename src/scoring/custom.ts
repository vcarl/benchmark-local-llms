import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { CodeExecFailed, type CodeExecTimeout, type ScorerSpawnFailed } from "../errors/index.js";
import { runSandboxed } from "./sandbox.js";
import type { PromptScore } from "./score-result.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Run a challenge-supplied scorer in the isolated runner (`sandbox.ts`).
 * Contract: `source` is a single self-contained Python script (the scorer
 * config carries it inline, so editing the script changes the scorer
 * digest), run as `python3 -c <source>`; harness writes `{ output, ...meta }`
 * as JSON to stdin; script prints `{ score, breakdown? }` JSON to stdout.
 * Non-zero exit or unparseable stdout -> CodeExecFailed.
 */
export const scoreCustom = (
  output: string,
  source: string,
  meta: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Effect.Effect<
  PromptScore,
  CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const run = yield* runSandboxed({
      command: ["python3", "-c", source],
      stdin: JSON.stringify({ output, ...meta }),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (run.exitCode !== 0)
      return yield* Effect.fail(
        new CodeExecFailed({ exitCode: run.exitCode, stderr: run.stderr.slice(0, 200) }),
      );

    const parsed = yield* Effect.try({
      try: () => JSON.parse(run.stdout) as { score: number; breakdown?: unknown },
      catch: () =>
        new CodeExecFailed({
          exitCode: 0,
          stderr: `unparseable scorer output: ${run.stdout.slice(0, 120)}`,
        }),
    });
    const score = Math.max(0, Math.min(1, Number(parsed.score)));
    return { kind: "prompt", score, details: `custom: ${score}` };
  });
