/**
 * Write the webapp's data file as a `<script>`-loadable global assignment
 * (§10.3). The webapp loads `webapp/src/data/data.js` as a plain `<script>`
 * for the static report bundle and as a side-effect import for the dev
 * server. The file assigns to `globalThis` rather than `window` so it
 * evaluates cleanly in Node SSR contexts (TanStack Start prerender) where
 * `window` is undefined.
 *
 *     globalThis.__BENCHMARK_DATA = [{...}, {...}, ...];\n
 *
 * No module export, no indentation in the JSON body (matches Python
 * prototype's `json.dumps` with no `indent` — a single compact line).
 *
 * The writer creates the parent directory if it doesn't exist so the report
 * command works on a fresh checkout without the operator pre-creating
 * `webapp/src/data/`.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { FileIOError } from "../errors/index.js";
import type { WebappRecord } from "./webapp-contract.js";

const toFileIOError =
  (filePath: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: filePath, operation, cause: String(cause) });

/**
 * Serialize records to the `globalThis.__BENCHMARK_DATA = [...];` form.
 * Exported for test assertions (it's easier to parse back the JSON portion
 * from a unit test than to read+diff whole files).
 */
export const formatDataJs = (records: ReadonlyArray<WebappRecord>): string => {
  const json = JSON.stringify(records);
  return `globalThis.__BENCHMARK_DATA = ${json};\n`;
};

/**
 * Write the data.js file. Creates the parent directory if missing. Overwrites
 * any existing file. Default path is `webapp/src/data/data.js` relative to
 * the repo root (§10.3); callers should pass the absolute path.
 */
export const writeDataJs = (
  outputPath: string,
  records: ReadonlyArray<WebappRecord>,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = path.dirname(outputPath);
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(dir, "mkdir-data-dir")));
    const contents = formatDataJs(records);
    yield* fs
      .writeFileString(outputPath, contents, { flag: "w" })
      .pipe(Effect.mapError(toFileIOError(outputPath, "write-data-js")));
  });
