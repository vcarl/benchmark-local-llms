/**
 * Pure glue layer between CLI flag structs and {@link RunLoopConfig}.
 *
 * The @effect/cli layer parses flags into a plain options object; this module
 * converts that object (plus loaded corpora) into the `RunLoopConfig` shape
 * that the orchestration layer consumes. Kept separate from the subcommand
 * definition so flag parsing and config assembly can be unit-tested in
 * isolation.
 *
 * Scenario filtering semantics mirror `benchmark.py::main` lines 166-177:
 *   - `"none"` → no scenarios (empty array)
 *   - `"all"`  → every scenario
 *   - any other substring → scenarios whose `.name` contains it
 *
 * Temperature is no longer a CLI flag — each model in `models.yaml` carries
 * its own `temperature: number` and the run loop reads it directly.
 */

import type { RunLoopConfig } from "../../orchestration/run-loop.js";
import type { ModelConfig } from "../../schema/model.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";

/**
 * Shape of run-time options after parsing (see `commands/run.ts`). Kept here
 * so tests can construct it without importing @effect/cli.
 */
export interface RunFlags {
  readonly modelName?: string | undefined;
  readonly quant?: string | undefined;
  readonly params?: string | undefined;
  readonly maxTokens: number;
  readonly scenarios: string;
  readonly noSave: boolean;
  readonly fresh: boolean;
  readonly idleTimeoutSec?: number | undefined;
  readonly archiveDir: string;
  readonly scenariosOnly: boolean;
  /**
   * Logical-run group id stamped on every archive produced in one bench run
   * invocation. Real plumbing (state file, resume) lands in later tasks; for
   * now callers may pass the sentinel `"UNSET-PENDING-TASK-6"`.
   */
  readonly runId: string;
}

/** Filter the scenario corpus per the `--scenarios` flag semantics. */
export const filterScenarios = (
  scenarios: ReadonlyArray<ScenarioCorpusEntry>,
  filter: string,
): ReadonlyArray<ScenarioCorpusEntry> => {
  if (filter === "none") return [];
  if (filter === "all" || filter.length === 0) return scenarios;
  return scenarios.filter((s) => s.name.includes(filter));
};

/**
 * Assemble a {@link RunLoopConfig} from parsed flags + already-loaded corpora.
 * Pure function — does no I/O — so unit tests can fixture the inputs.
 */
export const buildRunLoopConfig = (params: {
  readonly flags: RunFlags;
  readonly models: ReadonlyArray<ModelConfig>;
  readonly promptCorpus: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarioCorpus: ReadonlyArray<ScenarioCorpusEntry>;
  readonly systemPrompts: Record<string, string>;
}): RunLoopConfig => {
  const scenarios = filterScenarios(params.scenarioCorpus, params.flags.scenarios);
  const config: RunLoopConfig = {
    runId: params.flags.runId,
    models: params.models,
    promptCorpus: params.promptCorpus,
    scenarioCorpus: scenarios,
    systemPrompts: params.systemPrompts,
    archiveDir: params.flags.archiveDir,
    fresh: params.flags.fresh,
    maxTokens: params.flags.maxTokens,
    noSave: params.flags.noSave,
    scenariosOnly: params.flags.scenariosOnly,
    ...(params.flags.modelName !== undefined ? { modelNameFilter: params.flags.modelName } : {}),
    ...(params.flags.quant !== undefined ? { quantFilter: params.flags.quant } : {}),
    ...(params.flags.params !== undefined ? { paramsFilter: params.flags.params } : {}),
    ...(params.flags.idleTimeoutSec !== undefined
      ? { idleTimeoutSec: params.flags.idleTimeoutSec }
      : {}),
  };
  return config;
};
