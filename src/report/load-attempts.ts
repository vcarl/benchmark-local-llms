import { FileSystem, Path } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError } from "../errors/index.js";
import { AttemptManifest, ItemResult } from "../schema/attempt.js";

export interface LoadedAttempt {
  readonly manifest: AttemptManifest;
  readonly items: ReadonlyArray<ItemResult>;
}
export interface AttemptLoadIssue {
  readonly path: string;
  readonly reason: string;
}

const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResult);

/** Parse one attempt `.jsonl`: line 1 = manifest, lines 2.. = item results. */
const parseAttempt = (path: string, source: string) =>
  Effect.gen(function* () {
    const lines = source.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return yield* Effect.fail(`empty file`);
    const headerJson = yield* Effect.try({
      try: () => JSON.parse(lines[0] as string) as unknown,
      catch: () => `line 1 is not JSON`,
    });
    const manifest = yield* decodeManifest(headerJson).pipe(
      Effect.mapError(() => `line 1 is not an AttemptManifest`),
    );
    const items: ItemResult[] = [];
    for (let i = 1; i < lines.length; i++) {
      const json = yield* Effect.try({
        try: () => JSON.parse(lines[i] as string) as unknown,
        catch: () => `line ${i + 1} is not JSON`,
      });
      items.push(
        yield* decodeItem(json).pipe(Effect.mapError(() => `line ${i + 1} is not an ItemResult`)),
      );
    }
    return { manifest, items } satisfies LoadedAttempt;
  }).pipe(
    Effect.mapError((reason) => ({ path, reason: String(reason) }) satisfies AttemptLoadIssue),
  );

/**
 * Load a single attempt `.jsonl` into {@link LoadedAttempt}. Reuses the same
 * {@link parseAttempt} logic the directory loader uses (line 1 = manifest,
 * lines 2.. = item results); a non-attempt / legacy file fails with an
 * {@link AttemptLoadIssue} carrying `{ path, reason }`. The caller (e.g. the
 * `score` command) maps that issue into a user-facing message.
 */
export const loadAttemptArchive = (
  file: string,
): Effect.Effect<LoadedAttempt, AttemptLoadIssue, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          (cause) => ({ path: file, reason: String(cause) }) satisfies AttemptLoadIssue,
        ),
      );
    return yield* parseAttempt(file, source);
  });

/**
 * Load every `*.jsonl` attempt archive under `dir`. Files that fail to parse are
 * collected as `issues` rather than aborting the run; the directory-read failure
 * itself surfaces as {@link FileIOError}.
 */
export const loadAttemptArchives = (
  dir: string,
): Effect.Effect<
  { attempts: ReadonlyArray<LoadedAttempt>; issues: ReadonlyArray<AttemptLoadIssue> },
  FileIOError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          (cause) => new FileIOError({ path: dir, operation: "readDirectory", cause }),
        ),
      );
    const jsonl = entries.filter((e) => e.endsWith(".jsonl")).sort();

    const attempts: LoadedAttempt[] = [];
    const issues: AttemptLoadIssue[] = [];
    for (const name of jsonl) {
      const full = pathSvc.join(dir, name);
      const source = yield* fs
        .readFileString(full)
        .pipe(
          Effect.mapError(
            (cause) => new FileIOError({ path: full, operation: "readFileString", cause }),
          ),
        );
      const parsed = yield* Effect.either(parseAttempt(full, source));
      if (parsed._tag === "Right") attempts.push(parsed.right);
      else issues.push(parsed.left);
    }
    return { attempts, issues };
  });
