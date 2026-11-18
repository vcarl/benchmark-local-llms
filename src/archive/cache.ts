/**
 * Cross-run cache lookup (§6.2). Scans archives in `archiveDir` for a
 * previous `ExecutionResult` that matches the given key, so the run loop
 * can skip re-executing a (model × prompt × temperature) combination that
 * already has a recorded output.
 *
 * Key shape: `(artifact, runId, promptName, promptHash, temperature)`.
 * `artifact`, `runId`, and `promptHash` together guarantee we're comparing
 * like-for-like — `artifact` pins the model build, `runId` pins the logical
 * run, `promptHash` pins the prompt content (including its `system` prompt
 * text and any constraint bodies).
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
import { Effect, Option, Schema } from "effect";
import { FileIOError, type JsonlCorruptLine } from "../errors/index.js";
import {
  AttemptManifest,
  type ItemResult,
  ItemResult as ItemResultSchema,
} from "../schema/attempt.js";
import type { ExecutionResult } from "../schema/index.js";
import { loadManifest } from "./loader.js";

interface LegacyCacheKey {
  readonly artifact: string;
  readonly runId: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
}

const matchesKey = (r: ExecutionResult, key: LegacyCacheKey): boolean =>
  r.runId === key.runId &&
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
  key: LegacyCacheKey,
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

    yield* Effect.logDebug(
      `scanning ${archiveDir} (${archives.length} files) for key=(${key.artifact},${key.runId},${key.promptName},${key.promptHash},${key.temperature})`,
    ).pipe(Effect.annotateLogs("scope", "cache"));

    let best: ExecutionResult | null = null;
    let candidateCount = 0;
    for (const entry of archives) {
      const filePath = pathMod.join(archiveDir, entry);
      const loaded = yield* loadManifest(filePath);
      if (loaded.manifest.artifact !== key.artifact) continue;
      if (loaded.manifest.runId !== key.runId) continue;
      for (const r of loaded.results) {
        if (!matchesKey(r, key)) continue;
        candidateCount += 1;
        if (best === null || r.executedAt > best.executedAt) {
          best = r;
        }
      }
    }

    yield* Effect.logDebug(
      candidateCount === 0
        ? "0 candidates"
        : `${candidateCount} candidates, picked archiveId=${best?.archiveId ?? "?"} (most recent)`,
    ).pipe(Effect.annotateLogs("scope", "cache"));

    return best === null ? Option.none() : Option.some(best);
  });

/**
 * Cross-run item cache lookup. Scans completed attempt archives in
 * `archiveDir` for a previously executed-and-scored `ItemResult` whose
 * identity matches `key`, so `runChallenge` can copy it verbatim instead of
 * re-running the model.
 *
 * Key shape: `(configHash, challengeId, challengeVersion, itemHash)`, plus the machine (`hardwareId`). The
 * header pins config + challenge identity; `itemHash` (scorer-inclusive) pins
 * the per-item content + scoring rules, so an edited scorer invalidates the
 * cache even without a `challengeVersion` bump.
 *
 * Only *completed* attempts are eligible: `finishedAt !== null` AND
 * `interrupted === false` (mirrors `isCompleted` in the report path). This is
 * why the cache skips a partial archive being resumed — resume reads that
 * archive's body explicitly instead.
 *
 * Tie-break: if multiple archives hold a matching item, return the one with
 * the most recent matched-item `executedAt` (not file mtime — a re-run keeps
 * the old file, and the item's own timestamp is what the operator cares about).
 *
 * Repeated samples: the sample index (`sample`, absent = 0) joins the key, so
 * {@link findCachedSamples} returns the best line per sample index in one scan.
 *
 * Origin: each returned line carries `cachedFrom` — its own when it already has
 * one, else the attempt it was found in. Among identical lines (a verbatim
 * replay shares `executedAt`), the attempt that started before the line
 * executed — its executor — wins over a replay.
 */
export interface CacheKey {
  readonly configHash: string;
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly itemHash: string;
  /**
   * The running machine's `env.hardwareId`. When set, a line is served only
   * from an attempt on the same machine; an attempt without a hardwareId
   * (written before schemaVersion 3) is the operator's own and stays eligible.
   */
  readonly hardwareId?: string;
}

const decodeManifest = Schema.decodeUnknown(AttemptManifest);
const decodeItem = Schema.decodeUnknown(ItemResultSchema);

/** Eligible only if the attempt is completed (mirrors report `isCompleted`). */
const isCompleted = (m: AttemptManifest): boolean =>
  m.finishedAt !== null && m.interrupted === false;

const headerMatches = (m: AttemptManifest, key: CacheKey): boolean =>
  m.configHash === key.configHash &&
  m.challengeId === key.challengeId &&
  m.challengeVersion === key.challengeVersion &&
  (key.hardwareId === undefined ||
    m.env.hardwareId === undefined ||
    m.env.hardwareId === key.hardwareId);

/**
 * Scan every `*.jsonl` under `archiveDir` (non-recursive) for cached
 * `ItemResult`s matching `key` in completed attempts. Returns, per sample
 * index, the most recent match by the matched item's `executedAt` (an empty
 * map if nothing matches).
 *
 * A directory-read failure surfaces as `FileIOError`. A header or body line
 * that fails to parse for a given file causes that file to be skipped (it is
 * never a cache hit); the file-read itself surfaces as `FileIOError`.
 */
export const findCachedSamples = (
  archiveDir: string,
  key: CacheKey,
): Effect.Effect<
  Map<number, ItemResult>,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;

    const entries = yield* fs
      .readDirectory(archiveDir)
      .pipe(
        Effect.mapError(
          (cause) =>
            new FileIOError({ path: archiveDir, operation: "readDirectory", cause: String(cause) }),
        ),
      );
    const archives = entries.filter((e) => e.endsWith(".jsonl")).sort();

    const best = new Map<number, { item: ItemResult; executor: boolean; attemptId: string }>();
    for (const entry of archives) {
      const filePath = pathMod.join(archiveDir, entry);
      const source = yield* fs.readFileString(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new FileIOError({
              path: filePath,
              operation: "readFileString",
              cause: String(cause),
            }),
        ),
      );
      const lines = source.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length === 0) continue;

      // Header: decode-or-skip (a malformed/legacy header is not a cache hit).
      const headerJson = yield* Effect.try({
        try: () => JSON.parse(lines[0] as string) as unknown,
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => null));
      if (headerJson === null) continue;
      const manifestOpt = yield* decodeManifest(headerJson).pipe(Effect.option);
      if (Option.isNone(manifestOpt)) continue;
      const manifest = manifestOpt.value;
      if (!isCompleted(manifest)) continue;
      if (!headerMatches(manifest, key)) continue;

      for (let i = 1; i < lines.length; i++) {
        const itemJson = yield* Effect.try({
          try: () => JSON.parse(lines[i] as string) as unknown,
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));
        if (itemJson === null) continue;
        const itemOpt = yield* decodeItem(itemJson).pipe(Effect.option);
        if (Option.isNone(itemOpt)) continue;
        const item = itemOpt.value;
        if (item.itemHash !== key.itemHash) continue;
        const s = item.sample ?? 0;
        // An attempt that started after the line executed holds a replay of it.
        const executor = Date.parse(manifest.startedAt) <= Date.parse(item.executedAt);
        const cur = best.get(s);
        if (
          cur === undefined ||
          item.executedAt > cur.item.executedAt ||
          (item.executedAt === cur.item.executedAt && executor && !cur.executor)
        ) {
          best.set(s, { item, executor, attemptId: manifest.attemptId });
        }
      }
    }

    return new Map(
      [...best].map(([s, { item, attemptId }]) => [
        s,
        {
          ...item,
          cachedFrom: item.cachedFrom ?? { attemptId, executedAt: item.executedAt },
        },
      ]),
    );
  });

/** Sample 0 of {@link findCachedSamples}: the single-generation cache lookup. */
export const findCachedItem = (archiveDir: string, key: CacheKey) =>
  findCachedSamples(archiveDir, key).pipe(Effect.map((m) => Option.fromNullable(m.get(0))));
