from unittest.mock import MagicMock, patch

from commander_runner import CommanderEvent
from common import Scenario, ScenarioCutoffs
from game_session import GameSessionResult, run_game_session


def _scenario(**overrides):
    base = dict(
        name="test",
        fixture="fix",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="generic",
        cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=100),
    )
    base.update(overrides)
    return Scenario(**base)


def test_run_game_session_completes_normally(monkeypatch):
    """Commander exits cleanly, no cutoffs trip."""
    fake_proc = MagicMock()
    fake_proc.poll.return_value = 0
    fake_proc.wait.return_value = 0

    events = [
        CommanderEvent("turn_start", 1, "t"),
        CommanderEvent("tool_call", 1, "t", {"tool": "scan"}),
        CommanderEvent("turn_end", 1, "t", {"total_tokens_in": 50, "total_tokens_out": 80}),
    ]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {"credits": 100, "stats": {"credits_earned": 100}}
    fake_admin.get_event_log.return_value = []

    fake_gs_proc = MagicMock()
    fake_gs_proc.poll.return_value = None

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.spawn_commander", return_value=fake_proc), \
         patch("game_session.iter_events", return_value=iter(events)):

        result = run_game_session(
            scenario=_scenario(),
            model_name="qwen-7b",
            commander_model_string="ollama/qwen-7b",
            scenario_path="/tmp/whatever.yaml",
        )

    assert isinstance(result, GameSessionResult)
    assert result.termination_reason == "completed"
    assert result.tool_call_count == 1
    assert result.total_tokens == 130
    assert result.final_player_stats == {"credits": 100, "stats": {"credits_earned": 100}}
    fake_admin.reset.assert_called_once_with("fix")


def test_run_game_session_trips_tool_call_cutoff():
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None  # still running

    # Three tool_calls, cutoff at 2
    events = [CommanderEvent("tool_call", i, "t") for i in range(3)]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {}
    fake_admin.get_event_log.return_value = []
    fake_gs_proc = MagicMock()

    sc = _scenario(cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=2))

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.spawn_commander", return_value=fake_proc), \
         patch("game_session.iter_events", return_value=iter(events)):

        result = run_game_session(
            scenario=sc,
            model_name="qwen-7b",
            commander_model_string="ollama/qwen-7b",
            scenario_path="/tmp/whatever.yaml",
        )

    assert result.termination_reason == "tool_calls"
    fake_proc.terminate.assert_called()
