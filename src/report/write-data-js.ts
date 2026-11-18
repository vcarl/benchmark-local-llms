/**
 * Write the webapp's data file as a `<script>`-loadable global assignment.
 * The webapp loads `webapp/src/data/data.js` as a plain `<script>` for the
 * static report bundle and as a side-effect import for the dev server. The
 * file assigns to `globalThis` rather than `window` so it evaluates cleanly
 * in Node.
 *
 *     globalThis.__BENCHMARK_ROWS = [{ dataset, challengeSet, hardware, rows }, ...];\n
 *
 * One entry per dataset (src/report/rows.ts), the main dataset first. A
 * single compact JSON line. The writer creates the parent directory if it
 * doesn't exist.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { FileIOError } from "../errors/index.js";
import type { RowsDataset } from "./rows.js";

const toFileIOError =
  (filePath: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: filePath, operation, cause: String(cause) });

/** Serialize the datasets to the `globalThis.__BENCHMARK_ROWS = [...];` form. */
export const formatDataJs = (datasets: ReadonlyArray<RowsDataset>): string =>
  `globalThis.__BENCHMARK_ROWS = ${JSON.stringify(datasets)};\n`;

/**
 * Write the data.js file. Creates the parent directory if missing. Overwrites
 * any existing file. Default path is `webapp/src/data/data.js` relative to
 * the repo root (§10.3); callers should pass the absolute path.
 */
export const writeDataJs = (
  outputPath: string,
  datasets: ReadonlyArray<RowsDataset>,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = path.dirname(outputPath);
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(dir, "mkdir-data-dir")));
    const contents = formatDataJs(datasets);
    yield* fs
      .writeFileString(outputPath, contents, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(outputPath, "write-data-js")));
  });
