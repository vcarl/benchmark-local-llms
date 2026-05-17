from unittest.mock import MagicMock, patch

from admiral_runner import AgentEvent
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
    """Admiral agent loop runs, SSE stream closes, no cutoffs trip."""
    events = [
        AgentEvent("connection", 1, "t", {"summary": "connected"}),
        AgentEvent("tool_call", 2, "t", {"tool": "scan"}),
        AgentEvent("turn_end", 3, "t", {"totalTokensIn": 50, "totalTokensOut": 80}),
    ]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {"credits": 100, "stats": {"credits_earned": 100}}

    fake_gs_proc = MagicMock()
    fake_gs_proc.poll.return_value = None

    fake_stream = MagicMock()
    fake_stream.__iter__ = MagicMock(return_value=iter(events))
    fake_stream.__enter__ = MagicMock(return_value=fake_stream)
    fake_stream.__exit__ = MagicMock(return_value=False)

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.configure_provider"), \
         patch("game_session.create_profile", return_value="fake-profile-id"), \
         patch("game_session.connect_profile"), \
         patch("game_session.disconnect_profile"), \
         patch("game_session.delete_profile"), \
         patch("game_session.AdmiralLogStream", return_value=fake_stream):

        result = run_game_session(
            scenario=_scenario(),
            model_name="qwen-7b",
            admiral_model_string="Qwen/Qwen2.5-7B-Instruct-GGUF",
            scenario_path="/tmp/whatever.md",
            llm_base_url="http://127.0.0.1:18080/v1",
        )

    assert isinstance(result, GameSessionResult)
    assert result.termination_reason == "completed"
    assert result.tool_call_count == 1
    assert result.total_tokens == 130
    assert result.final_player_stats == {"credits": 100, "stats": {"credits_earned": 100}}
    fake_admin.reset.assert_called_once_with("fix")


def test_run_game_session_trips_tool_call_cutoff():
    # Three tool_calls, cutoff at 2
    events = [AgentEvent("tool_call", i, "t") for i in range(3)]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {}
    fake_gs_proc = MagicMock()

    fake_stream = MagicMock()
    fake_stream.__iter__ = MagicMock(return_value=iter(events))
    fake_stream.__enter__ = MagicMock(return_value=fake_stream)
    fake_stream.__exit__ = MagicMock(return_value=False)

    sc = _scenario(cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=2))

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.configure_provider"), \
         patch("game_session.create_profile", return_value="fake-profile-id"), \
         patch("game_session.connect_profile"), \
         patch("game_session.disconnect_profile") as mock_disconnect, \
         patch("game_session.delete_profile"), \
         patch("game_session.AdmiralLogStream", return_value=fake_stream):

        result = run_game_session(
            scenario=sc,
            model_name="qwen-7b",
            admiral_model_string="Qwen/Qwen2.5-7B-Instruct-GGUF",
            scenario_path="/tmp/whatever.md",
            llm_base_url="http://127.0.0.1:18080/v1",
        )

    assert result.termination_reason == "tool_calls"
    # Should have disconnected the profile on cutoff
    mock_disconnect.assert_called()
