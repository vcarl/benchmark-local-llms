/**
 * Report aggregation (§7.1 step 3-4). For each loaded archive, every
 * {@link ExecutionResult} is matched to its corpus entry and re-scored via
 * B3's {@link scoreExecution}. The resulting {model × prompt × temperature}
 * webapp records are returned flat — the webapp does all slice-and-dice
 * aggregation browser-side (§7.2), so the backend emits one record per
 * execution, not pre-averaged buckets.
 *
 * Scoring failures are non-fatal: if lookup misses or the scorer errors,
 * we emit the record with `score=0` and an explanatory `score_details`
 * (requirements §7 + "If you hit a wall" in the task spec). One bad
 * prompt doesn't sink the report.
 */
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import type { LoadedArchive } from "../archive/loader.js";
import type {
  ExecutionResult,
  PromptCorpusEntry,
  RunManifest,
  ScenarioCorpusEntry,
} from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";
import { scoreExecution } from "../scoring/score-result.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

/**
 * Scoring strategy:
 * - `as-run`: use the manifest's embedded corpus (the "re-score as run"
 *   guarantee of §2.4).
 * - `current`: use a caller-provided corpus from freshly-loaded YAML. Only
 *   valid if the caller can supply it; when omitted, falls back to `as-run`.
 */
export type ScoringMode = "as-run" | "current";

export interface AggregateOptions {
  readonly scoringMode: ScoringMode;
  /** Provided only when scoringMode === "current". Keyed by prompt/scenario name. */
  readonly currentPromptCorpus?: Record<string, PromptCorpusEntry>;
  readonly currentScenarioCorpus?: Record<string, ScenarioCorpusEntry>;
}

const pickEntry = (
  manifest: RunManifest,
  result: ExecutionResult,
  options: AggregateOptions,
): PromptCorpusEntry | ScenarioCorpusEntry | null => {
  const isScenario = result.scenarioName !== null;
  if (options.scoringMode === "current") {
    if (isScenario) {
      return options.currentScenarioCorpus?.[result.promptName] ?? null;
    }
    return options.currentPromptCorpus?.[result.promptName] ?? null;
  }
  // as-run: use the manifest's embedded corpus
  if (isScenario) {
    return manifest.scenarioCorpus[result.promptName] ?? null;
  }
  return manifest.promptCorpus[result.promptName] ?? null;
};

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
 * Result of aggregating one archive.
 */
export interface AggregatedArchive {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly unmatched: ReadonlyArray<{
    readonly promptName: string;
    readonly reason: "no-corpus-entry";
  }>;
}

/**
 * Turn one loaded archive into the corresponding webapp records plus
 * diagnostic lists. `unmatched` entries had no corpus match under the
 * requested scoring mode and are dropped (no valid record can be built
 * without a corpus entry — there's no `category`, `tier`, or `promptText`
 * to fill).
 */
export const aggregateArchive = (
  archive: LoadedArchive,
  options: AggregateOptions,
): Effect.Effect<AggregatedArchive, never, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const records: WebappRecord[] = [];
    const unmatched: AggregatedArchive["unmatched"] =
      [] as unknown as AggregatedArchive["unmatched"];
    const unmatchedMut = unmatched as Array<{
      readonly promptName: string;
      readonly reason: "no-corpus-entry";
    }>;

    for (const result of archive.results) {
      const entry = pickEntry(archive.manifest, result, options);
      if (entry === null) {
        unmatchedMut.push({ promptName: result.promptName, reason: "no-corpus-entry" });
        continue;
      }
      const score =
        result.error !== null && result.error.length > 0
          ? errorScore(result)
          : yield* safeScore(result, entry);
      records.push(toWebappRecord(result, entry, score));
    }
    return { records, unmatched };
  });

/**
 * Aggregate multiple archives. Concatenates the per-archive results in input
 * order. Unmatched entries across archives are collected into one flat list
 * tagged with the source archive path.
 */
export const aggregateAll = (
  archives: ReadonlyArray<{ readonly path: string; readonly data: LoadedArchive }>,
  options: AggregateOptions,
): Effect.Effect<
  {
    readonly records: ReadonlyArray<WebappRecord>;
    readonly unmatched: ReadonlyArray<{
      readonly archivePath: string;
      readonly promptName: string;
    }>;
  },
  never,
  CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const records: WebappRecord[] = [];
    const unmatched: Array<{ readonly archivePath: string; readonly promptName: string }> = [];
    for (const a of archives) {
      const out = yield* aggregateArchive(a.data, options);
      records.push(...out.records);
      for (const u of out.unmatched) {
        unmatched.push({ archivePath: a.path, promptName: u.promptName });
      }
    }
    return { records, unmatched };
  });
