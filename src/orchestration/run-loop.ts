/**
 * Environment fingerprint for benchmark runs.
 *
 * `defaultRunEnv` builds the machine and harness part of every bundle's `env`
 * (imported by src/cli/commands/run.ts). `runtimeVersion` is a placeholder
 * here; `runMatrix` overrides it per configuration with the probed runtime
 * version. The hostname is not recorded; the hardware profile and its
 * `hardwareId` identify the machine.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { hardwareIdOf } from "../store/bundle.js";
import { probeHardware } from "./hardware.js";
import type { RunEnv } from "./run-challenge.js";

/** Full HEAD sha of the benchmark checkout; "unknown" if git is unavailable. */
export const gitSha = Command.string(Command.make("git", "rev-parse", "HEAD")).pipe(
  Effect.map((s) => s.trim() || "unknown"),
  Effect.catchAll(() => Effect.succeed("unknown")),
);

export const defaultRunEnv = (): Effect.Effect<RunEnv, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const hardware = yield* probeHardware;
    return {
      platform: `${process.platform}-${process.arch}`,
      runtimeVersion: "unknown",
      nodeVersion: process.version,
      harnessGitSha: yield* gitSha,
      hardware,
      hardwareId: hardwareIdOf(hardware),
    };
  });
