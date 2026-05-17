/**
 * Per-scenario events side-file writer.
 *
 * The webapp's ScenarioView lazy-fetches one of these files when the user
 * opens a scenario detail page. Keeping events out of `data.js` drops the
 * main bundle from ~360 MB to ~4 MB.
 *
 * Inputs (`archive_id`, `prompt_name`) are slugified by our own report
 * tooling and safe by construction; we don't validate at this layer. If a
 * corrupt archive ever produced an unsafe character, the filesystem write
 * will fail and surface as `FileIOError`.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { FileIOError } from "../errors/index.js";
import type { WebappRecord } from "./webapp-contract.js";

/**
 * Build the filename for a scenario's events side file:
 *   events/<archive_id>__<prompt_name>.json
 */
export const eventFileName = (archiveId: string, promptName: string): string =>
  `${archiveId}__${promptName}.json`;

const toFileIOError =
  (filePath: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: filePath, operation, cause: String(cause) });

/**
 * Write one JSON file per scenario record whose `events` array is non-empty.
 *
 * The file shape is `{ blobPool, events }` where `blobPool` is the row's
 * de-dup pool (hash → message body) and `events` is the raw `AgentEvent[]`.
 * `turn_end.data.context` carries `messagesRef: string[]` referencing pool
 * keys — see the archive-format spec for the long-form contract.
 *
 * Records with no events (null or empty) are skipped — the wire-side
 * `has_events` flag tells the webapp not to fetch.
 *
 * Creates the directory if it doesn't exist. Existing files are overwritten.
 */
export const writeEventFiles = (
  eventsDir: string,
  records: ReadonlyArray<WebappRecord>,
): Effect.Effect<void, FileIOError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .makeDirectory(eventsDir, { recursive: true })
      .pipe(Effect.mapError(toFileIOError(eventsDir, "mkdir-events-dir")));

    for (const rec of records) {
      if (rec.kind !== "scenario") continue;
      if (rec.events === null || rec.events.length === 0) continue;
      const filename = eventFileName(rec.archive_id, rec.prompt_name);
      const filePath = path.join(eventsDir, filename);
      const body = JSON.stringify({ blobPool: rec.blob_pool ?? {}, events: rec.events });
      yield* fs
        .writeFileString(filePath, body, { flag: "w" })
        .pipe(Effect.mapError(toFileIOError(filePath, "write-events-file")));
    }
  });
