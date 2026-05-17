"""HTTP client for the SpaceMolt gameserver benchmark admin API.

Python port of smbench/src/lib/admin-client.ts. Stdlib-only to match runner.py.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class AdminError(RuntimeError):
    """Raised when an admin API request fails."""


class AdminClient:
    def __init__(self, server_url: str, admin_token: str, timeout: float = 10.0):
        self.base_url = server_url.rstrip("/")
        self.admin_token = admin_token
        self.timeout = timeout

    def _request(self, method: str, path: str, body: dict | None = None) -> Any:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.admin_token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status >= 300:
                    raise AdminError(f"{method} {path} failed: {resp.status}")
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise AdminError(f"{method} {path} failed: {e.code} {e.read()[:200]!r}") from e
        except urllib.error.URLError as e:
            raise AdminError(f"{method} {path} network error: {e}") from e

    def reset(self, fixture: str) -> list[dict]:
        """Reset the gameserver to a benchmark fixture.

        Returns a list of player credential dicts with keys:
        username, password, empire, player_id.
        """
        data = self._request("POST", "/api/admin/benchmark/reset", body={"fixture": fixture})
        if isinstance(data, dict):
            return data.get("players", [])
        return []

    def get_player_stats(self, player_id: str) -> dict:
        q = urllib.parse.urlencode({"player_id": player_id})
        data = self._request("GET", f"/api/admin/benchmark/player-stats?{q}")
        return data if isinstance(data, dict) else {}
