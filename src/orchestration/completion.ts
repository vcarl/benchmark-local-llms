/**
 * Completion verdict for the active logical run. Enumerates the planned cell
 * matrix supplied by the caller (built from the live filtered config), scans
 * the archive directory for results tagged with the active runId, and reports
 * whether every planned cell has a matching valid result.
 *
 * "Valid" mirrors the cache predicate: error === null; non-empty output for
 * prompts; non-null terminationReason for scenarios.
 */
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { loadManifest } from "../archive/loader.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import { isValidCachedResult } from "./cache.js";

export interface PlannedCell {
  readonly artifact: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly temperature: number;
  readonly kind: "prompt" | "scenario";
}

export interface CompletionVerdict {
  readonly complete: boolean;
  readonly totalCells: number;
  readonly validCells: number;
}

export interface CheckCompletionInput {
  readonly archiveDir: string;
  readonly runId: string;
  readonly plannedCells: ReadonlyArray<PlannedCell>;
}

const cellKey = (c: PlannedCell): string =>
  `${c.artifact}|${c.promptName}|${c.promptHash}|${c.temperature}`;

export const checkCompletion = (
  input: CheckCompletionInput,
): Effect.Effect<
  CompletionVerdict,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathMod = yield* Path.Path;

    const planned = new Map<string, PlannedCell>();
    for (const c of input.plannedCells) planned.set(cellKey(c), c);
    const satisfied = new Set<string>();

    const entries = yield* fs
      .readDirectory(input.archiveDir)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
    const archives = entries.filter((e) => e.endsWith(".jsonl"));

    for (const entry of archives) {
      const filePath = pathMod.join(input.archiveDir, entry);
      const loaded = yield* loadManifest(filePath);
      if (loaded.manifest.runId !== input.runId) continue;
      for (const r of loaded.results) {
        if (r.runId !== input.runId) continue;
        if (!isValidCachedResult(r)) continue;
        const key = `${loaded.manifest.artifact}|${r.promptName}|${r.promptHash}|${r.temperature}`;
        if (planned.has(key)) satisfied.add(key);
      }
    }

    const validCells = satisfied.size;
    const totalCells = planned.size;
    return {
      complete: totalCells > 0 && validCells === totalCells,
      totalCells,
      validCells,
    };
  });
