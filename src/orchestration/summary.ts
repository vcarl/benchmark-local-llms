/**
 * Per-model aggregator + formatter for the end-of-run summary block.
 *
 * Pure data — no Effect, no logging, no I/O. The orchestration layer
 * updates a `Ref<ModelAggregate>` as results stream in, then passes the
 * terminal aggregate to `formatModelBlock` for emission.
 */
import type { Runtime, TerminationReason } from "../schema/enums.js";
import type { ExecutionResult } from "../schema/execution.js";

export interface StatsCounts {
  readonly completed: number;
  readonly cached: number;
  readonly errors: number;
}

interface SlowestItem {
  readonly name: string;
  readonly wallTimeSec: number;
  readonly kind: "prompt" | "scenario";
}

export interface ModelAggregate {
  readonly promptStats: StatsCounts;
  readonly scenarioStats: StatsCounts & { readonly lastErrorReason: TerminationReason | null };
  readonly tokenWeightedGenTpsNumerator: number;
  readonly tokenWeightedGenTpsDenominator: number;
  readonly tokenWeightedPromptTpsNumerator: number;
  readonly tokenWeightedPromptTpsDenominator: number;
  readonly slowest: ReadonlyArray<SlowestItem>;
}

export const emptyAggregate = (): ModelAggregate => ({
  promptStats: { completed: 0, cached: 0, errors: 0 },
  scenarioStats: { completed: 0, cached: 0, errors: 0, lastErrorReason: null },
  tokenWeightedGenTpsNumerator: 0,
  tokenWeightedGenTpsDenominator: 0,
  tokenWeightedPromptTpsNumerator: 0,
  tokenWeightedPromptTpsDenominator: 0,
  slowest: [],
});

const bumpCounts = (s: StatsCounts, cached: boolean, error: boolean): StatsCounts => {
  if (error) return { ...s, errors: s.errors + 1 };
  if (cached) return { ...s, cached: s.cached + 1 };
  return { ...s, completed: s.completed + 1 };
};

const addSlowest = (
  slots: ReadonlyArray<SlowestItem>,
  entry: SlowestItem,
): ReadonlyArray<SlowestItem> =>
  [...slots, entry].sort((a, b) => b.wallTimeSec - a.wallTimeSec).slice(0, 3);

const includeInSlowest = (r: ExecutionResult, cached: boolean): boolean =>
  !cached && r.error === null;

const addTps = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): Pick<
  ModelAggregate,
  | "tokenWeightedGenTpsDenominator"
  | "tokenWeightedGenTpsNumerator"
  | "tokenWeightedPromptTpsDenominator"
  | "tokenWeightedPromptTpsNumerator"
> => {
  if (cached || r.error !== null) {
    return {
      tokenWeightedGenTpsDenominator: agg.tokenWeightedGenTpsDenominator,
      tokenWeightedGenTpsNumerator: agg.tokenWeightedGenTpsNumerator,
      tokenWeightedPromptTpsDenominator: agg.tokenWeightedPromptTpsDenominator,
      tokenWeightedPromptTpsNumerator: agg.tokenWeightedPromptTpsNumerator,
    };
  }
  return {
    tokenWeightedGenTpsDenominator: agg.tokenWeightedGenTpsDenominator + r.generationTokens,
    tokenWeightedGenTpsNumerator:
      agg.tokenWeightedGenTpsNumerator + r.generationTokens * r.generationTps,
    tokenWeightedPromptTpsDenominator: agg.tokenWeightedPromptTpsDenominator + r.promptTokens,
    tokenWeightedPromptTpsNumerator:
      agg.tokenWeightedPromptTpsNumerator + r.promptTokens * r.promptTps,
  };
};

export const recordPrompt = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): ModelAggregate => {
  const tps = addTps(agg, r, cached);
  const promptStats = bumpCounts(agg.promptStats, cached, r.error !== null);
  const slowest = includeInSlowest(r, cached)
    ? addSlowest(agg.slowest, { kind: "prompt", name: r.promptName, wallTimeSec: r.wallTimeSec })
    : agg.slowest;
  return { ...agg, ...tps, promptStats, slowest };
};

export const recordScenario = (
  agg: ModelAggregate,
  r: ExecutionResult,
  cached: boolean,
): ModelAggregate => {
  // Scenarios are not included in TPS averages — they measure game-play wall time,
  // not raw generation throughput.
  const tps = {
    tokenWeightedGenTpsDenominator: agg.tokenWeightedGenTpsDenominator,
    tokenWeightedGenTpsNumerator: agg.tokenWeightedGenTpsNumerator,
    tokenWeightedPromptTpsDenominator: agg.tokenWeightedPromptTpsDenominator,
    tokenWeightedPromptTpsNumerator: agg.tokenWeightedPromptTpsNumerator,
  };
  const isError = r.error !== null;
  const scenarioStats: ModelAggregate["scenarioStats"] = {
    ...bumpCounts(agg.scenarioStats, cached, isError),
    lastErrorReason: isError ? r.terminationReason : agg.scenarioStats.lastErrorReason,
  };
  const name = r.scenarioName ?? r.promptName;
  const slowest = includeInSlowest(r, cached)
    ? addSlowest(agg.slowest, { kind: "scenario", name, wallTimeSec: r.wallTimeSec })
    : agg.slowest;
  return { ...agg, ...tps, scenarioStats, slowest };
};

const safeDivide = (num: number, den: number): number => (den === 0 ? 0 : num / den);

export const averageGenTps = (agg: ModelAggregate): number =>
  safeDivide(agg.tokenWeightedGenTpsNumerator, agg.tokenWeightedGenTpsDenominator);

export const averagePromptTps = (agg: ModelAggregate): number =>
  safeDivide(agg.tokenWeightedPromptTpsNumerator, agg.tokenWeightedPromptTpsDenominator);

export const slowest3 = (agg: ModelAggregate): ReadonlyArray<SlowestItem> => agg.slowest;

// ── Formatters ─────────────────────────────────────────────────────────────

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(1)}h`;
};

const scenarioErrorTrailer = (s: ModelAggregate["scenarioStats"]): string => {
  if (s.errors === 0) return "";
  const reason = s.lastErrorReason ?? "error";
  return ` (${reason})`;
};

const slowestLine = (slots: ReadonlyArray<SlowestItem>): string => {
  if (slots.length === 0) return "—";
  return slots.map((s) => `${s.name} ${Math.round(s.wallTimeSec)}s`).join(" · ");
};

export interface FormatModelBlockParams {
  readonly aggregate: ModelAggregate;
  readonly archivePath: string;
  readonly interrupted: boolean;
  readonly modelDisplayName: string;
  readonly quant: string;
  readonly runtime: Runtime;
  readonly totalWallTimeSec: number;
}

export const formatModelBlock = (params: FormatModelBlockParams): string => {
  const a = params.aggregate;
  const headerLabel = `${params.modelDisplayName} · ${params.runtime}${
    params.quant ? ` · ${params.quant}` : ""
  }`;
  const headerRule = `─ ${headerLabel} ${"─".repeat(Math.max(0, 50 - headerLabel.length))}`;
  const promptsLine = `  prompts     ${a.promptStats.completed} completed · ${a.promptStats.cached} cached · ${a.promptStats.errors} errors`;
  const scenariosLine = `  scenarios   ${a.scenarioStats.completed} completed · ${a.scenarioStats.cached} cached · ${a.scenarioStats.errors} errors${scenarioErrorTrailer(a.scenarioStats)}`;
  const wallLine = `  wall        ${formatDuration(params.totalWallTimeSec)} total · avg ${averageGenTps(a).toFixed(1)} tps gen · avg ${averagePromptTps(a).toFixed(1)} tps prompt`;
  const slowestListLine = `  slowest     ${slowestLine(a.slowest)}`;
  const archiveLine = `  archive     ${params.archivePath}`;
  const interruptedLine = `  interrupted ${params.interrupted}`;
  return [
    headerRule,
    promptsLine,
    scenariosLine,
    wallLine,
    slowestListLine,
    archiveLine,
    interruptedLine,
  ].join("\n");
};

export interface ModelRollupInput {
  readonly cached: number;
  readonly completed: number;
  readonly errors: number;
  readonly totalWallTimeSec: number;
}

export const formatCrossModelRollup = (rows: ReadonlyArray<ModelRollupInput>): string => {
  const totals = rows.reduce(
    (acc, r) => ({
      cached: acc.cached + r.cached,
      completed: acc.completed + r.completed,
      errors: acc.errors + r.errors,
      wall: acc.wall + r.totalWallTimeSec,
    }),
    { cached: 0, completed: 0, errors: 0, wall: 0 },
  );
  const heading = `─ totals ${"─".repeat(50)}`;
  const body = `  ${rows.length} models · ${totals.completed} completed · ${totals.cached} cached · ${totals.errors} errors · ${formatDuration(totals.wall)} total`;
  return `${heading}\n${body}`;
};
