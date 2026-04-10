"""Admiral API runner.

Drives game scenarios through Admiral's HTTP API and SSE log streaming,
replacing the old Commander subprocess approach. Admiral runs as a persistent
HTTP server; this module manages its lifecycle and maps its log events to
AgentEvent objects consumed by the cutoff watchdog.

Admiral API (port 3031 by default):
  - PUT  /api/providers          — configure LLM provider
  - POST /api/profiles           — create agent profile
  - POST /api/profiles/:id/connect — connect/disconnect agent
  - GET  /api/profiles/:id/logs?stream=true — SSE log stream
  - DELETE /api/profiles/:id     — delete profile
"""

import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional


ADMIRAL_PORT = 3031


@dataclass
class AgentEvent:
    """Event from Admiral's log stream. Interface-compatible with CutoffWatchdog."""
    event: str       # tool_call, turn_end, tool_error, connection, error, etc.
    tick: int
    ts: str
    data: dict = field(default_factory=dict)


# ── Server lifecycle ──────────────────────────────────────────────────────

def start_admiral_server(
    admiral_dir: Path,
    port: int = ADMIRAL_PORT,
) -> subprocess.Popen:
    """Start the Admiral server as a subprocess and wait for it to be healthy."""
    env = {**os.environ, "PORT": str(port)}
    if "PATH" not in env:
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

    log_path = Path("/tmp/testbench-admiral.log")
    log_fh = open(log_path, "w")

    proc = subprocess.Popen(
        ["bun", "run", "src/server/index.ts"],
        cwd=str(admiral_dir),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        text=True,
    )
    proc._log_fh = log_fh  # type: ignore[attr-defined]

    try:
        _wait_for_health(port)
    except RuntimeError:
        try:
            with open(log_path) as f:
                tail = f.read()[-400:]
        except OSError:
            tail = ""
        proc.kill()
        proc.wait()
        log_fh.close()
        raise RuntimeError(
            f"Admiral server failed to start. Tail of {log_path}:\n{tail}"
        )

    return proc


def stop_admiral_server(proc: subprocess.Popen) -> None:
    """Stop the Admiral server subprocess."""
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    log_fh = getattr(proc, "_log_fh", None)
    if log_fh is not None:
        try:
            log_fh.close()
        except Exception:
            pass


def _wait_for_health(port: int, timeout: float = 30) -> None:
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        try:
            resp = urllib.request.urlopen(url, timeout=2)
            if resp.status == 200:
                return
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Admiral health check timed out after {timeout}s")


# ── HTTP API helpers ──────────────────────────────────────────────────────

def _api(
    method: str,
    path: str,
    body: Optional[dict] = None,
    port: int = ADMIRAL_PORT,
) -> dict:
    """Make an HTTP API call to Admiral. Returns parsed JSON response."""
    url = f"http://127.0.0.1:{port}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    resp = urllib.request.urlopen(req, timeout=30)
    raw = resp.read()
    return json.loads(raw) if raw else {}


def configure_provider(
    base_url: str,
    api_key: str = "local",
    port: int = ADMIRAL_PORT,
) -> None:
    """Configure Admiral's custom provider to point at the local LLM server."""
    _api("PUT", "/api/providers", {
        "id": "custom",
        "base_url": base_url,
        "api_key": api_key,
    }, port=port)


def create_profile(
    name: str,
    username: str,
    password: str,
    model: str,
    server_url: str,
    directive: str = "",
    connection_mode: str = "http_v2",
    port: int = ADMIRAL_PORT,
) -> str:
    """Create an Admiral profile. Returns the profile ID."""
    resp = _api("POST", "/api/profiles", {
        "name": name,
        "username": username,
        "password": password,
        "provider": "custom",
        "model": f"custom/{model}",
        "directive": directive,
        "server_url": server_url,
        "connection_mode": connection_mode,
    }, port=port)
    return resp["id"]


def connect_profile(profile_id: str, port: int = ADMIRAL_PORT) -> None:
    """Connect a profile and start its LLM agent loop."""
    _api("POST", f"/api/profiles/{profile_id}/connect", {
        "action": "connect_llm",
    }, port=port)


def disconnect_profile(profile_id: str, port: int = ADMIRAL_PORT) -> None:
    """Disconnect a profile (best-effort)."""
    try:
        _api("POST", f"/api/profiles/{profile_id}/connect", {
            "action": "disconnect",
        }, port=port)
    except Exception:
        pass


def delete_profile(profile_id: str, port: int = ADMIRAL_PORT) -> None:
    """Delete a profile (best-effort)."""
    try:
        _api("DELETE", f"/api/profiles/{profile_id}", port=port)
    except Exception:
        pass


# ── SSE log stream ────────────────────────────────────────────────────────

class AdmiralLogStream:
    """Streams SSE log events from Admiral and maps them to AgentEvent objects.

    Admiral log types are mapped as follows:
      - tool_call  → tool_call  (counted by watchdog)
      - tool_result with error → tool_error
      - tool_result success → tool_result (informational, not counted)
      - llm_call   → turn_end  (token counts accumulated into cumulative totals)
      - error      → error
      - connection  → connection

    Other log types (llm_thought, notification, system, server_message) are
    skipped since the watchdog doesn't need them.
    """

    def __init__(self, profile_id: str, port: int = ADMIRAL_PORT):
        self.profile_id = profile_id
        self.port = port
        self._resp = None
        self._closed = False
        self._cumulative_in = 0
        self._cumulative_out = 0
        self._tick = 0
        self._seen_ids: set[int] = set()

    def open(self) -> "AdmiralLogStream":
        url = (
            f"http://127.0.0.1:{self.port}"
            f"/api/profiles/{self.profile_id}/logs?stream=true"
        )
        self._resp = urllib.request.urlopen(url)
        return self

    def close(self) -> None:
        self._closed = True
        if self._resp:
            try:
                self._resp.close()
            except Exception:
                pass

    def __enter__(self) -> "AdmiralLogStream":
        return self.open()

    def __exit__(self, *args) -> None:
        self.close()

    def __iter__(self) -> Iterator[AgentEvent]:
        return self.events()

    def events(self) -> Iterator[AgentEvent]:
        """Yield AgentEvent objects from the SSE stream."""
        if self._resp is None:
            return
        try:
            while not self._closed:
                line = self._resp.readline()
                if not line:
                    break  # Connection closed
                text = line.decode("utf-8").rstrip("\r\n")
                if not text.startswith("data: "):
                    continue  # Skip SSE comments, heartbeats, event-type lines
                try:
                    entry = json.loads(text[6:])
                except json.JSONDecodeError:
                    continue

                # Deduplicate (initial batch may overlap with live stream)
                eid = entry.get("id")
                if eid is not None:
                    if eid in self._seen_ids:
                        continue
                    self._seen_ids.add(eid)

                event = self._map_entry(entry)
                if event is not None:
                    yield event
        except (OSError, ConnectionError):
            pass  # Stream closed externally

    def _map_entry(self, entry: dict) -> Optional[AgentEvent]:
        log_type = entry.get("type", "")
        ts = entry.get("timestamp", "")
        summary = entry.get("summary", "")

        # Parse detail — may be a JSON string (from SQLite) or already a dict
        detail_raw = entry.get("detail")
        detail: dict = {}
        if isinstance(detail_raw, str):
            try:
                detail = json.loads(detail_raw)
            except (json.JSONDecodeError, TypeError):
                detail = {"raw": detail_raw}
        elif isinstance(detail_raw, dict):
            detail = detail_raw

        self._tick += 1

        if log_type == "tool_call":
            tool_name = detail.get("tool") or detail.get("name") or summary or "?"
            return AgentEvent(
                event="tool_call",
                tick=self._tick,
                ts=ts,
                data={"tool": tool_name, **detail},
            )

        if log_type == "tool_result":
            tool_name = detail.get("tool") or detail.get("name") or summary or "?"
            status = detail.get("status", "")
            if status == "error" or "error" in summary.lower():
                return AgentEvent(
                    event="tool_error",
                    tick=self._tick,
                    ts=ts,
                    data={"tool": tool_name, **detail},
                )
            return AgentEvent(
                event="tool_result",
                tick=self._tick,
                ts=ts,
                data={"tool": tool_name, **detail},
            )

        if log_type == "llm_call":
            usage = detail.get("usage", {})
            self._cumulative_in += int(usage.get("input", 0))
            self._cumulative_out += int(usage.get("output", 0))
            return AgentEvent(
                event="turn_end",
                tick=self._tick,
                ts=ts,
                data={
                    "totalTokensIn": self._cumulative_in,
                    "totalTokensOut": self._cumulative_out,
                },
            )

        if log_type == "error":
            return AgentEvent(
                event="error",
                tick=self._tick,
                ts=ts,
                data={"summary": summary, **detail},
            )

        if log_type == "connection":
            return AgentEvent(
                event="connection",
                tick=self._tick,
                ts=ts,
                data={"summary": summary},
            )

        # llm_thought, notification, system, server_message — skip
        return None
