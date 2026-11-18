/**
 * Environment fingerprint for benchmark runs.
 *
 * `defaultRunEnv` builds the `env` stamped on every attempt (imported by
 * src/cli/commands/run.ts). `runtimeVersion` is a placeholder here; `runMatrix`
 * overrides it per configuration with the probed runtime version. The hostname
 * is not recorded; the hardware profile and its `hardwareId` identify the machine.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { RunEnv } from "../schema/run-manifest.js";
import { hardwareId, probeHardware } from "./hardware.js";

/** Short HEAD sha of the benchmark checkout; "unknown" if git is unavailable. */
const gitSha = Command.string(Command.make("git", "rev-parse", "--short", "HEAD")).pipe(
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
      benchmarkGitSha: yield* gitSha,
      hardware,
      hardwareId: hardwareId(hardware),
    };
  });
