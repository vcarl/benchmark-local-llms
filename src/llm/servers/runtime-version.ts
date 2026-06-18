/**
 * Probe the installed runtime versions and parse them into the stable
 * display strings stamped into `RunManifest.env.runtimeVersion`.
 *
 * `llama-server --version` writes `version: <build> (<sha>)` to STDERR, mixed
 * with Metal-init noise; `mlx_lm --version` writes a bare semver to STDOUT.
 * The probe (below) merges stderr→stdout via `sh -c '"$0" … 2>&1'` so a
 * single `Command.string` capture works for both, and these pure parsers
 * scan the resulting blob. Any unparseable / failed probe degrades to
 * "unknown" — a version probe must never fail a benchmark run.
 */
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { Runtime } from "../../schema/enums.js";

/** `version: 8390 (b6c83aad5)` → `llama.cpp b8390 (b6c83aad5)`. */
export const parseLlamacppVersion = (raw: string): string => {
  const m = raw.match(/^version:\s*(\d+)\s*\(([0-9a-f]+)\)/m);
  return m ? `llama.cpp b${m[1]} (${m[2]})` : "unknown";
};

/** `0.31.2` → `mlx-lm 0.31.2`. */
export const parseMlxVersion = (raw: string): string => {
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? `mlx-lm ${m[1]}` : "unknown";
};

/**
 * Probe the installed version for `runtime` using `bin`. `bin` is the
 * `llama-server` binary for llamacpp, or the python interpreter for mlx.
 *
 * We invoke through `sh -c '"$0" … 2>&1'` (binary passed as the positional
 * `$0`, so there is no shell-injection surface) to merge the subprocess's
 * stderr into stdout: llama-server prints its version banner to stderr, and
 * `Command.string` only captures stdout. Any failure collapses to "unknown".
 */
export const probeRuntimeVersion = (
  runtime: Runtime,
  bin: string,
): Effect.Effect<string, never, CommandExecutor.CommandExecutor> => {
  const command =
    runtime === "llamacpp"
      ? Command.make("sh", "-c", '"$0" --version 2>&1', bin)
      : Command.make("sh", "-c", '"$0" -m mlx_lm --version 2>&1', bin);
  const parse = runtime === "llamacpp" ? parseLlamacppVersion : parseMlxVersion;
  return Command.string(command).pipe(
    Effect.map(parse),
    Effect.catchAll(() => Effect.succeed("unknown")),
  );
};
