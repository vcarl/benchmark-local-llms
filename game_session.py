"""Run one SpaceMolt game session: gameserver + commander + cutoff watchdog.

Assembles game_admin, game_lifecycle, commander_runner, and cutoff_watchdog
into a single entry point. Tests use mocks; the integration smoke test in
tests/test_game_session_integration.py exercises the real binaries.
"""

import json as _json
import os
import secrets
import subprocess
import sys
import time
import uuid
from collections import Counter
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
from commander_runner import CommanderEvent, drain_stderr, iter_events, spawn_commander
from cutoff_watchdog import CutoffWatchdog


def _log(msg: str) -> None:
    print(f"    [game] {msg}", flush=True)


def _write_commander_credentials(commander_dir: str, session_id: str, creds: dict) -> None:
    """Write credentials.json into commander's session directory."""
    session_dir = Path(commander_dir) / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "username": creds.get("username"),
        "password": creds.get("password"),
        "empire": creds.get("empire"),
        "playerId": creds.get("playerId"),
    }
    (session_dir / "credentials.json").write_text(_json.dumps(payload, indent=2))


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
    error: Optional[str] = None


def run_game_session(
    scenario: Scenario,
    model_name: str,
    commander_model_string: str,
    scenario_path: str,
    llm_base_url: str = LLAMACPP_BASE_URL,
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
    # AdminClient uses absolute paths (`/api/admin/...`) so it takes the
    # bare origin. Commander's API lives under `/api/v1/` on the local
    # gameserver — session creation hits `/api/v1/session`, tool calls hit
    # `/api/v1/<command>`, and fetchGameCommands() does
    # `baseUrl + "/openapi.json"` → `/api/v1/openapi.json`.
    origin_url = f"http://127.0.0.1:{port}"
    commander_base_url = f"{origin_url}/api/v2"

    events: list[CommanderEvent] = []
    watchdog = CutoffWatchdog(scenario.cutoffs)
    termination = "error"
    error: Optional[str] = None
    final_stats: dict = {}

    gs_proc = None
    cmd_proc = None
    try:
        gs_proc = start_gameserver(GAMESERVER_BINARY, port=port, admin_token=admin_token)
        admin = AdminClient(origin_url, admin_token)
        # TODO: re-enable once the gameserver exposes /api/admin/benchmark/reset.
        # Running without fixture reset means scores are only meaningful when the
        # server happens to be in a known state. See design doc (2026-04-07).
        player_creds = None
        try:
            all_creds = admin.reset(scenario.fixture)
            target_username = scenario.llm_player_id
            for c in all_creds:
                if c.get("username") == target_username:
                    player_creds = c
                    break
            if player_creds:
                _write_commander_credentials(COMMANDER_DIR, session_id, player_creds)
            else:
                _log(f"[warn] no credentials found for player {target_username}")
        except AdminError as e:
            print(f"    [warn] reset skipped: {e}", flush=True)

        _log(f"spawning commander: model={commander_model_string} "
             f"{COMMANDER_LOCAL_BASE_URL_ENV}={llm_base_url}")
        _log(f"scenario_path={scenario_path} commander_base_url={commander_base_url}")

        cmd_proc = spawn_commander(
            commander_dir=COMMANDER_DIR,
            model=commander_model_string,
            scenario_path=Path(scenario_path),
            server_url=commander_base_url,
            session=session_id,
            llm_base_url_env=COMMANDER_LOCAL_BASE_URL_ENV,
            llm_base_url=llm_base_url,
        )
        _log(f"commander pid={cmd_proc.pid}")
        # Drain stderr so commander doesn't block on a full pipe buffer.
        drain_stderr(cmd_proc, sys.stderr)

        event_counts: Counter = Counter()
        last_event_ts = time.monotonic()
        last_heartbeat = time.monotonic()
        HEARTBEAT_INTERVAL = 15.0  # seconds
        STALL_WARN = 30.0          # warn if no events for this long

        for event in iter_events(cmd_proc):
            events.append(event)
            event_counts[event.event] += 1
            now = time.monotonic()
            gap = now - last_event_ts
            last_event_ts = now

            # Log first occurrence of each event type and periodic heartbeats.
            if event_counts[event.event] == 1:
                _log(f"first '{event.event}' event (tick={event.tick})")
            if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                summary = ", ".join(f"{k}={v}" for k, v in sorted(event_counts.items()))
                _log(f"heartbeat t={watchdog.elapsed_sec:.0f}s "
                     f"tokens={watchdog.total_tokens} tools={watchdog.tool_call_count} | {summary}")
                last_heartbeat = now
            if gap > STALL_WARN:
                _log(f"WARN: {gap:.0f}s gap between events (last: {event.event})")

            watchdog.observe(event)
            if watchdog.tripped() is not None:
                termination = watchdog.tripped()
                _log(f"cutoff tripped: {termination}")
                cmd_proc.terminate()
                try:
                    cmd_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cmd_proc.kill()
                break
        else:
            # Generator exhausted normally — commander exited
            _log(f"commander stdout closed after {len(events)} events")
            cmd_proc.wait(timeout=10)
            termination = "completed"

        # Final event summary — critical for diagnosing "commander ran but
        # never hit the LLM" symptoms.
        summary = ", ".join(f"{k}={v}" for k, v in sorted(event_counts.items())) or "(none)"
        _log(f"event summary: {summary}")
        _log(f"totals: tokens={watchdog.total_tokens} "
             f"tool_calls={watchdog.tool_call_count} "
             f"elapsed={watchdog.elapsed_sec:.1f}s "
             f"termination={termination} "
             f"exit_code={cmd_proc.poll()}")
        if not events:
            _log("WARN: commander produced ZERO events — check stderr above, "
                 "model string, or env vars")

        try:
            final_stats = admin.get_player_stats(scenario.llm_player_id)
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
        error=error,
    )
