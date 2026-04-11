"""End-to-end smoke test: real gameserver + real Admiral + real llama.cpp.

Gated behind RUN_INTEGRATION=1. Requires:
  - Gameserver binary at $TESTBENCH_GAMESERVER_BINARY (or default)
  - Admiral checkout at $TESTBENCH_ADMIRAL_DIR (or default ~/workspace/admiral)
  - Llama.cpp server running on :18080 with a small model loaded
    (run `python benchmark.py --quick --model-name 'qwen 2.5 7b'` in another shell first)
  - ~/workspace/smbench/scenarios/s1-bootstrap-grind.md present
"""
import os
from pathlib import Path

import pytest

from common import (
    Scenario, ScenarioCutoffs, GAMESERVER_BINARY, ADMIRAL_DIR,
)
from admiral_runner import start_admiral_server, stop_admiral_server
from game_session import run_game_session


@pytest.mark.integration
def test_bootstrap_grind_smoke():
    if GAMESERVER_BINARY is None:
        pytest.skip("TESTBENCH_GAMESERVER_BINARY not set")
    if not GAMESERVER_BINARY.exists():
        pytest.skip(f"gameserver binary not at {GAMESERVER_BINARY}")
    if not ADMIRAL_DIR.exists():
        pytest.skip(f"admiral dir not at {ADMIRAL_DIR}")

    scenario_md = Path.home() / "workspace" / "smbench" / "scenarios" / "s1-bootstrap-grind.md"
    if not scenario_md.exists():
        pytest.skip(f"scenario md not at {scenario_md}")

    # Tight cutoffs so the smoke test finishes fast even if the model is slow
    scenario = Scenario(
        name="smoke_bootstrap",
        fixture="s1-bootstrap-grind",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={},
        cutoffs=ScenarioCutoffs(wall_clock_sec=120, total_tokens=20000, tool_calls=20),
    )

    # Start Admiral server for the test
    admiral_proc = start_admiral_server(ADMIRAL_DIR)
    try:
        result = run_game_session(
            scenario=scenario,
            model_name="Qwen 2.5 7B Instruct",
            admiral_model_string="Qwen/Qwen2.5-7B-Instruct-GGUF",
            scenario_path=str(scenario_md),
        )
    finally:
        stop_admiral_server(admiral_proc)

    # We don't assert success — only that the pipeline runs end-to-end without
    # exception and produces a recognizable termination reason.
    assert result.termination_reason in ("completed", "wall_clock", "tokens", "tool_calls")
    assert result.error is None or "final-state read" in (result.error or "")
    print(f"\nSmoke test result: {result.termination_reason}")
    print(f"  tool_calls={result.tool_call_count} tokens={result.total_tokens}")
    print(f"  events captured: {len(result.events)}")
    print(f"  final_stats: {result.final_player_stats}")
