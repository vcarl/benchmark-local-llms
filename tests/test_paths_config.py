from pathlib import Path

from common import (
    GAMESERVER_BINARY, ADMIRAL_DIR,
)


def test_path_constants_are_paths():
    # GAMESERVER_BINARY is None unless TESTBENCH_GAMESERVER_BINARY is set
    assert GAMESERVER_BINARY is None or isinstance(GAMESERVER_BINARY, Path)
    assert isinstance(ADMIRAL_DIR, Path)
