"""Run one SpaceMolt game session: gameserver + Admiral + cutoff watchdog.

Assembles game_admin, game_lifecycle, admiral_runner, and cutoff_watchdog
into a single entry point. The Admiral server must already be running
(started by benchmark.py); this module creates a profile per scenario,
connects the LLM loop, streams events, and tears down.
"""

import secrets
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from common import (
    GAMESERVER_BINARY,
    Scenario,
)
from game_admin import AdminClient, AdminError
from game_lifecycle import allocate_port, start_gameserver, stop_gameserver
from admiral_runner import (
    AgentEvent, AdmiralLogStream,
    configure_provider, create_profile, connect_profile,
    disconnect_profile, delete_profile,
)
from cutoff_watchdog import CutoffWatchdog


def _log(msg: str) -> None:
    print(f"    [game] {msg}", flush=True)


LLAMACPP_BASE_URL = "http://127.0.0.1:18080/v1"  # matches runner.LLAMACPP_PORT


@dataclass
class GameSessionResult:
    scenario_name: str
    termination_reason: str  # completed | wall_clock | tokens | tool_calls | error
    tool_call_count: int
    total_tokens: int
    elapsed_sec: float
    events: list[AgentEvent] = field(default_factory=list)
    final_player_stats: dict = field(default_factory=dict)
    error: Optional[str] = None


def run_game_session(
    scenario: Scenario,
    model_name: str,
    admiral_model_string: str,
    scenario_path: str,
    llm_base_url: str = LLAMACPP_BASE_URL,
) -> GameSessionResult:
    """Run one scenario x model game session end to end.

    `admiral_model_string` is the model identifier passed to Admiral's
    profile creation (e.g. the HF repo id). Admiral prefixes it with
    "custom/" internally.

    `scenario_path` is the path to the scenario markdown file whose
    contents are sent as the Admiral profile's directive.

    The Admiral server must already be running (see admiral_runner.start_admiral_server).
    """
    port = allocate_port()
    admin_token = secrets.token_hex(16)
    session_id = uuid.uuid4().hex[:8]
    origin_url = f"http://127.0.0.1:{port}"

    events: list[AgentEvent] = []
    watchdog = CutoffWatchdog(scenario.cutoffs)
    termination = "error"
    error: Optional[str] = None
    final_stats: dict = {}
    profile_id: Optional[str] = None
    log_stream: Optional[AdmiralLogStream] = None

    gs_proc = None
    try:
        gs_proc = start_gameserver(GAMESERVER_BINARY, port=port, admin_token=admin_token)
        admin = AdminClient(origin_url, admin_token)

        # Reset game state and get player credentials
        player_creds = None
        try:
            all_creds = admin.reset(scenario.fixture)
            target_username = scenario.llm_player_id
            for c in all_creds:
                if c.get("username") == target_username:
                    player_creds = c
                    break
            if not player_creds:
                _log(f"[warn] no credentials found for player {target_username}")
        except AdminError as e:
            print(f"    [warn] reset skipped: {e}", flush=True)

        # Resolve scenario markdown path and read as directive text
        if scenario.scenario_md:
            smbench_scenarios_dir = Path.home() / "workspace" / "smbench" / "scenarios"
            resolved_scenario_path = str(smbench_scenarios_dir / scenario.scenario_md)
        else:
            resolved_scenario_path = scenario_path

        directive = ""
        try:
            directive = Path(resolved_scenario_path).read_text()
        except FileNotFoundError:
            _log(f"[warn] scenario file not found: {resolved_scenario_path}")

        # Configure Admiral's LLM provider to point at the local server
        _log(f"configuring Admiral provider: llm_base_url={llm_base_url}")
        configure_provider(base_url=llm_base_url, api_key="local")

        # Create Admiral profile with game credentials
        username = player_creds.get("username", "") if player_creds else ""
        password = player_creds.get("password", "") if player_creds else ""

        profile_id = create_profile(
            name=f"bench-{session_id}",
            username=username,
            password=password,
            model=admiral_model_string,
            server_url=origin_url,
            directive=directive,
            connection_mode="http_v2",
        )
        _log(f"created Admiral profile {profile_id}")

        # Connect and start the LLM agent loop
        _log(f"connecting Admiral profile (model={admiral_model_string})")
        connect_profile(profile_id)

        # Open SSE log stream and monitor events
        log_stream = AdmiralLogStream(profile_id)
        log_stream.open()

        event_counts: Counter = Counter()
        tool_counts: Counter = Counter()  # per-tool-name call counts
        tool_errors: Counter = Counter()  # per-tool-name error counts
        last_event_ts = time.monotonic()
        last_heartbeat = time.monotonic()
        pending_tool: Optional[str] = None  # track last tool_call for pairing with result
        HEARTBEAT_INTERVAL = 15.0  # seconds
        STALL_WARN = 30.0          # warn if no events for this long

        for event in log_stream:
            events.append(event)
            event_counts[event.event] += 1
            now = time.monotonic()
            gap = now - last_event_ts
            last_event_ts = now

            # Log individual tool calls with their name
            if event.event == "tool_call":
                tool = event.data.get("tool", "?")
                tool_counts[tool] += 1
                pending_tool = tool
                _log(f"tool_call: {tool}")

            # Log tool results (success)
            elif event.event == "tool_result":
                tool = event.data.get("tool", "") or pending_tool or "?"
                result_snippet = event.data.get("result", "")
                if isinstance(result_snippet, str) and len(result_snippet) > 120:
                    result_snippet = result_snippet[:120] + "..."
                _log(f"tool_result: {tool} -> ok"
                     + (f" ({result_snippet})" if result_snippet else ""))
                pending_tool = None

            # Log tool errors with detail
            elif event.event == "tool_error":
                tool = event.data.get("tool", "") or pending_tool or "?"
                tool_errors[tool] += 1
                error_msg = event.data.get("error", event.data.get("message", ""))
                args = event.data.get("args", {})
                _log(f"tool_error: {tool} args={args}"
                     + (f" error={error_msg}" if error_msg else ""))
                pending_tool = None

            # Log turn_end with token deltas
            elif event.event == "turn_end":
                tok_in = event.data.get("totalTokensIn", 0)
                tok_out = event.data.get("totalTokensOut", 0)
                _log(f"turn_end: tokens_in={tok_in} tokens_out={tok_out}")

            # Log first occurrence of other event types
            elif event_counts[event.event] == 1:
                _log(f"first '{event.event}' event (tick={event.tick})")

            # Periodic heartbeat with tool breakdown
            if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                evt_summary = ", ".join(f"{k}={v}" for k, v in sorted(event_counts.items()))
                tool_summary = ", ".join(f"{k}={v}" for k, v in tool_counts.most_common(5))
                _log(f"heartbeat t={watchdog.elapsed_sec:.0f}s "
                     f"tokens={watchdog.total_tokens} tools={watchdog.tool_call_count} | {evt_summary}")
                if tool_summary:
                    _log(f"  tools used: {tool_summary}")
                last_heartbeat = now
            if gap > STALL_WARN:
                _log(f"WARN: {gap:.0f}s gap between events (last: {event.event})")

            watchdog.observe(event)
            if watchdog.tripped() is not None:
                termination = watchdog.tripped()
                _log(f"cutoff tripped: {termination}")
                disconnect_profile(profile_id)
                break
        else:
            # SSE stream closed (Admiral shut down or connection lost)
            _log(f"log stream closed after {len(events)} events")
            termination = "completed"

        # Final event summary
        evt_summary = ", ".join(f"{k}={v}" for k, v in sorted(event_counts.items())) or "(none)"
        _log(f"event summary: {evt_summary}")
        if tool_counts:
            tool_breakdown = ", ".join(f"{k}={v}" for k, v in tool_counts.most_common())
            _log(f"tool breakdown: {tool_breakdown}")
        if tool_errors:
            err_breakdown = ", ".join(f"{k}={v}" for k, v in tool_errors.most_common())
            _log(f"tool errors: {err_breakdown}")
        _log(f"totals: tokens={watchdog.total_tokens} "
             f"tool_calls={watchdog.tool_call_count} "
             f"elapsed={watchdog.elapsed_sec:.1f}s "
             f"termination={termination}")
        if not events:
            _log("WARN: Admiral produced ZERO events — check provider config")

        try:
            final_stats = admin.get_player_stats(scenario.llm_player_id)
        except AdminError as e:
            error = f"final-state read: {e}"

    except Exception as e:
        termination = "error"
        error = str(e)[:200]
    finally:
        if log_stream is not None:
            log_stream.close()
        if profile_id is not None:
            disconnect_profile(profile_id)
            delete_profile(profile_id)
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
