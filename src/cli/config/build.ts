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
  readonly maxTokens: number;
  readonly scenarios: string;
  readonly noSave: boolean;
  readonly fresh: boolean;
  readonly temperatures: ReadonlyArray<number>;
  readonly idleTimeoutSec?: number | undefined;
  readonly archiveDir: string;
  readonly scenariosOnly: boolean;
}

/**
 * Parse `--temperatures 0.7,1.0` into a number array. Empty / missing input
 * returns `[0.7]` per requirements §8.2.
 *
 * Returns `null` when any token fails to parse — caller turns that into a
 * user-facing validation error.
 */
export const parseTemperatures = (raw: string | undefined): ReadonlyArray<number> | null => {
  if (raw === undefined || raw.length === 0) return [0.7];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return [0.7];
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
};

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
    models: params.models,
    promptCorpus: params.promptCorpus,
    scenarioCorpus: scenarios,
    systemPrompts: params.systemPrompts,
    temperatures: params.flags.temperatures,
    archiveDir: params.flags.archiveDir,
    fresh: params.flags.fresh,
    maxTokens: params.flags.maxTokens,
    noSave: params.flags.noSave,
    scenariosOnly: params.flags.scenariosOnly,
    ...(params.flags.modelName !== undefined ? { modelNameFilter: params.flags.modelName } : {}),
    ...(params.flags.idleTimeoutSec !== undefined
      ? { idleTimeoutSec: params.flags.idleTimeoutSec }
      : {}),
  };
  return config;
};
