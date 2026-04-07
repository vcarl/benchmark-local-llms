"""Run one SpaceMolt game session: gameserver + commander + cutoff watchdog.

Assembles game_admin, game_lifecycle, commander_runner, and cutoff_watchdog
into a single entry point. Tests use mocks; the integration smoke test in
tests/test_game_session_integration.py exercises the real binaries.
"""

import secrets
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from common import (
    GAMESERVER_BINARY, COMMANDER_DIR,
    COMMANDER_LOCAL_BASE_URL_ENV,
    Scenario,
)
from game_admin import AdminClient, AdminError
from game_lifecycle import allocate_port, start_gameserver, stop_gameserver
from commander_runner import CommanderEvent, iter_events, spawn_commander
from cutoff_watchdog import CutoffWatchdog


LLAMACPP_BASE_URL = "http://127.0.0.1:18080/v1"  # matches runner.LLAMACPP_PORT


@dataclass
class GameSessionResult:
    scenario_name: str
    termination_reason: str  # completed | wall_clock | tokens | tool_calls | error
    tool_call_count: int
    total_tokens: int
    elapsed_sec: float
    events: list[CommanderEvent] = field(default_factory=list)
    final_player_stats: dict = field(default_factory=dict)
    final_event_log: list = field(default_factory=list)
    error: Optional[str] = None


def run_game_session(
    scenario: Scenario,
    model_name: str,
    commander_model_string: str,
    scenario_path: str,
) -> GameSessionResult:
    """Run one scenario × model game session end to end.

    `commander_model_string` is the value passed to commander's `--model` flag,
    formatted for the local provider (see Task 6 investigation — e.g.
    "ollama/qwen2.5-7b-instruct").

    `scenario_path` is the path commander reads for scenario goal text. For
    SpaceMolt this is the markdown scenario file in ~/workspace/smbench/scenarios,
    NOT the testbench YAML.
    """
    port = allocate_port()
    admin_token = secrets.token_hex(16)
    session_id = uuid.uuid4().hex[:8]
    server_url = f"http://127.0.0.1:{port}"

    events: list[CommanderEvent] = []
    watchdog = CutoffWatchdog(scenario.cutoffs)
    termination = "error"
    error: Optional[str] = None
    final_stats: dict = {}
    final_log: list = []

    gs_proc = None
    cmd_proc = None
    try:
        gs_proc = start_gameserver(GAMESERVER_BINARY, port=port, admin_token=admin_token)
        admin = AdminClient(server_url, admin_token)
        # TODO: re-enable once the gameserver exposes /api/admin/benchmark/reset.
        # Running without fixture reset means scores are only meaningful when the
        # server happens to be in a known state. See design doc (2026-04-07).
        try:
            admin.reset(scenario.fixture)
        except AdminError as e:
            print(f"    [warn] reset skipped: {e}", flush=True)

        cmd_proc = spawn_commander(
            commander_dir=COMMANDER_DIR,
            model=commander_model_string,
            scenario_path=Path(scenario_path),
            server_url=server_url,
            session=session_id,
            llm_base_url_env=COMMANDER_LOCAL_BASE_URL_ENV,
            llm_base_url=LLAMACPP_BASE_URL,
        )

        for event in iter_events(cmd_proc):
            events.append(event)
            watchdog.observe(event)
            if watchdog.tripped() is not None:
                termination = watchdog.tripped()
                cmd_proc.terminate()
                try:
                    cmd_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cmd_proc.kill()
                break
        else:
            # Generator exhausted normally — commander exited
            cmd_proc.wait(timeout=10)
            termination = "completed"

        try:
            final_stats = admin.get_player_stats(scenario.llm_player_id)
            final_log = admin.get_event_log()
        except AdminError as e:
            # Final-state read failure shouldn't mask the run; record but continue
            error = f"final-state read: {e}"

    except Exception as e:
        termination = "error"
        error = str(e)[:200]
    finally:
        if cmd_proc is not None and cmd_proc.poll() is None:
            cmd_proc.terminate()
            try:
                cmd_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cmd_proc.kill()
        if gs_proc is not None:
            stop_gameserver(gs_proc)

    return GameSessionResult(
        scenario_name=scenario.name,
        termination_reason=termination,
        tool_call_count=watchdog.tool_call_count,
        total_tokens=watchdog.total_tokens,
        elapsed_sec=watchdog.elapsed_sec,
        events=events,
        final_player_stats=final_stats,
        final_event_log=final_log,
        error=error,
    )
