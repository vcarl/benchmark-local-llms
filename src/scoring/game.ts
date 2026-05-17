/**
 * Game scenario scorers — port of `game_scorers.py`.
 *
 * Each scorer reads tool events (from `result.events`) and final player stats
 * (from `result.finalPlayerStats`) and returns a score in [0, 1] plus a
 * human-readable details string. The registry at the bottom keys all 14
 * scorers by the same name strings the prototype uses, so the YAML config's
 * `scorer_name` field dispatches identically.
 *
 * The Python source divides its smbench-style 0-100 output by 100 to get
 * testbench's 0-1 convention; we do the same here. Clamps, thresholds, and
 * accuracy weights are byte-exact ports — migrated archives must re-score
 * identically.
 */
import type { AgentEvent, ExecutionResult } from "../schema/index.js";
import type { Score } from "./score-result.js";

type PlayerStats = Record<string, unknown>;
type Params = Record<string, unknown>;

type ScorerFn = (result: ExecutionResult, params: Params) => Score;

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

/**
 * Reads a top-level field from `final_player_stats` as a number (mirrors
 * `float(result.final_player_stats.get("credits", 0))` in _trading).
 */
const topStat = (stats: PlayerStats | null, key: string): number => {
  if (stats === null) return 0;
  const v = stats[key];
  return typeof v === "number" ? v : 0;
};

const clamp1 = (x: number): number => (x > 1 ? 1 : x);

const bootstrap_grind: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const creditsEarned = stat(r.finalPlayerStats, "credits_earned");
  const earnRatio = totalTools > 0 ? creditsEarned / totalTools : 0.0;

  const creditScore = clamp1(creditsEarned / 5000) * 40;
  const efficiencyScore = accuracy * 20;
  const activityScore = clamp1(totalTools / 30) * 20;
  const ratioScore = clamp1(earnRatio / 30) * 20;

  const raw = creditScore + efficiencyScore + activityScore + ratioScore;
  return {
    score: raw / 100,
    details: `credits_earned=${Math.trunc(creditsEarned)} tools=${totalTools} errors=${errors} ratio=${earnRatio.toFixed(1)}`,
  };
};

const navigation: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const explored = stat(r.finalPlayerStats, "systems_explored");

  const exploration = clamp1(explored / 10) * 50;
  const efficiency = accuracy * 25;
  const activity = clamp1(totalTools / 20) * 25;
  const raw = exploration + efficiency + activity;
  return {
    score: raw / 100,
    details: `systems_explored=${Math.trunc(explored)} tools=${totalTools} errors=${errors}`,
  };
};

const trading: ScorerFn = (r) => {
  const { totalTools, accuracy } = toolMetrics(r.events);
  const credits = topStat(r.finalPlayerStats, "credits");
  const earned = stat(r.finalPlayerStats, "credits_earned");

  const creditScore = clamp1(credits / 15000) * 40;
  const earnedScore = clamp1(earned / 20000) * 30;
  const efficiency = accuracy * 15;
  const activity = clamp1(totalTools / 40) * 15;
  const raw = creditScore + earnedScore + efficiency + activity;
  return {
    score: raw / 100,
    details: `credits=${Math.trunc(credits)} earned=${Math.trunc(earned)} tools=${totalTools}`,
  };
};

const combat: ScorerFn = (r) => {
  const { totalTools, accuracy } = toolMetrics(r.events);
  const pirates = stat(r.finalPlayerStats, "pirates_destroyed");

  const pirateScore = clamp1(pirates / 3) * 50;
  const efficiency = accuracy * 25;
  const activity = clamp1(totalTools / 30) * 25;
  const raw = pirateScore + efficiency + activity;
  return {
    score: raw / 100,
    details: `pirates_destroyed=${Math.trunc(pirates)} tools=${totalTools}`,
  };
};

const generic: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const efficiency = accuracy * 50;
  const activity = clamp1(totalTools / 30) * 50;
  const raw = efficiency + activity;
  return {
    score: raw / 100,
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
    score: raw / 100,
    details: `ore_mined=${Math.trunc(oreMined)} times_docked=${Math.trunc(timesDocked)} credits_earned=${Math.trunc(creditsEarned)} errors=${errors}`,
  };
};

const refuel_loop: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const timesDocked = stat(r.finalPlayerStats, "times_docked");
  const jumpsCompleted = stat(r.finalPlayerStats, "jumps_completed");
  const deathsPirate = stat(r.finalPlayerStats, "deaths_by_pirate");
  const deathsPlayer = stat(r.finalPlayerStats, "deaths_by_player");
  const deathsSelf = stat(r.finalPlayerStats, "deaths_by_self_destruct");
  const totalDeaths = deathsPirate + deathsPlayer + deathsSelf;

  const dockScore = clamp1(timesDocked / 3) * 30;
  const jumpScore = clamp1(jumpsCompleted / 2) * 30;
  const survivalScore = (totalDeaths === 0 ? 1 : 0) * 20;
  const accuracyScore = accuracy * 20;

  const raw = dockScore + jumpScore + survivalScore + accuracyScore;
  return {
    score: raw / 100,
    details: `times_docked=${Math.trunc(timesDocked)} jumps_completed=${Math.trunc(jumpsCompleted)} deaths=${Math.trunc(totalDeaths)} errors=${errors}`,
  };
};

const navigation_route: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const systemsExplored = stat(r.finalPlayerStats, "systems_explored");
  const jumpsCompleted = stat(r.finalPlayerStats, "jumps_completed");

  const exploreScore = clamp1(systemsExplored / 3) * 40;
  const jumpScore = clamp1(jumpsCompleted / 2) * 30;
  const accuracyScore = accuracy * 30;

  const raw = exploreScore + jumpScore + accuracyScore;
  return {
    score: raw / 100,
    details: `systems_explored=${Math.trunc(systemsExplored)} jumps_completed=${Math.trunc(jumpsCompleted)} errors=${errors}`,
  };
};

const market_buy_sell: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const itemsBought = stat(r.finalPlayerStats, "exchange_items_bought");
  const itemsSold = stat(r.finalPlayerStats, "exchange_items_sold");
  const creditsEarned = stat(r.finalPlayerStats, "credits_earned");

  const buyScore = clamp1(itemsBought / 1) * 30;
  const sellScore = clamp1(itemsSold / 1) * 30;
  const creditScore = clamp1(creditsEarned / 500) * 20;
  const accuracyScore = accuracy * 20;

  const raw = buyScore + sellScore + creditScore + accuracyScore;
  return {
    score: raw / 100,
    details: `exchange_items_bought=${Math.trunc(itemsBought)} exchange_items_sold=${Math.trunc(itemsSold)} credits_earned=${Math.trunc(creditsEarned)} errors=${errors}`,
  };
};

const equip_ship: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const modulesInstalled = stat(r.finalPlayerStats, "modules_installed");

  const installScore = clamp1(modulesInstalled / 1) * 60;
  const accuracyScore = accuracy * 20;
  const activityScore = clamp1(totalTools / 10) * 20;

  const raw = installScore + accuracyScore + activityScore;
  return {
    score: raw / 100,
    details: `modules_installed=${Math.trunc(modulesInstalled)} tools=${totalTools} errors=${errors}`,
  };
};

const craft_item: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const itemsCrafted = stat(r.finalPlayerStats, "items_crafted");

  const craftScore = clamp1(itemsCrafted / 1) * 60;
  const accuracyScore = accuracy * 20;
  const activityScore = clamp1(totalTools / 10) * 20;

  const raw = craftScore + accuracyScore + activityScore;
  return {
    score: raw / 100,
    details: `items_crafted=${Math.trunc(itemsCrafted)} tools=${totalTools} errors=${errors}`,
  };
};

const combat_pirate: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const piratesDestroyed = stat(r.finalPlayerStats, "pirates_destroyed");
  const battlesStarted = stat(r.finalPlayerStats, "battles_started");
  const deathsPirate = stat(r.finalPlayerStats, "deaths_by_pirate");
  const deathsPlayer = stat(r.finalPlayerStats, "deaths_by_player");
  const deathsSelf = stat(r.finalPlayerStats, "deaths_by_self_destruct");
  const totalDeaths = deathsPirate + deathsPlayer + deathsSelf;

  const pirateScore = clamp1(piratesDestroyed / 1) * 40;
  const battleScore = clamp1(battlesStarted / 1) * 20;
  const survivalScore = totalDeaths === 0 ? 20 : 6;
  const accuracyScore = accuracy * 20;

  const raw = pirateScore + battleScore + survivalScore + accuracyScore;
  return {
    score: raw / 100,
    details: `pirates_destroyed=${Math.trunc(piratesDestroyed)} battles_started=${Math.trunc(battlesStarted)} deaths=${Math.trunc(totalDeaths)} errors=${errors}`,
  };
};

const storage_management: ScorerFn = (r) => {
  const { totalTools, errors, accuracy } = toolMetrics(r.events);
  const oreMined = stat(r.finalPlayerStats, "ore_mined");
  const timesDocked = stat(r.finalPlayerStats, "times_docked");

  const oreScore = clamp1(oreMined / 5) * 25;
  const dockScore = clamp1(timesDocked / 2) * 25;
  const accuracyScore = accuracy * 30;
  const activityScore = clamp1(totalTools / 15) * 20;

  const raw = oreScore + dockScore + accuracyScore + activityScore;
  return {
    score: raw / 100,
    details: `ore_mined=${Math.trunc(oreMined)} times_docked=${Math.trunc(timesDocked)} tools=${totalTools} errors=${errors}`,
  };
};

const scan_and_survey: ScorerFn = (r) => {
  const { errors, accuracy } = toolMetrics(r.events);
  const systemsExplored = stat(r.finalPlayerStats, "systems_explored");
  const scansPerformed = stat(r.finalPlayerStats, "scans_performed");

  const exploreScore = clamp1(systemsExplored / 2) * 35;
  const scanScore = clamp1(scansPerformed / 1) * 35;
  const accuracyScore = accuracy * 30;

  const raw = exploreScore + scanScore + accuracyScore;
  return {
    score: raw / 100,
    details: `systems_explored=${Math.trunc(systemsExplored)} scans_performed=${Math.trunc(scansPerformed)} errors=${errors}`,
  };
};

export const GAME_SCORERS: Readonly<Record<string, ScorerFn>> = {
  bootstrap_grind,
  navigation,
  trading,
  combat,
  generic,
  dock_and_sell,
  refuel_loop,
  navigation_route,
  market_buy_sell,
  equip_ship,
  craft_item,
  combat_pirate,
  storage_management,
  scan_and_survey,
};
