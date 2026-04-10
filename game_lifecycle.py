"""SpaceMolt gameserver process lifecycle.

Python port of smbench/src/lib/server-lifecycle.ts (gameserver bits only).
"""

import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional


class HealthCheckTimeout(RuntimeError):
    pass


def wait_for_healthy(url: str, timeout_sec: float, interval_sec: float = 1.0) -> None:
    """Poll `url` until it returns 2xx, or raise HealthCheckTimeout."""
    deadline = time.perf_counter() + timeout_sec
    while time.perf_counter() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(interval_sec)
    raise HealthCheckTimeout(f"Timed out waiting for {url}")


def start_gameserver(
    binary_path: Path,
    port: int,
    admin_token: str,
    tick_rate: int = 10,
    timeout_sec: float = 30.0,
) -> subprocess.Popen:
    """Spawn the gameserver binary, wait until /health returns 200, return the process.

    Raises HealthCheckTimeout (and kills the child) on failure.
    """
    env = {
        **os.environ,
        "PORT": str(port),
        "ADMIN_API_TOKEN": admin_token,
        "TICK_RATE": str(tick_rate),
        # Tells the gameserver to relax registration-code checks so the
        # benchmark agent can register without a Clerk-issued code.
        "BENCHMARK_MODE": "1",
        # DATA_DIR must point to the gameserver's data directory so YAML
        # files (ships, items, etc.) are found regardless of CWD.
        "DATA_DIR": str(binary_path.parent / "data"),
    }
    print(f"    Starting gameserver on port {port}...", flush=True)
    proc = subprocess.Popen(
        [str(binary_path)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        wait_for_healthy(f"http://127.0.0.1:{port}/health", timeout_sec=timeout_sec)
    except HealthCheckTimeout:
        stop_gameserver(proc)
        raise
    print(f"    Gameserver ready.", flush=True)
    return proc


def stop_gameserver(proc: subprocess.Popen, grace_sec: float = 5.0) -> None:
    """SIGTERM, wait `grace_sec`, then SIGKILL if still alive."""
    if proc.poll() is not None:
        return
    print(f"    Stopping gameserver (pid {proc.pid})...", flush=True)
    proc.terminate()
    try:
        proc.wait(timeout=grace_sec)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def allocate_port() -> int:
    """Bind to port 0 to let the OS pick a free high port, then close and return it.

    Inherently racy (the port could be claimed before we use it), but adequate for
    benchmark runs that immediately spawn the gameserver after allocation.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
