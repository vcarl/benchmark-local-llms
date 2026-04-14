/**
 * Cross-run cache lookup (§6.2). Scans archives in `archiveDir` for a
 * previous `ExecutionResult` that matches the given key, so the run loop
 * can skip re-executing a (model × prompt × temperature) combination that
 * already has a recorded output.
 *
 * Key shape: `(artifact, promptName, promptHash, temperature)`. `artifact`
 * and `promptHash` together guarantee we're comparing like-for-like —
 * `artifact` pins the model build, `promptHash` pins the prompt content
 * (including its `system` prompt text and any constraint bodies).
 *
 * Fast-filter on `manifest.artifact` before scanning result lines: the
 * manifest filename convention isn't reliable (users may rename), so we
 * decode headers and discard non-matching archives rather than guess from
 * path. This is cheap — decoding one line per file.
 *
 * Tie-breaking: if multiple archives contain a matching result, return
 * the one with the most recent `executedAt` timestamp. We don't use file
 * mtime because `--fresh` reruns preserve the old file; the result's own
 * timestamp is what the operator cares about.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { FileIOError, type JsonlCorruptLine } from "../errors/index.js";
import type { ExecutionResult } from "../schema/index.js";
import { loadManifest } from "./loader.js";

export interface CacheKey {
  readonly artifact: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
}

const matchesKey = (r: ExecutionResult, key: CacheKey): boolean =>
  r.promptName === key.promptName &&
  r.promptHash === key.promptHash &&
  r.temperature === key.temperature;

/**
 * Scan every `*.jsonl` under `archiveDir` (non-recursive) for a cached
 * `ExecutionResult` matching `key`. Returns the most recent match by
 * `executedAt`, or `None` if nothing matches.
 *
 * Filesystem errors on individual archives propagate — the caller decides
 * whether to fail the run or continue without the cache. Corrupt lines
 * within an archive surface as `JsonlCorruptLine`: the fix is to repair
 * the archive (or delete it), not to silently ignore.
 */
export const findCachedResult = (
  archiveDir: string,
  key: CacheKey,
): Effect.Effect<
  Option.Option<ExecutionResult>,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;

    const entries = yield* fs.readDirectory(archiveDir).pipe(
      Effect.mapError(
        (cause) =>
          new FileIOError({
            path: archiveDir,
            operation: "read-archive-dir",
            cause: String(cause),
          }),
      ),
    );
    const archives = entries.filter((e) => e.endsWith(".jsonl"));

    let best: ExecutionResult | null = null;
    for (const entry of archives) {
      const filePath = pathMod.join(archiveDir, entry);
      const loaded = yield* loadManifest(filePath);
      if (loaded.manifest.artifact !== key.artifact) continue;
      for (const r of loaded.results) {
        if (!matchesKey(r, key)) continue;
        if (best === null || r.executedAt > best.executedAt) {
          best = r;
        }
      }
    }

    return best === null ? Option.none() : Option.some(best);
  });
