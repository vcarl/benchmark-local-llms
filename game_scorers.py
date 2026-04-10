"""Game scenario scorers — Python port of smbench/src/lib/scorer.ts.

Each scorer takes a GameSessionResult and params dict, returns (score, details)
where score is in [0, 1] (matching testbench's existing 0-1 normalization) and
details is a human-readable summary string for the report.

Note: smbench uses a 0-100 scale; we divide by 100 here to match testbench's
existing scoring convention (see _score_constraints in runner.py:175).
"""

from typing import Callable

from game_session import GameSessionResult


class ScorerNotFound(KeyError):
    pass


def _tool_metrics(result: GameSessionResult) -> tuple[int, int, float]:
    tool_calls = sum(1 for e in result.events if e.event == "tool_call")
    tool_errors = sum(1 for e in result.events if e.event == "tool_error")
    total = tool_calls + tool_errors
    accuracy = tool_calls / total if total > 0 else 0.0
    return total, tool_errors, accuracy


def _stat(stats: dict, key: str) -> float:
    inner = stats.get("stats", {}) if isinstance(stats, dict) else {}
    return float(inner.get(key, 0))


def _bootstrap_grind(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    credits_earned = _stat(result.final_player_stats, "credits_earned")
    earn_ratio = (credits_earned / total_tools) if total_tools > 0 else 0.0

    credit_score = min(credits_earned / 5000, 1) * 40
    efficiency_score = accuracy * 20
    activity_score = min(total_tools / 30, 1) * 20
    ratio_score = min(earn_ratio / 30, 1) * 20

    raw = credit_score + efficiency_score + activity_score + ratio_score
    return raw / 100, (
        f"credits_earned={int(credits_earned)} tools={total_tools} "
        f"errors={errors} ratio={earn_ratio:.1f}"
    )


def _navigation(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    explored = _stat(result.final_player_stats, "systems_explored")

    exploration = min(explored / 10, 1) * 50
    efficiency = accuracy * 25
    activity = min(total_tools / 20, 1) * 25
    raw = exploration + efficiency + activity
    return raw / 100, f"systems_explored={int(explored)} tools={total_tools} errors={errors}"


def _trading(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    credits = float(result.final_player_stats.get("credits", 0))
    earned = _stat(result.final_player_stats, "credits_earned")

    credit_score = min(credits / 15000, 1) * 40
    earned_score = min(earned / 20000, 1) * 30
    efficiency = accuracy * 15
    activity = min(total_tools / 40, 1) * 15
    raw = credit_score + earned_score + efficiency + activity
    return raw / 100, f"credits={int(credits)} earned={int(earned)} tools={total_tools}"


def _combat(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    pirates = _stat(result.final_player_stats, "pirates_destroyed")

    pirate_score = min(pirates / 3, 1) * 50
    efficiency = accuracy * 25
    activity = min(total_tools / 30, 1) * 25
    raw = pirate_score + efficiency + activity
    return raw / 100, f"pirates_destroyed={int(pirates)} tools={total_tools}"


def _generic(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    efficiency = accuracy * 50
    activity = min(total_tools / 30, 1) * 50
    raw = efficiency + activity
    return raw / 100, f"tools={total_tools} errors={errors} accuracy={accuracy:.2f}"


def _dock_and_sell(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    ore_mined = _stat(result.final_player_stats, "ore_mined")
    times_docked = _stat(result.final_player_stats, "times_docked")
    credits_earned = _stat(result.final_player_stats, "credits_earned")

    ore_score = min(ore_mined / 5, 1) * 25
    dock_score = min(times_docked / 2, 1) * 25
    credit_score = min(credits_earned / 50, 1) * 30
    accuracy_score = accuracy * 20

    raw = ore_score + dock_score + credit_score + accuracy_score
    return raw / 100, (
        f"ore_mined={int(ore_mined)} times_docked={int(times_docked)} "
        f"credits_earned={int(credits_earned)} errors={errors}"
    )


def _refuel_loop(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    times_docked = _stat(result.final_player_stats, "times_docked")
    jumps_completed = _stat(result.final_player_stats, "jumps_completed")
    deaths_by_pirate = _stat(result.final_player_stats, "deaths_by_pirate")
    deaths_by_player = _stat(result.final_player_stats, "deaths_by_player")
    deaths_by_self = _stat(result.final_player_stats, "deaths_by_self_destruct")
    total_deaths = deaths_by_pirate + deaths_by_player + deaths_by_self

    dock_score = min(times_docked / 3, 1) * 30
    jump_score = min(jumps_completed / 2, 1) * 30
    survival_score = (1 if total_deaths == 0 else 0) * 20
    accuracy_score = accuracy * 20

    raw = dock_score + jump_score + survival_score + accuracy_score
    return raw / 100, (
        f"times_docked={int(times_docked)} jumps_completed={int(jumps_completed)} "
        f"deaths={int(total_deaths)} errors={errors}"
    )


def _navigation_route(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    systems_explored = _stat(result.final_player_stats, "systems_explored")
    jumps_completed = _stat(result.final_player_stats, "jumps_completed")

    explore_score = min(systems_explored / 3, 1) * 40
    jump_score = min(jumps_completed / 2, 1) * 30
    accuracy_score = accuracy * 30

    raw = explore_score + jump_score + accuracy_score
    return raw / 100, (
        f"systems_explored={int(systems_explored)} jumps_completed={int(jumps_completed)} "
        f"errors={errors}"
    )


def _market_buy_sell(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    items_bought = _stat(result.final_player_stats, "exchange_items_bought")
    items_sold = _stat(result.final_player_stats, "exchange_items_sold")
    credits_earned = _stat(result.final_player_stats, "credits_earned")

    buy_score = min(items_bought / 1, 1) * 30
    sell_score = min(items_sold / 1, 1) * 30
    credit_score = min(credits_earned / 500, 1) * 20
    accuracy_score = accuracy * 20

    raw = buy_score + sell_score + credit_score + accuracy_score
    return raw / 100, (
        f"exchange_items_bought={int(items_bought)} exchange_items_sold={int(items_sold)} "
        f"credits_earned={int(credits_earned)} errors={errors}"
    )


def _equip_ship(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    modules_installed = _stat(result.final_player_stats, "modules_installed")

    install_score = min(modules_installed / 1, 1) * 60
    accuracy_score = accuracy * 20
    activity_score = min(total_tools / 10, 1) * 20

    raw = install_score + accuracy_score + activity_score
    return raw / 100, (
        f"modules_installed={int(modules_installed)} tools={total_tools} errors={errors}"
    )


def _craft_item(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    items_crafted = _stat(result.final_player_stats, "items_crafted")

    craft_score = min(items_crafted / 1, 1) * 60
    accuracy_score = accuracy * 20
    activity_score = min(total_tools / 10, 1) * 20

    raw = craft_score + accuracy_score + activity_score
    return raw / 100, (
        f"items_crafted={int(items_crafted)} tools={total_tools} errors={errors}"
    )


def _combat_pirate(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    pirates_destroyed = _stat(result.final_player_stats, "pirates_destroyed")
    battles_started = _stat(result.final_player_stats, "battles_started")
    deaths_by_pirate = _stat(result.final_player_stats, "deaths_by_pirate")
    deaths_by_player = _stat(result.final_player_stats, "deaths_by_player")
    deaths_by_self = _stat(result.final_player_stats, "deaths_by_self_destruct")
    total_deaths = deaths_by_pirate + deaths_by_player + deaths_by_self

    pirate_score = min(pirates_destroyed / 1, 1) * 40
    battle_score = min(battles_started / 1, 1) * 20
    survival_score = (20 if total_deaths == 0 else 6)
    accuracy_score = accuracy * 20

    raw = pirate_score + battle_score + survival_score + accuracy_score
    return raw / 100, (
        f"pirates_destroyed={int(pirates_destroyed)} battles_started={int(battles_started)} "
        f"deaths={int(total_deaths)} errors={errors}"
    )


def _storage_management(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    ore_mined = _stat(result.final_player_stats, "ore_mined")
    times_docked = _stat(result.final_player_stats, "times_docked")

    ore_score = min(ore_mined / 5, 1) * 25
    dock_score = min(times_docked / 2, 1) * 25
    accuracy_score = accuracy * 30
    activity_score = min(total_tools / 15, 1) * 20

    raw = ore_score + dock_score + accuracy_score + activity_score
    return raw / 100, (
        f"ore_mined={int(ore_mined)} times_docked={int(times_docked)} "
        f"tools={total_tools} errors={errors}"
    )


def _scan_and_survey(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    systems_explored = _stat(result.final_player_stats, "systems_explored")
    scans_performed = _stat(result.final_player_stats, "scans_performed")

    explore_score = min(systems_explored / 2, 1) * 35
    scan_score = min(scans_performed / 1, 1) * 35
    accuracy_score = accuracy * 30

    raw = explore_score + scan_score + accuracy_score
    return raw / 100, (
        f"systems_explored={int(systems_explored)} scans_performed={int(scans_performed)} "
        f"errors={errors}"
    )


_REGISTRY: dict[str, Callable[[GameSessionResult, dict], tuple[float, str]]] = {
    "bootstrap_grind": _bootstrap_grind,
    "navigation": _navigation,
    "trading": _trading,
    "combat": _combat,
    "generic": _generic,
    "dock_and_sell": _dock_and_sell,
    "refuel_loop": _refuel_loop,
    "navigation_route": _navigation_route,
    "market_buy_sell": _market_buy_sell,
    "equip_ship": _equip_ship,
    "craft_item": _craft_item,
    "combat_pirate": _combat_pirate,
    "storage_management": _storage_management,
    "scan_and_survey": _scan_and_survey,
}


def score_game(scorer_name: str, result: GameSessionResult, params: dict) -> tuple[float, str]:
    if scorer_name not in _REGISTRY:
        raise ScorerNotFound(f"Unknown game scorer: {scorer_name}")
    return _REGISTRY[scorer_name](result, params)
