/**
 * `freezeLegacy`: the `legacy` block of a dataset manifest, read from attempt
 * archives in place. It lists exactly the attempts the report's rows read: an
 * attempt file that parses, of a challenge in the dataset's challenge set,
 * not of the harness's `smoke-config`. Interrupted attempts are listed (rows
 * use them for cell status); unparseable files are listed nowhere. A reused
 * archive contributes only attempts of rows (`configHash@hardware`) that the
 * own archive's listed attempts have. Each listed file, and each content-store
 * blob a listed schemaVersion ≥ 2 attempt references and the archive holds,
 * is pinned by SHA-256 of its bytes.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { listChallengeFiles, loadChallenge } from "../config/challenges.js";
import type { LegacyArchivePins, LegacyBlock } from "../dataset/manifest.js";
import { FileIOError } from "../errors/index.js";
import type { HardwareProfile } from "../schema/run-manifest.js";
import { sha256Hex } from "../store/digest.js";
import { type LoadedAttempt, parseAttempt } from "./load-attempts.js";
import { blobPinKey } from "./pinned.js";

/** The harness's own test config; its attempts are in no dataset. */
const HARNESS_CONFIG_ID = "smoke-config";

export interface FreezeOptions {
  /** The dataset's own archive directory. */
  readonly archive: string;
  /** An archive whose attempts of the own archive's rows also count. */
  readonly reuse?: string;
  readonly challengesDir: string;
  /** The machine attempts without `env.hardwareId` are attributed to. */
  readonly legacyHardware: { readonly id: string; readonly profile?: HardwareProfile };
}

const io = (path: string, operation: string) => (cause: unknown) =>
  new FileIOError({ path, operation, cause });

/** Ids of the challenges in `dir` that load (an unloadable file is out of the set). */
const challengeIds = (dir: string) =>
  Effect.gen(function* () {
    const files = yield* listChallengeFiles(dir).pipe(Effect.orElseSucceed(() => []));
    const ids = new Set<string>();
    for (const f of files) {
      const c = yield* loadChallenge(f.path).pipe(Effect.option);
      if (Option.isSome(c)) ids.add(c.value.id);
    }
    return ids;
  });

/** Every attempt file in `dir` that parses and passes `keep`, with the sha256 of its bytes. */
const scan = (dir: string, keep: (a: LoadedAttempt) => boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const names = (yield* fs.readDirectory(dir).pipe(Effect.mapError(io(dir, "readDirectory"))))
      .filter((e) => e.endsWith(".jsonl"))
      .sort();
    const out: { name: string; sha: string; attempt: LoadedAttempt }[] = [];
    for (const name of names) {
      const full = pathSvc.join(dir, name);
      const bytes = yield* fs.readFile(full).pipe(Effect.mapError(io(full, "readFile")));
      const parsed = yield* Effect.option(parseAttempt(full, new TextDecoder().decode(bytes)));
      if (Option.isSome(parsed) && keep(parsed.value))
        out.push({ name, sha: sha256Hex(bytes), attempt: parsed.value });
    }
    return out;
  });

/** Pins of the blobs under `<dir>/content/` that the schemaVersion ≥ 2 `attempts` reference. */
const pinBlobs = (dir: string, attempts: ReadonlyArray<LoadedAttempt>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const keys = new Set<string>();
    for (const { manifest, items } of attempts) {
      if (manifest.schemaVersion < 2) continue;
      keys.add(blobPinKey("system", manifest));
      for (const i of items) {
        keys.add(blobPinKey("prompts", i.promptHash));
        if (i.scorerHash !== undefined) keys.add(blobPinKey("scorers", i.scorerHash));
      }
    }
    const blobs: Record<string, string> = {};
    for (const key of keys) {
      const path = `${dir}/content/${key}`;
      if (!(yield* fs.exists(path).pipe(Effect.mapError(io(path, "exists"))))) continue;
      blobs[key] = sha256Hex(yield* fs.readFile(path).pipe(Effect.mapError(io(path, "readFile"))));
    }
    return blobs;
  });

export const freezeLegacy = (
  options: FreezeOptions,
): Effect.Effect<LegacyBlock, FileIOError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const pathSvc = yield* Path.Path;
    const inSet = yield* challengeIds(options.challengesDir);
    const rowKey = (a: LoadedAttempt) =>
      `${a.manifest.configHash}@${a.manifest.env.hardwareId ?? options.legacyHardware.id}`;
    const member = (a: LoadedAttempt) =>
      a.manifest.configId !== HARNESS_CONFIG_ID && inSet.has(a.manifest.challengeId);

    const own = yield* scan(options.archive, member);
    const rows = new Set(own.map((x) => rowKey(x.attempt)));
    const sources: [string, typeof own][] = [[options.archive, own]];
    if (options.reuse !== undefined)
      sources.push([
        options.reuse,
        yield* scan(options.reuse, (a) => member(a) && rows.has(rowKey(a))),
      ]);

    const archives: Record<string, LegacyArchivePins> = {};
    for (const [dir, listed] of sources)
      archives[pathSvc.basename(pathSvc.resolve(dir))] = {
        attempts: Object.fromEntries(listed.map((x) => [x.name, x.sha])),
        blobs: yield* pinBlobs(
          dir,
          listed.map((x) => x.attempt),
        ),
      };
    return { hardware: options.legacyHardware, archives };
  });
