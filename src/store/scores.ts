/**
 * Score records: our grade of one execution under one scorer, appended to
 * `<store>/scores/<bundleDigest>.jsonl` (one `stableStringify` line each,
 * O_APPEND, never rewritten).
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { stableStringify } from "../config/hashing.js";
import { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import { FailureKind } from "../schema/attempt.js";

export const ScoreRecord = Schema.Struct({
  execution: Schema.String,
  scorer: Schema.String,
  score: Schema.Number,
  failureKind: Schema.NullOr(FailureKind),
  details: Schema.NullOr(Schema.String),
  nearMiss: Schema.NullOr(Schema.String),
  breakdown: Schema.NullOr(
    Schema.Struct({
      passed: Schema.Array(Schema.String),
      failed: Schema.Array(Schema.String),
      errored: Schema.Array(Schema.String),
    }),
  ),
  harnessGitSha: Schema.String,
  scoredAt: Schema.String,
});
export type ScoreRecord = typeof ScoreRecord.Type;

const scoresPath = (store: string, bundleDigest: string): string =>
  path.join(store, "scores", `${bundleDigest}.jsonl`);

export const appendScores = (
  store: string,
  bundleDigest: string,
  records: ReadonlyArray<ScoreRecord>,
) =>
  Effect.gen(function* () {
    if (records.length === 0) return;
    const fs = yield* FileSystem.FileSystem;
    const file = scoresPath(store, bundleDigest);
    yield* fs
      .makeDirectory(path.dirname(file), { recursive: true })
      .pipe(Effect.mapError((cause) => new FileIOError({ path: file, operation: "mkdir", cause })));
    yield* fs
      .writeFileString(file, records.map((r) => `${stableStringify(r)}\n`).join(""), { flag: "a" })
      .pipe(
        Effect.mapError(
          (cause) => new FileIOError({ path: file, operation: "append scores", cause }),
        ),
      );
  });

/** Every record for a bundle, in append order; none when it was never scored. */
export const readScores = (store: string, bundleDigest: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = scoresPath(store, bundleDigest);
    const exists = yield* fs
      .exists(file)
      .pipe(Effect.mapError((cause) => new FileIOError({ path: file, operation: "stat", cause })));
    if (!exists) return [];
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError((cause) => new FileIOError({ path: file, operation: "read", cause })));
    const lines = text.split("\n").filter((l) => l !== "");
    return yield* Effect.forEach(lines, (raw, i) =>
      Effect.try(() => JSON.parse(raw) as unknown).pipe(
        Effect.flatMap(Schema.decodeUnknown(ScoreRecord)),
        Effect.mapError(
          () => new JsonlCorruptLine({ filePath: file, lineNumber: i + 1, rawLine: raw }),
        ),
      ),
    );
  });

/**
 * The (execution, scorer) keys whose records disagree on any of score,
 * failureKind, details, nearMiss or breakdown: a nondeterministic scorer.
 * `items` maps execution digest → item for naming.
 */
export const conflicts = (
  records: ReadonlyArray<ScoreRecord>,
  items: ReadonlyMap<string, string>,
): Array<{ execution: string; scorer: string; item: string | undefined }> => {
  const seen = new Map<string, string>();
  const out = new Map<string, { execution: string; scorer: string; item: string | undefined }>();
  for (const r of records) {
    const key = stableStringify([r.execution, r.scorer]);
    const grade = stableStringify([r.score, r.failureKind, r.details, r.nearMiss, r.breakdown]);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, grade);
    else if (first !== grade && !out.has(key)) {
      out.set(key, { execution: r.execution, scorer: r.scorer, item: items.get(r.execution) });
    }
  }
  return [...out.values()];
};
