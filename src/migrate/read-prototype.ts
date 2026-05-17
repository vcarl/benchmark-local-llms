/**
 * Prototype-format archive reader (requirements §11).
 *
 * The Python prototype wrote `benchmark-execution/{model_slug}__{runtime}.jsonl`
 * as a flat sequence of records — no manifest header, snake_case field names,
 * overwritten on each run. This loader parses one such file into a list of
 * {@link PrototypeRecord} values plus per-file metadata (mtime, source path)
 * used for synthetic timestamps in the output.
 *
 * Design decisions:
 *
 * - **Loose schema.** The prototype's field set evolved (events added late,
 *   quant added late, `final_state_summary` renamed from earlier shapes).
 *   We accept anything optional rather than fail-fast — unknown fields are
 *   ignored, missing fields become `undefined`. Corrupt lines are reported
 *   per-line, not globally fatal, so one bad line doesn't sink a whole file.
 *
 * - **mtime as timestamp.** The prototype didn't record per-execution
 *   timestamps anywhere usable. Requirements §11.1 explicitly says "use file
 *   mtime as the best proxy." All records in the same file get the same
 *   synthetic `executedAt` — a known lossy conversion, documented in the
 *   migrated manifest's env.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileIOError } from "../errors/index.js";

/**
 * Schema for one prototype JSONL record. Every field is optional — the
 * prototype's actual on-disk records vary in shape across versions, and
 * we backfill missing required fields at conversion time (see
 * `reconstruct-manifest.ts`).
 *
 * Unknown extra keys are allowed; we don't validate a closed set because
 * older / experimental archives may have fields we don't need.
 */
export const PrototypeRecord = Schema.Struct({
  model: Schema.optional(Schema.String),
  runtime: Schema.optional(Schema.String),
  quant: Schema.optional(Schema.String),
  prompt_name: Schema.optional(Schema.String),
  prompt_tokens: Schema.optional(Schema.Number),
  generation_tokens: Schema.optional(Schema.Number),
  prompt_tps: Schema.optional(Schema.Number),
  generation_tps: Schema.optional(Schema.Number),
  peak_memory_gb: Schema.optional(Schema.Number),
  wall_time_sec: Schema.optional(Schema.Number),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.NullOr(Schema.String)),
  prompt_hash: Schema.optional(Schema.String),
  scenario_name: Schema.optional(Schema.NullOr(Schema.String)),
  scenario_hash: Schema.optional(Schema.NullOr(Schema.String)),
  termination_reason: Schema.optional(Schema.NullOr(Schema.String)),
  tool_call_count: Schema.optional(Schema.NullOr(Schema.Number)),
  /** Old name for what the new schema calls `finalPlayerStats`. */
  final_state_summary: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  final_player_stats: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  /** Events were added late; often absent or `null`/`[]`. */
  events: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown }))),
  ),
  temperature: Schema.optional(Schema.Number),
});
export type PrototypeRecord = typeof PrototypeRecord.Type;

export interface ReadPrototypeIssue {
  readonly lineNumber: number;
  readonly reason: string;
  readonly raw: string;
}

export interface PrototypeFile {
  readonly path: string;
  readonly mtimeMs: number;
  readonly records: ReadonlyArray<PrototypeRecord>;
  readonly issues: ReadonlyArray<ReadPrototypeIssue>;
}

const decodeRecord = Schema.decodeUnknown(PrototypeRecord);

/**
 * Read one `benchmark-execution/*.jsonl` file, parsing each line with the
 * loose prototype schema. Bad lines are collected in `issues` rather than
 * failing the whole file, so a single corrupt record doesn't block
 * migration of the rest.
 */
export const readPrototypeFile = (
  filePath: string,
): Effect.Effect<PrototypeFile, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (e) =>
          new FileIOError({
            path: filePath,
            operation: "read-prototype-file",
            cause: String(e),
          }),
      ),
    );
    const stat = yield* fs.stat(filePath).pipe(
      Effect.mapError(
        (e) =>
          new FileIOError({
            path: filePath,
            operation: "stat-prototype-file",
            cause: String(e),
          }),
      ),
    );
    const mtimeMs = stat.mtime._tag === "Some" ? stat.mtime.value.getTime() : Date.now();

    const lines = contents.split("\n");
    const records: PrototypeRecord[] = [];
    const issues: ReadPrototypeIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      if (raw.length === 0) continue;
      const parseOutcome = yield* Effect.try({
        try: () => JSON.parse(raw) as unknown,
        catch: (e) => new Error(`JSON parse failure: ${String(e)}`),
      }).pipe(Effect.either);
      if (parseOutcome._tag === "Left") {
        issues.push({
          lineNumber: i + 1,
          reason: parseOutcome.left.message,
          raw: raw.slice(0, 200),
        });
        continue;
      }
      const decodeOutcome = yield* decodeRecord(parseOutcome.right).pipe(Effect.either);
      if (decodeOutcome._tag === "Left") {
        issues.push({
          lineNumber: i + 1,
          reason: `schema decode failure: ${String(decodeOutcome.left)}`,
          raw: raw.slice(0, 200),
        });
        continue;
      }
      records.push(decodeOutcome.right);
    }

    return { path: filePath, mtimeMs, records, issues };
  });

/**
 * List all `*.jsonl` files in `sourceDir` (non-recursive). The migration
 * tool feeds these to `readPrototypeFile` one at a time. Non-jsonl files
 * are ignored silently.
 */
export const discoverPrototypeFiles = (
  sourceDir: string,
): Effect.Effect<ReadonlyArray<string>, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;
    const entries = yield* fs.readDirectory(sourceDir).pipe(
      Effect.mapError(
        (e) =>
          new FileIOError({
            path: sourceDir,
            operation: "read-prototype-dir",
            cause: String(e),
          }),
      ),
    );
    return entries
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => pathMod.join(sourceDir, f))
      .sort();
  });
