/**
 * Environment fingerprint for benchmark runs.
 *
 * `defaultRunEnv` is the only surviving export from this module after the
 * per-model run stack (runLoop / runModel) was removed. It is imported by
 * src/cli/commands/run.ts to build the `env` field stamped on every attempt.
 */

import type { RunEnv } from "../schema/run-manifest.js";

// ── Environment fingerprint ────────────────────────────────────────────────

/**
 * Build the `env` field for a manifest. Falls back to light defaults when
 * called outside of test control. A follow-up patch can replace this with a
 * proper service (hostname from `os.hostname`, git SHA from a subprocess).
 */
export const defaultRunEnv = (): RunEnv => ({
  hostname: process.env["HOSTNAME"] ?? "unknown",
  platform: `${process.platform}-${process.arch}`,
  runtimeVersion: "unknown",
  nodeVersion: process.version,
  benchmarkGitSha: "unknown",
});
