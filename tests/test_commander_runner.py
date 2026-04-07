import io
import json
from unittest.mock import patch, MagicMock

from commander_runner import iter_events, CommanderEvent


def _fake_proc(stdout_lines: list[str]):
    proc = MagicMock()
    proc.stdout = io.StringIO("".join(line + "\n" for line in stdout_lines))
    proc.poll.return_value = None
    return proc


def test_iter_events_parses_jsonl_only():
    proc = _fake_proc([
        '{"event": "turn_start", "tick": 1, "ts": "t"}',
        'plain log line, ignored',
        '{"event": "tool_call", "tick": 2, "ts": "t", "tool": "scan"}',
        '',
    ])
    events = list(iter_events(proc))
    assert len(events) == 2
    assert events[0].event == "turn_start"
    assert events[1].event == "tool_call"
    assert events[1].data["tool"] == "scan"


def test_iter_events_stops_on_eof():
    proc = _fake_proc([])
    assert list(iter_events(proc)) == []
