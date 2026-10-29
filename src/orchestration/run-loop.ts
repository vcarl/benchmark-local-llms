/**
 * Environment fingerprint for benchmark runs.
 *
 * `defaultRunEnv` builds the `env` stamped on every attempt (imported by
 * src/cli/commands/run.ts). `runtimeVersion` is a placeholder here; `runMatrix`
 * overrides it per configuration with the probed runtime version.
 */
import os from "node:os";
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { RunEnv } from "../schema/run-manifest.js";

/** Short HEAD sha of the benchmark checkout; "unknown" if git is unavailable. */
const gitSha = Command.string(Command.make("git", "rev-parse", "--short", "HEAD")).pipe(
  Effect.map((s) => s.trim() || "unknown"),
  Effect.catchAll(() => Effect.succeed("unknown")),
);

export const defaultRunEnv = (): Effect.Effect<RunEnv, never, CommandExecutor.CommandExecutor> =>
  Effect.map(gitSha, (benchmarkGitSha) => ({
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    runtimeVersion: "unknown",
    nodeVersion: process.version,
    benchmarkGitSha,
  }));
