import pytest

from admiral_runner import AgentEvent
from game_scorers import score_game, ScorerNotFound
from game_session import GameSessionResult


def _result(events=None, stats=None, **overrides):
    base = dict(
        scenario_name="test",
        termination_reason="completed",
        tool_call_count=0,
        total_tokens=0,
        elapsed_sec=0.0,
        events=events or [],
        final_player_stats=stats or {},
    )
    base.update(overrides)
    return GameSessionResult(**base)


def test_bootstrap_grind_full_credit():
    events = [AgentEvent("tool_call", 1, "t") for _ in range(30)]
    result = _result(
        events=events,
        stats={"credits": 5000, "stats": {"credits_earned": 5000}},
        tool_call_count=30,
    )
    score, details = score_game("bootstrap_grind", result, {})
    # 40 (credits) + 20 (efficiency, no errors) + 20 (activity 30/30) + 20 (ratio 5000/30=166>30)
    # = 100 / 100 = 1.0
    assert score == pytest.approx(1.0, abs=0.01)
    assert "credits_earned=5000" in details


def test_bootstrap_grind_zero():
    result = _result(stats={"credits": 0, "stats": {"credits_earned": 0}})
    score, details = score_game("bootstrap_grind", result, {})
    assert score == 0.0


def test_bootstrap_grind_with_tool_errors_dilutes_efficiency():
    events = [AgentEvent("tool_call", 1, "t")] * 5 + [AgentEvent("tool_error", 1, "t")] * 5
    result = _result(events=events, stats={"credits": 0, "stats": {"credits_earned": 0}})
    score, _ = score_game("bootstrap_grind", result, {})
    # efficiency: 0.5*20=10, activity: 10/30*20=6.67 → 16.67/100 = 0.1667
    assert score == pytest.approx(0.1667, abs=0.01)


def test_navigation():
    result = _result(stats={"stats": {"systems_explored": 10}}, tool_call_count=20)
    result.events = [AgentEvent("tool_call", 1, "t")] * 20
    score, _ = score_game("navigation", result, {})
    # 50 (exploration) + 25 (efficiency) + 25 (activity) = 100 → 1.0
    assert score == pytest.approx(1.0, abs=0.01)


def test_generic_fallback():
    events = [AgentEvent("tool_call", 1, "t")] * 30
    result = _result(events=events, tool_call_count=30)
    score, _ = score_game("generic", result, {})
    # 50 efficiency + 50 activity = 100 → 1.0
    assert score == pytest.approx(1.0, abs=0.01)


def test_unknown_scorer_raises():
    with pytest.raises(ScorerNotFound):
        score_game("does_not_exist", _result(), {})
