import json
from unittest.mock import patch, MagicMock

from admiral_runner import AgentEvent, AdmiralLogStream


def _make_sse_lines(entries: list[dict]) -> list[bytes]:
    """Build raw SSE byte lines from a list of log entry dicts."""
    lines = []
    for entry in entries:
        lines.append(f"data: {json.dumps(entry)}\n".encode())
        lines.append(b"\n")  # SSE blank line separator
    return lines


def test_log_stream_maps_tool_call():
    entries = [
        {"id": 1, "type": "tool_call", "summary": "mine", "detail": '{"tool": "mine", "args": {"resource": "ore"}}', "timestamp": "t"},
    ]
    stream = AdmiralLogStream("fake-id")
    # Mock the response object
    stream._resp = MagicMock()
    stream._resp.readline = MagicMock(side_effect=_make_sse_lines(entries) + [b""])

    events = list(stream.events())
    assert len(events) == 1
    assert events[0].event == "tool_call"
    assert events[0].data["tool"] == "mine"


def test_log_stream_maps_llm_call_to_turn_end():
    entries = [
        {"id": 1, "type": "llm_call", "summary": "call", "detail": '{"usage": {"input": 100, "output": 50}}', "timestamp": "t1"},
        {"id": 2, "type": "llm_call", "summary": "call", "detail": '{"usage": {"input": 200, "output": 80}}', "timestamp": "t2"},
    ]
    stream = AdmiralLogStream("fake-id")
    stream._resp = MagicMock()
    stream._resp.readline = MagicMock(side_effect=_make_sse_lines(entries) + [b""])

    events = list(stream.events())
    assert len(events) == 2
    # Token counts should be cumulative
    assert events[0].data["totalTokensIn"] == 100
    assert events[0].data["totalTokensOut"] == 50
    assert events[1].data["totalTokensIn"] == 300
    assert events[1].data["totalTokensOut"] == 130


def test_log_stream_deduplicates_by_id():
    entries = [
        {"id": 1, "type": "tool_call", "summary": "scan", "detail": '{"tool": "scan"}', "timestamp": "t"},
        {"id": 1, "type": "tool_call", "summary": "scan", "detail": '{"tool": "scan"}', "timestamp": "t"},
        {"id": 2, "type": "tool_call", "summary": "mine", "detail": '{"tool": "mine"}', "timestamp": "t"},
    ]
    stream = AdmiralLogStream("fake-id")
    stream._resp = MagicMock()
    stream._resp.readline = MagicMock(side_effect=_make_sse_lines(entries) + [b""])

    events = list(stream.events())
    assert len(events) == 2
    assert events[0].data["tool"] == "scan"
    assert events[1].data["tool"] == "mine"


def test_log_stream_skips_non_data_lines():
    """SSE comments and heartbeats should be ignored."""
    raw_lines = [
        b": heartbeat\n",
        b"\n",
        b"event: activity\n",
        f'data: {json.dumps({"id": 1, "type": "tool_call", "summary": "scan", "detail": "{}", "timestamp": "t"})}\n'.encode(),
        b"\n",
        b"",  # EOF
    ]
    stream = AdmiralLogStream("fake-id")
    stream._resp = MagicMock()
    stream._resp.readline = MagicMock(side_effect=raw_lines)

    events = list(stream.events())
    assert len(events) == 1
    assert events[0].event == "tool_call"


def test_log_stream_maps_tool_error():
    entries = [
        {"id": 1, "type": "tool_result", "summary": "error: command failed", "detail": '{"tool": "mine", "status": "error"}', "timestamp": "t"},
    ]
    stream = AdmiralLogStream("fake-id")
    stream._resp = MagicMock()
    stream._resp.readline = MagicMock(side_effect=_make_sse_lines(entries) + [b""])

    events = list(stream.events())
    assert len(events) == 1
    assert events[0].event == "tool_error"
    assert events[0].data["tool"] == "mine"
