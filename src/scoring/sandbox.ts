/**
 * Isolated runner for code scorers. Model output and challenge scorer scripts
 * run in a throwaway Docker container — never on the host — with no network,
 * a read-only root fs, non-root user, no capabilities, and memory / CPU /
 * pids / wall-time limits. There is no host-python fallback: if Docker is
 * unavailable the run fails with `ScorerSpawnFailed`.
 */
import { randomUUID } from "node:crypto";
import { Command, type CommandExecutor } from "@effect/platform";
import { Cause, Effect, Option, Stream } from "effect";
import { CodeExecFailed, CodeExecTimeout, ScorerSpawnFailed } from "../errors/index.js";

/** `python:3.9-slim` (multi-arch index digest). 3.9 matches the interpreter that graded the archive. */
export const SANDBOX_IMAGE =
  "python@sha256:2d97f6910b16bd338d3060f261f53f144965f755599aab1acda1e13cf1731b1b";

/** Printed to stderr by the container before the payload runs; its absence means the runner never started. */
const STARTED = "__SANDBOX_STARTED__";
/** Host-side backstop beyond the in-container timeout (container start, docker CLI hangs). */
const HOST_GRACE_MS = 5_000;
/** Cleanup `docker rm -f` gives up after this; a hung daemon otherwise blocks forever. */
const RM_TIMEOUT_MS = 30_000;
/** Per-stream capture cap; the rest is drained and dropped. */
const OUTPUT_CAP_BYTES = 1 << 20;
/** GNU `timeout` exit status when it terminated the payload. */
const TIMEOUT_EXIT = 124;

export interface SandboxMount {
  readonly host: string;
  readonly container: string;
}

/**
 * `docker` argv. The payload runs under `timeout -k 1 <sec>` (SIGTERM, then
 * SIGKILL a second later): exit 124 is a timeout; 137 is a kill (memory
 * limit, or a payload that ignored SIGTERM).
 */
export const sandboxArgs = (
  name: string,
  timeoutSec: number,
  command: readonly string[],
  mounts: readonly SandboxMount[] = [],
): string[] => [
  "run",
  "--rm",
  "-i",
  "--name",
  name,
  "--network",
  "none",
  "--read-only",
  "--tmpfs",
  "/tmp:rw,size=16m",
  "--memory",
  "256m",
  "--memory-swap",
  "256m",
  "--cpus",
  "1",
  "--pids-limit",
  "64",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--user",
  "65534:65534",
  ...mounts.flatMap((m) => ["-v", `${m.host}:${m.container}:ro`]),
  SANDBOX_IMAGE,
  "sh",
  "-c",
  `echo ${STARTED} >&2; exec timeout -k 1 "$0" "$@"`,
  String(timeoutSec),
  ...command,
];

const collectCapped = <E>(s: Stream.Stream<Uint8Array, E>) =>
  Stream.runFold(s, { parts: [] as Uint8Array[], size: 0 }, (acc, chunk) => {
    if (acc.size < OUTPUT_CAP_BYTES) {
      acc.parts.push(chunk);
      acc.size += chunk.length;
    }
    return acc;
  }).pipe(Effect.map((acc) => new TextDecoder("utf-8").decode(Buffer.concat(acc.parts))));

export interface SandboxResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Run `command` in the sandbox with `stdin` fed to it. Fails with
 * `CodeExecTimeout` when the payload exceeds `timeoutMs` (the in-container
 * timeout fired), `CodeExecFailed` when the sandbox gives no exit within a host
 * grace period beyond that, `ScorerSpawnFailed` when the container never
 * started (no docker binary, daemon down, image unavailable). On host timeout
 * or interrupt the container is force-removed.
 */
export const runSandboxed = (opts: {
  readonly command: readonly string[];
  readonly stdin: string;
  readonly timeoutMs: number;
  readonly mounts?: readonly SandboxMount[];
}): Effect.Effect<
  SandboxResult,
  CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const name = `bench-scorer-${randomUUID()}`;
    const timeoutSec = opts.timeoutMs / 1000;
    const cmd = Command.make(
      "docker",
      ...sandboxArgs(name, timeoutSec, opts.command, opts.mounts),
    ).pipe(Command.feed(opts.stdin));

    const collect = Effect.scoped(
      Effect.gen(function* () {
        const proc = yield* Command.start(cmd);
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [collectCapped(proc.stdout), collectCapped(proc.stderr), proc.exitCode],
          { concurrency: "unbounded" },
        );
        return { stdout, stderr, exitCode: Number(exitCode) };
      }),
    ).pipe(
      // Bounded: a wedged Docker daemon must not hang the run on cleanup.
      Effect.onInterrupt(() =>
        Command.exitCode(Command.make("docker", "rm", "-f", name)).pipe(
          Effect.timeout(RM_TIMEOUT_MS),
          Effect.ignore,
        ),
      ),
    );

    const raced = yield* Effect.timeout(collect, opts.timeoutMs + HOST_GRACE_MS).pipe(
      Effect.catchAllCause(
        (cause): Effect.Effect<never, CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed> => {
          const failure = Cause.failureOption(cause);
          if (Option.isNone(failure)) return Effect.failCause(cause as Cause.Cause<never>);
          const e = failure.value as { _tag?: string; reason?: string };
          // The in-container timeout never fired: a sandbox fault, not the payload's.
          if (e._tag === "TimeoutException")
            return Effect.fail(
              new CodeExecFailed({
                exitCode: -1,
                stderr: `sandbox gave no exit within ${opts.timeoutMs + HOST_GRACE_MS}ms`,
              }),
            );
          if (e._tag === "SystemError" && e.reason === "NotFound")
            return Effect.fail(new ScorerSpawnFailed({ binary: "docker", cause: String(e) }));
          return Effect.fail(new CodeExecFailed({ exitCode: -1, stderr: String(e) }));
        },
      ),
    );

    const at = raced.stderr.indexOf(`${STARTED}\n`);
    if (at < 0) {
      return yield* Effect.fail(
        new ScorerSpawnFailed({
          binary: "docker",
          cause: `exit ${raced.exitCode}: ${raced.stderr.slice(0, 300)}`,
        }),
      );
    }
    if (raced.exitCode === TIMEOUT_EXIT) {
      return yield* Effect.fail(new CodeExecTimeout({ timeoutSec }));
    }
    return { ...raced, stderr: raced.stderr.slice(at + STARTED.length + 1) };
  });
