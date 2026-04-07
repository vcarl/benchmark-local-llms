import pytest

from commander_runner import CommanderEvent
from common import ScenarioCutoffs
from cutoff_watchdog import CutoffWatchdog


def _ev(name: str, **data) -> CommanderEvent:
    return CommanderEvent(event=name, tick=0, ts="t", data=data)


def cutoffs(**overrides):
    base = dict(wall_clock_sec=600, total_tokens=1000, tool_calls=10)
    base.update(overrides)
    return ScenarioCutoffs(**base)


def test_no_cutoff_when_under_limits():
    w = CutoffWatchdog(cutoffs(), now=lambda: 0.0)
    w.observe(_ev("tool_call", tool="scan"))
    w.observe(_ev("turn_end", total_tokens_in=10, total_tokens_out=20))
    assert w.tripped() is None


def test_tool_calls_cutoff():
    w = CutoffWatchdog(cutoffs(tool_calls=2), now=lambda: 0.0)
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))
    assert w.tripped() is None
    w.observe(_ev("tool_call"))
    assert w.tripped() == "tool_calls"


def test_token_cutoff_uses_latest_turn_end():
    w = CutoffWatchdog(cutoffs(total_tokens=100), now=lambda: 0.0)
    w.observe(_ev("turn_end", total_tokens_in=40, total_tokens_out=40))
    assert w.tripped() is None
    w.observe(_ev("turn_end", total_tokens_in=60, total_tokens_out=60))
    assert w.tripped() == "tokens"


def test_wall_clock_cutoff():
    clock = [0.0]
    w = CutoffWatchdog(cutoffs(wall_clock_sec=10), now=lambda: clock[0])
    w.observe(_ev("turn_start"))
    assert w.tripped() is None
    clock[0] = 11.0
    assert w.tripped() == "wall_clock"


def test_first_cutoff_wins():
    clock = [0.0]
    w = CutoffWatchdog(cutoffs(wall_clock_sec=10, tool_calls=1), now=lambda: clock[0])
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))  # trips tool_calls
    clock[0] = 1000
    # tool_calls already tripped first; result should remain
    assert w.tripped() == "tool_calls"


def test_token_count_and_tool_count_exposed():
    w = CutoffWatchdog(cutoffs(), now=lambda: 0.0)
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))
    w.observe(_ev("turn_end", total_tokens_in=30, total_tokens_out=70))
    assert w.tool_call_count == 2
    assert w.total_tokens == 100
