from unittest.mock import patch, MagicMock

import pytest

from game_lifecycle import wait_for_healthy, HealthCheckTimeout


def test_wait_for_healthy_returns_on_first_ok():
    resp = MagicMock(status=200)
    resp.__enter__ = lambda self: self
    resp.__exit__ = lambda self, *a: None
    with patch("urllib.request.urlopen", return_value=resp):
        wait_for_healthy("http://x/health", timeout_sec=1.0, interval_sec=0.01)


def test_wait_for_healthy_times_out():
    with patch("urllib.request.urlopen", side_effect=ConnectionError("nope")):
        with pytest.raises(HealthCheckTimeout):
            wait_for_healthy("http://x/health", timeout_sec=0.1, interval_sec=0.01)
