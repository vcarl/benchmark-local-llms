/**
 * Game scenario scorers — port of `game_scorers.py`.
 *
 * Each scorer reads tool events (from `result.events`) and final player stats
 * (from `result.finalPlayerStats`) and returns a score in [0, 1] plus a
 * human-readable details string. The registry at the bottom keys all
 * scorers by the same name strings the prototype uses, so the YAML config's
 * `scorer_name` field dispatches identically.
 *
 * The Python source divides its smbench-style 0-100 output by 100 to get
 * testbench's 0-1 convention; we do the same here. Clamps, thresholds, and
 * accuracy weights are byte-exact ports — migrated archives must re-score
 * identically.
 */
import type { AgentEvent, ExecutionResult } from "../schema/index.js";
import type { ScenarioScore } from "./score-result.js";

type PlayerStats = Record<string, unknown>;
type Params = Record<string, unknown>;

type ScorerFn = (result: ExecutionResult, params: Params) => ScenarioScore;

const toolMetrics = (
  events: ReadonlyArray<AgentEvent> | null,
): { totalTools: number; errors: number; accuracy: number } => {
  if (events === null) return { totalTools: 0, errors: 0, accuracy: 0 };
  let toolCalls = 0;
  let toolErrors = 0;
  for (const e of events) {
    if (e.event === "tool_call") toolCalls++;
    else if (e.event === "tool_error") toolErrors++;
  }
  const total = toolCalls + toolErrors;
  const accuracy = total > 0 ? toolCalls / total : 0.0;
  return { totalTools: total, errors: toolErrors, accuracy };
};

/**
 * Reads `stats.stats[key]` as a number. Mirrors the Python `_stat` helper:
 * `final_player_stats` is a dict whose `stats` key holds another dict of
 * numeric counters. Missing values read as 0.
 */
const stat = (stats: PlayerStats | null, key: string): number => {
  if (stats === null) return 0;
  const inner = stats["stats"];
  if (typeof inner !== "object" || inner === null) return 0;
  const v = (inner as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
};

const clamp1 = (x: number): number => (x > 1 ? 1 : x);

const generic: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const efficiency = accuracy * 50;
  const activity = clamp1(totalTools / 30) * 50;
  const raw = efficiency + activity;
  return {
    kind: "scenario",
    value: raw / 100,
    scoreField: "generic",
    details: `tools=${totalTools} errors=${errors} accuracy=${accuracy.toFixed(2)}`,
  };
};

const dock_and_sell: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const oreMined = stat(r.finalPlayerStats, "ore_mined");
  const timesDocked = stat(r.finalPlayerStats, "times_docked");
  const creditsEarned = stat(r.finalPlayerStats, "credits_earned");

  const oreScore = clamp1(oreMined / 5) * 25;
  const dockScore = clamp1(timesDocked / 2) * 25;
  const creditScore = clamp1(creditsEarned / 50) * 30;
  const accuracyScore = accuracy * 20;

  const raw = oreScore + dockScore + creditScore + accuracyScore;
  return {
    kind: "scenario",
    value: raw / 100,
    scoreField: "composite",
    details: `ore_mined=${Math.trunc(oreMined)} times_docked=${Math.trunc(timesDocked)} credits_earned=${Math.trunc(creditsEarned)} errors=${errors}`,
  };
};

const api_field: ScorerFn = (r, params) => {
  const scoreField =
    typeof params["scoreField"] === "string" ? (params["scoreField"] as string) : "score";
  if (r.finalPlayerStats === null) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `no finalPlayerStats; cannot read field "${scoreField}"`,
    };
  }
  const raw = r.finalPlayerStats[scoreField];
  if (raw === undefined || raw === null) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `field "${scoreField}" missing from finalPlayerStats`,
    };
  }
  // Coerce numeric strings ("4200") via Number(); Number.isFinite below rejects NaN.
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `field "${scoreField}" is non-numeric: ${JSON.stringify(raw)}`,
    };
  }
  return {
    kind: "scenario",
    value: num,
    scoreField,
    details: `${scoreField}=${num}`,
  };
};

export const GAME_SCORERS: Readonly<Record<string, ScorerFn>> = {
  api_field,
  dock_and_sell,
  generic,
};
