from pathlib import Path

from common import (
    GAMESERVER_BINARY, COMMANDER_DIR, COMMANDER_LOCAL_PROVIDER,
    COMMANDER_LOCAL_BASE_URL_ENV,
)


def test_path_constants_are_paths():
    # GAMESERVER_BINARY is None unless TESTBENCH_GAMESERVER_BINARY is set
    assert GAMESERVER_BINARY is None or isinstance(GAMESERVER_BINARY, Path)
    assert isinstance(COMMANDER_DIR, Path)


def test_commander_local_provider_constants_present():
    # Filled in from Task 6 Step 1 investigation
    assert COMMANDER_LOCAL_PROVIDER  # non-empty
    assert COMMANDER_LOCAL_BASE_URL_ENV  # non-empty
