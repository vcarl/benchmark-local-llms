/**
 * Cross-run cache dispatch for the orchestration loop (§5.3.2).
 *
 * Thin shim around {@link findCachedResult}: if `fresh` is set, the cache is
 * disabled wholesale; otherwise we consult the archive directory for a prior
 * `(artifact, promptName, promptHash, temperature)` hit. A successful hit is
 * returned as `Some<ExecutionResult>` so the run loop can carry it into the
 * new archive (choice (a) from the task brief — rationale in the C4 summary).
 *
 * A result is considered a valid cache hit only if it has no `error`, a
 * non-empty `output` (for prompts) OR non-null `finalPlayerStats`/non-empty
 * events (for scenarios). This mirrors the Python prototype's
 * `result_is_valid` check and keeps accidental failure-caches from leaking
 * across runs.
 */
import type { FileSystem, Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { findCachedResult } from "../archive/cache.js";
import type { FileIOError, JsonlCorruptLine } from "../errors/index.js";
import type { ExecutionResult } from "../schema/index.js";

export interface CacheLookupInput {
  readonly archiveDir: string;
  readonly artifact: string;
  readonly runId: string;
  readonly promptName: string;
  /** For prompt runs this is `PromptCorpusEntry.promptHash`; for scenarios it's
   *  the scenario hash (the loader stamps both slots with the same value so
   *  the lookup key shape stays uniform). */
  readonly promptHash: string;
  readonly temperature: number;
  /** True → skip cache entirely. False → consult archives. */
  readonly fresh: boolean;
}

/**
 * A result is a "valid" cache entry if it has no error string AND either
 * carries a non-empty prompt output OR non-null scenario state.
 */
export const isValidCachedResult = (r: ExecutionResult): boolean => {
  if (r.error !== null) return false;
  if (r.scenarioName !== null) {
    // Scenario: accept any completed (including "wall_clock"/"tokens") as
    // long as there's no error. Stored events may be empty if Admiral never
    // emitted anything; we still prefer not to re-execute.
    return r.terminationReason !== null;
  }
  // Prompt: require non-empty output.
  return r.output.length > 0;
};

/**
 * Consult the cross-run cache. Returns `Some<ExecutionResult>` on a valid hit
 * (carrying the prior execution), `None` otherwise. `None` is also returned
 * when `fresh` is set — the call is a no-op in that mode.
 */
export const lookupCache = (
  input: CacheLookupInput,
): Effect.Effect<
  Option.Option<ExecutionResult>,
  FileIOError | JsonlCorruptLine,
  FileSystem.FileSystem | Path.Path
> => {
  if (input.fresh) {
    return Effect.succeed(Option.none());
  }
  return findCachedResult(input.archiveDir, {
    artifact: input.artifact,
    runId: input.runId,
    promptName: input.promptName,
    promptHash: input.promptHash,
    temperature: input.temperature,
  }).pipe(Effect.map((option) => Option.filter(option, isValidCachedResult)));
};
