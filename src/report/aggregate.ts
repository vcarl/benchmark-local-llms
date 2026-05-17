/**
 * Report aggregation (§7.1 step 3-4). For each loaded archive, every
 * {@link ExecutionResult} is matched against the current on-disk corpus and
 * re-scored via B3's {@link scoreExecution}. Results whose prompt or scenario
 * is absent from the current corpus, or whose hash no longer matches, are
 * dropped and counted in {@link AggregateResult.dropped}.
 *
 * One run = one score: every surviving result is emitted as its own record.
 * No cell-level deduplication. The webapp aggregates across runs per variant
 * (mean / pass rate) downstream.
 *
 * Schema-compliance check: each archive's `manifest.runId` must be unique
 * across the loaded set. A collision means a copy/migration mistake. We don't
 * try to disambiguate — every archive sharing the duplicated runId is rejected
 * (none of its results contribute), and the violation is surfaced in
 * {@link AggregateResult.duplicateRunIds}. The rest of the report still runs.
 *
 * Scoring failures are non-fatal: if the scorer errors, we emit the record
 * with `score=0` and an explanatory `score_details` (requirements §7 +
 * "If you hit a wall" in the task spec). One bad prompt doesn't sink the
 * report.
 */
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { LoadedArchive } from "../archive/loader.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";
import { scoreExecution } from "../scoring/score-result.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

export interface AggregateInput {
  readonly archives: ReadonlyArray<{
    readonly path: string;
    readonly mtime: Date;
    readonly data: LoadedArchive;
  }>;
  readonly currentPromptCorpus: Record<string, PromptCorpusEntry>;
  readonly currentScenarioCorpus: Record<string, ScenarioCorpusEntry>;
}

export interface DuplicateRunIdIssue {
  readonly runId: string;
  readonly paths: ReadonlyArray<string>;
}

export interface AggregateResult {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly dropped: {
    readonly promptAbsent: number;
    readonly promptDrifted: number;
  };
  /**
   * Archives whose `manifest.runId` was not unique across the loaded set.
   * All copies are rejected; their results are not in `records`.
   */
  readonly duplicateRunIds: ReadonlyArray<DuplicateRunIdIssue>;
}

/**
 * Score one {@link ExecutionResult}; on scorer error, produce a sentinel
 * {@link Score} describing the failure. Errors are captured as score=0 so
 * the report still emits the record (operator still sees the metrics).
 */
const safeScore = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
): Effect.Effect<Score, never, CommandExecutor.CommandExecutor> =>
  scoreExecution(result, entry).pipe(
    Effect.catchAll((err) =>
      Effect.succeed<Score>({
        score: 0,
        details: `scorer error: ${err._tag}`,
      }),
    ),
  );

/**
 * If the execution itself errored (LLM failure, wall-clock cutoff with no
 * output, etc.), skip scoring and emit a zero-score record marked with the
 * error. This matches the Python prototype's `r.error` → display-as-error
 * behavior.
 */
const errorScore = (result: ExecutionResult): Score => ({
  score: 0,
  details: `execution error: ${(result.error ?? "").slice(0, 160)}`,
});

/**
 * Determine whether a prompt result's hash matches the current corpus entry.
 * Only call when `result.scenarioName === null`.
 */
const promptHashMatches = (result: ExecutionResult, entry: PromptCorpusEntry): boolean =>
  entry.promptHash === result.promptHash;

/**
 * Determine whether a scenario result's hash matches the current corpus entry.
 * Only call when `result.scenarioName !== null`.
 *
 * If `result.scenarioHash` is null the stored record is corrupt — it carries a
 * non-null `scenarioName` but no hash to compare. Return `false` so the record
 * is counted as `promptDrifted` (the nearest existing drop bucket). The
 * null-hash path is explicit here so callers don't silently evaluate
 * `null === someHash` as `false` through an opaque comparison.
 */
const scenarioHashMatches = (result: ExecutionResult, entry: ScenarioCorpusEntry): boolean => {
  if (result.scenarioHash === null) {
    // Corrupt result: scenarioName set but no scenarioHash recorded. Drop it.
    return false;
  }
  return entry.scenarioHash === result.scenarioHash;
};

/**
 * Group archives by `manifest.runId` and split out collisions. Compliant
 * archives have a singleton group; collided archives have ≥2 paths sharing
 * the same runId.
 */
const partitionByRunId = (
  archives: AggregateInput["archives"],
): {
  readonly compliant: AggregateInput["archives"];
  readonly duplicates: ReadonlyArray<DuplicateRunIdIssue>;
} => {
  const byRunId = new Map<string, AggregateInput["archives"][number][]>();
  for (const a of archives) {
    const id = a.data.manifest.runId;
    const arr = byRunId.get(id);
    if (arr) arr.push(a);
    else byRunId.set(id, [a]);
  }
  const compliant: AggregateInput["archives"][number][] = [];
  const duplicates: DuplicateRunIdIssue[] = [];
  for (const [runId, group] of byRunId) {
    if (group.length === 1) {
      compliant.push(...group);
    } else {
      duplicates.push({
        runId,
        paths: group.map((g) => g.path).sort(),
      });
    }
  }
  return { compliant, duplicates };
};

/**
 * Aggregate multiple archives against the current on-disk corpus. Results
 * whose prompt/scenario is absent or whose hash has drifted are dropped and
 * counted in `dropped`. Archives that share a `manifest.runId` with another
 * archive are rejected wholesale and surfaced in `duplicateRunIds`. Every
 * surviving result becomes one record (no cell-level dedup).
 */
export const aggregateAll = (
  input: AggregateInput,
): Effect.Effect<AggregateResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const { compliant, duplicates } = partitionByRunId(input.archives);

    const records: WebappRecord[] = [];
    let promptAbsent = 0;
    let promptDrifted = 0;

    for (const archive of compliant) {
      for (const result of archive.data.results) {
        if (result.scenarioName !== null) {
          // --- Scenario path ---
          const entry = input.currentScenarioCorpus[result.promptName];
          if (entry === undefined) {
            promptAbsent += 1;
            continue;
          }
          if (!scenarioHashMatches(result, entry)) {
            promptDrifted += 1;
            continue;
          }
          const score =
            result.error !== null && result.error.length > 0
              ? errorScore(result)
              : yield* safeScore(result, entry);
          records.push(toWebappRecord(result, entry, score));
        } else {
          // --- Prompt path ---
          const entry = input.currentPromptCorpus[result.promptName];
          if (entry === undefined) {
            promptAbsent += 1;
            continue;
          }
          if (!promptHashMatches(result, entry)) {
            promptDrifted += 1;
            continue;
          }
          const score =
            result.error !== null && result.error.length > 0
              ? errorScore(result)
              : yield* safeScore(result, entry);
          records.push(toWebappRecord(result, entry, score));
        }
      }
    }

    return {
      records,
      dropped: { promptAbsent, promptDrifted },
      duplicateRunIds: duplicates,
    };
  });
