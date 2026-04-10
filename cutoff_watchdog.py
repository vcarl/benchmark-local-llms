"""Cutoff watchdog: pure state machine over CommanderEvents.

Tracks running counts of tool calls and total tokens, plus elapsed wall-clock
time, and reports the first cutoff to trip. The watchdog is the single source
of truth for "world limits" per the design doc — commander may have its own
softer turn limits as guard rails.
"""

import time
from typing import Callable, Optional

from commander_runner import CommanderEvent
from common import ScenarioCutoffs


class CutoffWatchdog:
    def __init__(self, cutoffs: ScenarioCutoffs, now: Callable[[], float] = time.perf_counter):
        self.cutoffs = cutoffs
        self._now = now
        self._start = now()
        self._tripped: Optional[str] = None
        self.tool_call_count = 0
        self.total_tokens = 0  # latest turn_end's in+out

    def observe(self, event: CommanderEvent) -> None:
        if event.event == "tool_call":
            self.tool_call_count += 1
        elif event.event == "turn_end":
            tokens_in = int(event.data.get("totalTokensIn", 0))
            tokens_out = int(event.data.get("totalTokensOut", 0))
            self.total_tokens = tokens_in + tokens_out

    def tripped(self) -> Optional[str]:
        """Return the name of the first cutoff that has tripped, or None.

        Sticky: once a cutoff has tripped, the same name is returned forever.
        """
        if self._tripped is not None:
            return self._tripped
        if self.tool_call_count > self.cutoffs.tool_calls:
            self._tripped = "tool_calls"
        elif self.total_tokens > self.cutoffs.total_tokens:
            self._tripped = "tokens"
        elif (self._now() - self._start) > self.cutoffs.wall_clock_sec:
            self._tripped = "wall_clock"
        return self._tripped

    @property
    def elapsed_sec(self) -> float:
        return self._now() - self._start
