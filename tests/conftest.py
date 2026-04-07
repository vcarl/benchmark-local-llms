"""Shared pytest fixtures for testbench/llms tests."""
import os
import sys
from pathlib import Path

# Make the project root importable so tests can `from common import ...`
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


def pytest_collection_modifyitems(config, items):
    """Skip @pytest.mark.integration tests unless RUN_INTEGRATION=1."""
    if os.environ.get("RUN_INTEGRATION") == "1":
        return
    skip = pytest.mark.skip(reason="integration test; set RUN_INTEGRATION=1 to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
