import json
from unittest.mock import patch, MagicMock

import pytest

from game_admin import AdminClient, AdminError


def _fake_response(status: int, body: bytes):
    resp = MagicMock()
    resp.status = status
    resp.read.return_value = body
    resp.__enter__ = lambda self: self
    resp.__exit__ = lambda self, *a: None
    return resp


def test_admin_client_reset_posts_with_fixture():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(200, b"{}")
        client.reset("s1-bootstrap-grind")
        req = urlopen.call_args[0][0]
        assert req.full_url == "http://localhost:8080/api/admin/benchmark/reset"
        assert req.get_method() == "POST"
        assert req.headers["Authorization"] == "Bearer tok"
        assert json.loads(req.data) == {"fixture": "s1-bootstrap-grind"}


def test_admin_client_get_player_stats():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(200, b'{"credits": 500, "stats": {"credits_earned": 500}}')
        stats = client.get_player_stats("alice")
        assert stats == {"credits": 500, "stats": {"credits_earned": 500}}
        req = urlopen.call_args[0][0]
        assert "player_id=alice" in req.full_url


def test_admin_client_raises_on_http_error():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(500, b"boom")
        with pytest.raises(AdminError, match="500"):
            client.reset("x")
