from unittest.mock import patch, MagicMock

from common import BenchmarkResult, Scenario, ScenarioCutoffs
from admiral_runner import AgentEvent
from game_session import GameSessionResult
from runner import run_game_scenario, score_result


def _scenario():
    return Scenario(
        name="bootstrap_grind",
        fixture="s1-bootstrap-grind",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={},
        cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=100),
    )


def test_run_game_scenario_populates_benchmark_result():
    fake_session = GameSessionResult(
        scenario_name="bootstrap_grind",
        termination_reason="completed",
        tool_call_count=15,
        total_tokens=2500,
        elapsed_sec=42.0,
        events=[AgentEvent("tool_call", i, "t") for i in range(15)],
        final_player_stats={"credits": 1000, "stats": {"credits_earned": 1000}},
    )
    model_cfg = {"name": "Qwen 2.5 7B Instruct"}

    with patch("runner.run_game_session", return_value=fake_session):
        r = run_game_scenario(
            model_cfg=model_cfg,
            scenario=_scenario(),
            admiral_model_string="Qwen/Qwen2.5-7B-Instruct-GGUF",
            scenario_md_path="/fake/s1.md",
            llm_base_url="http://127.0.0.1:18080/v1",
        )

    assert isinstance(r, BenchmarkResult)
    assert r.model == "Qwen 2.5 7B Instruct"
    assert r.runtime == "llamacpp"
    assert r.scenario_name == "bootstrap_grind"
    assert r.tool_call_count == 15
    assert r.termination_reason == "completed"
    assert r.wall_time_sec == 42.0
    assert r.final_state_summary == {"credits": 1000, "stats": {"credits_earned": 1000}}


def test_score_result_dispatches_to_game_scorer():
    r = BenchmarkResult(model="m", runtime="llamacpp", prompt_name="bootstrap_grind")
    r.scenario_name = "bootstrap_grind"
    r.tool_call_count = 30
    r.final_state_summary = {"credits": 5000, "stats": {"credits_earned": 5000}}
    r.output = "ignored for game scorers"

    pcfg = {
        "scorer": "game",
        "game_scorer": "bootstrap_grind",
        "scorer_params": {},
        "category": "game",
    }
    from admiral_runner import AgentEvent
    from game_session import GameSessionResult
    r._game_session = GameSessionResult(  # type: ignore[attr-defined]
        scenario_name="bootstrap_grind",
        termination_reason="completed",
        tool_call_count=30,
        total_tokens=1000,
        elapsed_sec=10.0,
        events=[AgentEvent("tool_call", i, "t") for i in range(30)],
        final_player_stats={"credits": 5000, "stats": {"credits_earned": 5000}},
    )

    score_result(r, pcfg)
    assert r.score is not None
    assert r.score > 0.5
