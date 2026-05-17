/**
 * Migrated archive writer. Emits one `{archiveId}.jsonl` under the migration
 * output dir for a reconstructed group (§11.2: destructive-safe — writer
 * never touches the source directory).
 *
 * Reuses B2's writer primitives rather than hand-serializing: the manifest
 * and ExecutionResults go through the same Schema encode path as fresh
 * runs, which guarantees byte-compatibility with the rest of the system
 * (report generator will load these archives and treat them identically
 * to runtime-produced ones).
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { appendResult, writeManifestHeader } from "../archive/writer.js";
import { FileIOError } from "../errors/index.js";
import type { ExecutionResult, RunManifest } from "../schema/index.js";

const toFileIOError =
  (filePath: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: filePath, operation, cause: String(cause) });

/**
 * Write one migrated archive to `{outputDir}/{archiveId}.jsonl`. Creates the
 * output dir if missing (including intermediate parents), then writes the
 * manifest header and appends each result line.
 *
 * **Not atomic.** A crash midway through `appendResult` will leave a
 * partial file. Acceptable because migration is a one-time operator-driven
 * step — re-running overwrites the partial file cleanly via the writer's
 * `flag: "w"` on the header.
 */
export const writeMigratedArchive = (
  outputDir: string,
  archiveId: string,
  manifest: RunManifest,
  results: ReadonlyArray<ExecutionResult>,
): Effect.Effect<string, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .makeDirectory(outputDir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(outputDir, "mkdir-migrate-dir")));
    const outputPath = path.join(outputDir, `${archiveId}.jsonl`);
    yield* writeManifestHeader(outputPath, manifest);
    for (const r of results) {
      yield* appendResult(outputPath, r);
    }
    return outputPath;
  });
