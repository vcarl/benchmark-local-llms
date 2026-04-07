from pathlib import Path

import pytest
import yaml

from common import Scenario, load_scenarios


def test_load_scenarios_parses_yaml(tmp_path):
    scenario_file = tmp_path / "bootstrap.yaml"
    scenario_file.write_text(yaml.safe_dump({
        "name": "bootstrap_grind",
        "fixture": "s1-bootstrap-grind",
        "players": [{"id": "alice", "controlled_by": "llm"}],
        "scorer": "bootstrap_grind",
        "scorer_params": {"target_credits": 1000},
        "cutoffs": {"wall_clock_sec": 600, "total_tokens": 100000, "tool_calls": 200},
        "commander": {"max_turns": 250},
    }))

    scenarios = load_scenarios(tmp_path)
    assert len(scenarios) == 1
    s = scenarios[0]
    assert isinstance(s, Scenario)
    assert s.name == "bootstrap_grind"
    assert s.fixture == "s1-bootstrap-grind"
    assert s.players == [{"id": "alice", "controlled_by": "llm"}]
    assert s.scorer == "bootstrap_grind"
    assert s.scorer_params == {"target_credits": 1000}
    assert s.cutoffs.wall_clock_sec == 600
    assert s.cutoffs.total_tokens == 100000
    assert s.cutoffs.tool_calls == 200
    assert s.commander_max_turns == 250


def test_load_scenarios_requires_one_llm_player(tmp_path):
    scenario_file = tmp_path / "bad.yaml"
    scenario_file.write_text(yaml.safe_dump({
        "name": "bad",
        "fixture": "x",
        "players": [{"id": "a", "controlled_by": "scripted"}],
        "scorer": "generic",
        "cutoffs": {"wall_clock_sec": 60, "total_tokens": 1000, "tool_calls": 10},
    }))
    with pytest.raises(ValueError, match="exactly one"):
        load_scenarios(tmp_path)

from common import BenchmarkResult, compute_scenario_hash, ScenarioCutoffs, Scenario


def test_benchmark_result_has_scenario_fields():
    r = BenchmarkResult(model="m", runtime="llamacpp", prompt_name="p")
    assert r.scenario_name is None
    assert r.termination_reason is None
    assert r.tool_call_count is None
    assert r.final_state_summary is None


def test_compute_scenario_hash_stable():
    s = Scenario(
        name="x",
        fixture="fix",
        players=[{"id": "a", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={"target_credits": 1000},
        cutoffs=ScenarioCutoffs(wall_clock_sec=60, total_tokens=1000, tool_calls=10),
    )
    h1 = compute_scenario_hash(s)
    h2 = compute_scenario_hash(s)
    assert h1 == h2
    assert len(h1) == 12

    s2 = Scenario(
        name="x", fixture="fix",
        players=[{"id": "a", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={"target_credits": 2000},  # different
        cutoffs=ScenarioCutoffs(wall_clock_sec=60, total_tokens=1000, tool_calls=10),
    )
    assert compute_scenario_hash(s2) != h1
