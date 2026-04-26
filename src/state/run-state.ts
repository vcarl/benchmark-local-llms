/**
 * Run-state file management. Persists the active logical-run id in
 * `{archiveDir}/.run-state.json` so that `./bench run` invocations after the
 * first one resume the same logical run rather than starting over.
 *
 * Shape: `{ runId: string, createdAt: string }`. Anything else, parse errors,
 * or read errors are treated as "no state" — we don't fail the run; the
 * caller starts fresh.
 *
 * Cleared by the run command iff the planned cell matrix is fully populated
 * with valid results tagged with the active runId. `--fresh` deletes the
 * file before generating a new id.
 */

import { randomBytes } from "node:crypto";
import { FileSystem, Path } from "@effect/platform";
import { Clock, Effect, Option, Schema } from "effect";

export const STATE_FILE_NAME = ".run-state.json";

const RunState = Schema.Struct({
  runId: Schema.String,
  createdAt: Schema.String,
});
export type RunState = typeof RunState.Type;

const decodeState = Schema.decodeUnknown(RunState);

const stateFilePath = (archiveDir: string) =>
  Effect.gen(function* () {
    const pathMod = yield* Path.Path;
    return pathMod.join(archiveDir, STATE_FILE_NAME);
  });

/**
 * Read the state file. Returns `None` when:
 *   - the file doesn't exist
 *   - the file is unreadable (FS error)
 *   - the contents aren't valid JSON
 *   - the JSON doesn't match the expected shape
 *
 * In all error cases we log a warning and return `None`. The run continues
 * with a fresh id; resume is just unavailable.
 */
export const loadRunState = (
  archiveDir: string,
): Effect.Effect<Option.Option<RunState>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return Option.none<RunState>();

    const contents = yield* fs.readFileString(file).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to read ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    if (Option.isNone(contents)) return Option.none<RunState>();

    const parsed = yield* Effect.try({
      try: () => JSON.parse(contents.value) as unknown,
      catch: (e) => e,
    }).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: corrupt JSON in ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    if (Option.isNone(parsed)) return Option.none<RunState>();

    const decoded = yield* decodeState(parsed.value).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: shape-invalid ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.option,
    );
    return decoded;
  });

/**
 * Write the state file (overwriting any existing content). Failures log a
 * warning and complete successfully — the run proceeds without resume
 * available, but should not be aborted just because the disk is grumpy.
 */
export const saveRunState = (
  archiveDir: string,
  state: RunState,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    yield* fs.writeFileString(file, `${JSON.stringify(state)}\n`).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to write ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Delete the state file. No-op if it doesn't exist.
 */
export const clearRunState = (
  archiveDir: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* stateFilePath(archiveDir);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return;
    yield* fs.remove(file).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`run-state: failed to delete ${file}: ${String(e)}`).pipe(
          Effect.annotateLogs("scope", "run-state"),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Generate a fresh run-id of shape `r-{YYYY-MM-DD}-{6-hex}`. Date is from
 * the Effect Clock (so tests can pin time); the hex suffix is 24 random
 * bits via `crypto.randomBytes`, which is unaffected by clock control —
 * tests pinning time should not also assume the suffix is deterministic.
 */
export const generateRunId = (): Effect.Effect<string> =>
  Effect.gen(function* () {
    const millis = yield* Clock.currentTimeMillis;
    const date = new Date(millis).toISOString().slice(0, 10);
    const suffix = randomBytes(3).toString("hex");
    return `r-${date}-${suffix}`;
  });
