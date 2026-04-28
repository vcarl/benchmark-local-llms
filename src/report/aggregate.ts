/**
 * Report aggregation (§7.1 step 3-4). For each loaded archive, every
 * {@link ExecutionResult} is matched against the current on-disk corpus and
 * re-scored via B3's {@link scoreExecution}. Results whose prompt or scenario
 * is absent from the current corpus, or whose hash no longer matches, are
 * dropped and counted in {@link AggregateResult.dropped}.
 *
 * The resulting {model × prompt × temperature} webapp records are returned
 * flat — the webapp does all slice-and-dice aggregation browser-side (§7.2),
 * so the backend emits one record per execution, not pre-averaged buckets.
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

export interface AggregateResult {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly dropped: {
    readonly promptAbsent: number;
    readonly promptDrifted: number;
  };
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

type CellKey = string;
const cellKeyOf = (r: ExecutionResult): CellKey =>
  `${r.model}|${r.runtime}|${r.quant}|${r.promptName}|${r.promptHash}|${r.temperature}`;

interface Candidate {
  readonly archivePath: string;
  readonly mtime: Date;
  readonly result: ExecutionResult;
  readonly entry: PromptCorpusEntry | ScenarioCorpusEntry;
  readonly score: Score;
}

const pickWinner = (a: Candidate, b: Candidate): Candidate => {
  if (a.result.executedAt !== b.result.executedAt) {
    return a.result.executedAt > b.result.executedAt ? a : b;
  }
  if (a.mtime.getTime() !== b.mtime.getTime()) {
    return a.mtime.getTime() > b.mtime.getTime() ? a : b;
  }
  return a.archivePath < b.archivePath ? a : b;
};

/**
 * Aggregate multiple archives against the current on-disk corpus. Results
 * whose prompt/scenario is absent or whose hash has drifted are dropped and
 * counted in `dropped`. Duplicate cells (same model × prompt × temperature)
 * across archives are collapsed to one record using a deterministic tie-break:
 * latest executedAt wins; on tie, latest archive mtime wins; on tie, smaller
 * archive path wins.
 */
export const aggregateAll = (
  input: AggregateInput,
): Effect.Effect<AggregateResult, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const candidates = new Map<CellKey, Candidate>();
    let promptAbsent = 0;
    let promptDrifted = 0;

    for (const archive of input.archives) {
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
          const candidate: Candidate = {
            archivePath: archive.path,
            mtime: archive.mtime,
            result,
            entry,
            score,
          };
          const key = cellKeyOf(result);
          const existing = candidates.get(key);
          candidates.set(key, existing === undefined ? candidate : pickWinner(existing, candidate));
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
          const candidate: Candidate = {
            archivePath: archive.path,
            mtime: archive.mtime,
            result,
            entry,
            score,
          };
          const key = cellKeyOf(result);
          const existing = candidates.get(key);
          candidates.set(key, existing === undefined ? candidate : pickWinner(existing, candidate));
        }
      }
    }

    const records: WebappRecord[] = [];
    for (const c of candidates.values()) {
      records.push(toWebappRecord(c.result, c.entry, c.score));
    }
    return { records, dropped: { promptAbsent, promptDrifted } };
  });
