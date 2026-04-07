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


_REGISTRY: dict[str, Callable[[GameSessionResult, dict], tuple[float, str]]] = {
    "bootstrap_grind": _bootstrap_grind,
    "navigation": _navigation,
    "trading": _trading,
    "combat": _combat,
    "generic": _generic,
}


def score_game(scorer_name: str, result: GameSessionResult, params: dict) -> tuple[float, str]:
    if scorer_name not in _REGISTRY:
        raise ScorerNotFound(f"Unknown game scorer: {scorer_name}")
    return _REGISTRY[scorer_name](result, params)
