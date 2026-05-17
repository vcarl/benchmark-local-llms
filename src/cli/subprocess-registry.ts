/**
 * Process-level safety net for tracked subprocesses. Complements Effect's
 * scoped finalizer — which handles the graceful shutdown path — by catching
 * the ungraceful paths Node exposes: SIGHUP (terminal hangup), uncaught
 * exceptions, and any `exit` event including `process.exit()` calls from
 * third-party code.
 *
 * `NodeRuntime.runMain` intercepts SIGINT/SIGTERM and interrupts the root
 * fiber, which triggers finalizers and kills children cleanly. It does NOT
 * handle SIGHUP, uncaughtException, or sudden-exit paths. Without this
 * module, a closed pipe (`./bench run | head`) or an uncaught crash orphans
 * llama-server / mlx_lm.server processes: macOS has no PDEATHSIG, so the
 * kernel doesn't adopt+kill them automatically.
 *
 * @effect/platform-node-shared spawns children with `detached: true`, so
 * each child is its own process group leader — we can signal the whole
 * group with `process.kill(-pid, sig)` and catch any grandchildren mlx_lm
 * might spawn. The same library falls back to individual-PID kill if group
 * kill fails; we mirror that here.
 *
 * Allowed to use try/catch and console: we're operating below the Effect
 * runtime in signal handlers where no fiber exists. Lint allowlist applies.
 */

const trackedPids = new Set<number>();
let installed = false;

/** Add a spawned-subprocess PID to the safety net. */
export const registerSubprocess = (pid: number): void => {
  trackedPids.add(pid);
};

/** Remove a PID once its Effect scope finalizer has cleaned up. */
export const deregisterSubprocess = (pid: number): void => {
  trackedPids.delete(pid);
};

const killOne = (pid: number, signal: NodeJS.Signals): void => {
  // Group kill first — reaches any grandchildren. Falls back to individual
  // PID if the group no longer exists (ESRCH on leader exit).
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // fall through
  }
  try {
    process.kill(pid, signal);
  } catch {
    // process already gone; nothing to do
  }
};

const signalAll = (signal: NodeJS.Signals): void => {
  for (const pid of trackedPids) killOne(pid, signal);
};

const GRACE_MS = 2000;

/**
 * Wire the safety-net handlers. Idempotent — safe to call more than once.
 * Must run once at program startup, before any subprocess is spawned, so a
 * subsequently-installed handler can't hide the tracked PIDs from us.
 */
export const installSubprocessSafetyNet = (): void => {
  if (installed) return;
  installed = true;

  // `exit`: fires on every path Node doesn't crash out of (including
  // process.exit()). Synchronous only — dispatch SIGTERM to the group and
  // let the child handle its own cleanup. We're tearing down; no time to
  // wait, and SIGKILL here would deny the child a chance to flush sockets.
  process.on("exit", () => signalAll("SIGTERM"));

  // SIGHUP / uncaughtException: event loop is still live. Graceful-then-hard
  // — SIGTERM, brief grace, SIGKILL, exit. Preserves the user's preference
  // to SIGTERM first while guaranteeing no orphans when the child ignores
  // the graceful signal.
  const gracefulThenHard = (exitCode: number): void => {
    signalAll("SIGTERM");
    setTimeout(() => {
      signalAll("SIGKILL");
      process.exit(exitCode);
    }, GRACE_MS);
  };

  process.on("SIGHUP", () => gracefulThenHard(129)); // 128 + SIGHUP (1)
  process.on("uncaughtException", (err) => {
    console.error(err);
    gracefulThenHard(1);
  });
};

// Test-only internals. Not exported from the module barrel.
export const __testing = {
  trackedPids: (): ReadonlySet<number> => trackedPids,
  reset: (): void => {
    trackedPids.clear();
    installed = false;
  },
};
